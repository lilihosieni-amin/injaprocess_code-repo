"""The activity record (spec D41, D42).

Append-only by construction: this module offers no update and no delete, and no
endpoint anywhere exposes one. A record the top user can rewrite records nothing.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3


#: The Telegram runtime's actor — stamped by the outbox drain (D59) and by the
#: git projection for chat edits (D60), never read from anything it wrote.
AGENT = "agent:control-bot"


def session_tag(session_id: str | None) -> str | None:
    """A session as the record may show it: 6 hex chars of its SHA-256.

    A live session id is a bearer credential, so no report ever returns one;
    the tag still lets a reader see which rows came from the same session.
    """
    if not session_id:
        return None
    return hashlib.sha256(session_id.encode()).hexdigest()[:6]


def record(conn: sqlite3.Connection, *, actor: str, action: str, now: int,
           session_id: str | None = None, target: str | None = None,
           ip: str = "", user_agent: str = "", outcome: str = "ok",
           detail: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_events (at, actor, session_id, action, target, ip,"
        " user_agent, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (now, actor, session_id, action, target, ip, user_agent, outcome,
         json.dumps(detail, ensure_ascii=False) if detail is not None else None),
    )


def recent_failures(conn: sqlite3.Connection, *, actor: str,
                    since: int) -> tuple[int, int | None]:
    """How many sign-ins `actor` has failed since `since`, and when the first was.

    The counter behind the sign-in throttle (`auth.login_retry_after`). It reads
    the activity record rather than keeping a table or a dict of its own, because
    the rows are already being written — `login.failure` is recorded for every
    miss (D42) — and a second store would be a second thing to keep correct.

    **`action = 'login.failure'` and not `outcome = 'fail'`.** A throttled attempt
    is recorded too, as `login.throttled`, and if it counted here the window would
    feed itself: somebody hammering a locked account would keep pushing the oldest
    failure forward and never be let back in. Only a real verification failure
    extends it.

    `MIN(at)` comes back with the count because the caller answers `Retry-After`
    with it: the window is a sliding one, so the wait is until the *oldest*
    failure leaves it, not a fixed minute from now.

    Indexed by `audit_at`'s sibling `audit_actor (actor, at)` — a seek on the
    actor and a range scan on the timestamp, which is why this can run on every
    sign-in without the record's size mattering. Rows are never deleted (D45), so
    that index is the whole reason this stays cheap at a million rows.
    """
    row = conn.execute(
        "SELECT COUNT(*), MIN(at) FROM audit_events"
        " WHERE actor = ? AND action = 'login.failure' AND at > ?",
        (actor, since),
    ).fetchone()
    return int(row[0]), (int(row[1]) if row[1] is not None else None)
