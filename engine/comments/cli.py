"""`comments` — the Telegram runtime's way to comments (spec D4, D39, D59).

Deterministic; reads and writes comments.db by SQL only (it is owned and
migrated by ui-backend). Sees only `approved` and `addressed` comments. Never
reads a users table: the author and the trail are denormalised in the file.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

SCHEMA_VERSION = 1
AGENT = "agent:control-bot"
VISIBLE = ("approved", "addressed")
_CMT = re.compile(r"^CMT-([1-9][0-9]*)$")


class Refused(Exception):
    pass


def _open(db: str | None) -> sqlite3.Connection:
    path = Path(db or os.environ.get("COMMENTS_DB", ""))
    if not str(path) or not path.is_file():
        raise Refused(f"the comment store is not initialised ({path or 'COMMENTS_DB unset'})")
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    got = conn.execute("SELECT version FROM schema_version").fetchone()
    if got is None or got[0] != SCHEMA_VERSION:
        raise Refused(f"the comment store is not initialised (schema {got and got[0]},"
                      f" expected {SCHEMA_VERSION})")
    return conn


def _load(conn, ref: str) -> sqlite3.Row:
    m = _CMT.match(ref)
    row = (conn.execute("SELECT * FROM comments WHERE id = ?", (int(m.group(1)),)).fetchone()
          if m else None)
    if row is None or row["state"] not in VISIBLE:
        raise Refused(f"{ref} not found")
    return row


def _list(conn, a) -> None:
    for r in conn.execute("SELECT * FROM comments WHERE department = ? AND state = ?"
                          " ORDER BY id", (a.department, a.status)):
        first = r["text"].splitlines()[0][:60] if r["text"] else ""
        print(f"CMT-{r['id']}\t{r['state']}\t{r['department']}\t"
              f"{r['anchor_kind']} {r['anchor_id']}\t{first}")


def _show(conn, a) -> None:
    r = _load(conn, a.ref)
    snap = json.loads(r["snapshot"])
    where = " › ".join(x for x in (snap.get("department_name"), snap.get("process_name"),
                                   snap.get("node_label")) if x)
    print(f"CMT-{r['id']} · {r['state']} · {r['department']}")
    print(f"anchor: {r['anchor_kind']} {r['anchor_id']} ({where})")
    print(f"author: {r['author_name']}")
    print("text:")
    print(r["text"])
    print("trail:")
    for e in conn.execute("SELECT * FROM comment_events WHERE comment_id = ? ORDER BY id",
                          (r["id"],)):
        stamp = time.strftime("%Y-%m-%d %H:%M", time.gmtime(e["at"]))
        line = f"  {stamp} {e['kind']} {e['user_name']}"
        if e["note"]:
            line += f": {e['note']}"
        print(line)


def _resolve(conn, a) -> None:
    now = int(time.time())
    conn.execute("BEGIN IMMEDIATE")
    try:
        r = _load(conn, a.ref)
        if r["state"] != "approved":
            raise Refused(f"{a.ref} is already addressed")
        conn.execute("UPDATE comments SET state = 'addressed', updated_at = ? WHERE id = ?",
                     (now, r["id"]))
        detail = json.dumps({"commit": a.commit}) if a.commit else None
        conn.execute("INSERT INTO comment_events (comment_id, at, kind, user_id, user_name,"
                     " note, detail) VALUES (?, ?, 'addressed', NULL, ?, ?, ?)",
                     (r["id"], now, AGENT, a.note, detail))
        conn.execute("INSERT INTO outbox (at, kind, target, payload) VALUES (?, ?, ?, ?)",
                     (now, "comment.addressed", f"CMT-{r['id']}",
                      json.dumps({"note": a.note, "commit": a.commit}, ensure_ascii=False)))
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    print(f"CMT-{r['id']} addressed")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="comments")
    ap.add_argument("--db", help="comments.db (default: $COMMENTS_DB)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    p.add_argument("--department", required=True)
    p.add_argument("--status", default="approved", choices=VISIBLE)
    p = sub.add_parser("show")
    p.add_argument("ref")
    p = sub.add_parser("resolve")
    p.add_argument("ref")
    p.add_argument("--commit")
    p.add_argument("--note")
    a = ap.parse_args(argv)
    try:
        conn = _open(a.db)
        {"list": _list, "show": _show, "resolve": _resolve}[a.cmd](conn, a)
    except Refused as e:
        print(f"comments: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
