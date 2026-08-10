"""User rows. No policy, no HTTP — delegation rules live in P0c."""
from __future__ import annotations

import sqlite3
import time

from ..phone import normalise_phone


def create(conn: sqlite3.Connection, *, username: str, display_name: str,
           password_hash: str, role_id: int, supervisor_id: int | None = None,
           can_supervise: bool = False) -> int:
    cur = conn.execute(
        "INSERT INTO users (username, display_name, password_hash, role_id,"
        " supervisor_id, can_supervise) VALUES (?, ?, ?, ?, ?, ?)",
        (normalise_phone(username), display_name, password_hash, role_id,
         supervisor_id, 1 if can_supervise else 0),
    )
    return int(cur.lastrowid)


def by_username(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    # Normalised on both sides of the comparison (D57). Only the canonical form
    # is stored, so a lookup for the raw string a Persian keyboard produced would
    # miss the account and hand the same person a second one.
    return conn.execute(
        "SELECT * FROM users WHERE username = ?",
        (normalise_phone(username),)).fetchone()


def by_id(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def set_password(conn: sqlite3.Connection, user_id: int, password_hash: str) -> None:
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                 (password_hash, user_id))


def set_disabled(conn: sqlite3.Connection, user_id: int, disabled: bool,
                 now: int | None = None) -> None:
    # `now` is optional and fourth, so the three-argument calls already written
    # against this signature keep working. It exists because every other write in
    # these stores takes its instant from the caller: without it, the one
    # timestamp that decides whether a person can sign in is the one timestamp no
    # test can control, and the `user.disabled` activity event would always name a
    # different instant than the row it describes.
    conn.execute("UPDATE users SET disabled_at = ? WHERE id = ?",
                 ((_now() if now is None else now) if disabled else None, user_id))


def _now() -> int:
    return int(time.time())
