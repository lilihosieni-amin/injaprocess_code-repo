"""`comments.db` — comments and their approval workflow (spec D1, D5).

A second SQLite file, not tables in `app.db`: this one is mounted into
control-bot for the `comments` CLI, and `app.db` never is (D5). The CLI in
`engine/comments/` reads and writes these tables by their SQL; it cannot import
this module (`test_layering.py`), so the schema is the contract and
`tests/test_comments_contract.py` pins it from both sides. Change a table here
and that test tells you which CLI query to change with it.

Append-only migrations, like `db.MIGRATIONS`.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from . import db

MIGRATIONS: list[tuple[int, str]] = [
    (1, """
        CREATE TABLE schema_version (version INTEGER NOT NULL);

        CREATE TABLE comments (
            -- AUTOINCREMENT, not a bare rowid: a CMT number is quoted in
            -- Telegram and must never come back as someone else's (D32).
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            -- The author, denormalised (D39): the CLI reads this file only and
            -- must never need a users table.
            author_id       INTEGER NOT NULL,
            author_username TEXT NOT NULL,
            author_name     TEXT NOT NULL,
            anchor_kind     TEXT NOT NULL
                            CHECK (anchor_kind IN ('node', 'process', 'department')),
            -- node id, process id, or department code
            anchor_id       TEXT NOT NULL,
            -- the process of a node or process anchor; NULL for a department
            process_id      TEXT,
            department      TEXT NOT NULL,
            -- JSON {department_name, process_name?, node_label?} as it stood (D31)
            snapshot        TEXT NOT NULL,
            text            TEXT NOT NULL,
            state           TEXT NOT NULL CHECK (state IN
                            ('awaiting', 'approved', 'addressed', 'rejected', 'withdrawn')),
            -- set only while awaiting: with a named Reader supervisor, or in the
            -- Admin pool (D63)
            stage           TEXT CHECK (stage IN ('reader', 'pool')),
            approver_id     INTEGER,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );
        CREATE INDEX comments_state ON comments (state, stage);
        CREATE INDEX comments_department ON comments (department);
        CREATE INDEX comments_process ON comments (process_id);

        CREATE TABLE comment_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id  INTEGER NOT NULL REFERENCES comments(id),
            at          INTEGER NOT NULL,
            -- submitted · edited · withdrawn · assigned · skipped · pooled ·
            -- approved · rejected · delivered · addressed
            kind        TEXT NOT NULL,
            -- the person the event is about: who acted, or for `assigned` and
            -- `skipped` the supervisor it went to or passed. NULL for the agent
            -- and for system moves.
            user_id     INTEGER,
            user_name   TEXT NOT NULL,
            -- an approval's note, a rejection's reason, an addressing note
            note        TEXT,
            -- JSON: {"reason": "disabled"|"cycle"|"no_admin"} · {"commit": sha}
            detail      TEXT
        );
        CREATE INDEX comment_events_comment ON comment_events (comment_id, id);
        CREATE INDEX comment_events_user ON comment_events (kind, user_id);

        CREATE TABLE outbox (
            -- D59: what the CLI did, for ui-backend to copy into app.db. The
            -- drain stamps the actor itself; nothing here is trusted as one.
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            at          INTEGER NOT NULL,
            kind        TEXT NOT NULL,
            target      TEXT NOT NULL,
            payload     TEXT NOT NULL,
            drained_at  INTEGER
        );
    """),
]

SCHEMA_VERSION = MIGRATIONS[-1][0]


def open_comments(path: Path) -> sqlite3.Connection:
    conn = db.connect(path)
    db.migrate(conn, MIGRATIONS)
    return conn
