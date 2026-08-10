from __future__ import annotations

import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import engine, gitcommit, storage
from .. import save as save_mod
from ..access import NOT_FOUND, requires
from ..auth import require_session
from ..models import CreateProcessBody, PendingDecision

router = APIRouter(prefix="/api/processes")

logger = logging.getLogger(__name__)


def _pid_target(request: Request) -> str:
    """`dept:{department}` for the process in the path — from the id, never the file.

    `storage.dept_of` is `pid.rsplit("-", 1)[0]`: pure string arithmetic, no
    filesystem, no registry. That is what lets the gate run *before* the process
    is loaded, and it is the whole of D56's existence rule on these five routes.
    Read the department out of the stored document instead and the resource has
    to be resolved to decide the status — at which point an out-of-scope caller
    gets one answer for a process that exists and another for one that does not,
    and can map every department by asking.

    An id that is no id (`cooking-001-x`, `Cooking-001`) yields a target the
    grammar refuses, which `contains` answers `False` for even to a `*` holder,
    so it is a 404 like anything else out of scope rather than a 500.
    """
    return f"dept:{storage.dept_of(request.path_params['pid'])}"


def _create_target(body: CreateProcessBody, request: Request,
                   user=Depends(require_session)) -> CreateProcessBody:
    """The one target that is not in the path: `POST /api/processes` names its
    department in the body.

    Still lexical — `body.department` is the caller's own text, checked against
    their scopes and against nothing on disk — but it cannot be a plain
    `requires(...)` dependency, because the body is not a `Request` attribute a
    sync callable can reach. So the gate is wrapped in a dependency that *does*
    take the body, and the handler takes its body from here rather than
    declaring it a second time: two body parameters of the same name would make
    FastAPI embed the body under a key and change the wire format.

    Returning the body keeps the resolution order visible in the signature —
    `create_process` cannot run before this has.
    """
    requires("edit", f"dept:{body.department}")(request, user)
    return body


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(cfg, pid):
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return path, storage.read_json(path)


def _sync_order(cfg, dept: str, written: list) -> None:
    """Reconcile `dept`'s order.json (ARD §4.6) and stage it — best effort.

    Mirrors merge's `_sync_order` (engine/merge/cli.py) and for the same reason.
    By the time a caller reaches this point the process file is already written
    or already unlinked and the id ledger has advanced, so letting the failure
    out would answer a *fully applied* change with a 500 and commit nothing:
    the user's retry mints the next id and orphans the first. And `reconcile`
    reads **every** process file in the department, so without this one
    unreadable sibling would poison every create and delete there.

    The catch is as wide as merge's `(ValueError, OSError)`, because the engine
    runs as a **subprocess**: a `order` console script that is missing from
    PATH — a partial deploy, or a checkout that skipped the editable reinstall —
    makes `subprocess.run` raise `FileNotFoundError`, an `OSError` and not an
    `EngineError`. Catching only `EngineError` would leave exactly the
    half-applied create this guard exists to prevent.

    order.json is derived state — `order sync <dept>` rebuilds it from disk, and
    an unreadable one can simply be deleted first — so warning and leaving the
    file out of `written` still leaves a complete recovery path.
    """
    try:
        engine.order_sync(cfg, dept)
    except (engine.EngineError, OSError) as e:
        logger.warning("the change is applied but %s's order.json could not be "
                       "synced: %s", dept, getattr(e, "message", None) or e)
        return
    written.append(storage.order_path(cfg.data_root, dept))


@router.get("/{pid}")
def get_process(pid: str, request: Request,
                _=Depends(requires("view", _pid_target))):
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
async def create_process(request: Request, response: Response,
                         body: CreateProcessBody = Depends(_create_target)):
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
            raise HTTPException(status_code=404, detail=NOT_FOUND)
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
        # keep the department's order.json equal to its active set (ARD §4.6),
        # in the same commit as the creation itself
        _sync_order(cfg, body.department, written)
        action = (f"create sub-process of {body.parent['process']}"
                  if body.parent else "create process")
        gitcommit.commit(cfg, written, pid, action)
    return child


@router.delete("/{pid}")
async def delete_process(pid: str, request: Request,
                         _=Depends(requires("edit", _pid_target))):
    cfg = request.app.state.cfg
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)

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
    # a permanently deleted process leaves the order (ARD §4.6)
    _sync_order(cfg, storage.dept_of(pid), written)
    gitcommit.commit(cfg, written, pid, "delete process")
    return {"deleted": pid}


@router.post("/{pid}/relayout")
def relayout(pid: str, body: dict, request: Request,
             _=Depends(requires("edit", _pid_target))):
    cfg = request.app.state.cfg
    body["id"] = pid
    body["department"] = storage.dept_of(pid)
    # Realize temp-keyed new nodes so the layout CLI's schema check passes. Stateless:
    # nothing is written; these real ids ride back to the editor and are kept at Save.
    doc, _remap = save_mod.allocate_new_node_ids(cfg, body)
    try:
        return engine.run_layout(cfg, doc)
    except engine.EngineError as e:
        raise HTTPException(status_code=422, detail=e.message)


@router.put("/{pid}")
async def save_process(pid: str, body: dict, request: Request,
                       _=Depends(requires("edit", _pid_target))):
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


@router.post("/{pid}/pending/{index}")
async def resolve(pid: str, index: int, body: PendingDecision, request: Request,
                  _=Depends(requires("edit", _pid_target))):
    cfg = request.app.state.cfg
    if body.decision not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="decision must be accept|reject")
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    async with storage.file_lock(path):
        try:
            engine.resolve_pending(cfg, pid, index, body.decision)
        except engine.EngineError as e:
            raise HTTPException(status_code=409, detail=e.message)
        gitcommit.commit(cfg, [path], pid, f"{body.decision} pending #{index}")
        return storage.read_json(path)
