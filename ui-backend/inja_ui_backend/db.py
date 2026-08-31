"""The operational store (spec D1, D6).

stdlib sqlite3, no ORM. The project already refuses an ORM for process content;
this store has seven tables and no relational complexity that would justify a
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
    (2, """
        CREATE TABLE confirmations (
            -- A process id ('dining-001') or a department code ('dining').
            -- One column for both because the two namespaces are disjoint by
            -- construction: a department code carries no '-', a process id
            -- always does. D20 says the target is "a process id or a department
            -- code"; splitting it into two tables would give the same question
            -- two places to be answered and two places to forget one.
            -- NOT NULL is not redundant beside PRIMARY KEY: sqlite keeps a
            -- long-standing bug-compatibility quirk where a non-INTEGER primary
            -- key still accepts NULL, and accepts it repeatedly since NULLs do
            -- not equal each other. Without it a store bug could fill the table
            -- with rows that vouch for nothing.
            target       TEXT PRIMARY KEY NOT NULL,
            -- The SHA-256 of the canonical form of what was confirmed (D21).
            -- Never a boolean: a boolean would have to be cleared correctly by
            -- the UI's Save, a chat edit and a `merge` run, and missing one
            -- leaves the mark vouching for something stale.
            fingerprint  TEXT NOT NULL,
            confirmed_by TEXT NOT NULL,           -- username
            confirmed_at INTEGER NOT NULL         -- unix seconds
        );

        CREATE TABLE visibility_policy (
            -- One row per *changed* switch. An absent row reads as D17's
            -- default (store/policy.py), so the defaults are stated once, in
            -- Python, rather than once here and once there.
            field   TEXT PRIMARY KEY NOT NULL,   -- see `target` above on NOT NULL
            visible INTEGER NOT NULL CHECK (visible IN (0, 1))
        );
    """),
    (3, """
        -- The data-repo's `HEAD` at the moment of the vouch (QF-24), so a
        -- post-restore reconciliation can tell backup skew — the confirmation
        -- is fine, only `app.db` was restored from an older snapshot than the
        -- data-repo — from genuine drift, where the content really has moved
        -- on since. Nullable: a row written before this migration carries
        -- none, and that is a fact about it, not an error.
        ALTER TABLE confirmations ADD COLUMN data_repo_commit TEXT;
    """),
]

SCHEMA_VERSION = MIGRATIONS[-1][0]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    # `check_same_thread=False`: the app opens one connection at startup, on the
    # main thread, and every request handler then runs in one of FastAPI's
    # threadpool workers -- the routers are plain `def`, deliberately, so argon2
    # does not block the event loop. Without this the first request dies with
    # "SQLite objects created in a thread can only be used in that same thread".
    # Safe because CPython's sqlite3 reports `threadsafety == 3` here (SQLite
    # built in serialized mode), so the library serializes concurrent use of one
    # connection itself.
    #
    # INVARIANT, and it is the whole of what makes the sharing safe: **no request
    # handler may open an explicit transaction on the shared connection.** A
    # transaction is connection state, not statement state, so serialization does
    # not help with one: with `isolation_level=None` Python opens none implicitly,
    # and today every handler is a single autocommitted statement, so there is
    # nothing to interleave. The moment a handler wraps writes in `BEGIN...COMMIT`
    # -- creating a user and their scopes together, or revoking every other session
    # when a password changes -- two concurrent requests share one transaction:
    # the second `BEGIN` raises "cannot start a transaction within a transaction",
    # or, worse, one thread's `COMMIT` commits the other thread's half-written
    # work. Anything needing atomicity across statements must therefore open its
    # own connection (`db.connect`) and use it on that one thread. The only
    # explicit transactions in the package are `migrate` below, which runs once at
    # startup before any request, and `seed.py`, which is an operator CLI on its
    # own connection.
    conn = sqlite3.connect(str(path), isolation_level=None,
                           check_same_thread=False)
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
