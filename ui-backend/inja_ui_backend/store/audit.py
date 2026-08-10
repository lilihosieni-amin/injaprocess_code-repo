"""The activity record (spec D41, D45).

Append-only by construction: this module offers no update and no delete, and no
endpoint anywhere exposes one. A record the top user can rewrite records nothing.
"""
from __future__ import annotations

import json
import sqlite3


def record(conn: sqlite3.Connection, *, actor: str, action: str, now: int,
           session_id: str | None = None, target: str | None = None,
           ip: str = "", user_agent: str = "", outcome: str = "ok",
           detail: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_events (at, actor, session_id, action, target, ip,"
        " user_agent, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (now, actor, session_id, action, target, ip, user_agent, outcome,
         json.dumps(detail, ensure_ascii=False) if detail is not None else None),
    )
