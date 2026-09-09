"""The chat actor's vouch per entry — `facts/.confirmations.json` (v3.7 §3).

The second confirmation channel, beside `app.db`'s marks. A confirmation is
normally the ui-backend's — `(target, fingerprint, …)` matched against the
entry's current print — and any change moves the print and un-confirms the
entry. That is right for a pipeline run and wrong for the owner's own chat
instruction: the owner has just said what the entry should say. The engine
cannot reach `app.db` (components communicate through the filesystem only,
ARD §1), so its vouching is this file, which it writes and this module reads.

A row vouches while its `updated_at` equals the entry's own. No fingerprint is
shared between the two components and none needs to be: every engine write path
stamps `updated_at` on every entry it touches, so a later change by anything
moves the stamp and the row goes stale on its own, exactly the way a fingerprint
mismatch does.

Everything here is written by the *other* component, so nothing here may raise:
an absent, unreadable or malformed file reads as no confirmations at all. The
one writer on this side is `forget`, the revoke path — the ledger is a
confirmation record rather than store content, so `facts/**`'s merge-only rule
(the agent's, hook-enforced) does not bind it.
"""
from __future__ import annotations

from pathlib import Path

from .. import storage

#: Relative to `DATA_ROOT`; a dotfile beside the store's five kind files and
#: the derived `.index.json`, which is what the engine writes it with.
LEDGER = Path("facts") / ".confirmations.json"


def _rows(root: Path) -> tuple[Path, dict | None, dict | None]:
    """The ledger path, its whole document, and its `entries` map — or `None`s
    for anything the file is not. Shared by the reader and the writer so
    "what counts as a usable ledger" has one definition."""
    path = Path(root) / LEDGER
    try:
        doc = storage.read_json(path)
    except (OSError, ValueError):
        return path, None, None
    rows = doc.get("entries") if isinstance(doc, dict) else None
    return path, doc, rows if isinstance(rows, dict) else None


def load(root: Path) -> dict[str, dict]:
    """Every vouch in the ledger, `{fact id: row}` — `{}` when there is none.

    Read once per request by the routes that need it, the way the DB marks are
    resolved in one statement: it is one small file and the alternative is an
    open per listed row.
    """
    return _rows(root)[2] or {}


def confirmed(rows: dict[str, dict], entry: dict) -> bool:
    """Does the ledger vouch for `entry` **as it now is**?

    The stamps are compared as strings and both have to be strings: a row
    missing its `updated_at`, or an entry missing its own, is not a match, or a
    malformed pair of `None`s would vouch for everything it touched.
    """
    fid, stamp = entry.get("id"), entry.get("updated_at")
    if not isinstance(fid, str) or not isinstance(stamp, str):
        return False
    row = rows.get(fid)
    return isinstance(row, dict) and row.get("updated_at") == stamp


def forget(root: Path, fid: str) -> bool:
    """Drop `fid`'s row, atomically; `True` when one was there to drop.

    The rest of the file is rewritten as it was — the ledger holds every
    chat-confirmed entry in the store and a withdrawal is about one of them.
    """
    path, doc, rows = _rows(root)
    if rows is None or fid not in rows:
        return False
    del rows[fid]
    storage.write_json_atomic(path, doc)
    return True
