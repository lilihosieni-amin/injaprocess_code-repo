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


#: The only process keys either document reads, and therefore the only ones a
#: public file carries. A **whitelist**, not a blacklist: the exported link is
#: unauthenticated, so a field added to `process.schema.json` later must have to
#: be let in deliberately rather than start shipping the day it is written.
#:
#: `pending` and `nodes` are added by `_public_process` after this copy — the
#: first emptied, the second rewritten node by node.
PUBLIC_PROCESS_KEYS: tuple[str, ...] = ("id", "department", "name", "parent", "edges")


def _empty_icom() -> dict:
    """A fresh, structurally valid but empty ICOM record."""
    return {"inputs": [], "controls": [], "outputs": [], "mechanisms": []}


def _empty_node_source() -> dict:
    """A fresh, structurally valid but empty node provenance record."""
    return {"created_by": "", "touched_by": []}


def _public_node(node: dict) -> dict:
    """One node with its two sensitive values blanked, its shape untouched.

    `icom` and `source` are *emptied* rather than dropped because the frontend
    reads both through `ActivityNode`, whose contract says they are always
    there: the drawer's ICOM block indexes `icom.inputs` (behind `showIcom`,
    which the export turns off — but that is one JSX prop, not a guarantee), and
    its footer renders `source.created_by` with no guard at all. Dropping either
    key turns a reader's click into a `TypeError` inside a document that has
    already been handed out; blanking the value cannot.
    """
    out = dict(node)
    if "icom" in out:
        out["icom"] = _empty_icom()
    if "source" in out:
        out["source"] = _empty_node_source()
    return out


def _public_process(doc: dict) -> dict:
    """One process reduced to what the two documents actually render."""
    out = {k: doc[k] for k in PUBLIC_PROCESS_KEYS if k in doc}
    out["nodes"] = [_public_node(n) for n in doc.get("nodes", [])]
    out["pending"] = []
    return out


def build_payload(data_root: Path, code: str, generated_at: str) -> dict:
    """What the template renders: the overview, the processes, the timestamp.

    Trimmed here rather than hidden in the template, because the template hides
    nothing: an export is served from a deliberately unauthenticated link (D6)
    whose filename token is its only guard, so every byte of this payload is
    readable by anyone holding that link, through View Source. Whatever no
    document renders must therefore not be in it.

    **Withheld entirely** (whitelisted out by `PUBLIC_PROCESS_KEYS`):

    * `pending` — unreviewed internal disagreements. Emptied rather than
      dropped: `toFlowNodes` iterates it to count each node's conflicts, so the
      key has to be there; the *contents* must not travel.
    * `summary`, `idef0`, `kpis` — the process's own summary and IDEF0/KPI
      records. Maintained by the editing app's Summary screen, which is not part
      of either export bundle; no exported view reads them.
    * `source` (`type`/`ref`/`run`) and `created_at`/`updated_at` — where the
      process came from and when it was last touched. `source.ref` and
      `source.run` name a meeting recording and a pipeline run.
    * `tombstoned`/`superseded_by` — a tombstoned process is dropped below, so
      these can only ever describe a process nobody outside sees.

    **Blanked in place** (`_public_node`): every node's `source` — real
    provenance, e.g. `runs/chat/20260722-050015` plus who edited it — and its
    `icom`. Both keys stay because the frontend's `ProcNode` type says they are
    always present and the drawer dereferences them; see `_public_node`.

    **Kept, and load-bearing in ways that are not obvious:** `dept.department`
    keys the export's offline react-query cache; `process.department` is what
    `DetailDrawer` passes to `useProcesses`; `parent` decides the «زیرفرآیند»
    tags and the printed guide's "what is this about?" note; node `position` is
    the whole diagram geometry; node `removed` is what keeps a soft-deleted node
    out of the counts, the bands and the steps.
    """
    overview = storage.overview_path(data_root, code)
    if not overview.is_file():
        raise ExportUnavailable(f"department {code} has no overview.json")
    procs = []
    for doc in storage.ordered_processes(data_root, code):
        if doc.get("tombstoned"):
            continue
        procs.append(_public_process(doc))
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


def export_html_path(export_dir: Path, code: str, kind: str, token: str) -> Path:
    """Where `write_export` puts the document. The one place the layout is spelled."""
    return Path(export_dir) / code / f"{kind}-{token}.html"


def export_pdf_path(export_dir: Path, code: str, kind: str, token: str) -> Path:
    """The server-rendered PDF, beside its HTML with the same stem (spec §11).

    Same stem is a contract with the document itself, not a convenience: the
    «چاپ / PDF» button inside the exported page builds its href by swapping its
    own `.html` for `.pdf`, having no other way to learn the name. Move one and
    the button in every already-published document points at nothing.
    """
    return export_html_path(export_dir, code, kind, token).with_suffix(".pdf")


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

    The `.pdf` siblings are pruned on the same terms and for the same reason: a
    rotated key orphans the rendered PDF exactly as it orphans the document, and an
    orphan PDF is every bit as public as the HTML it was printed from. The *current*
    token's PDF is deliberately spared here — it is the render's to overwrite or,
    when the render fails, the endpoint's to unlink (D21).
    """
    folder = Path(export_dir) / code
    path = export_html_path(export_dir, code, kind, token)
    storage.write_text_atomic(path, html)

    cutoff = time.time() - TMP_SWEEP_AGE_S
    pdf = path.with_suffix(".pdf")
    stale = [p for p in folder.glob(f"{kind}-*.html") if p != path]
    stale += [p for p in folder.glob(f"{kind}-*.pdf") if p != pdf]
    stale += [p for p in folder.glob("*.tmp") if _older_than(p, cutoff)]
    for old in stale:
        try:
            old.unlink()
        except OSError as e:
            logger.warning("%s/%s: %s survives the prune and stays publicly served: %s",
                           code, kind, old, e)
    return path
