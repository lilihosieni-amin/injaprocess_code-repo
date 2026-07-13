from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import Settings

COOKIE_NAME = "inja_session"
_ph = PasswordHasher()


def verify_hash(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def authenticate(cfg: Settings, username: str, password: str) -> bool:
    h = cfg.users.get(username)
    if h and verify_hash(h, password):
        return True
    # Single-user env fallback (UI_USERNAME/UI_PASSWORD_HASH). Disabled in
    # multi-user mode, where load_settings leaves these blank ("") so the
    # guard below is falsy and cannot authenticate an empty username.
    if cfg.ui_username and cfg.ui_password_hash and username == cfg.ui_username:
        return verify_hash(cfg.ui_password_hash, password)
    return False


def _serializer(cfg: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(cfg.session_signing_key, salt="inja-session")


def issue_cookie(cfg: Settings, username: str) -> str:
    return _serializer(cfg).dumps({"u": username})


def read_cookie(cfg: Settings, token: str) -> str | None:
    try:
        data = _serializer(cfg).loads(token, max_age=cfg.session_ttl)
        return data.get("u")
    except (BadSignature, SignatureExpired):
        return None


def require_session(request: Request) -> str:
    cfg: Settings = request.app.state.cfg
    token = request.cookies.get(COOKIE_NAME)
    user = read_cookie(cfg, token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="authentication required")
    return user
