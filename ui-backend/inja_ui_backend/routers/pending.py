from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from .. import storage
from ..access import reachable_departments
from ..auth import require_session

router = APIRouter(prefix="/api/pending")


@router.get("")
def list_pending(request: Request, user=Depends(require_session)):
    """Open conflicts across every department the caller may `edit`.

    `edit` rather than `view`, which is the one surprising line in the mapping.
    An unresolved proposal is internal bookkeeping and not content: `pending` is
    on the never-shown list (D17), and D56 puts the *count* of them there too,
    because a badge saying "three conflicts" leaks the existence of withheld
    proposals as surely as the proposals do. Only the person who can resolve one
    is served it.

    Filtered rather than gated, like the department board and for the same
    reason: this route spans every department, so there is no single target. A
    caller who may edit nowhere gets `[]` and a 200 — not a 403, which would be
    a claim about resources rather than about the list itself.

    `is None` is every department; `set()` is none of them. Both are falsy and
    they are opposites, so neither may be tested for truth.
    """
    cfg = request.app.state.cfg
    reachable = reachable_departments(request.app.state.db, user, "edit")
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        if reachable is not None and d["code"] not in reachable:
            continue
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
