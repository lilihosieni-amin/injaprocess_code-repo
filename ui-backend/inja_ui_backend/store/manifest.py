"""`attachments/sheets/manifest.json` — the estate's workbook roll (Appendix B).

Read-only, like everything the ui-backend does with the data-repo: the
manifest's judgement columns are confirmed by a person at Gate M and edited by
hand (spec §17.10 — there is no workbook screen in v1).

Absence is a value, not an error, for the same reason `facts_store.load_index`
tolerates an absent store: until the first `dump-workbook --init-manifest` run
every deployment is in this state, and the coverage line these functions feed
sits on screens that must still render — «۰ از ۰» is an honest answer, a 500
is not.
"""
from __future__ import annotations

from pathlib import Path

from .. import storage

_EMPTY: dict = {"schema_version": 1, "branches": [], "workbooks": []}


def read_manifest(root: Path) -> dict:
    """The manifest as stored, or an empty one.

    A fresh dict each call (`_EMPTY` is copied, never handed out), so a
    caller's `["workbooks"].append(...)` cannot corrupt every later call in
    the process.
    """
    path = Path(root) / "attachments" / "sheets" / "manifest.json"
    if not path.is_file():
        return dict(_EMPTY)
    try:
        doc = storage.read_json(path)
    except (OSError, ValueError):
        return dict(_EMPTY)
    return doc if isinstance(doc, dict) else dict(_EMPTY)


def branches(root: Path) -> list:
    """`[{code, name}]` — the registered branches, the only place they are
    declared (QF-4)."""
    rows = read_manifest(root).get("branches")
    return [b for b in rows if isinstance(b, dict)] if isinstance(rows, list) else []


def workbook_count(root: Path) -> int:
    """The coverage denominator: every workbook the manifest names."""
    rows = read_manifest(root).get("workbooks")
    return sum(1 for w in rows if isinstance(w, dict)) if isinstance(rows, list) else 0
