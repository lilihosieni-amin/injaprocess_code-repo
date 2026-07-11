from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import COOKIE_NAME, issue_cookie, require_session, verify_password
from ..models import LoginBody

router = APIRouter(prefix="/api/auth")


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    cfg = request.app.state.cfg
    if body.username != cfg.ui_username or not verify_password(cfg, body.password):
        raise HTTPException(status_code=401, detail="invalid credentials")
    response.set_cookie(COOKIE_NAME, issue_cookie(cfg, body.username),
                        httponly=True, samesite="lax", max_age=cfg.session_ttl)
    return {"username": body.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    user = require_session(request)
    return {"username": user}
