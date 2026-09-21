"""The operational store (spec D1, D6).

stdlib sqlite3, no ORM. The project already refuses an ORM for process content;
this store has seven tables and no relational complexity that would justify a
dependency. Schema is a list of numbered migrations so the same code path
creates a fresh database and upgrades an existing one.
"""
from __future__ import annotations

import sqlite3
import threading
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
    # THE RULE: **one connection per thread.** A `sqlite3.Connection` must never
    # be used by two threads at once. SQLite's serialized mode (`threadsafety ==
    # 3`) only protects SQLite's own C state; Python's `Connection` and its
    # cursors carry state of their own (the statement cache, the current
    # statement's row), and two threads calling `execute()`/`fetchone()` on one
    # object interleave it: rows come back from the other thread's query, or
    # `IndexError` / `InterfaceError` is raised. Sharing one connection across
    # FastAPI's threadpool made ~5-8% of requests fail under 24 parallel GETs.
    #
    # So the app never hands a handler this connection directly: `app.state.db`
    # (and `app.state.comments_db`) is a `PerThread`, which gives each worker
    # thread a connection of its own (the routers are plain `def`, deliberately,
    # so argon2 does not block the event loop — hence many threads).
    #
    # `check_same_thread=False` stays only so a connection opened on one thread
    # may be *handed* to another (a test's `app.state.db = conn`); it is not
    # permission to use one from two threads at the same time.
    #
    # Still no explicit transaction on `app.state.db` from a handler: a
    # threadpool thread is reused by later requests, so a transaction left open
    # there would leak into someone else's request. Anything needing atomicity
    # across statements opens its own connection (`db.connect`) and closes it.
    # The only other explicit transactions are `migrate` below (once, at
    # startup) and `seed.py` (an operator CLI on its own connection).
    conn = sqlite3.connect(str(path), isolation_level=None,
                           check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL so a reader never blocks the writer; foreign keys are off by default in
    # sqlite and the session/user relationship depends on them.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


class _Owned:
    """Closes its connection when the last reference goes.

    A `sqlite3.Connection` sits in a reference cycle with its statement cache,
    so dropping it only closes it at the next cyclic GC pass. This holder is
    acyclic, so plain refcounting runs `__del__` the moment a thread's
    `threading.local` is cleared, i.e. when the thread exits.
    """

    __slots__ = ("conn",)

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def __del__(self):
        self.conn.close()


class PerThread:
    """A stand-in for one shared connection that is really one per thread.

    Every attribute (`execute`, `in_transaction`, ...) is forwarded to the
    calling thread's own `connect(path)`, opened on first use and closed when
    that thread exits (`_Owned`), so the number open is bounded by the threads
    alive (the threadpool's size), not by the number of requests.

    Attribute *reads* only: no `with`, no attribute assignment (setting
    `row_factory` here sets it on the proxy, not on any connection), and a call
    with a lasting effect, such as `set_trace_callback`, affects only the
    calling thread's connection.
    """

    def __init__(self, path: Path):
        self._path = path
        self._local = threading.local()

    def __getattr__(self, name: str):
        owned = getattr(self._local, "owned", None)
        if owned is None:
            owned = self._local.owned = _Owned(connect(self._path))
        return getattr(owned.conn, name)


def _current_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).fetchone()
    if row is None:
        return 0
    got = conn.execute("SELECT version FROM schema_version").fetchone()
    return got[0] if got else 0


def migrate(conn: sqlite3.Connection,
            migrations: list[tuple[int, str]] | None = None) -> int:
    migrations = MIGRATIONS if migrations is None else migrations
    version = _current_version(conn)
    for target, sql in migrations:
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
