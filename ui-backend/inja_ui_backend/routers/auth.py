import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..auth import (
    COOKIE_NAME,
    attempted_actor,
    authenticate,
    current_user,
    descriptor,
    get_conn,
    record,
    request_origin,
    require_session,
)
from ..models import LoginBody
from ..store import sessions

router = APIRouter(prefix="/api/auth")


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    # A plain `def`, so FastAPI runs it in a threadpool: argon2 is deliberately
    # ~58 ms of CPU, and verifying on the event loop would freeze every other
    # request in the process for that long.
    cfg = request.app.state.cfg
    conn = get_conn(request)
    user, reason = authenticate(conn, body.username, body.password)
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
