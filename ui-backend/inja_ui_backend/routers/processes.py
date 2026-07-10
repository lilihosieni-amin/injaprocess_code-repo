from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import storage
from ..auth import require_session

router = APIRouter(prefix="/api/processes")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(cfg, pid):
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="process not found")
    return path, storage.read_json(path)


@router.get("/{pid}")
def get_process(pid: str, request: Request, _: str = Depends(require_session)):
    _, doc = _load(request.app.state.cfg, pid)
    return doc
