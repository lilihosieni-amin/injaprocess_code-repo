from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import engine, gitcommit, storage
from ..auth import require_session

router = APIRouter(prefix="/api/departments")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("")
def list_departments(request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        files = storage.list_process_files(cfg.data_root, d["code"])
        subs = 0
        conflicts = 0
        for path in files:
            proc = storage.read_json(path)
            if proc.get("parent"):
                subs += 1
            conflicts += sum(1 for p in proc.get("pending", [])
                             if p.get("status") == "open")
        out.append({"code": d["code"], "name": d["name"],
                    "count": len(files), "subs": subs, "conflicts": conflicts})
    return out


@router.get("/{code}/overview")
def get_overview(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    path = storage.overview_path(cfg.data_root, code)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="overview not found")
    return storage.read_json(path)


@router.put("/{code}/overview")
async def put_overview(code: str, body: dict, request: Request,
                       _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    body["department"] = code
    body["updated_at"] = _now()
    try:
        engine.validate_doc(cfg, "overview.schema.json", body)
    except engine.EngineError as e:
        raise HTTPException(status_code=422, detail=e.message)
    path = storage.overview_path(cfg.data_root, code)
    async with storage.file_lock(path):
        storage.write_json_atomic(path, body)
        gitcommit.commit(cfg, [path], code, "update overview")
    return body


@router.get("/{code}/processes")
def list_processes(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    return [storage.read_json(p) for p in storage.list_process_files(cfg.data_root, code)]


@router.get("/{code}/next-id")
def next_id(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")
    return {"next_id": engine.peek_process_id(cfg, code)}
