"""The operational store (spec D1, D6).

stdlib sqlite3, no ORM. The project already refuses an ORM for process content;
this store has five tables and no relational complexity that would justify a
dependency. Schema is a list of numbered migrations so the same code path
creates a fresh database and upgrades an existing one.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

# Every migration is (version, sql). Append only — never edit a shipped one.
MIGRATIONS: list[tuple[int, str]] = [
    (1, """
        CREATE TABLE schema_version (version INTEGER NOT NULL);

        CREATE TABLE roles (
            id           INTEGER PRIMARY KEY,
            name         TEXT NOT NULL UNIQUE,
            capabilities TEXT NOT NULL          -- JSON array of capability names
        );

        CREATE TABLE users (
            id            INTEGER PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE, -- canonical ^09\\d{9}$ (D57)
            display_name  TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role_id       INTEGER NOT NULL REFERENCES roles(id),
            supervisor_id INTEGER REFERENCES users(id),
            can_supervise INTEGER NOT NULL DEFAULT 0,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            disabled_at   INTEGER
        );

        CREATE TABLE user_scopes (
            user_id INTEGER NOT NULL REFERENCES users(id),
            scope   TEXT NOT NULL,              -- '*' | 'dept:x' | 'dept:x/report:k'
            PRIMARY KEY (user_id, scope)
        );

        CREATE TABLE sessions (
            id         TEXT PRIMARY KEY,        -- opaque; the cookie carries only this
            user_id    INTEGER NOT NULL REFERENCES users(id),
            issued_at  INTEGER NOT NULL,
            last_seen  INTEGER NOT NULL,
            ip         TEXT NOT NULL,
            user_agent TEXT NOT NULL,
            revoked_at INTEGER
        );

        CREATE TABLE audit_events (
            id         INTEGER PRIMARY KEY,
            at         INTEGER NOT NULL,
            actor      TEXT NOT NULL,           -- username, or 'agent:...' / 'run:...'
            session_id TEXT,
            action     TEXT NOT NULL,
            target     TEXT,
            ip         TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',
            outcome    TEXT NOT NULL DEFAULT 'ok',
            detail     TEXT                     -- JSON, for reason/before/after
        );
        CREATE INDEX audit_at ON audit_events (at);
        CREATE INDEX audit_actor ON audit_events (actor, at);
    """),
]

SCHEMA_VERSION = MIGRATIONS[-1][0]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.row_factory = sqlite3.Row
    # WAL so a reader never blocks the writer; foreign keys are off by default in
    # sqlite and the session/user relationship depends on them.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _current_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).fetchone()
    if row is None:
        return 0
    got = conn.execute("SELECT version FROM schema_version").fetchone()
    return got[0] if got else 0


def migrate(conn: sqlite3.Connection) -> int:
    version = _current_version(conn)
    for target, sql in MIGRATIONS:
        if target <= version:
            continue
        # The DDL and the version bump must land together or not at all. The
        # connection is in autocommit mode and executescript adds no transaction
        # of its own, so without this wrapper a crash between the CREATEs and the
        # version row would leave schema_version present but empty -- and every
        # later start would re-run migration 1 and die on "table already exists".
        # Wrapping happens here rather than in the migration text so the author of
        # migration 2 cannot forget it.
        try:
            conn.executescript(
                "BEGIN;\n"
                f"{sql}\n"
                "DELETE FROM schema_version;\n"
                f"INSERT INTO schema_version (version) VALUES ({int(target)});\n"
                "COMMIT;"
            )
        except Exception:
            # A failed statement stops the script before COMMIT, leaving the
            # transaction open on this connection. Undo it so the caller is left
            # with a database it can retry against rather than a wedged one.
            if conn.in_transaction:
                conn.rollback()
            raise
        version = target
    return version
