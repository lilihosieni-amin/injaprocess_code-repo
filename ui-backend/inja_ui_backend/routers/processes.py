from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import engine, gitcommit, storage
from .. import save as save_mod
from ..auth import require_session
from ..models import CreateProcessBody

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


def _skeleton(pid: str, department: str, name: str, parent: dict | None) -> dict:
    now = _now()
    return {
        "id": pid, "department": department,
        "name": name or "فرآیند جدید", "summary": "",
        "source": {"type": "manual", "ref": None, "run": None},
        "parent": parent, "created_at": now, "updated_at": now,
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [], "pending": [],
        "nodes": [
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 60, "y": 120}, "layout": "manual"},
            {"id": "end", "type": "end", "label": "پایان",
             "position": {"x": 320, "y": 120}, "layout": "manual"},
        ],
        "edges": [{"from": "start", "to": "end", "label": ""}],
    }


@router.post("", status_code=201)
async def create_process(body: CreateProcessBody, request: Request, response: Response,
                         _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if body.department not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=400, detail="unknown department")

    # Guard the parent link BEFORE allocating anything, mirroring merge's guards,
    # so a rejected request never leaves an orphan child file.
    ppath = pdoc = pnode = None
    if body.parent:
        ppath, pdoc = _load(cfg, body.parent["process"])          # 404 if parent missing
        pnode = next((n for n in pdoc["nodes"] if n["id"] == body.parent["node"]), None)
        if pnode is None:
            raise HTTPException(status_code=404, detail="parent node not found")
        if pnode.get("type") != "activity":
            raise HTTPException(status_code=400, detail="parent node must be an activity")
        if pnode.get("subprocess") is not None:
            raise HTTPException(status_code=409, detail="parent node already links a sub-process")

    pid = engine.allocate_process_id(cfg, body.department)
    child = _skeleton(pid, body.department, body.name, body.parent)
    try:
        engine.validate_doc(cfg, "process.schema.json", child)
    except engine.EngineError as e:
        raise HTTPException(status_code=422, detail=e.message)

    child_path = storage.proc_path(cfg.data_root, pid)
    written = [child_path]
    async with storage.file_lock(child_path):
        storage.write_json_atomic(child_path, child)
        if body.parent:
            pnode["subprocess"] = pid
            pdoc["updated_at"] = _now()
            engine.validate_doc(cfg, "process.schema.json", pdoc)
            storage.write_json_atomic(ppath, pdoc)
            written.append(ppath)
        action = (f"create sub-process of {body.parent['process']}"
                  if body.parent else "create process")
        gitcommit.commit(cfg, written, pid, action)
    return child


@router.delete("/{pid}")
async def delete_process(pid: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="process not found")

    reg = storage.read_json(storage.registry_path(cfg.data_root))
    written = []
    path.unlink()
    written.append(path)
    for d in reg["departments"]:
        for fp in storage.list_process_files(cfg.data_root, d["code"]):
            doc = storage.read_json(fp)
            changed = False
            for n in doc.get("nodes", []):
                if n.get("subprocess") == pid:
                    n["subprocess"] = None
                    changed = True
            if doc.get("parent") and doc["parent"].get("process") == pid:
                doc["parent"] = None
                changed = True
            if changed:
                doc["updated_at"] = _now()
                storage.write_json_atomic(fp, doc)
                written.append(fp)
    gitcommit.commit(cfg, written, pid, "delete process")
    return {"deleted": pid}


@router.put("/{pid}")
async def save_process(pid: str, body: dict, request: Request,
                       _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    path = storage.proc_path(cfg.data_root, pid)
    async with storage.file_lock(path):
        on_disk = storage.read_json(path) if path.is_file() else None
        doc = save_mod.prepare_save(cfg, pid, body, on_disk)
        try:
            engine.validate_doc(cfg, "process.schema.json", doc)
        except engine.EngineError as e:
            raise HTTPException(status_code=422, detail=e.message)
        storage.write_json_atomic(path, doc)
        gitcommit.commit(cfg, [path], pid, "save")
    return doc
