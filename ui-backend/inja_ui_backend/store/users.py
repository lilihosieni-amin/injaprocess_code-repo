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


def update(conn: sqlite3.Connection, user_id: int, *, username: str,
           display_name: str, role_id: int, supervisor_id: int | None,
           can_supervise: bool) -> None:
    """Rewrite the five mutable columns of one account.

    Every field is given, never a dynamic `SET` built from whichever ones a
    request mentioned: the caller has already resolved "absent" to "what the row
    holds now", and a half-built statement is how a column nobody meant to touch
    ends up in one. `id`, `password_hash`, `created_at` and `disabled_at` are
    absent on purpose — the first three have their own writers and the fourth is
    `set_disabled`'s, which is a different decision with a different guard (D14).

    **`WHERE id = ?`, and it is the whole safety of this statement.** An UPDATE
    over `users` with no `WHERE` re-roles every account in the installation, and
    a test whose fixture holds one user cannot tell the two apart.
    """
    conn.execute(
        "UPDATE users SET username = ?, display_name = ?, role_id = ?,"
        " supervisor_id = ?, can_supervise = ? WHERE id = ?",
        (normalise_phone(username), display_name, role_id, supervisor_id,
         1 if can_supervise else 0, user_id),
    )


def set_scopes(conn: sqlite3.Connection, user_id: int,
               scopes: list[str]) -> None:
    """Replace one user's scope rows with exactly `scopes`.

    **Call this inside a transaction on a connection of your own.** It is a
    DELETE followed by N INSERTs, and between them the account reaches nothing;
    on the shared autocommit connection (see `db.connect`) a concurrent request
    would read that gap as a user with no access at all.

    **`WHERE user_id = ?`.** `DELETE FROM user_scopes` without it empties the
    table for every account in the installation — and would pass every test
    whose fixture happens to hold one user's scopes, which is why
    `test_users_api.py` seeds two.

    `scopes` is expected already normalised and de-duplicated by the caller:
    `user_scopes` is keyed `(user_id, scope)`, so a list carrying the same scope
    twice raises `IntegrityError` from inside the caller's transaction rather
    than storing anything.
    """
    conn.execute("DELETE FROM user_scopes WHERE user_id = ?", (user_id,))
    for scope in scopes:
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                     (user_id, scope))


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
