"""Per-person authentication (spec D7, D15, D47, D56, D57, D58).

Mechanics only: who is signing in, whether the credential holds, and which row
the cookie names. No HTTP shapes — `routers/auth.py` owns those — and no
capability enforcement, which is a separate sub-project (D48).
"""
from __future__ import annotations

import json
import sqlite3
import time

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request

from .phone import USERNAME_RE, normalise_phone
from .store import audit, sessions, users

COOKIE_NAME = "inja_session"
MIN_PASSWORD_LENGTH = 6

_ph = PasswordHasher()

# Verified against on the miss path so an unknown number costs the same as a
# wrong password. Without it, sign-in is a timing oracle — and with phone
# numbers as usernames it answers "does this person work here?" (D56).
_DUMMY_HASH = _ph.hash("a-password-nobody-has")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_hash(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        # A stored value argon2 cannot even parse is not a password anyone got
        # right; refusing beats a 500 that says the account is special.
        return False


def validate_password(password: str) -> str | None:
    """Return an error message, or None when acceptable.

    Six characters, no complexity rule, no expiry, no reuse check (D58). Every
    rule beyond a length floor trades a real cost in passwords written down
    against a benefit the evidence has not supported for a decade.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"گذرواژه باید دست‌کم {MIN_PASSWORD_LENGTH} نویسه باشد"
    return None


def authenticate(conn: sqlite3.Connection, username: str,
                 password: str) -> tuple[sqlite3.Row | None, str]:
    """Return (user, reason). Reason is recorded, never returned to the caller."""
    canonical = normalise_phone(username)
    row = users.by_username(conn, canonical) if canonical else None
    if row is None:
        verify_hash(_DUMMY_HASH, password)      # constant-time miss path
        return None, "no_such_user"
    # Before the disabled check, and deliberately: a disabled account with the
    # wrong password is a wrong password, so the two cost the same argon2 verify
    # and the record says which of them it really was.
    if not verify_hash(row["password_hash"], password):
        return None, "bad_password"
    if row["disabled_at"] is not None:
        return None, "disabled"
    return row, "ok"


def attempted_actor(username: str) -> str:
    """Who a failed sign-in is recorded against.

    The canonical number when the attempt looks like one, so repeated guesses at
    one account group together in the failed-sign-in report however each was
    typed. Otherwise the raw text, truncated: `normalise_phone` is a normaliser
    and not a validator — it answers "0cashier" for "cashier" — and recording
    that would dress someone walking a namespace up as a mistyped number.
    """
    canonical = normalise_phone(username)
    if USERNAME_RE.fullmatch(canonical):
        return canonical
    return username[:64]


def request_origin(request: Request) -> tuple[str, str]:
    """(ip, user_agent) for the session row and the activity record.

    One function so the two never disagree, and one place to start trusting
    `X-Forwarded-For` when the proxy in front of this service is configured to
    set it (D7).
    """
    return ((request.client.host if request.client else ""),
            request.headers.get("user-agent", ""))


def get_conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def current_user(request: Request) -> sqlite3.Row | None:
    """The signed-in user, or None. `require_session` is the version that refuses.

    Resolving the session also touches its heartbeat and refuses a revoked one,
    an expired one and one whose user has since been disabled (D7).

    The session id is left on `request.state.session_id` for the handlers that
    need to name it — the activity record, and revoking on sign-out.
    """
    conn = get_conn(request)
    sid = request.cookies.get(COOKIE_NAME)
    row = sessions.resolve(conn, sid, ttl=request.app.state.cfg.session_ttl,
                           now=int(time.time())) if sid else None
    if row is None:
        return None
    user = users.by_id(conn, row["user_id"])
    if user is None:
        return None
    request.state.session_id = row["id"]
    return user


def require_session(request: Request) -> sqlite3.Row:
    """The session gate. Returns the USER row.

    Named and used exactly as before, so the fourteen routers that bind it to
    `_` need no change here. Capability enforcement is P0b.
    """
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


def descriptor(conn: sqlite3.Connection, user: sqlite3.Row) -> dict:
    """What `GET /api/auth/me` says about the signed-in person (D47).

    Field names are the SPA's (`ui/src/auth/session.ts`), which is the only
    consumer. Capabilities and scopes are reported, never enforced here.
    """
    role = conn.execute("SELECT name, capabilities FROM roles WHERE id = ?",
                        (user["role_id"],)).fetchone()
    scopes = [r["scope"] for r in conn.execute(
        "SELECT scope FROM user_scopes WHERE user_id = ? ORDER BY scope",
        (user["id"],))]
    supervisor = (users.by_id(conn, user["supervisor_id"])
                  if user["supervisor_id"] is not None else None)
    return {
        "username": user["username"],
        "displayName": user["display_name"],
        "role": role["name"],
        "capabilities": json.loads(role["capabilities"]),
        "scopes": scopes,
        "supervisor": supervisor["username"] if supervisor is not None else None,
        "canSupervise": bool(user["can_supervise"]),
        # Nothing produces approvals yet — comments arrive in a later phase. The
        # key is here from the start because the reader shell draws a badge from
        # it, and an absent key reads as `undefined` rather than as none.
        "pendingApprovals": 0,
    }


def record(request: Request, action: str, **kw) -> None:
    ip, user_agent = request_origin(request)
    audit.record(get_conn(request), action=action, now=int(time.time()),
                 ip=ip, user_agent=user_agent, **kw)
