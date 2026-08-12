from __future__ import annotations

import datetime
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import engine, gitcommit, storage
from ..access import NOT_FOUND, permits, reachable_departments, requires
from ..auth import require_session
from ..disclosure import Disclosure

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

    This is the **only** caller of `reachable_departments` in the service, and
    therefore the only place that invariant has to be got right. `/api/pending`
    used to carry the same two lines and the same paragraph explaining them —
    two homes for one subtlety, one of which could drift to `if not reachable:`
    while the other's tests stayed green. It now decides per department with
    `permits`, which is a bool and has no trap, for a reason of its own (see
    `routers/pending.py`). If a second caller of `reachable_departments` ever
    appears, this filter is what to extract rather than to copy.

    **`conflicts` is served only to someone who may `edit` that department**, and
    is absent — not zeroed — for everyone else. It is the same rule `/api/pending`
    is gated by, applied to the *count* of the same thing: D17 puts `pending`
    (unresolved conflicts) in the never-shown block with no switch, and D56's
    derived-signals row names a `pending` **count** in as many words, because a
    badge saying "two conflicts" leaks the existence of withheld proposals as
    surely as the proposals do. §11 test 9 says it plainly — *no pending count
    reaches a non-editor* — and until now this route handed every Reader the very
    number the endpoint next door refuses them.

    Absent rather than zero because D56 is "not sent", not "sent harmless": a `0`
    still answers *"how many unresolved proposals does this department have"*,
    and it answers it wrongly, which is worse than not answering.

    **The `edit` question is asked per department and never per caller.** It is
    `may_edit(f"dept:{code}")` inside the loop, and two model-legal holders make
    the difference visible:

    * `dept:x/report:k` alone is named by `reachable_departments` — that is what
      puts x in this list at all — while `allows` refuses them on x itself, so a
      check that asked only whether the *role* holds `edit` would serve them a
      count for a department they cannot open;
    * `dept:a` **and** `dept:b/report:k` together is listed for both, may edit a
      and not b, and a check of the form "may this caller edit *somewhere*?"
      would hand them b's count. That caller is the one a per-caller regression
      passes every other test with; `test_body_scan.py` holds them.

    **`subs` counts only a parent the caller may see**, for the same reason and
    by the same rule as the two document endpoints (`disclosure.py`). The badge
    is derived from a link, and when that link points into a department the
    caller is 404'd out of, a `1` says *one of your processes hangs under
    something you may not know about* — D56's derived-signals row, the same
    clause the conflict count above is withheld under. A sub-process whose
    parent is in the caller's own scope still counts, so the badge keeps meaning
    what it says for the people it is for.

    `permits` resolves the capability set and the scope rows once for the whole
    board rather than once per department — the same decision, eighteen fewer
    reads. `Disclosure` holds two of those resolutions, which is why the
    per-parent question below costs no query at all. See `routers/pending.py`
    for the same per-department shape.
    """
    cfg = request.app.state.cfg
    conn = request.app.state.db
    reachable = reachable_departments(conn, user, "view")
    may_edit = permits(conn, user, "edit")
    shown = Disclosure(conn, user)
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
            parent = proc.get("parent")
            if isinstance(parent, dict) and shown.sees(parent.get("process")):
                subs += 1
            conflicts += sum(1 for p in proc.get("pending", [])
                             if p.get("status") == "open")
        row = {"code": d["code"], "name": d["name"], "count": count, "subs": subs}
        if may_edit(f"dept:{d['code']}"):
            row["conflicts"] = conflicts
        out.append(row)
    return out


@router.get("/{code}/overview")
def get_overview(code: str, request: Request,
                 user=Depends(requires("view", _dept_target))):
    """The department information page — in full (D55).

    Shown in its entirety: no per-field switches, no policy table, and none
    planned. What the department does, its sub-units, who works there and what
    each role is measured on is what a staff member should be able to read, and
    so is `updated_at` — a last-updated date says nothing about what the
    department does, and `ui/src/screens/Overview.tsx` dereferences it with no
    guard.

    Redacted rather than returned raw, so that "every boundary runs the same
    rule" stays a property a reader can check rather than a list of the ones
    somebody remembered. The filter takes nothing away today; if a row of D55
    ever becomes switchable it becomes a row in `store.policy.FIELDS`, and this
    boundary already reads it.
    """
    cfg = request.app.state.cfg
    path = storage.overview_path(cfg.data_root, code)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    shown = Disclosure(request.app.state.db, user)
    return shown.redact_overview(storage.read_json(path), code)


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
                   user=Depends(requires("view", _dept_target))):
    """Processes in curated order (ARD §4.6), tombstones last — for an editor only.

    The ordering rule itself lives in `storage.ordered_processes` so the export
    and this endpoint cannot disagree about a department's sequence.

    **A tombstoned process is absent from a non-editor's body** (D17, D56). D17
    puts "Tombstoned processes" in the never-shown block — *excluded entirely*,
    switchable ❌ never — and D56's Whole-records row says how: *absent from the
    response body, filtered in the query. Never client-side.* §11 test 9 names
    "no tombstoned process id" among what the body scan must pin, and
    `test_body_scan.py` holds it in both directions.

    **Filtered here rather than in `storage.ordered_processes`.** A tombstone is
    a *retained* record, not a deletion, and the editor needs it: the process
    list draws it greyed with «باطل‌شده» and carries the only permanent-delete
    affordance there is, and the flow and summary screens show its banner and its
    `superseded_by` heirs. Filtering in storage would take the record away from
    the person whose job it is to clear it — and `ordered_processes` is also the
    one statement of "this department's sequence" that the export agrees with, so
    a caller-blind function is what keeps the two from disagreeing. The export is
    the other consumer, it never wants tombstones, and it already drops them
    itself (`exports.department_payload`). The rule therefore lives at each
    boundary that serves a *reader* — which is what D56 means by "filtered in the
    query".

    The `edit` question is asked about **this department**, never about the
    caller — `Disclosure.edits(code)`, which is `allows(…, "edit",
    f"dept:{code}")` with the lookups hoisted out of the loop. Same shape as the
    board's conflict count next door and for the same reason: a caller holding
    `dept:a` plus `dept:b/report:k` may edit a and not b, and "may this caller
    edit somewhere?" would hand them b's tombstones.

    **And each document is redacted** (`disclosure.py`), which is the half a
    whole-record filter cannot do: every process here is one this caller may
    have, and each may still name a process, a node and a department outside
    their scope through `parent` or a node's `subprocess`, and carry the
    unresolved proposals whose *count* the board withholds from this very
    caller. Same two rules, same module, as `GET /api/processes/{pid}` — the
    door and the window.
    """
    cfg = request.app.state.cfg
    shown = Disclosure(request.app.state.db, user)
    docs = storage.ordered_processes(cfg.data_root, code)
    if not shown.edits(code):
        docs = [d for d in docs if not d.get("tombstoned")]
    return [shown.redact(d, code) for d in docs]


@router.get("/{code}/next-id")
def next_id(code: str, request: Request,
            _=Depends(requires("edit", _dept_target))):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"next_id": engine.peek_process_id(cfg, code)}
