"""The content-visibility policy surface (spec D16, D19).

**Gated on `set_visibility` at `*`, both directions.**

Writing, because there is one global policy: a gate on `dept:{code}` would let a
department-scoped Editor decide what every other department publishes, and a
policy some Editors may set for everyone is not a global policy — it is a
per-department policy with a bug. `*` is the only target honest about the blast
radius, and `set_visibility` is `delegable: false` (D50), so no role holding it
can be created through any API path.

Reading, because knowing that "node actor is hidden" tells a reader a field
exists which they are not being shown — D56's derived-signals row. The only
screen that needs the policy is the Editor's.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..access import NOT_FOUND, requires
from ..auth import record
from ..models import VisibilityBody
from ..store import policy

router = APIRouter(prefix="/api/visibility")


def _state(conn) -> dict:
    """The policy and its identity, in one shape both routes answer with.

    `version` travels with the fields because it is what D27 keys the report
    cache on: a client that has just changed a switch can see the key move, and
    an artifact built under a different one is a different artifact.
    """
    return {"fields": policy.current(conn), "version": policy.version(conn)}


@router.get("")
def get_policy(request: Request,
               _=Depends(requires("set_visibility", "*"))):
    return _state(request.app.state.db)


@router.put("/{field}")
def set_policy_field(field: str, body: VisibilityBody, request: Request,
                     user=Depends(requires("set_visibility", "*"))):
    """Move one switch, and say so in the record.

    `NOT_FOUND` for a field nobody declared — the uniform 404, not a 400 naming
    the field, for the same reason every other 404 in this service is uniform.
    Checked before `policy.set_field`, which raises `ValueError` for the same
    case: two guards because this one chooses a status and that one protects the
    table, and the day a second writer appears the data layer is what still holds.

    D19 wants the actor, the field and **both values**, so the previous value
    comes back from `set_field` rather than being re-read afterwards — a
    read-after-write would race itself and could only ever report the new one
    twice.

    **The race is narrowed, not closed, and deliberately so.** `set_field` reads
    the old value and writes the new one in two statements with no transaction
    between them, because this connection is shared across FastAPI's threadpool
    and is safe only while no handler opens one (see `db.connect`). Two Editors
    flipping the same switch at the same instant can therefore both read the same
    `before` and write two events that agree about a value only one of them
    replaced. The stored policy is still whichever write landed last — nothing is
    lost — and the cost is one misleading `before` in the record, which is a
    smaller harm than a `BEGIN` on a connection every other request is using.
    """
    if field not in policy.FIELDS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    conn = request.app.state.db
    before = policy.set_field(conn, field, body.visible)
    record(request, "visibility.policy.changed", actor=user["username"],
           session_id=request.state.session_id, target=field,
           detail={"field": field, "before": before, "after": body.visible})
    return _state(conn)
