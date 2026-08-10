"""The one shared credential that opens a published export.

It is a sibling of `auth`, never a part of it. The export credential lives in its
own two settings instead of in `app_db`, so `auth.authenticate` — which reads rows
from that database — has no path to it.

The two session kinds are now different in kind rather than in salt: an export
session is a signed itsdangerous token carrying its own claims, while an admin
session is an opaque id looked up in the `sessions` table. So an export token
opens the admin API only if it happens to equal a live session id, which it
cannot: one is signed and structured, the other is 32 bytes from `secrets`. The
separation is structural. The reverse is allowed — an admin already sees
everything.
"""
from __future__ import annotations

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from . import auth
from .config import Settings

#: Distinct from `auth.COOKIE_NAME`, so both sessions can live in one browser
#: and neither is ever read in place of the other.
EXPORT_COOKIE = "inja_export_session"

#: Distinct from the admin session's "inja-session"; this is what makes an
#: export token fail the admin signature check, and vice versa.
_SALT = "inja-export-session"


def configured(cfg: Settings) -> bool:
    """Whether an export credential exists at all. Unset closes the gate.

    Public because the login page needs the same question answered (D30): with
    nothing to type, a form would be a lie, so the router keeps answering 401.
    """
    return bool(cfg.export_username and cfg.export_password_hash)


def authenticate(cfg: Settings, username: str, password: str) -> bool:
    if not configured(cfg):
        return False
    if username != cfg.export_username:
        return False
    return auth.verify_hash(cfg.export_password_hash, password)


def _serializer(cfg: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(cfg.session_signing_key, salt=_SALT)


def issue_cookie(cfg: Settings) -> str:
    return _serializer(cfg).dumps({"e": True})


def read_cookie(cfg: Settings, token: str) -> bool:
    """True only for a token this server signed, still inside its TTL, while an
    export credential is configured."""
    if not configured(cfg):
        return False
    try:
        data = _serializer(cfg).loads(token, max_age=cfg.session_ttl)
    except (BadSignature, SignatureExpired):
        return False
    return data.get("e") is True


def require_export_access(request: Request) -> None:
    """FastAPI dependency: an export session or an admin session, else 401."""
    cfg: Settings = request.app.state.cfg
    export_token = request.cookies.get(EXPORT_COOKIE)
    if export_token and read_cookie(cfg, export_token):
        return
    # The admin session is a row now, not a signed blob (D7), so this asks the
    # session store rather than a signature — which is also what makes a revoked
    # or disabled account lose its way into the exports.
    if auth.current_user(request) is not None:
        return
    raise HTTPException(status_code=401, detail="authentication required")
