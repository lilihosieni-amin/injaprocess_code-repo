"""Background work for comments: the D59 outbox drain and the D63 reconcile.

Both run every 30 seconds on a daemon thread started by the app's lifespan
(`app.py`), each on connections of their own — never the shared request
connections `app.state.db` / `app.state.comments_db`, per `db.connect`'s
invariant that only one thread may hold an explicit transaction on those.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

from . import comment_rules, comments_db, db
from .store import audit

log = logging.getLogger(__name__)
AGENT = "agent:control-bot"
INTERVAL = 30


def drain(app_db: Path, comments_path: Path) -> int:
    """Copy undrained outbox rows into the activity record (D59).

    The actor is stamped here, `agent:control-bot`, never read from the
    payload — the CLI's outbox is not a trusted actor. Replay is a no-op: the
    outbox id travels as `detail.outbox_id`, and a row already carrying it is
    skipped rather than duplicated — the guard that makes it safe to retry a
    drain that inserted the audit row but crashed before marking `drained_at`
    (`test_replay_is_a_no_op`). The event keeps the outbox row's own time.
    """
    cc = comments_db.open_comments(comments_path)
    app = db.connect(app_db)
    moved = 0
    try:
        rows = cc.execute(
            "SELECT * FROM outbox WHERE drained_at IS NULL ORDER BY id").fetchall()
        for row in rows:
            seen = app.execute(
                "SELECT 1 FROM audit_events WHERE action = ? AND target = ?"
                " AND json_extract(detail, '$.outbox_id') = ? LIMIT 1",
                (row["kind"], row["target"], row["id"])).fetchone()
            if seen is None:
                payload = json.loads(row["payload"])
                payload.pop("actor", None)
                audit.record(app, actor=AGENT, action=row["kind"], now=row["at"],
                             target=row["target"], detail={**payload, "outbox_id": row["id"]})
                moved += 1
            cc.execute("UPDATE outbox SET drained_at = ? WHERE id = ?",
                       (int(time.time()), row["id"]))
    finally:
        cc.close()
        app.close()
    return moved


def tick(cfg) -> None:
    """Drain, then reconcile — every 30 seconds (D59, D63)."""
    drain(cfg.app_db, cfg.comments_db)
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
    """Run `tick` every `INTERVAL` seconds until `stop` is set."""
    while not stop.wait(INTERVAL):
        try:
            tick(cfg)
        except Exception:                       # keep the loop alive; log and retry
            log.exception("comment tick failed")
