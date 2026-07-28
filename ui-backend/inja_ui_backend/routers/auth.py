from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import COOKIE_NAME, issue_cookie, require_session, authenticate
from ..models import LoginBody

router = APIRouter(prefix="/api/auth")


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    cfg = request.app.state.cfg
    if not authenticate(cfg, body.username, body.password):
        raise HTTPException(status_code=401, detail="invalid credentials")
    # `secure`: this cookie is the whole admin session, so it may never travel over
    # a cleartext hop. `deploy/Caddyfile` publishes 443 and nothing else, so there
    # is no plain-HTTP path to production — but that is a deploy-side fact one
    # config edit away from changing, and this is the browser-side guarantee.
    # `http://localhost` still works: user agents treat it as a potentially
    # trustworthy origin, so the local stack is unaffected (see
    # `deploy/local/README.md`).
    response.set_cookie(COOKIE_NAME, issue_cookie(cfg, body.username),
                        httponly=True, samesite="lax", secure=True,
                        max_age=cfg.session_ttl)
    return {"username": body.username}


@router.post("/logout")
def logout(response: Response):
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
def me(request: Request):
    user = require_session(request)
    return {"username": user}
