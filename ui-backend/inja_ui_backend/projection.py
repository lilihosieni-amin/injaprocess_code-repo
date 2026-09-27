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

from . import db, facts_store, gitcommit, storage
from .fingerprint import fact_fingerprint, fingerprint
from .store import audit

log = logging.getLogger(__name__)

#: The actor of the events the projection writes about itself.
SYSTEM = "system:projection"
_PROC = re.compile(r"^departments/([a-z]+)/processes/([a-z]+-[0-9]{3})\.json$")
_DEPT = re.compile(r"^departments/([a-z]+)/(?:overview|order)\.json$")
_FACTS = re.compile(r"^facts/(?:records|measurements|rules|notes)\.json$")
_RUN = re.compile(r"^runs/(facts/)?([a-z]+)/([0-9]{8}-[0-9]{6})/")
_FACT_ID = re.compile(r"^F-[0-9]{5}$")
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


def _commits(cfg, since: str, head: str) -> list[dict]:
    """Every non-merge commit in `(since, head]`, oldest first. `--no-merges`
    walks the commits a merge brings in, each once, and never the merge
    itself, whose diff against its first parent would count them twice.

    Bounded by `head` — the sha `run()` already read and will set the marker
    to — and never by the live ref `HEAD`. The data-repo is written by other
    containers; walking `HEAD` here would pick up a commit that lands after
    `run()` read it, project its events, and then leave the marker at the
    older `head`, so the next pass projects that same commit again — a
    permanent duplicate, and the record is append-only (D45)."""
    r = gitcommit._git(cfg, "log", "--no-merges", "--reverse", "--no-renames",
                       "--name-status", f"--format={_FMT}", f"{since}..{head}")
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


def _head_time(cfg, head: str) -> int:
    """`head`'s own commit time — the fallback timestamp for a staleness event
    that names no commit of its own to borrow one from."""
    r = gitcommit._git(cfg, "show", "-s", "--format=%ct", head)
    try:
        return int(r.stdout.strip()) if r.returncode == 0 else int(time.time())
    except ValueError:
        return int(time.time())


def _kind(subject: str) -> str:
    return re.split(r"[(:]", subject, maxsplit=1)[0].strip()


#: `pipeline(cooking): ...` / `quantify(cooking): ...` -> `cooking`.
_SUBJECT_DEPT = re.compile(r"^\w+\(([a-z]+)\)")


def _actor(c: dict) -> str | None:
    """Who the edit events of commit `c` name — `None` for a `ui-edit` commit,
    whose endpoint already recorded the edit with the real user (D78)."""
    kind = _kind(c["subject"])
    if kind == "ui-edit":
        return None
    if kind in ("pipeline", "quantify"):
        dept_m = _SUBJECT_DEPT.match(c["subject"])
        dept = dept_m.group(1) if dept_m else None
        # `merge` commits `git add … runs`, which sweeps up whatever else sits
        # under `runs/` — an abandoned chat-edit's scratch directory, another
        # department's failed attempt — alongside the run this commit is
        # actually reporting. `--name-status` lists paths sorted, so crediting
        # the first match in path order can name the wrong run. Trust only a
        # run whose own department matches the subject's, and among those the
        # newest stamp (the stamps sort lexicographically, so string max
        # works): a re-run of the same department leaves the older run's
        # files untouched in this commit, so only the new one's paths appear.
        stamps = []
        for _, path in c["files"]:
            m = _RUN.match(path)
            if not m or bool(m.group(1)) != (kind == "quantify"):
                continue
            if dept is not None and m.group(2) != dept:
                continue
            stamps.append((m.group(1) or "", m.group(2), m.group(3)))
        if stamps:
            facts_prefix, run_dept, stamp = max(stamps, key=lambda s: s[2])
            return f"run:{facts_prefix}{run_dept}/{stamp}"
        return f"run:{kind}"        # no matching run directory: invent no stamp
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


#: Sentinel: the target's content exists but could not be parsed — never
#: treated as "gone" (which would read as a deletion) and never compared
#: equal to anything, including itself, so a target stuck behind it is
#: skipped rather than judged (fix review, D80).
_UNREADABLE = object()


def _target_relpath(target: str) -> str:
    """The data-repo path a non-fact confirmation target lives at."""
    if "-" in target:
        return f"departments/{storage.dept_of(target)}/processes/{target}.json"
    return f"departments/{target}/overview.json"


_FACT_FILES = ("records", "measurements", "rules", "notes")


def _head_fact_entries(cfg, head: str) -> dict[str, dict]:
    """Every fact entry at `head`, id -> entry, across the four kind files —
    each read once per pass, not once per confirmed fact (fix review: 236
    confirmed facts at today's size, 1,798 at nine departments, each
    re-parsing all four aggregate files, made a single pass with HEAD moved
    take 0.42s-24s under `_LOCK`)."""
    out: dict[str, dict] = {}
    for name in _FACT_FILES:
        out.update(_entries_at(cfg, head, f"facts/{name}.json"))
    return out


def _head_fingerprint(cfg, target: str, *, doc_head: str, facts: dict[str, dict]):
    """`target`'s fingerprint AT `doc_head` — never the live working tree.

    A writer (a chat edit, a pipeline run) saves the file and commits it as
    two separate steps; a pass that lands in between would see the new bytes
    before any commit names who made them, and credit the change to whatever
    unrelated commit happens to be newest instead (the reviewer's AAAA/BBBB
    case). Reading at `doc_head` instead means the fingerprint here always
    has a real commit behind it. `None` when the target does not exist at
    `doc_head` (or, for a fact, is not in `facts`, already read once for the
    whole pass by `_head_fact_entries`); `_UNREADABLE` when a document exists
    but its JSON cannot be parsed there — the fact case cannot reach this: an
    unparseable fact file already came back as "no entries" from
    `_entries_at`, which swallows the parse error, so the aggregate never
    truly disappears from this function's point of view.

    ponytail: one `git show` subprocess per confirmed *process or department*
    target whenever HEAD moves (facts are batched above, four reads for the
    whole pass). Fine at today's non-fact confirmation counts (tens, not
    thousands); batch with `git cat-file --batch` if that count reaches the
    thousands.
    """
    if _FACT_ID.fullmatch(target):
        return fact_fingerprint(facts[target]) if target in facts else None
    r = gitcommit._git(cfg, "show", f"{doc_head}:{_target_relpath(target)}")
    if r.returncode != 0:
        return None
    try:
        return fingerprint(json.loads(r.stdout))
    except (ValueError, TypeError, AttributeError):
        return _UNREADABLE


def _working_fingerprint(cfg, target: str, *, facts: dict[str, dict]):
    """`target`'s fingerprint in the live working tree — same shape as
    `_head_fingerprint`, compared against it to tell "already committed" from
    "a writer still has this file open" (D80). `facts` is the working tree's
    own id -> entry map, read once for the whole pass exactly like the head
    side's."""
    if _FACT_ID.fullmatch(target):
        return fact_fingerprint(facts[target]) if target in facts else None
    path = (storage.proc_path(cfg.data_root, target) if "-" in target
            else storage.overview_path(cfg.data_root, target))
    if not path.is_file():
        return None
    try:
        return fingerprint(storage.read_json(path))
    except (OSError, ValueError, TypeError, AttributeError):
        return _UNREADABLE


def _judgeable(cfg, head: str, targets: list[str]) -> dict[str, str | None]:
    """Each of `targets` this pass may judge for staleness: its fingerprint at
    `head`, but only when the working tree already agrees with `head` — a
    target still mid-write (saved but not yet committed, or committed but not
    yet checked out here) is left out of the map entirely, and picked up on a
    later pass once the two agree (D80). `_UNREADABLE` never equals anything,
    including another `_UNREADABLE`, so an unparseable target is left out too
    rather than silently judged "unchanged".

    The two fact maps are each built once for every target in this call, not
    once per fact target — see `_head_fact_entries`."""
    head_facts = _head_fact_entries(cfg, head)
    work_facts = {e.get("id"): e for e in facts_store.load_all(cfg.data_root)}
    head_fp = {t: _head_fingerprint(cfg, t, doc_head=head, facts=head_facts)
              for t in targets}
    work_fp = {t: _working_fingerprint(cfg, t, facts=work_facts) for t in targets}
    return {t: head_fp[t] for t in targets
            if head_fp[t] is not _UNREADABLE and head_fp[t] == work_fp[t]}


def _staleness(cfg, conn, head: str, now_fp: dict[str, str | None], credit: dict,
               fallback: tuple, *, announce: bool) -> int:
    """Compare every confirmation with its target's `now_fp` (D80) — the
    caller's map of judgeable targets, computed once at `head` before this
    pass's transaction opened.

    A new mismatch writes `confirmation.invalidated` once — credited to the
    newest commit in the batch that touched the target, or to `fallback` when
    none did — and marks the row with `emitted_for_sha`. A match clears the
    mark silently: the content is back to what was vouched for. With
    `announce=False` (seeding) mismatches are marked and nothing is written,
    so old staleness is not announced as new. A target missing from `now_fp`
    (confirmed after the map was built, or still mid-write) is left untouched
    this pass — neither announced, marked, nor cleared.

    ponytail: measured at HEAD, not per commit — when two commits in one
    batch both touch the target, the event is credited to the later, never to
    both. A target `_judgeable` skips because its working tree still
    disagrees with `head` is not judged at all this pass; it is picked up
    again only on a later pass once HEAD has moved on and the two agree —
    credited then to whatever commit that later pass's `credit` map names for
    it (a fresh edit that landed since), or to `fallback`/`SYSTEM` when the
    working copy was simply restored to match an unrelated commit that moved
    HEAD in the meantime. Per-commit fingerprints would mean reading every
    confirmed document out of every commit instead of once per pass.
    """
    rows = conn.execute(
        "SELECT target, fingerprint, emitted_for_sha FROM confirmations").fetchall()
    n = 0
    for r in rows:
        if r["target"] not in now_fp:
            continue
        stale = now_fp[r["target"]] != r["fingerprint"]
        if stale and r["emitted_for_sha"] is None:
            if announce:
                sha, at, actor = credit.get(r["target"], fallback)
                audit.record(conn, actor=actor, action="confirmation.invalidated",
                             now=at, target=r["target"], detail={"commit": sha})
                n += 1
            conn.execute("UPDATE confirmations SET emitted_for_sha = ? WHERE target = ?",
                         (head, r["target"]))
        elif not stale and r["emitted_for_sha"] is not None:
            conn.execute("UPDATE confirmations SET emitted_for_sha = NULL WHERE target = ?",
                         (r["target"],))
    return n


def _targets(conn) -> list[str]:
    return [r["target"] for r in conn.execute("SELECT target FROM confirmations")]


def _seed(cfg, conn, head: str) -> None:
    now_fp = _judgeable(cfg, head, _targets(conn))
    conn.execute("BEGIN IMMEDIATE")
    try:
        _staleness(cfg, conn, head, now_fp, {}, (head, 0, SYSTEM), announce=False)
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
            commits = _commits(cfg, marker, head)
            rows, credit = [], {}
            for c in commits:
                actor = _actor(c)
                # ui-edit commits write no edit event, but ARE checked for
                # staleness — credited to the person in their Acted-By trailer.
                credited = actor or c["acted_by"] or f"git:{c['author']}"
                for action, target, change, extra in _touched(cfg, c):
                    credit[target] = (c["sha"], c["at"], credited)
                    if actor is not None:
                        rows.append((c["at"], actor, action, target,
                                     {"change": change, "commit": c["sha"], **extra}))
            # Always the system, at HEAD's own commit time — never a commit
            # that, by construction, never touched this target (fix review):
            # the last commit in the batch may be an unrelated department's
            # edit, and crediting it here would misattribute a permanent,
            # append-only record entry to the wrong person.
            fallback = (head, _head_time(cfg, head), SYSTEM)
            now_fp = _judgeable(cfg, head, _targets(conn))
            conn.execute("BEGIN IMMEDIATE")
            try:
                for at, actor, action, target, detail in rows:
                    audit.record(conn, actor=actor, action=action, now=at,
                                 target=target, detail=detail)
                n = len(rows) + _staleness(cfg, conn, head, now_fp, credit, fallback,
                                           announce=True)
                _set_marker(conn, head)
                conn.execute("COMMIT")
            except BaseException:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
            return n
        finally:
            conn.close()
