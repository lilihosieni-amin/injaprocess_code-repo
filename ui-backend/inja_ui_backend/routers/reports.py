"""Every report route: the registry, the read, the build and the download.

One module because they are one feature and they share three things that must
never drift — the scope target (`_report_target`), the cache key
(`_current_key`) and the registry itself. The download has to land on exactly
the file the build wrote, and the two computing that name separately is how a
download 404s for a department nothing is wrong with.
"""
from __future__ import annotations

import dataclasses
import datetime
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.staticfiles import NotModifiedResponse, StaticFiles

from .. import exports, pdf, storage
from ..access import NOT_FOUND, requires
from ..auth import record, require_session
from ..fingerprint import fingerprint
from ..store import confirmations, policy

logger = logging.getLogger(__name__)

#: Its own router because its path is not under `/api/departments`. Registered
#: beside the other one and, like it, **before** the SPA catch-all (D24 — route
#: ordering is load-bearing; a mount at "/" swallows everything after it).
registry_router = APIRouter(prefix="/api/reports")

router = APIRouter(prefix="/api/departments")


@registry_router.get("")
def list_reports(_user=Depends(require_session)):
    """The registry, for the dialog that lists reports and the scope picker.

    Behind the session and gated on nothing else: it is the catalogue of kinds,
    not of anybody's departments, and it names no content. What a given caller
    may *do* with a kind is decided per department, at the routes below, from
    the session row — never from this list.
    """
    return {"reports": [dataclasses.asdict(r) for r in exports.REGISTRY]}


#: The one answer this handler gives for *"there is nothing here to publish"* —
#: whichever of the two reasons it is.
#:
#: **One body, because two would be an existence oracle.** The two states are «no
#: `overview.json` at all» and «an `overview.json` nobody has confirmed», and the
#: gated read of the same document refuses to tell them apart: `GET
#: /api/departments/{code}/overview` answers `NOT_FOUND` for both (a missing file
#: and a record the gate withholds), precisely so that a caller cannot use it to
#: map what exists. This endpoint is reachable by a plain `reader` — `export_pdf`
#: is in the default reader role — and by an `export_pdf` holder scoped
#: `dept:{code}/report:{kind}`, who holds no `view` on the department at all. Two
#: different sentences here would hand exactly those callers the distinction the
#: read endpoint refuses them, out of the one route that never asks `view`.
#:
#: It still says what to go and do, which is why it is a 409 rather than a
#: fourth `NOT_FOUND`: the gate already admitted this caller, so "reachable, and
#: not in a publishable state" tells them nothing that reaching this line did not
#: — and it is the only message on the handler an Editor can act on. It names
#: both halves of the requirement (complete the introduction, then confirm it)
#: because the union of the two is true in either state and the difference
#: between them is not this response's to disclose.
NOT_PUBLISHABLE = ("معرفی این دپارتمان هنوز کامل و تأیید نشده است؛"
                   " ابتدا آن را ثبت و سپس تأیید کنید.")


def _report_target(request: Request) -> str:
    """`dept:{code}/report:{kind}` — both segments, each from its own path slot.

    The narrower of the two shapes D10 allows, because that is what this route
    actually acts on: a reader granted `dept:cooking/report:steps` must reach the
    steps export of cooking and no other kind, while a `dept:cooking` holder
    reaches every kind in it — including kinds added after the grant, which is
    exactly what `contains` gives for free and a list of known kinds would not.

    Lexical, like every other target: `kind` is not checked against
    `REPORT_IDS` here. Doing so would put a lookup in front of the gate and
    hand an out-of-scope caller a different answer for a real kind than for an
    invented one. An unknown kind is still a well-formed scope, so it passes the
    gate for whoever holds the department and is refused by the handler below;
    a kind the *grammar* refuses reaches nothing under `contains` and is a 404
    for everyone, wildcard holders included.
    """
    return (f"dept:{request.path_params['code']}"
            f"/report:{request.path_params['kind']}")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _file_url(code: str, kind: str) -> str:
    """The download route's own path (Task 5). Built here and nowhere else, so
    the link the dialog receives and the route that serves it cannot disagree."""
    return f"/api/departments/{code}/reports/{kind}/file.pdf"


def _drop_stale_pdf(path: Path, code: str, kind: str) -> None:
    """Remove the PDF left over from an earlier export of this department+kind.

    The token is derived from the department's content (`exports.report_key`) and
    not stored, so re-exporting a department nothing has changed writes to that
    same path again. Whenever a render does not produce a new one, whatever
    is sitting at that path was printed from an *older* version of the document
    that has just been overwritten — and it is served from the same public folder,
    one extension away from a link people share. A reader tapping «چاپ / PDF»
    would silently download a document that disagrees with the one on their
    screen, which is strictly worse than no PDF at all.

    `exports.write_export` now clears that path *before* it writes the HTML, so on
    every normal path this finds nothing and does nothing. It stays as the second
    line of defence, and it is not redundant: it is the only thing standing between
    a reader and a mismatch if a future caller ever renders over a document it did
    not write through `write_export`, and the error below is how that would be
    noticed rather than served.
    """
    try:
        path.unlink(missing_ok=True)
    except OSError as e:
        # Not the render's "never mind" warning: this one means a mismatched PDF
        # is still being served and only a human can clear it.
        logger.error("%s/%s: the stale PDF could not be removed and now disagrees "
                     "with the document beside it: %s: %s", code, kind, path, e)


def _render_pdf_beside(cfg, code: str, kind: str, token: str,
                      html_path: Path) -> Path | None:
    """Print the freshly written document to a PDF next to it — and say whether it
    worked.

    **Owner ruling: *"the export button should just create pdf. not html. we
    doen't need html at all."*** The PDF is what the panel hands over now, so
    this function's answer is no longer only a side effect on disk: it returns
    the path when a PDF is genuinely there and `None` when there is not, and the
    caller puts that in `pdf_url` or leaves the field out. A response that named a
    `.pdf` which had not been printed would be a dead link in an export dialog.

    **Nothing in here may raise, and that has not changed.** A browser that is
    missing, crashes, times out or prints nothing is a *deployment* fault, and the
    document itself is already written and published by the time this runs — the
    reader-facing `/exports` link, the exported page's own «چاپ / PDF» button and
    the whole cache key are unaffected either way (D18, D21). What the caller does
    with a `None` is the caller's decision; what this must never do is lose the
    document over the enhancement.

    This runs inside a *sync* path operation, which FastAPI dispatches to its
    worker threadpool. That is deliberate and load-bearing: `pdf.render_pdf`
    blocks for seconds to tens of seconds while it drives a browser, and on the
    event loop it would freeze every other request this process serves. Making
    this handler `async def` without moving the call off the loop reintroduces
    exactly that — `test_the_render_does_not_run_on_the_event_loop` pins it.
    """
    pdf_path = exports.export_pdf_path(cfg.export_dir, code, kind, token)
    if not cfg.chromium_path:
        # A supported deployment, not a fault — but it is worth one line, because
        # an operator who expected PDFs and has none needs to be told which knob
        # is unset rather than left guessing at the browser.
        logger.warning("%s/%s: CHROMIUM_PATH is not configured, so the export has "
                       "no PDF", code, kind)
        _drop_stale_pdf(pdf_path, code, kind)
        return None
    try:
        pdf.render_pdf(cfg.chromium_path, html_path, pdf_path)
        # `render_pdf` returning is not proof a file landed: it drives a browser
        # over CDP and the last step is a write. The answer this function gives is
        # about a file the client will be sent to, so it is read off the disk.
        return pdf_path if pdf_path.is_file() else None
    except Exception as e:  # noqa: BLE001
        # Deliberately every exception, not the two the renderer means to raise.
        # D21 is a promise about the *export*, and narrowing this to
        # `(PdfRenderError, OSError)` would rest that promise on a type
        # discipline inside `pdf.py` that nothing enforces: it drives a
        # subprocess, a socket and a JSON protocol, so a `RuntimeError` from the
        # CDP plumbing or a decode error on a truncated frame is entirely
        # possible — and would 500 an export whose HTML is already written and
        # already being served. `BaseException` is not caught: a
        # `KeyboardInterrupt` or a cancellation is the process being taken down,
        # not a render that went wrong.
        #
        # The type is named in the log precisely because this is now a catch-all:
        # a surprise must still be diagnosable, and "PdfRenderError" versus
        # "RuntimeError" is the difference between a known failure mode and a bug.
        logger.warning("%s/%s: the export's PDF could not be rendered; the document "
                       "itself is published: %s: %s",
                       code, kind, type(e).__name__, e)
        _drop_stale_pdf(pdf_path, code, kind)
        return None


def _known(cfg, code: str, kind: str) -> None:
    """Refuse an unknown kind or department with the one 404 body this service
    gives (D56). Lexical order preserved from the old handler: the gate has
    already decided reachability, so nothing here separates "not there" from
    "not yours"."""
    if kind not in exports.REPORT_IDS:
        logger.info("%s/%s: unknown report kind: %s", code, kind, kind)
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        logger.info("%s/%s: unknown department: %s", code, kind, code)
        raise HTTPException(status_code=404, detail=NOT_FOUND)


def _current_key(request: Request, code: str, kind: str) -> str | None:
    """This department's report key as it stands **right now**, or `None` when
    there is nothing publishable.

    **The one place the key is computed**, and that is the point rather than
    tidiness: the build writes a file named by it and the download resolves a
    file named by it, and two copies of this arithmetic drifting by one input
    is a download that 404s forever on a department where nothing is wrong.

    `None` means the overview is missing or carries no valid confirmation —
    `build_payload` refuses in exactly that case (D22), so a key would name a
    file that cannot exist.
    """
    cfg = request.app.state.cfg
    conn = request.app.state.db
    active = [doc for doc in storage.ordered_processes(cfg.data_root, code)
              if not doc.get("tombstoned")]
    stored = confirmations.stored_for(conn, [code] + [d.get("id") for d in active])
    try:
        overview = storage.read_json(storage.overview_path(cfg.data_root, code))
    except OSError:
        return None
    if stored.get(code) != fingerprint(overview):
        return None
    published = [fingerprint(doc) for doc in active
                 if stored.get(doc.get("id")) == fingerprint(doc)]
    return exports.report_key(code, kind, process_fingerprints=published,
                              overview_fingerprint=fingerprint(overview),
                              policy_version=policy.version(conn))


@router.get("/{code}/reports/{kind}")
def read_report(code: str, kind: str, request: Request,
                user=Depends(requires("view", _report_target))):
    """The report as the application renders it (D25).

    **`view`, and the artifact is never in this response.** Reading and
    downloading are two responses on purpose: the single file inlines the whole
    department into one document (ARD §13.3), so serving it here would hand a
    reader without `export_pdf` the complete artifact and a Ctrl-S, and make
    FR-E7's *"the ability to download may be withheld from a person who may
    still read"* decorative. §11 test 23 asserts that on the bytes, not the
    status.

    **Empty is a state, not a failure.** Nothing is confirmed at start (D23), so
    on day one every report in the system is empty; §10 says plainly that an
    empty report renders the empty state rather than 404. `build_payload` raises
    when the overview carries no valid confirmation, and that becomes the same
    empty body a department with no `overview.json` gets — the two must not be
    distinguishable, because the difference is a derived signal about withheld
    content (D56).

    The payload is `build_payload`'s, which means it is the **same filter every
    other response goes through** (D18) and the same caller-independent view the
    downloadable artifact carries (D27): permission decides whether this is
    served, never what it contains.
    """
    cfg = request.app.state.cfg
    conn = request.app.state.db
    _known(cfg, code, kind)
    generated_at = _now()
    active = [doc for doc in storage.ordered_processes(cfg.data_root, code)
              if not doc.get("tombstoned")]
    stored = confirmations.stored_for(conn, [code] + [d.get("id") for d in active])
    try:
        payload = exports.build_payload(cfg.data_root, code, generated_at,
                                        policy=policy.current(conn), confirmed=stored)
    except exports.ExportUnavailable as e:
        logger.info("%s/%s: read as empty: %s", code, kind, e)
        payload = {"dept": None, "processes": [], "generated_at": generated_at}
    record(request, "report.viewed", actor=user["username"],
           session_id=getattr(request.state, "session_id", None),
           target=f"dept:{code}/report:{kind}")
    return payload


@router.post("/{code}/reports/{kind}")
def build_report(code: str, kind: str, request: Request,
                 _=Depends(requires("export_pdf", _report_target))):
    cfg = request.app.state.cfg
    # Every detail this handler returns is rendered verbatim by `ExportModal`,
    # inside an otherwise Persian dialog, so all of them are Persian and the
    # English (with the offending value) goes to the log. A malformed request is
    # nobody's to act on, so it is logged at INFO; the missing overview below is
    # a real data gap and gets a warning.
    #
    # The two 404s below no longer say *which* thing was not found, and that is
    # the point rather than a regression. The gate above answers 404 for a
    # report outside the caller's scope; if these said "unknown kind" or
    # "unknown department" they would tell a prober which of their guesses
    # landed inside their own scope and which did not, which is the boundary the
    # status code was just made uniform to hide. `NOT_FOUND` is the one body
    # every 404 in this service carries. The missing overview further down is
    # not one of them — it is a 409 and keeps its guidance; see there. The 503s
    # are unaffected: a deployment fault is nothing to hide, and telling an
    # operator which variable is unset costs no disclosure at all.
    _known(cfg, code, kind)
    # Both settings are deployment faults: no retry and no user action fixes an
    # unset environment variable, so each answers 503 *and* leaves a log line.
    # Without the log an operator watching a misconfigured service sees nothing.
    if not cfg.export_dir:
        logger.error("%s/%s: EXPORT_DIR is not configured", code, kind)
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)")

    # **The cache, used** (D27). A chromium render is tens of seconds and is
    # serialised process-wide, so rebuilding an artifact whose key has not moved
    # is the one thing the key exists to prevent — and it is what the reader
    # waits through. A hit answers before the template is even read.
    cached = _current_key(request, code, kind)
    if cached is not None \
            and exports.export_html_path(cfg.export_dir, code, kind, cached).is_file() \
            and exports.export_pdf_path(cfg.export_dir, code, kind, cached).is_file():
        return {"pdf_url": _file_url(code, kind), "generated_at": _now()}

    if not cfg.export_template_dir:
        logger.error("%s/%s: UI_EXPORT_TEMPLATE_DIR is not configured", code, kind)
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (UI_EXPORT_TEMPLATE_DIR)")

    # The template dir is configured but the build never put `{kind}.html` in it:
    # a deployment fault, so it is logged like the other 503s below.
    template_path = cfg.export_template_dir / f"{kind}.html"
    if not template_path.is_file():
        logger.error("%s/%s: the export template is missing: %s", code, kind, template_path)
        raise HTTPException(status_code=503,
                            detail=f"قالب خروجی یافت نشد: {template_path.name}")

    # Read outside the render guard below: a permissions error, or a deletion
    # racing the `is_file()` check above, is a deployment fault too and must not
    # escape as a bare 500 with nothing in the log.
    try:
        template = template_path.read_text(encoding="utf-8")
    except OSError as e:
        logger.error("%s/%s: the export template could not be read: %s: %s",
                     code, kind, template_path, e)
        raise HTTPException(status_code=503,
                            detail=f"قالب خروجی خوانده نشد: {template_path.name}") from e

    conn = request.app.state.db
    active = [doc for doc in storage.ordered_processes(cfg.data_root, code)
              if not doc.get("tombstoned")]
    # One statement for the whole department (D56: filtered in the query), and
    # the department's own code alongside its processes, because the overview is
    # a confirmable target too (D20, D55).
    stored = confirmations.stored_for(conn, [code] + [d.get("id") for d in active])
    current_policy = policy.current(conn)

    generated_at = _now()
    try:
        payload = exports.build_payload(cfg.data_root, code, generated_at,
                                        policy=current_policy, confirmed=stored)
    except exports.Unconfirmed as e:
        # The department's introduction exists and nobody has vouched for it
        # (D22). INFO rather than the WARNING below: this is the ordinary state
        # of a department somebody is still working on, not a data gap.
        #
        # **Caught first, and it must stay first:** it is a subclass of
        # `ExportUnavailable`, and a reversed order would send every unconfirmed
        # department down the branch below. The two answer the client
        # identically — see `NOT_PUBLISHABLE`, which is the whole point — so what
        # a reversal would cost is the operator's log line, which is the one
        # place the two states may be told apart.
        logger.info("%s/%s: %s", code, kind, e)
        raise HTTPException(status_code=409, detail=NOT_PUBLISHABLE) from e
    except exports.ExportUnavailable as e:
        # A department with no overview.json has nothing to document yet: the
        # likeliest failure on the whole handler, and the only one that tells a
        # user what to go and do.
        #
        # **409, not 404, and that is what lets it keep saying so.** The uniform
        # `NOT_FOUND` body exists because a self-describing 404 describes the
        # caller's scope boundary — an `export_pdf` holder scoped
        # `dept:{code}/report:{kind}` passes the gate above without holding
        # `view` on the department, so "this department has no introduction yet"
        # in a *404* would separate "not there" from "not yours" for them. A 409
        # is not in that partition at all: it says the department is reachable —
        # which the caller already knows, because the gate let them through, and
        # which it says identically for every kind and every caller who gets
        # here — but is not in a state that can be exported. Nothing about which
        # of their guesses landed is legible in it, because reaching this line
        # at all already required being inside.
        #
        # The *body* is the same one the unconfirmed branch above answers with,
        # and that is the second half of the same rule: same status and same
        # bytes, or the prose re-opens the existence question the status closed.
        #
        # Everything narrower stays 404: an unknown kind and an unknown
        # department above are both "there is no such thing", answered in the one
        # body every 404 here carries.
        logger.warning("%s/%s: %s", code, kind, e)
        raise HTTPException(status_code=409, detail=NOT_PUBLISHABLE) from e

    try:
        html = exports.render(template, payload)
    except exports.ExportUnavailable as e:
        # A template that exists but carries no data slot was built wrong: a
        # deployment fault, not a data one. Retrying cannot fix it, so it joins
        # the other "export is not configured" 503s. The operator-facing English
        # goes to the log, where only an operator reads it; the client gets the
        # same user-facing Persian as every other detail on this handler.
        logger.error("%s/%s: the export template is unusable: %s", code, kind, e)
        raise HTTPException(status_code=503, detail="قالب خروجی نامعتبر است") from e

    # The key is the content, not the department (D27): the fingerprints of the
    # confirmed processes in curated order, the overview's, and the policy
    # version. `build_payload` published exactly the processes below, so the two
    # cannot disagree about what this file contains.
    token = _current_key(request, code, kind)
    if token is None:
        # Readable a moment ago and not now — a `merge` run, or an operator
        # clearing a department while somebody builds. Same answer as the
        # missing-overview branch above, body included.
        logger.warning("%s/%s: the department introduction went away mid-build, "
                       "so the report is refused", code, kind)
        raise HTTPException(status_code=409, detail=NOT_PUBLISHABLE)
    try:
        written = exports.write_export(cfg.export_dir, code, kind, token, html)
    except OSError as e:
        # `str(OSError)` carries the filename, so the underlying error is logged
        # and the response says only that the write failed: a full server path in
        # a client-visible detail is disclosure, and the client cannot act on it.
        logger.error("%s/%s: the export file could not be written: %s", code, kind, e)
        raise HTTPException(status_code=500,
                            detail="نوشتن فایل خروجی انجام نشد") from e

    # After the document is on disk and before the link goes out, so a reader who
    # follows it straight away finds the PDF already there. Never raises (D21).
    rendered = _render_pdf_beside(cfg, code, kind, token, written)

    # **`pdf_url` is present only when a PDF is genuinely on disk** — owner
    # ruling, *"the export button should just create pdf"*. It is the field the
    # panel's export dialog hands over. Absent rather than null, and never a
    # guessed `.pdf` beside a render that did not run: a dialog offering a link
    # to a file that is not there is worse than a dialog that says the export
    # failed, which is what the panel now draws when this field does not come
    # back.
    body: dict = {"generated_at": generated_at}
    if rendered is not None:
        body["pdf_url"] = _file_url(code, kind)
    return body


#: Borrowed, not reimplemented. `is_not_modified` is the exact comparison the
#: old static mount made — `If-None-Match` against the response's own `etag`,
#: then `If-Modified-Since` against its `last-modified` — and it reads no
#: instance state, so an empty `StaticFiles` is just somewhere to hang it.
#: Reproducing it here would mean re-deriving the etag format `FileResponse`
#: picked, and the two agreeing forever is the whole point.
_conditional = StaticFiles(check_dir=False)

#: The two shapes a download comes in (D25), each with the function that names
#: its file. A shape not in here is a 404 like any other unknown path.
_ARTIFACT = {"pdf": exports.export_pdf_path, "html": exports.export_html_path}


@router.api_route("/{code}/reports/{kind}/file.{ext}", methods=["GET", "HEAD"])
def download_report(code: str, kind: str, ext: str, request: Request,
                    user=Depends(requires("export_pdf", _report_target))):
    """The built single file (D25) — the download, on both extensions.

    **`export_pdf`, re-derived here on every request.** D56's *Downloads* row is
    the whole reason this is a route and not a folder: *"the download endpoint
    re-derives scope on every request; that the cached artifact exists (D27) is
    not authorisation to serve it."* `requires` asks the two questions in D56's
    order — scope first, so a department the caller may not learn of answers the
    same bare 404 a never-built report does; capability second, so a
    `reader_no_download` holder gets a 403 and an `access.denied` row on their
    own department.

    **The file name is computed, never received.** The old mount took a path
    from the URL and had to defend itself against `..`, `%00` and symlinks.
    Here the path is `{code}` and `{kind}` — both already validated by the gate
    and by `_known` — plus a key derived from the department's own content, so
    there is no traversal to defend against. The containment check stays anyway,
    because this is still the one place a filesystem path is built for an
    outsider's request and it costs one comparison.

    **There is no permanent link** (D28). The key moves with the content, so
    this URL serves *whatever is current* and 404s the moment it is asked for a
    version that no longer is — which is the same sentence as "a report is always
    current", written as a route.
    """
    cfg = request.app.state.cfg
    _known(cfg, code, kind)
    if ext not in _ARTIFACT or not cfg.export_dir:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    token = _current_key(request, code, kind)
    if token is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    root = cfg.export_dir.resolve()
    # `resolve()` on both sides, and inside the guard: it raises ValueError on an
    # embedded NUL and `stat()` raises OSError if the file is unlinked between
    # the check and the read. The old mount answered 404 to all of it; an
    # escaping exception here would be a 500 and a traceback.
    #
    # `stat_result` is taken here rather than left to `FileResponse` because
    # otherwise the validators do not exist until the body is streaming, and the
    # conditional check below needs them.
    try:
        target = _ARTIFACT[ext](cfg.export_dir, code, kind, token).resolve()
        servable = target.is_relative_to(root) and target.is_file()
        stat_result = target.stat() if servable else None
    except (ValueError, OSError):
        servable = False
    if not servable:
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    record(request, "report.downloaded", actor=user["username"],
           session_id=getattr(request.state, "session_id", None),
           target=f"dept:{code}/report:{kind}", detail={"format": ext})

    # `private`: the file is behind a session, so a shared cache must never keep
    # a copy to hand to the next person. `no-cache`: the reader's own browser may
    # keep one, but must revalidate — without it, a response carrying
    # `Last-Modified` is one a cache may assign heuristic freshness to and reuse
    # without asking (RFC 9111 §4.2.2), which is a staff member reading a
    # corrected process's old bytes with no way to tell.
    response = FileResponse(target, stat_result=stat_result,
                            headers={"Cache-Control": "private, no-cache"})
    if _conditional.is_not_modified(response.headers, request.headers):
        return NotModifiedResponse(response.headers)
    return response
