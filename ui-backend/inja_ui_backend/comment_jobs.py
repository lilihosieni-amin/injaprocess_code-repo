"""Background work for comments: the D59 outbox drain and the D63 reconcile.

Both run every 30 seconds on a daemon thread started by the app's lifespan
(`app.py`), each on connections of their own — never the shared request
connections `app.state.db` / `app.state.comments_db`, per `db.connect`'s
invariant that only one thread may hold an explicit transaction on those.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path

from . import comment_rules, comments_db, db
from .store import audit

log = logging.getLogger(__name__)
AGENT = "agent:control-bot"
INTERVAL = 30
#: The only outbox kind the CLI is known to emit. A kind outside this set is
#: marked drained and logged, never turned into an audit row — an outbox
#: emitter ahead of this allowlist fails loud in the log, not as a
#: wrong-shaped audit row nobody asked for.
KNOWN_KINDS = {"comment.addressed"}


def _payload_of(row: sqlite3.Row) -> dict | None:
    """The row's payload as a dict, or `None` if the row must be skipped.

    Two ways a row is unusable: a kind this module does not know how to record,
    or a payload that is not a JSON object (malformed, or a truncated write).
    Either would otherwise raise inside `drain` and wedge every later row
    behind it — a single bad row must cost that one row, not the whole drain.
    """
    if row["kind"] not in KNOWN_KINDS:
        log.warning("outbox row %s has an unrecorded kind %r, marking drained",
                   row["id"], row["kind"])
        return None
    try:
        payload = json.loads(row["payload"])
    except json.JSONDecodeError:
        payload = None
    if not isinstance(payload, dict):
        log.error("outbox row %s has a malformed payload, marking drained", row["id"])
        return None
    return payload


def drain(app_db: Path, comments_path: Path) -> int:
    """Copy undrained outbox rows into the activity record (D59).

    The actor is stamped here, `agent:control-bot`, never read from the
    payload — the CLI's outbox is not a trusted actor. Replay is a no-op: the
    outbox id travels as `detail.outbox_id`, checked and inserted inside one
    transaction on this connection of the drain's own (never the shared
    `app.state.db`, so this is not the transaction `db.connect` forbids), so a
    crash between the check and the mark cannot double-record
    (`test_replay_is_a_no_op`). The event keeps the outbox row's own time.
    """
    cc = comments_db.open_comments(comments_path)
    app = db.connect(app_db)
    moved = 0
    try:
        rows = cc.execute(
            "SELECT * FROM outbox WHERE drained_at IS NULL ORDER BY id").fetchall()
        for row in rows:
            payload = _payload_of(row)
            if payload is not None:
                app.execute("BEGIN IMMEDIATE")
                try:
                    seen = app.execute(
                        "SELECT 1 FROM audit_events WHERE action = ? AND target = ?"
                        " AND json_extract(detail, '$.outbox_id') = ? LIMIT 1",
                        (row["kind"], row["target"], row["id"])).fetchone()
                    if seen is None:
                        payload.pop("actor", None)
                        audit.record(app, actor=AGENT, action=row["kind"], now=row["at"],
                                     target=row["target"],
                                     detail={**payload, "outbox_id": row["id"]})
                        moved += 1
                    app.execute("COMMIT")
                except BaseException:
                    if app.in_transaction:
                        app.execute("ROLLBACK")
                    raise
            cc.execute("UPDATE outbox SET drained_at = ? WHERE id = ?",
                       (int(time.time()), row["id"]))
    finally:
        cc.close()
        app.close()
    return moved


def tick(cfg) -> None:
    """Drain, then reconcile — every 30 seconds (D59, D63).

    Drain runs guarded: whatever breaks the outbox copy must not also stop
    reconcile — a stranded comment behind a disabled or reassigned supervisor
    is an unrelated failure, and it is reconcile's job to keep moving it.
    """
    try:
        drain(cfg.app_db, cfg.comments_db)
    except Exception:
        log.exception("comment outbox drain failed")
    app = db.connect(cfg.app_db)
    cc = db.connect(cfg.comments_db)
    try:
        cc.execute("BEGIN IMMEDIATE")
        comment_rules.reconcile(app, cc, now=int(time.time()))
        cc.execute("COMMIT")
    except BaseException:
        if cc.in_transaction:
            cc.execute("ROLLBACK")
        raise
    finally:
        cc.close()
        app.close()


def loop(cfg, stop: threading.Event) -> None:
    """Run `tick` immediately, then every `INTERVAL` seconds, until `stop` is set."""
    while True:
        try:
            tick(cfg)
        except Exception:                       # keep the loop alive; log and retry
            log.exception("comment tick failed")
        if stop.wait(INTERVAL):
            return
