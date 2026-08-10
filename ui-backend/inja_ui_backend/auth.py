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
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
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
    except (InvalidHashError, VerificationError):
        # A stored value argon2 cannot even parse is not a password anyone got
        # right; refusing beats a 500 that says the account is special.
        #
        # These three and nothing wider. A bare `except Exception` here also
        # swallows the caller's own bugs -- a `None` where a hash belongs comes
        # back as a clean `False`, i.e. as "wrong password", and the bug looks
        # exactly like a member of staff mistyping. `VerifyMismatchError` is a
        # `VerificationError` and is caught above only for the comment; the pair
        # kept here is every failure argon2 raises about the *data* it was given.
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


def client_ip(request: Request) -> str:
    """The address to record for this request — the caller's, not the proxy's (D7).

    `request.client.host` is the peer of the TCP connection. Behind
    `deploy/Caddyfile` that peer is always Caddy, so recorded naively every row
    in the failed-sign-in report reads `172.18.0.1` and the report — D44's only
    detection surface — says nothing about who was guessing.

    `X-Forwarded-For` is the header that carries the answer, and it is also a
    header any client can simply write. Trusting it unconditionally is worse than
    the useless-but-honest bridge address: it lets a stranger choose what the
    audit record says about them, and an audit record an attacker can author is
    not evidence. So the header is read only as far as there are proxies actually
    in front of this process, and `TRUSTED_PROXY_HOPS` is how many that is.

    Caddy *appends* the peer it really saw to whatever the client sent, so with
    one trusted proxy the **last** entry is the one the proxy vouched for and
    every earlier entry is the client's own writing. With N trusted proxies it is
    the Nth from the end, by the same argument applied N times.

    Default 0 — the header is ignored and the peer is recorded. That is the right
    answer wherever no proxy exists: the tests, a local `uvicorn`, a stack reached
    directly on the LAN. A deployment that puts this behind a proxy sets the
    number to match its own topology; guessing on its behalf is what would make a
    direct client's forged header authoritative.

    A chain shorter than the configured hop count means the header did not come
    through the expected proxies (or came without one adding to it), so it cannot
    be read positionally and the peer is recorded instead.
    """
    peer = request.client.host if request.client else ""
    hops = request.app.state.cfg.trusted_proxy_hops
    if hops < 1:
        return peer
    chain = [part.strip() for part in
             request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if len(chain) < hops:
        return peer
    return chain[-hops]


def request_origin(request: Request) -> tuple[str, str]:
    """(ip, user_agent) for the session row and the activity record.

    One function so the two never disagree.
    """
    return client_ip(request), request.headers.get("user-agent", "")


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
