from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from pathlib import Path

from . import storage

logger = logging.getLogger(__name__)

EXPORT_KINDS: tuple[str, ...] = ("flowchart", "steps")

#: The literal the built template carries where its data belongs.
DATA_SLOT = "__INJA_EXPORT_DATA__"

#: How long an orphan `.tmp` is left alone before the sweep claims it. Long enough
#: that a concurrent write in flight is never yanked out from under its writer.
TMP_SWEEP_AGE_S = 3600


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

    A missing slot raises rather than passing the template through untouched: the
    literal is a cross-task contract with the export build, and a silent no-op
    here would publish a permanent link to a blank page with nothing logged.
    """
    if DATA_SLOT not in template:
        raise ExportUnavailable(f"the export template carries no {DATA_SLOT} slot")
    body = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    return template.replace(DATA_SLOT, body)


def _older_than(path: Path, cutoff: float) -> bool:
    """True if `path` was last written before `cutoff`; False if it is already gone."""
    try:
        return path.stat().st_mtime < cutoff
    except OSError:
        return False


def write_export(export_dir: Path, code: str, kind: str, token: str, html: str) -> Path:
    """Write atomically, then drop any older file of the same kind.

    Atomic because the link is permanent and public: a reader must never catch a
    half-written document. Pruning keeps one file per department+kind (D5) and
    clears orphans left by a rotated signing key — after a rotation the stale
    sibling *is* the revoked export, so a prune that fails is worth a log line.
    The sweep also collects `.tmp` files a killed process left behind: they sit in
    the publicly mounted folder and the `.html` glob cannot match them.
    """
    folder = Path(export_dir) / code
    path = folder / f"{kind}-{token}.html"
    storage.write_text_atomic(path, html)

    cutoff = time.time() - TMP_SWEEP_AGE_S
    stale = [p for p in folder.glob(f"{kind}-*.html") if p != path]
    stale += [p for p in folder.glob("*.tmp") if _older_than(p, cutoff)]
    for old in stale:
        try:
            old.unlink()
        except OSError as e:
            logger.warning("%s/%s: %s survives the prune and stays publicly served: %s",
                           code, kind, old, e)
    return path
