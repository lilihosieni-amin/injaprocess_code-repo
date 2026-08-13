import functools
import time

import anyio
import anyio.to_thread
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..auth import (
    COOKIE_NAME,
    VERIFY_LIMITER,
    apply_password_change,
    attempted_actor,
    authenticate,
    current_user,
    descriptor,
    get_conn,
    record,
    request_origin,
    require_session,
)
from ..models import LoginBody, PasswordBody
from ..store import sessions

router = APIRouter(prefix="/api/auth")

#: The one argon2 ceiling, defined in `auth.py` beside the work it bounds and
#: shared with `routers/users.py` (D15's administrator paths). Aliased under the
#: old private name so the two call sites below still read as they did; see
#: `auth.VERIFY_LIMITER` for why there is exactly one of it.
_VERIFY_LIMITER = VERIFY_LIMITER


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    cfg = request.app.state.cfg
    conn = get_conn(request)
    # Off the event loop and no more than `_VERIFY_LIMITER` at a time. `async` +
    # `to_thread.run_sync` rather than the plain `def` FastAPI would put in the
    # default threadpool for us, because only this form can carry a limiter of its
    # own — and the ceiling is the point. `anyio.to_thread.run_sync` rather than
    # Starlette's `run_in_threadpool`: that wrapper forwards its keyword arguments
    # to the function being called, so a `limiter=` cannot travel through it.
    #
    # The whole of `authenticate` goes across, not just the verify: the miss path's
    # dummy-hash verify is inside it, and it is what makes an unknown number cost
    # what a wrong password costs (D56). Splitting the lookup from the verify would
    # put the miss path outside the ceiling.
    user, reason = await anyio.to_thread.run_sync(
        functools.partial(authenticate, conn, body.username, body.password),
        limiter=_VERIFY_LIMITER)
    if user is None:
        # One response for a wrong password, an unknown number and a disabled
        # account (D56); three reasons in the record (D42), because an
        # ex-employee trying to get back in is worth being able to see.
        record(request, "login.failure", actor=attempted_actor(body.username),
               outcome="fail", detail={"reason": reason})
        raise HTTPException(status_code=401, detail="invalid credentials")

    ip, user_agent = request_origin(request)
    sid = sessions.issue(conn, user["id"], ip=ip, user_agent=user_agent,
                         now=int(time.time()))
    record(request, "login.success", actor=user["username"], session_id=sid)
    # The cookie carries the session id and nothing else (D7): a signed blob
    # naming the user could not be revoked, and revocation is the whole point.
    #
    # `secure`: this cookie is the whole session, so it may never travel over a
    # cleartext hop. `deploy/Caddyfile` publishes 443 and nothing else, so there
    # is no plain-HTTP path to production — but that is a deploy-side fact one
    # config edit away from changing, and this is the browser-side guarantee.
    # `http://localhost` still works: user agents treat it as a potentially
    # trustworthy origin, so the local stack is unaffected (see
    # `deploy/local/README.md`).
    response.set_cookie(COOKIE_NAME, sid, httponly=True, samesite="lax",
                        secure=True, max_age=cfg.session_ttl)
    return {"username": user["username"]}


@router.post("/logout")
def logout(request: Request, response: Response):
    # Not behind `require_session`: signing out of a session that has already
    # ended is not an error, and a 401 here would leave the browser holding a
    # cookie it was told nothing about.
    user = current_user(request)
    if user is not None:
        sid = request.state.session_id
        sessions.revoke(get_conn(request), sid, int(time.time()))
        record(request, "logout", actor=user["username"], session_id=sid)
    # Cleared with the attributes it was set with. starlette's `delete_cookie` is a
    # wrapper that forwards `path`/`domain`/`secure`/`httponly`/`samesite` to
    # `set_cookie` with `max_age=0`, so anything left unsaid is re-sent at its
    # *default* — and the default for `secure` is False. `path` is the part a user
    # agent matches identity on; `secure` matters because a non-secure Set-Cookie
    # arriving over an insecure channel is not permitted to overwrite a secure
    # cookie. The path is starlette's default "/", which is what login sets.
    response.delete_cookie(COOKIE_NAME, secure=True)
    return {"ok": True}


@router.get("/me")
def me(request: Request, user=Depends(require_session)):
    return descriptor(get_conn(request), user)


@router.post("/password", status_code=204)
async def change_password(body: PasswordBody, request: Request,
                          user=Depends(require_session)):
    """Change your own password, and end every other session you hold (D7, D15).

    The rules — re-verify the current password, the six-character floor, which
    sessions die and in what order — are `auth.apply_password_change`'s. This
    turns its answer into a status code and writes the record.

    `async` + `to_thread.run_sync` under `_VERIFY_LIMITER`, the same shape as
    `login` above and for a stronger reason: this handler runs *two* argon2
    operations, a verify and a hash, ~64 MiB and ~61 ms each. Needing a session
    first buys nothing — every member of staff has one — and as a plain `def` this
    would be worse than the endpoint the ceiling was built against, in two ways.
    It would allow 40 concurrent arenas (~2.5 GB on a 3.7 GB host, D22) rather
    than two; and because a limiter *replaces* the default pool rather than
    nesting inside it, those 40 would sit on the very pool the sign-in limiter
    exists to keep clear, stalling every sync route in the app — the export
    downloads included.

    The whole policy call goes across, not only the two argon2 calls. That keeps
    `apply_password_change`'s seam intact (a connection, a row, two strings; a
    message or None), and what travels with it is two `UPDATE`s against a local
    sqlite file — microseconds beside the ~122 ms the slot is held for anyway.
    """
    problem = await anyio.to_thread.run_sync(
        functools.partial(apply_password_change, get_conn(request), user,
                          body.current, body.next, now=int(time.time()),
                          keep_session=request.state.session_id),
        limiter=_VERIFY_LIMITER)
    if problem:
        # One status for both refusals. They are not the same message — the
        # person needs to know which of the two fields to correct — but neither
        # is a 401: the caller's session is fine, the body is not.
        raise HTTPException(status_code=400, detail=problem)
    record(request, "password.changed", actor=user["username"],
           session_id=request.state.session_id)
    return Response(status_code=204)
