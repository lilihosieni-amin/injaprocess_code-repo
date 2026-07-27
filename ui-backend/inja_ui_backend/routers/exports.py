from __future__ import annotations

import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import exports, storage
from ..auth import require_session

router = APIRouter(prefix="/api/departments")

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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

    # Both segments come from the path that was actually written, resolved against
    # the mount root, so the served URL cannot drift from the layout on disk.
    return {"url": f"/exports/{written.relative_to(cfg.export_dir).as_posix()}",
            "generated_at": generated_at}
