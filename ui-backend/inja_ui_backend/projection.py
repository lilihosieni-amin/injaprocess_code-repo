"""Content events projected from the data-repo's git history (spec D60;
addendum D79, D80).

A pipeline `merge` run and a chat edit change content with `ui-backend`
uninvolved. Git already records both, so instead of coupling the engine to the
activity record, this walks `git log` from the last projected commit and writes
one event per id touched per commit, timestamped by the commit.

Runs every 30 seconds in `comment_jobs.loop` and before every activity report.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time

from . import db, facts_store, gitcommit
from .store import audit

log = logging.getLogger(__name__)

#: The actor of the events the projection writes about itself.
SYSTEM = "system:projection"
_PROC = re.compile(r"^departments/([a-z]+)/processes/([a-z]+-[0-9]{3})\.json$")
_DEPT = re.compile(r"^departments/([a-z]+)/(?:overview|order)\.json$")
_FACTS = re.compile(r"^facts/(?:records|measurements|rules|notes)\.json$")
_RUN = re.compile(r"^runs/(facts/)?([a-z]+)/([0-9]{8}-[0-9]{6})/")
#: Commit kinds the Telegram runtime makes (ARD §15 and the data-repo's own
#: history since): each is the agent's, whoever the git author is — the server
#: authors `chat-edit` and `ui-edit` under the same identity.
_AGENT_KINDS = {"chat-edit", "restructure", "audit-fix", "edit-fact"}
_CHANGE = {"A": "created", "M": "updated", "D": "deleted"}
#: One record per commit: sha, commit time, author, subject, Acted-By trailer.
_FMT = "%x1e%H%x1f%ct%x1f%an%x1f%s%x1f%(trailers:key=Acted-By,valueonly,separator=)"
# ponytail: process-local lock — the loop thread and a report request may both
# call run(). One uvicorn worker (D6); a second worker needs a claim in app.db.
_LOCK = threading.Lock()


def _marker(conn) -> str | None:
    row = conn.execute("SELECT sha FROM projection_state WHERE id = 1").fetchone()
    return row["sha"] if row is not None else None


def _set_marker(conn, sha: str) -> None:
    conn.execute("INSERT INTO projection_state (id, sha) VALUES (1, ?)"
                 " ON CONFLICT(id) DO UPDATE SET sha = excluded.sha", (sha,))


def _commits(cfg, since: str) -> list[dict]:
    """Every non-merge commit after `since`, oldest first. `--no-merges` walks
    the commits a merge brings in, each once, and never the merge itself, whose
    diff against its first parent would count them twice."""
    r = gitcommit._git(cfg, "log", "--no-merges", "--reverse", "--no-renames",
                       "--name-status", f"--format={_FMT}", f"{since}..HEAD")
    if r.returncode != 0:
        raise RuntimeError(f"git log failed: {(r.stderr or r.stdout).strip()}")
    out = []
    for block in r.stdout.split("\x1e")[1:]:
        head, _, body = block.partition("\n")
        sha, at, author, subject, acted = head.split("\x1f")
        files = [(line.split("\t", 1)[0][:1], line.split("\t", 1)[1])
                 for line in body.splitlines() if "\t" in line]
        out.append({"sha": sha, "at": int(at), "author": author, "subject": subject,
                    "acted_by": acted.strip(), "files": files})
    return out


def _kind(subject: str) -> str:
    return re.split(r"[(:]", subject, maxsplit=1)[0].strip()


def _actor(c: dict) -> str | None:
    """Who the edit events of commit `c` name — `None` for a `ui-edit` commit,
    whose endpoint already recorded the edit with the real user (D78)."""
    kind = _kind(c["subject"])
    if kind == "ui-edit":
        return None
    if kind in ("pipeline", "quantify"):
        for _, path in c["files"]:
            m = _RUN.match(path)
            if m and bool(m.group(1)) == (kind == "quantify"):
                return f"run:{m.group(1) or ''}{m.group(2)}/{m.group(3)}"
        return f"run:{kind}"        # no run directory in the commit: invent no stamp
    if kind in _AGENT_KINDS:
        return audit.AGENT
    return f"git:{c['author']}"


def _entries_at(cfg, rev: str, path: str) -> dict[str, dict]:
    r = gitcommit._git(cfg, "show", f"{rev}:{path}")
    if r.returncode != 0:
        return {}                   # absent at that revision, or no parent at all
    try:
        doc = json.loads(r.stdout)
    except ValueError:
        return {}
    entries = doc.get("entries") if isinstance(doc, dict) else None
    return {e["id"]: e for e in entries or []
            if isinstance(e, dict) and isinstance(e.get("id"), str)}


def _fact_changes(cfg, sha: str, path: str):
    """(id, change, department) for every entry of `path` commit `sha` changed —
    compared entry by entry, because facts share four aggregate files."""
    before, after = _entries_at(cfg, f"{sha}^", path), _entries_at(cfg, sha, path)
    for fid in sorted(before.keys() | after.keys()):
        b, a = before.get(fid), after.get(fid)
        if b == a:
            continue
        change = "created" if b is None else "deleted" if a is None else "updated"
        yield fid, change, facts_store.first_department(a or b)


def _touched(cfg, c: dict) -> list[tuple[str, str, str, dict]]:
    """(action, target, change, extra) — one per id commit `c` touched. An id
    touched twice in one commit (overview + order; a fact moving between kind
    files) is one event, `updated` when the two changes disagree."""
    found: dict[tuple[str, str], tuple[str, dict]] = {}

    def add(action, target, change, extra):
        key = (action, target)
        if key in found and found[key][0] != change:
            change = "updated"
        found[key] = (change, extra)

    for status, path in c["files"]:
        change = _CHANGE.get(status, "updated")
        if m := _PROC.match(path):
            add("process.edited", m.group(2), change, {})
        elif m := _DEPT.match(path):
            add("department.edited", m.group(1), "updated", {})
        elif _FACTS.match(path):
            for fid, fchange, dept in _fact_changes(cfg, c["sha"], path):
                add("fact.edited", fid, fchange, {"department": dept})
    return [(a, t, ch, ex) for (a, t), (ch, ex) in found.items()]


def _seed(cfg, conn, head: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        _set_marker(conn, head)
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise


def run(cfg) -> int:
    """Project every commit since the marker; return how many events were written."""
    with _LOCK:
        head = gitcommit.head(cfg)
        if not head:
            return 0
        conn = db.connect(cfg.app_db)
        try:
            marker = _marker(conn)
            if marker is None:
                # First start: seeded at HEAD, so months of history are not
                # projected backdated as though it had been watching (D60).
                _seed(cfg, conn, head)
                return 0
            if marker == head:
                return 0
            if gitcommit._git(cfg, "merge-base", "--is-ancestor",
                              marker, head).returncode != 0:
                # A revert, rebase or force-push: do not guess. Record the gap,
                # re-seed, emit nothing for it (D60, addendum D79).
                audit.record(conn, actor=SYSTEM, action="projection.discontinuity",
                             now=int(time.time()), detail={"from": marker, "to": head})
                _seed(cfg, conn, head)
                return 1
            commits = _commits(cfg, marker)
            rows = []
            for c in commits:
                actor = _actor(c)
                if actor is None:
                    continue
                for action, target, change, extra in _touched(cfg, c):
                    rows.append((c["at"], actor, action, target,
                                 {"change": change, "commit": c["sha"], **extra}))
            conn.execute("BEGIN IMMEDIATE")
            try:
                for at, actor, action, target, detail in rows:
                    audit.record(conn, actor=actor, action=action, now=at,
                                 target=target, detail=detail)
                _set_marker(conn, head)
                conn.execute("COMMIT")
            except BaseException:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
            return len(rows)
        finally:
            conn.close()
