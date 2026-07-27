from __future__ import annotations

import datetime
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import engine, gitcommit, storage
from ..auth import require_session

router = APIRouter(prefix="/api/departments")

logger = logging.getLogger(__name__)

# The `order` CLI takes its sequence as one comma-joined `--sequence` argument
# and splits it back on commas, dropping empty parts. An id carrying a comma or
# an empty entry would therefore store a *different* sequence than the request
# asked for, so the wire format is enforced here rather than trusted.
PROCESS_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("")
def list_departments(request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
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


@router.put("/{code}/order")
async def put_order(code: str, body: dict, request: Request,
                    _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")
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
def list_processes(code: str, request: Request, _: str = Depends(require_session)):
    """Processes in curated order (ARD §4.6), tombstones last in id order.

    The ordering rule itself lives in `storage.ordered_processes` so the export
    and this endpoint cannot disagree about a department's sequence.
    """
    cfg = request.app.state.cfg
    return storage.ordered_processes(cfg.data_root, code)


@router.get("/{code}/next-id")
def next_id(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")
    return {"next_id": engine.peek_process_id(cfg, code)}
