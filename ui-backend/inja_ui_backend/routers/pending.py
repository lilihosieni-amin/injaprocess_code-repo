from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from .. import storage
from ..access import allows
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

    **`allows(…, "edit", "dept:{code}")` per department, and deliberately not
    `reachable_departments`.** The two differ on exactly one holder and it
    matters here: `reachable_departments` is "somewhere within", so it names `x`
    for a `dept:x/report:k` holder — right for the department board, where the
    holder must find `x` in the list to navigate to the one report they were
    granted, and wrong here, because on this route there is nothing to navigate
    to. Every row it would serve them names a process they cannot open, carries
    that process's `node`, `field`, `current` and `proposed`, and then 404s on
    the endpoint that resolves it. D56: a list endpoint never returns rows it
    then declines to render. A `dept:x/report:k` scope is model-legal on an
    Editor — nothing in D10 or D11 forbids it — so this is a check, not a note.

    This is a decision per department rather than a set to test against, which
    is also why the `None`-is-everything / `set()`-is-nothing trap that the
    department board has to carry is not here: `allows` answers a plain bool.
    """
    cfg = request.app.state.cfg
    conn = request.app.state.db
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        if not allows(conn, user, "edit", f"dept:{d['code']}"):
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
