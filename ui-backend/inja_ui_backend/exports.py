from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from pathlib import Path

from . import storage, visibility
from .fingerprint import fingerprint

logger = logging.getLogger(__name__)

EXPORT_KINDS: tuple[str, ...] = ("flowchart", "steps")

#: The literal the built template carries where its data belongs.
DATA_SLOT = "__INJA_EXPORT_DATA__"

#: How long an orphan `.tmp` is left alone before the sweep claims it. Long enough
#: that a concurrent write in flight is never yanked out from under its writer.
TMP_SWEEP_AGE_S = 3600


class ExportUnavailable(Exception):
    """A directory or file the export needs is not there."""


class Unconfirmed(ExportUnavailable):
    """The department has nothing an Editor has vouched for (D22, D23)."""


def build_payload(data_root: Path, code: str, generated_at: str, *,
                  policy: dict[str, bool], confirmed: dict[str, str]) -> dict:
    """What the template renders: the overview, the processes, the timestamp.

    **The same filter every API response goes through** (`visibility.filtered`,
    D18). One implementation means the published artifact and the flow canvas
    cannot disagree about what a reader may have — and it means an Editor moving
    a switch changes both at once, which is what D27's policy-versioned cache key
    exists to make safe. This module carries no whitelist of its own any more:
    it used to keep a *blacklist* for the node (`out = dict(node)`), so a node
    key nobody had heard of shipped from an unauthenticated link the day it was
    written, while the API's copy of the same node dropped it.

    **Built for a reader who may see this department and nothing else.** That is
    the caller-independent stance D27 requires — *"the artifact is the same for
    every caller… permission decides whether it is served, never what it
    contains"* — and it is what closes the cross-department link that used to
    travel in here. Making the contents depend on which Editor pressed Export
    would give one link two different bodies, which is a different design and not
    a filter; fixing it to *this department* costs nothing, because a bundle
    contains only this department's processes and a link out of it was never
    followable inside the file.

    **Only confirmed content is published** (D22). `confirmed` maps a target — a
    process id or this department's code — to the fingerprint an Editor vouched
    for; a process whose current fingerprint differs is absent, and an
    unconfirmed overview raises `Unconfirmed` rather than publishing an
    introduction nobody has reviewed. The caller resolves `confirmed` because
    this module has no database and is not about to grow one.

    Tombstoned processes are dropped before the confirmation question is even
    asked: they are excluded entirely (D17) and `storage.ordered_processes`
    returns them last rather than dropping them.

    **Those two clauses are the record gate** (`disclosure.may_serve`'s
    non-editor branch), and they are here rather than imported because
    `Disclosure` answers for *a caller* and this artifact must not: the file is
    cached and served from one link, so a gate keyed on the caller would put one
    reader's bundle in another reader's hands. Same rule, resolved
    caller-independently — a tombstone is absent, and a document no Editor has
    vouched for at its current bytes is absent, exactly as they are absent from
    `GET /api/departments/{code}/processes`.
    """
    overview = storage.overview_path(data_root, code)
    if not overview.is_file():
        raise ExportUnavailable(f"department {code} has no overview.json")
    ov = storage.read_json(overview)
    if confirmed.get(code) != fingerprint(ov):
        raise Unconfirmed(
            f"department {code}'s overview carries no valid confirmation")

    def sees(ref: object) -> bool:
        """Lexical, like every other reachability question in this service: the
        department is the id's own prefix and nothing is opened to find out."""
        return isinstance(ref, str) and storage.dept_of(ref) == code

    procs = []
    for doc in storage.ordered_processes(data_root, code):
        if doc.get("tombstoned"):
            continue
        if confirmed.get(doc.get("id")) != fingerprint(doc):
            continue
        procs.append(visibility.filtered(doc, policy=policy, sees=sees,
                                         editor=False))
    return {
        "dept": visibility.public_overview(ov, editor=False),
        "processes": procs,
        "generated_at": generated_at,
    }


def report_key(signing_key: str, code: str, kind: str, *,
               process_fingerprints: list[str], overview_fingerprint: str,
               policy_version: str) -> str:
    """The artifact's identity (D27) — 16 hex chars, keyed by the signing key.

    A digest over three things, and the third is not optional:

    1. the fingerprints of every **confirmed** process in the department, **in
       curated order** — order is part of the key because `order.json` is the
       document's table of contents and a reorder changes what the reader
       receives while changing no process;
    2. the department overview's fingerprint;
    3. the version of the content-visibility policy.

    Without (3), an Editor switching off "node actor" leaves every
    already-rendered report serving it: a cache that survives a policy change is
    a content leak, not a stale page.

    **HMAC on `SESSION_SIGNING_KEY` rather than a bare SHA-256**, which keeps
    what the old derived token bought: `/exports/{path}` is served from a
    publicly mounted folder whose filename is still a guard until D24 removes
    that surface, and a name anyone can compute from guessable content would not
    be one. Rotating the key rotates every link, and `write_export`'s prune
    clears the orphan that leaves behind.

    Each part is length-delimited by a NUL prefix so that two different lists
    cannot serialise to the same bytes. Hex digests contain no NUL, so the
    delimiter is unambiguous.
    """
    mac = hmac.new(signing_key.encode("utf-8"), digestmod=hashlib.sha256)
    for part in (f"export:{code}:{kind}", overview_fingerprint, policy_version,
                 *process_fingerprints):
        mac.update(b"\x00")
        mac.update(part.encode("utf-8"))
    return mac.hexdigest()[:16]


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


def _prune(paths: list[Path], code: str, kind: str) -> None:
    """Unlink each path, logging the ones that refuse rather than raising.

    A prune that fails is never fatal to the export — the document itself is
    already written — but it is never silent either: what survives is a file still
    being served from a public folder, and only a human can clear it.
    """
    for old in paths:
        try:
            old.unlink(missing_ok=True)
        except OSError as e:
            logger.warning("%s/%s: %s survives the prune and stays publicly served: %s",
                           code, kind, old, e)


def write_export(export_dir: Path, code: str, kind: str, token: str, html: str) -> Path:
    """Drop this export's previous PDF, write the document, then prune the rest.

    Atomic because the link is permanent and public: a reader must never catch a
    half-written document. Pruning keeps one file per department+kind (D5) and
    clears orphans left by a rotated signing key — after a rotation the stale
    sibling *is* the revoked export, so a prune that fails is worth a log line.
    The sweep also collects `.tmp` files a killed process left behind: they sit in
    the publicly mounted folder and the `.html` glob cannot match them.

    The `.pdf` siblings go on the same terms and for the same reason: a rotated key
    orphans the rendered PDF exactly as it orphans the document, and an orphan PDF
    is every bit as public as the HTML it was printed from.

    **The current token's PDF goes first, before the HTML is written**, and that
    ordering is the point rather than an accident. The token is derived from the
    department's content (`report_key`), so re-exporting a department nothing has
    changed lands on that exact path again: whatever sits there was printed from
    the document about to be overwritten. (When the content *has* moved the token
    moves with it, and the previous pair is cleared by the sibling prune below —
    but that is the easy half, and it is not the one a crash could strand.)
    The render that would replace it runs *after*
    this returns and takes seconds (~5 s measured), and the endpoint's own unlink
    (D21) runs later still — so the folder used to hold new HTML beside the previous
    export's PDF for that whole window, both publicly served, and a container
    restart or the OOM killer inside it made the mismatch permanent: a reader taps
    «چاپ / PDF», the file is there, and they silently download last week's flowchart
    under this week's document.

    Clearing it here means the worst state reachable at any instant is "old document,
    no PDF" or "new document, no PDF yet" — never a PDF that disagrees with the page
    beside it. The cost is those few seconds with no PDF on every successful
    regeneration, during which the document's button falls back to `window.print()`.
    That is the trade deliberately taken: a missing PDF degrades visibly, and a
    wrong one does not.
    """
    folder = Path(export_dir) / code
    path = export_html_path(export_dir, code, kind, token)
    _prune([path.with_suffix(".pdf")], code, kind)

    storage.write_text_atomic(path, html)

    cutoff = time.time() - TMP_SWEEP_AGE_S
    stale = [p for p in folder.glob(f"{kind}-*.html") if p != path]
    stale += list(folder.glob(f"{kind}-*.pdf"))
    stale += [p for p in folder.glob("*.tmp") if _older_than(p, cutoff)]
    _prune(stale, code, kind)
    return path
