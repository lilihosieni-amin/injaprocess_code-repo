from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from .. import storage
from ..auth import require_session

router = APIRouter(prefix="/api/pending")


@router.get("")
def list_pending(request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        for fp in storage.list_process_files(cfg.data_root, d["code"]):
            doc = storage.read_json(fp)
            for i, p in enumerate(doc.get("pending", [])):
                if p.get("status") == "open":
                    out.append({
                        "process": doc["id"], "department": doc["department"],
                        "name": doc["name"], "node": p["node"], "index": i,
                        "field": p["field"], "current": p["current"],
                        "proposed": p["proposed"], "source": p["source"],
                        "status": p["status"],
                    })
    return out
