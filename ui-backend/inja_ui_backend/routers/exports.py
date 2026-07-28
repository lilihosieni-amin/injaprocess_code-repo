from __future__ import annotations

import datetime
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import exports, pdf, storage
from ..auth import require_session

router = APIRouter(prefix="/api/departments")

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _drop_stale_pdf(path: Path, code: str, kind: str) -> None:
    """Remove the PDF left over from an earlier export of this department+kind.

    The token is derived, not stored (`export_token`), so the PDF's path is the
    same on every export. Whenever a render does not produce a new one, whatever
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


def _render_pdf_beside(cfg, code: str, kind: str, token: str, html_path: Path) -> None:
    """Print the freshly written document to a PDF next to it — best effort (D21).

    The HTML is the product and the PDF an enhancement, so nothing in here may
    raise: a browser that is missing, crashes, times out, or prints nothing costs
    the reader the PDF button and nothing else. The response is unchanged either
    way — the link is never surfaced by the app, only by the document's own button
    (D18).

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
        return
    try:
        pdf.render_pdf(cfg.chromium_path, html_path, pdf_path)
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


@router.post("/{code}/exports/{kind}")
def create_export(code: str, kind: str, request: Request,
                  _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    # Every detail this handler returns is rendered verbatim by `ExportModal`,
    # inside an otherwise Persian dialog — so the 404s make the same split the
    # 503s below do: Persian to the client, English (with the offending value)
    # to the log. A malformed request is nobody's to act on, so it is logged at
    # INFO; the missing overview below is a real data gap and gets a warning.
    if kind not in exports.EXPORT_KINDS:
        logger.info("%s/%s: unknown export kind: %s", code, kind, kind)
        raise HTTPException(status_code=404, detail="نوع خروجی نامعتبر است")

    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        logger.info("%s/%s: unknown department: %s", code, kind, code)
        raise HTTPException(status_code=404, detail="دپارتمان یافت نشد")

    # Both settings are deployment faults: no retry and no user action fixes an
    # unset environment variable, so each answers 503 *and* leaves a log line.
    # Without the log an operator watching a misconfigured service sees nothing.
    if not cfg.export_dir:
        logger.error("%s/%s: EXPORT_DIR is not configured", code, kind)
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)")
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

    generated_at = _now()
    try:
        payload = exports.build_payload(cfg.data_root, code, generated_at)
    except exports.ExportUnavailable as e:
        # A department with no overview.json has nothing to document yet. This is
        # the likeliest failure on the whole handler — most departments have no
        # overview yet — so it is also the message most users will read: Persian,
        # and naming the thing they can go and fill in. `str(e)` stays English
        # and goes to the log, where only an operator reads it.
        logger.warning("%s/%s: %s", code, kind, e)
        raise HTTPException(
            status_code=404,
            detail="اطلاعات معرفی این دپارتمان هنوز ثبت نشده است؛ ابتدا معرفی واحد را کامل کنید.",
        ) from e

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

    token = exports.export_token(cfg.session_signing_key, code, kind)
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
    _render_pdf_beside(cfg, code, kind, token, written)

    # Both segments come from the path that was actually written, resolved against
    # the mount root, so the served URL cannot drift from the layout on disk.
    return {"url": f"/exports/{written.relative_to(cfg.export_dir).as_posix()}",
            "generated_at": generated_at}
