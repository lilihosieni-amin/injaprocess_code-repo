"""SQL for comments.db. Rows in, rows out; no rules (those are comment_rules)."""
from __future__ import annotations

import json
import sqlite3


def insert(cc: sqlite3.Connection, *, author: sqlite3.Row, anchor_kind: str,
           anchor_id: str, process_id: str | None, department: str,
           snapshot: dict, text: str, now: int) -> int:
    return cc.execute(
        "INSERT INTO comments (author_id, author_username, author_name, anchor_kind,"
        " anchor_id, process_id, department, snapshot, text, state, created_at,"
        " updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting', ?, ?)",
        (author["id"], author["username"], author["display_name"], anchor_kind,
         anchor_id, process_id, department, json.dumps(snapshot, ensure_ascii=False),
         text, now, now)).lastrowid


def get(cc: sqlite3.Connection, cid: int) -> sqlite3.Row | None:
    return cc.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()


def event(cc: sqlite3.Connection, cid: int, *, kind: str, now: int,
          user_id: int | None = None, user_name: str, note: str | None = None,
          detail: dict | None = None) -> None:
    cc.execute(
        "INSERT INTO comment_events (comment_id, at, kind, user_id, user_name, note,"
        " detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (cid, now, kind, user_id, user_name, note,
         json.dumps(detail, ensure_ascii=False) if detail else None))


def events(cc: sqlite3.Connection, cid: int) -> list[sqlite3.Row]:
    return cc.execute("SELECT * FROM comment_events WHERE comment_id = ? ORDER BY id",
                      (cid,)).fetchall()


def set_state(cc: sqlite3.Connection, cid: int, *, state: str, stage: str | None = None,
              approver_id: int | None = None, now: int) -> None:
    cc.execute("UPDATE comments SET state = ?, stage = ?, approver_id = ?, updated_at = ?"
               " WHERE id = ?", (state, stage, approver_id, now, cid))


def set_text(cc: sqlite3.Connection, cid: int, *, text: str, now: int) -> None:
    cc.execute("UPDATE comments SET text = ?, updated_at = ? WHERE id = ?",
               (text, now, cid))


def approvers_since_restart(cc: sqlite3.Connection, cid: int) -> list[int]:
    """Who approved since the last submit or edit — the current pass (D36, D63)."""
    last = cc.execute(
        "SELECT COALESCE(MAX(id), 0) FROM comment_events"
        " WHERE comment_id = ? AND kind IN ('submitted', 'edited')", (cid,)).fetchone()[0]
    return [r[0] for r in cc.execute(
        "SELECT user_id FROM comment_events WHERE comment_id = ? AND kind = 'approved'"
        " AND id > ? AND user_id IS NOT NULL ORDER BY id", (cid, last))]


def outbox_append(cc: sqlite3.Connection, *, kind: str, target: str, payload: dict,
                  now: int) -> int:
    return cc.execute(
        "INSERT INTO outbox (at, kind, target, payload) VALUES (?, ?, ?, ?)",
        (now, kind, target, json.dumps(payload, ensure_ascii=False))).lastrowid
