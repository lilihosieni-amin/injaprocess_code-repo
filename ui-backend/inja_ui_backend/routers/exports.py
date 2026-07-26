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
    if kind not in exports.EXPORT_KINDS:
        raise HTTPException(status_code=404, detail=f"unknown export kind: {kind}")

    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")

    if not cfg.export_dir:
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)")
    if not cfg.export_template_dir:
        raise HTTPException(status_code=503,
                            detail="خروجی‌گیری پیکربندی نشده است (UI_EXPORT_TEMPLATE_DIR)")

    template_path = cfg.export_template_dir / f"{kind}.html"
    if not template_path.is_file():
        raise HTTPException(status_code=503,
                            detail=f"قالب خروجی یافت نشد: {template_path.name}")

    generated_at = _now()
    try:
        payload = exports.build_payload(cfg.data_root, code, generated_at)
    except exports.ExportUnavailable as e:
        # a department with no overview.json has nothing to document yet
        raise HTTPException(status_code=404, detail=str(e))

    try:
        html = exports.render(template_path.read_text(encoding="utf-8"), payload)
    except exports.ExportUnavailable as e:
        # A template that exists but carries no data slot was built wrong: a
        # deployment fault, not a data one. Retrying cannot fix it, so it joins
        # the other "export is not configured" 503s — and it is logged, because
        # only an operator can see the difference.
        logger.error("%s/%s: the export template is unusable: %s", code, kind, e)
        raise HTTPException(status_code=503, detail=str(e))

    token = exports.export_token(cfg.session_signing_key, code, kind)
    try:
        exports.write_export(cfg.export_dir, code, kind, token, html)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"نوشتن فایل خروجی انجام نشد: {e}")

    return {"url": f"/exports/{code}/{kind}-{token}.html",
            "generated_at": generated_at}
