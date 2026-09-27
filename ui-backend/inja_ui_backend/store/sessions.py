"""Session rows (spec D7).

A session is a row so it can be revoked, so 'who is here now' is answerable, and
so presence can be measured. The cookie carries this id and nothing else.
"""
from __future__ import annotations

import secrets
import sqlite3


#: D43/D81: an interval stays open while requests keep arriving within this gap.
IDLE_S = 300


def touch_interval(conn: sqlite3.Connection, session_id: str, now: int) -> None:
    """Extend the session's open activity interval, or open a new one (D81).

    Called on every signed-in request (`resolve`), so an interval ends at its
    last request by construction — D43's "backdated to the last heartbeat",
    with nothing to backdate. The heartbeat is the SPA's 60-second refetch of
    `/api/auth/me`, which TanStack Query pauses while the tab is hidden.
    """
    row = conn.execute(
        "SELECT id, ended_at FROM activity_intervals WHERE session_id = ?"
        " ORDER BY id DESC LIMIT 1", (session_id,)).fetchone()
    if row is not None and now - row["ended_at"] <= IDLE_S:
        conn.execute("UPDATE activity_intervals SET ended_at = ? WHERE id = ?",
                     (now, row["id"]))
    else:
        conn.execute("INSERT INTO activity_intervals (session_id, started_at, ended_at)"
                     " VALUES (?, ?, ?)", (session_id, now, now))


def issue(conn: sqlite3.Connection, user_id: int, *, ip: str, user_agent: str,
          now: int) -> str:
    sid = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (id, user_id, issued_at, last_seen, ip, user_agent)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (sid, user_id, now, now, ip, user_agent),
    )
    return sid


def resolve(conn: sqlite3.Connection, session_id: str, *, ttl: int,
            now: int) -> sqlite3.Row | None:
    """Return the session row, or None if it cannot be used.

    Expiry is ABSOLUTE from issued_at, never sliding from last_seen: the
    heartbeat runs while a tab is open, not while a person is present, so a
    sliding window would make 'signed in' unbounded for anyone who leaves the
    app open.

    Two things about the returned row. It is the row as it was read, *before*
    the `last_seen` write, so `row["last_seen"]` is the previous heartbeat, not
    `now` — do not report it as "last seen" without re-reading. And it carries
    an extra `user_disabled_at` column from the join: it is a session row, not
    a user row.
    """
    row = conn.execute(
        "SELECT s.*, u.disabled_at AS user_disabled_at FROM sessions s"
        " JOIN users u ON u.id = s.user_id WHERE s.id = ?", (session_id,)
    ).fetchone()
    if row is None or row["revoked_at"] is not None:
        return None
    if row["user_disabled_at"] is not None:
        return None
    if now - row["issued_at"] >= ttl:
        return None
    conn.execute("UPDATE sessions SET last_seen = ? WHERE id = ?", (now, session_id))
    touch_interval(conn, session_id, now)
    return row


def revoke(conn: sqlite3.Connection, session_id: str, now: int) -> None:
    conn.execute(
        "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
        (now, session_id))


def revoke_all_for_user(conn: sqlite3.Connection, user_id: int, now: int, *,
                        except_session: str | None = None) -> int:
    sql = ("UPDATE sessions SET revoked_at = ? WHERE user_id = ?"
           " AND revoked_at IS NULL")
    args: list[object] = [now, user_id]
    if except_session is not None:
        sql += " AND id != ?"
        args.append(except_session)
    return int(conn.execute(sql, args).rowcount)
