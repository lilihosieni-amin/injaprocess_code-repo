"""Reading the facts store (spec §16, QF-24).

Pure filesystem reads, and no writes: `facts/**` in the live data-repo is
written only by `merge facts` (QF-2, CLAUDE.md's hard rule), and this module
is not an exception to it.

Task 18 grows this module with the bundle builders a served entry needs
(`resolved`, `row_titles`, `path_labels`); this task builds only what the
confirmation gate needs to run before any of that exists.
"""
from __future__ import annotations

from pathlib import Path

from . import storage

#: Kind -> file, the plural of the kind name (spec §4, "Storage layout").
_FILES: dict[str, str] = {
    "item": "items.json",
    "record": "records.json",
    "measurement": "measurements.json",
    "rule": "rules.json",
    "note": "notes.json",
}


def load_index(root: Path) -> dict:
    """`facts/.index.json`, as stored — no derived additions.

    An absent file reads as an empty store rather than raising: every
    deployment is in exactly this state until the first `merge facts` run,
    and this sits inside the confirm gate (`_fact_departments`), before any
    scope decision — a crash there is a 500, not the uniform 404 an absent id
    must answer (`access.py`'s own rule: a crash is a denial of service, and
    an unanswerable question is a value, never an exception). A fresh dict
    each call, like `storage.read_json`'s own return — never a shared
    module-level default a caller's `["entries"].append(...)` could corrupt
    for every later call in the process.
    """
    path = Path(root) / "facts" / ".index.json"
    if not path.is_file():
        return {"schema_version": 1, "entries": []}
    return storage.read_json(path)


def load_entry(root: Path, fact_id: str) -> dict | None:
    """The envelope `fact_id` names, or `None`.

    The index row's `kind` picks which of the five files to open; when the
    index and a store file disagree about an entry's kind, the file is the
    truth for content, so this uses the index only to find the file, never to
    answer anything about what is inside it. `None`, never an exception, both
    when the id is absent from the index and when the file the index row
    points at does not carry it — a caller (the confirm gate among them) can
    treat "not found" as one case rather than two. That same "never an
    exception" holds for a malformed row too — one missing `id` or naming a
    `kind` outside the five (a hand-edited or partially-migrated store) reads
    as "not found" rather than a `KeyError`, for the same reason: the gate
    that calls this must fail closed, not crash.
    """
    row = next((r for r in load_index(root)["entries"] if r.get("id") == fact_id),
              None)
    if row is None:
        return None
    filename = _FILES.get(row.get("kind"))
    if filename is None:
        return None
    path = Path(root) / "facts" / filename
    if not path.is_file():
        return None
    doc = storage.read_json(path)
    return next((e for e in doc.get("entries", []) if e.get("id") == fact_id), None)
