from __future__ import annotations

import datetime
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import engine, gitcommit, storage
from ..access import NOT_FOUND, reachable_departments, requires
from ..auth import require_session

router = APIRouter(prefix="/api/departments")

logger = logging.getLogger(__name__)


def _dept_target(request: Request) -> str:
    """`dept:{code}`, read from the path and from nothing else (D56).

    Purely lexical, and that is the whole reason it is a two-line function:
    the moment a target is derived by *resolving* something — a registry lookup,
    a stat of the department's directory — the gate can no longer run first, and
    a status chosen after the resource is known is a status chosen by existence
    rather than by scope. `code` is then handed to `contains`, which refuses
    anything the grammar does not accept, so nothing is validated here either.
    """
    return f"dept:{request.path_params['code']}"


# The `order` CLI takes its sequence as one comma-joined `--sequence` argument
# and splits it back on commas, dropping empty parts. An id carrying a comma or
# an empty entry would therefore store a *different* sequence than the request
# asked for, so the wire format is enforced here rather than trusted.
PROCESS_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("")
def list_departments(request: Request, user=Depends(require_session)):
    """The board, filtered rather than gated.

    This route spans every department, so there is no one target to gate it on;
    refusing it outright would take the whole screen away from a two-department
    head over a third they cannot reach. A department outside the caller's scope
    is **absent** from the list instead — not present and greyed, and not
    present with its counts zeroed, both of which would still say it exists
    (D56: no derived signal may imply withheld content).

    `None` is every department and `set()` is none of them. They are opposites
    and both falsy, so the test is `is None` — `if not reachable:` would read a
    wildcard holder as reaching nothing, or an unscoped account as reaching
    everything, depending on which way it fell.
    """
    cfg = request.app.state.cfg
    reachable = reachable_departments(request.app.state.db, user, "view")
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        if reachable is not None and d["code"] not in reachable:
            continue
        files = storage.list_process_files(cfg.data_root, d["code"])
        count = 0
        subs = 0
        conflicts = 0
        for path in files:
            proc = storage.read_json(path)
            if proc.get("tombstoned"):
                continue  # tombstones are off the active board (§4.7)
            count += 1
            if proc.get("parent"):
                subs += 1
            conflicts += sum(1 for p in proc.get("pending", [])
                             if p.get("status") == "open")
        out.append({"code": d["code"], "name": d["name"],
                    "count": count, "subs": subs, "conflicts": conflicts})
    return out


@router.get("/{code}/overview")
def get_overview(code: str, request: Request,
                 _=Depends(requires("view", _dept_target))):
    cfg = request.app.state.cfg
    path = storage.overview_path(cfg.data_root, code)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return storage.read_json(path)


@router.put("/{code}/overview")
async def put_overview(code: str, body: dict, request: Request,
                       _=Depends(requires("edit", _dept_target))):
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


@router.put("/{code}/order")
async def put_order(code: str, body: dict, request: Request,
                    _=Depends(requires("edit", _dept_target))):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    sequence = body.get("order")
    if not isinstance(sequence, list) or not all(isinstance(s, str) for s in sequence):
        raise HTTPException(status_code=422,
                            detail="order must be a list of process ids")
    bad = [s for s in sequence if not PROCESS_ID_RE.match(s)]
    if bad:
        raise HTTPException(status_code=422,
                            detail=f"not a process id: {','.join(repr(b) for b in bad)}")
    path = storage.order_path(cfg.data_root, code)
    async with storage.file_lock(path):
        try:
            engine.order_set(cfg, code, sequence)
        except (engine.EngineError, OSError) as e:
            if isinstance(e, engine.EngineError):
                # a drifted active set is a conflict, not a bad request
                status = 409 if e.message.startswith("set mismatch") else 422
                detail = e.message
            else:
                # The engine runs as a subprocess, so a missing `order` console
                # script raises OSError, not EngineError. Nothing has been
                # written yet — unlike the create/delete paths, which must let
                # the change stand — so the only job is to refuse legibly
                # instead of letting the OSError escape unhandled.
                logger.warning("%s: could not run the order CLI: %s", code, e)
                status, detail = 500, f"the order CLI could not be run: {e}"
            raise HTTPException(status_code=status, detail=detail)
        gitcommit.commit(cfg, [path], code, "update process order")
    return {"order": sequence}


@router.get("/{code}/processes")
def list_processes(code: str, request: Request,
                   _=Depends(requires("view", _dept_target))):
    """Processes in curated order (ARD §4.6), tombstones last in id order.

    The ordering rule itself lives in `storage.ordered_processes` so the export
    and this endpoint cannot disagree about a department's sequence.
    """
    cfg = request.app.state.cfg
    return storage.ordered_processes(cfg.data_root, code)


@router.get("/{code}/next-id")
def next_id(code: str, request: Request,
            _=Depends(requires("edit", _dept_target))):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"next_id": engine.peek_process_id(cfg, code)}
