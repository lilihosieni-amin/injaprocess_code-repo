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


def _empty() -> dict:
    """A fresh empty manifest — new dict *and* new lists.

    Built each call rather than copied from a module-level default: a shallow
    copy of such a default shares its `branches`/`workbooks` lists, so one
    caller's `["workbooks"].append(...)` on a deployment with no manifest
    would show up in every later call for the life of the process.
    """
    return {"schema_version": 1, "branches": [], "workbooks": []}


def read_manifest(root: Path) -> dict:
    """The manifest as stored, or an empty one."""
    path = Path(root) / "attachments" / "sheets" / "manifest.json"
    if not path.is_file():
        return _empty()
    try:
        doc = storage.read_json(path)
    except (OSError, ValueError):
        return _empty()
    return doc if isinstance(doc, dict) else _empty()


def branches(root: Path) -> list:
    """`[{code, name}]` — the registered branches, the only place they are
    declared (QF-4)."""
    rows = read_manifest(root).get("branches")
    return [b for b in rows if isinstance(b, dict)] if isinstance(rows, list) else []


def workbook_titles(root: Path) -> dict:
    """`{spreadsheetId: title}` — a workbook's name as a person says it.

    The estate has no Persian workbook title and the manifest has no column for
    one, so the title is the file name without its extension («Mavade Avalie»),
    which is what the owner sees on the drive and what Gate M reads out. A row
    with no `file` contributes nothing rather than an empty name.
    """
    rows = read_manifest(root).get("workbooks")
    if not isinstance(rows, list):
        return {}
    return {w["spreadsheetId"]: str(w["file"]).rsplit(".", 1)[0]
            for w in rows if isinstance(w, dict)
            and w.get("spreadsheetId") and w.get("file")}


def workbook_count(root: Path) -> int:
    """The coverage denominator: every workbook the manifest names."""
    rows = read_manifest(root).get("workbooks")
    return sum(1 for w in rows if isinstance(w, dict)) if isinstance(rows, list) else 0
