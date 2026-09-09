"""`facts/.confirmations.json` — the chat actor's vouch per entry (v3.7 §3).

A row says: the actor named in the run's `meta.json` instructed the change
that left this entry at this `updated_at`. The ui-backend reads it beside its
own `app.db` marks and shows the entry confirmed while the two `updated_at`s
agree; every engine write path stamps the entries it changes, so a later
change by anything moves the entry's stamp and the row goes stale on its
own — `prune` (run by `save_store`) drops it.
"""
import pathlib
from datetime import datetime, timezone

from engine_common import read_json, validate, write_json_atomic

LEDGER = ".confirmations.json"


def _path(root):
    from merge_facts import facts_dir
    return facts_dir(pathlib.Path(root)) / LEDGER


def load(root):
    p = _path(root)
    return read_json(p) if p.is_file() else {"schema_version": 1, "entries": {}}


def save(root, doc):
    validate("facts-confirmations.schema.json", doc)
    write_json_atomic(_path(root), doc)


def chat_origin(run_dir):
    meta = pathlib.Path(run_dir) / "meta.json"
    if not meta.is_file():
        return False
    try:
        return read_json(meta).get("origin") == "chat"
    except ValueError:
        return False


def _actor(run_dir):
    meta = pathlib.Path(run_dir) / "meta.json"
    if meta.is_file():
        try:
            actor = read_json(meta).get("actor")
            if isinstance(actor, str) and actor:
                return actor
        except ValueError:
            pass
    return "chat"


def record(root, run_dir, run_ref, entries, force=False):
    """One row per entry — only for a chat-origin run unless `force`
    (`edit` exists for chat instructions and records always)."""
    if not entries or not (force or chat_origin(run_dir)):
        return 0
    doc = load(root)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    by = _actor(run_dir)
    for entry in entries:
        doc["entries"][entry["id"]] = {"updated_at": entry["updated_at"], "by": by,
                                       "run": run_ref, "at": now}
    save(root, doc)
    return len(entries)


def prune(root, store):
    """Drop every row whose entry is gone or whose `updated_at` moved."""
    p = _path(root)
    if not p.is_file():
        return 0
    doc = load(root)
    stamps = {e["id"]: e.get("updated_at") for kind in store for e in store[kind]["entries"]}
    keep = {fid: row for fid, row in doc["entries"].items()
            if stamps.get(fid) == row.get("updated_at")}
    dropped = len(doc["entries"]) - len(keep)
    if dropped:
        doc["entries"] = keep
        save(root, doc)
    return dropped


def forget_run(root, run_ref):
    p = _path(root)
    if not p.is_file():
        return 0
    doc = load(root)
    keep = {fid: row for fid, row in doc["entries"].items() if row.get("run") != run_ref}
    dropped = len(doc["entries"]) - len(keep)
    if dropped:
        doc["entries"] = keep
        save(root, doc)
    return dropped
