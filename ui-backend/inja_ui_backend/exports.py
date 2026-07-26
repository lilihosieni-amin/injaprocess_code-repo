from __future__ import annotations

import contextlib
import hashlib
import hmac
import json
import os
import tempfile
from pathlib import Path

from . import storage

EXPORT_KINDS: tuple[str, ...] = ("flowchart", "steps")

#: The literal the built template carries where its data belongs.
DATA_SLOT = "__INJA_EXPORT_DATA__"


class ExportUnavailable(Exception):
    """A directory or file the export needs is not there."""


def export_token(signing_key: str, code: str, kind: str) -> str:
    """Stable, unguessable per department+kind (D6, D7).

    Derived rather than stored: no state to migrate, and the same link survives
    a restart. Rotating SESSION_SIGNING_KEY rotates every link — `write_export`
    prunes the orphan that leaves behind.
    """
    mac = hmac.new(signing_key.encode("utf-8"),
                   f"export:{code}:{kind}".encode("utf-8"),
                   hashlib.sha256)
    return mac.hexdigest()[:16]


def build_payload(data_root: Path, code: str, generated_at: str) -> dict:
    """What the template renders: the overview, the processes, the timestamp.

    `pending` is emptied here rather than hidden in the template — an
    unauthenticated link (D6) must not carry unreviewed internal disagreements.
    """
    overview = storage.overview_path(data_root, code)
    if not overview.is_file():
        raise ExportUnavailable(f"department {code} has no overview.json")
    procs = []
    for doc in storage.ordered_processes(data_root, code):
        if doc.get("tombstoned"):
            continue
        procs.append({**doc, "pending": []})
    return {
        "dept": storage.read_json(overview),
        "processes": procs,
        "generated_at": generated_at,
    }


def render(template: str, payload: dict) -> str:
    """Substitute the data slot.

    Every `<` becomes its JSON escape, so no summary or description containing
    `</script>` can close the data block and inject markup. `JSON.parse` turns
    the escape back into `<`, so rendered text is unaffected.
    """
    body = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    return template.replace(DATA_SLOT, body)


def write_export(export_dir: Path, code: str, kind: str, token: str, html: str) -> Path:
    """Write atomically, then drop any older file of the same kind.

    Atomic because the link is permanent and public: a reader must never catch a
    half-written document. Pruning keeps one file per department+kind (D5) and
    clears orphans left by a rotated signing key.
    """
    folder = Path(export_dir) / code
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{kind}-{token}.html"

    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(html)
        os.replace(tmp, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)

    for stale in folder.glob(f"{kind}-*.html"):
        if stale != path:
            with contextlib.suppress(OSError):
                stale.unlink()
    return path
