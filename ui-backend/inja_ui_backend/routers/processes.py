from __future__ import annotations

import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import engine, gitcommit, storage
from .. import save as save_mod
from ..access import NOT_FOUND, requires
from ..auth import require_session
from ..disclosure import Disclosure
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


#: A target no scope covers, `*` included — `contains` refuses anything the
#: grammar does not accept. Used where a request names a parent this module
#: cannot read a department out of, so the answer is the same 404 as any other
#: unreachable target rather than a 500 or, worse, an ungated write.
_UNREACHABLE = ""


def _parent_target(parent: dict) -> str:
    """`dept:{department}` for the process a new sub-process is hung under.

    Lexical, exactly like `_pid_target` and for exactly the same reason: this
    runs *before* the parent is loaded, so it cannot ask the filesystem whether
    the parent is there. Read the department out of the stored document and the
    status code is decided by existence again — which is the disclosure this
    second gate exists to close.

    A `parent` that does not carry a string `process` names nothing this can
    resolve, so it reaches nothing: fail closed, and let the uniform 404 answer.
    """
    pid = parent.get("process")
    if not isinstance(pid, str):
        return _UNREACHABLE
    return f"dept:{storage.dept_of(pid)}"


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

    **Two targets, because this route writes to two places.** With `parent` set,
    the handler loads that parent — from anywhere on disk — and mutates it, so a
    gate on `body.department` alone lets an Editor scoped to one department write
    a `subprocess` link into every other. It is also an existence oracle across
    the whole partition: the handler answers 400 for a real parent node of the
    wrong type, 409 for one that already links a sub-process, 201 for a good one
    and 404 for a parent that is not there, so a caller who may create anywhere
    at all could map every process id — and, via "no such node" versus "not an
    activity", every node id — in all nine departments. Gating the parent makes
    all four answers the one 404 for anyone outside it.

    This is a second target on a route the plan's mapping gives one, taken under
    the plan's own "where anything here disagrees, the spec wins": D56's
    existence rule is unambiguous and a one-target gate cannot keep it.
    """
    requires("edit", f"dept:{body.department}")(request, user)
    # `if body.parent:` and not `is not None:` — the condition has to be the
    # handler's own, or the two disagree about what is being gated. An empty
    # dict is falsy there, so nothing is loaded and nothing is written, and
    # refusing it here would 404 a caller inside their own department over a
    # malformed body their schema check is already going to answer.
    if body.parent:
        requires("edit", _parent_target(body.parent))(request, user)
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
                user=Depends(requires("view", _pid_target))):
    """One process — and **not** a tombstoned one, unless the caller may edit it.

    The department listing is the endpoint the finding named, but filtering only
    there would close the door and leave the window open: a non-editor who knows
    or guesses an id reads the whole retained document from here. D17 excludes
    tombstoned processes *entirely* with no switch, and D56 is "if a user may not
    see it, it does not appear in **any** response to them" — the two together
    make this the same clause, not a second one.

    **Nor an unconfirmed one** (D22). A process carrying no valid confirmation
    does not appear for any user without `edit`, and the same 404 answers it: the
    two are one clause, because "this record is not for you" must have one answer
    however it came to be true.

    **404, not 403** (D56's Existence row). For a non-editor the record is not a
    resource they may not act on; it is one they must not learn exists, so the
    answer is the same `NOT_FOUND` a missing file gives. A 403 here would let a
    reader enumerate which ids used to be processes.

    The check runs *after* `_load`, which is safe because the scope gate has
    already run in the dependency: nobody outside `dept:{dept_of(pid)}` reaches
    this line at all, so the file read discloses nothing and the extra 404 is
    only ever served to someone already inside the department.

    **And the document is redacted on the way out** (`disclosure.Disclosure`).
    Whether it is served and what is in it are two decisions, and the gate above
    only makes the first: the stored document may name a process, a node and a
    department this caller is 404'd out of, through `parent` or a node's
    `subprocess`, and it carries the department's unresolved proposals — which
    the board's count and `/api/pending` both withhold from a non-editor three
    lines away. See `disclosure.py` for both rules.
    """
    _, doc = _load(request.app.state.cfg, pid)
    shown = Disclosure(request.app.state.db, user)
    dept = storage.dept_of(pid)
    # Tombstoned (D17) or carrying no valid confirmation (D22) — one question,
    # and 404 for both: for a non-editor these are not resources they may not act
    # on, they are resources they must not learn exist. A 403 here would let a
    # reader enumerate which ids are processes nobody has confirmed yet.
    if not shown.may_serve(doc, dept, pid):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return shown.redact(doc, dept)


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
                         body: CreateProcessBody = Depends(_create_target),
                         user=Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if body.department not in {d["code"] for d in reg["departments"]}:
        # The uniform 404, not a 400 naming the condition in English. The two
        # sibling routes with the same registry guard (`put_order`, `next_id`)
        # already answer this way, and the reason is D56's: a caller holding
        # `dept:nosuchplace` — legal under the grammar, so the gate lets it by —
        # could otherwise tell "no such department" from "not yours" by the
        # status alone, which is the boundary the uniform code just hid.
        raise HTTPException(status_code=404, detail=NOT_FOUND)

    # Guard the parent link BEFORE allocating anything, mirroring merge's guards,
    # so a rejected request never leaves an orphan child file.
    ppath = pdoc = pnode = None
    if body.parent:
        ppath, pdoc = _load(cfg, body.parent["process"])          # 404 if parent missing
        # `.get("node")`, the same treatment `_parent_target` gives a missing
        # `process`: a `parent` without one names no node, so it matches none
        # and takes the uniform 404 below. `body.parent["node"]` raised a
        # KeyError here and answered 500 to a well-gated caller.
        pnode = next((n for n in pdoc["nodes"] if n["id"] == body.parent.get("node")),
                     None)
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
    # Redacted like every other body that carries a process document, though
    # this is the one route where it can change nothing: the caller named the
    # parent themselves and was gated on `edit` at its department, and every
    # seeded role holding `edit` holds `view`. Applied anyway, because "every
    # boundary that returns a process runs the same rule" is a property a reader
    # can check, and "the four we reasoned about" is not.
    return Disclosure(request.app.state.db, user).redact(child, body.department)


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
    # This sweep is a **dereference, deliberately exempt from the caller's
    # scope** — the one cross-scope write in this service, and a decided one
    # rather than an oversight.
    #
    # It walks all nine departments because a link to a deleted process may be
    # anywhere: another department's node pointing at it as a `subprocess`, or a
    # child of it sitting elsewhere. Refusing to clear the ones outside the
    # caller's scope would leave dangling links — a node claiming a sub-process
    # that no longer exists, a child claiming a parent that does not — which is
    # strictly worse than the write, and worse for the very departments the
    # scope is protecting.
    #
    # It discloses nothing, which is why it is allowed to be exempt: the
    # response is `{"deleted": pid}` whatever was swept, the count and the
    # departments touched never reach the caller, and the timing is the same
    # walk over every department on every delete. And the only documents it
    # touches are ones that *pointed at a process the caller was entitled to
    # delete* — the deletion itself was already gated on `dept:{dept_of(pid)}`
    # above, so nothing here is reachable without that permission first.
    #
    # Contrast `POST /api/processes`, whose parent link is gated: there the
    # caller chooses the out-of-scope document and learns from the answer
    # whether it exists. Here they choose nothing and learn nothing.
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


#: What a caller is told when the layout CLI refuses their document.
#:
#: A sentence, not a diagnosis, and deliberately the same one for every way the
#: CLI can fail. `EngineError.message` is that CLI's **stderr**, and the CLI has
#: no error handling of its own (`engine/layout/cli.py` ends at `write_json_atomic`
#: with nothing caught), so its stderr on any failure is a Python traceback: the
#: absolute path of the venv's `layout` script, of `engine/layout/cli.py` and of
#: `engine_common/__init__.py`, their line numbers, the exception class, and —
#: when the schema is what refused — the offending fragment of the document. Put
#: in `HTTPException(detail=…)` that is served to the caller, which is how the
#: server's filesystem layout came to be readable by any Editor.
#:
#: The detail is not discarded; it goes to the log, where the person who can act
#: on it is. This is the one boundary in this module where the engine's own words
#: cannot be forwarded, because they are the only ones that are a traceback
#: rather than a message: `validate_doc` and `resolve_pending` below reach
#: `engine_common.validate`'s own `ValueError`, whose text is a schema
#: complaint an Editor can act on — and those two are a separate question from
#: this one, filed rather than folded in here.
LAYOUT_FAILED = "چیدمان خودکار روی این نمودار انجام نشد؛ نمودار تغییری نکرد."


@router.post("/{pid}/relayout")
def relayout(pid: str, body: dict, request: Request,
             user=Depends(requires("edit", _pid_target))):
    cfg = request.app.state.cfg
    body["id"] = pid
    body["department"] = storage.dept_of(pid)
    # Realize temp-keyed new nodes so the layout CLI's schema check passes. Stateless:
    # nothing is written; these real ids ride back to the editor and are kept at Save.
    doc, _remap = save_mod.allocate_new_node_ids(cfg, body)
    try:
        laid_out = engine.run_layout(cfg, doc)
    except engine.EngineError as e:
        # `%r` on both, and truncated: the CLI's stderr embeds whatever fragment
        # of the caller's own document the schema objected to, so an unquoted
        # newline in a node label writes a log line of the caller's choosing.
        # Same reason `export_files._log_failed_login` quotes the username it
        # records. WARNING, not ERROR: a document the schema refuses is a client
        # mistake, and the operator wants it findable without it paging anyone.
        logger.warning("relayout failed for %r (exit %d): %r",
                       pid[:64], e.code, e.message[:2000])
        raise HTTPException(status_code=422, detail=LAYOUT_FAILED)
    # An echo of what the caller sent, so redaction can disclose nothing new
    # here — and it runs anyway, so that the one boundary nobody has to think
    # about is not the one that stops matching the others.
    return Disclosure(request.app.state.db, user).redact(laid_out,
                                                         storage.dept_of(pid))


@router.put("/{pid}")
async def save_process(pid: str, body: dict, request: Request,
                       user=Depends(requires("edit", _pid_target))):
    """Save, with the links this caller was never shown put back first.

    The editor's client round-trips what it loaded, and what it loaded had every
    cross-department `parent` and `subprocess` blanked (`disclosure.redact`). A
    plain save would therefore erase, on disk, links their author never knew
    existed — and erase them from the neighbouring department that the scope
    boundary exists to protect. `restore` is the other half of the redaction:
    a link that is withheld is a link that cannot be edited.

    The response is redacted like every other, so the restored link is invisible
    to the caller who just preserved it.
    """
    cfg = request.app.state.cfg
    shown = Disclosure(request.app.state.db, user)
    path = storage.proc_path(cfg.data_root, pid)
    async with storage.file_lock(path):
        on_disk = storage.read_json(path) if path.is_file() else None
        doc = shown.restore(save_mod.prepare_save(cfg, pid, body, on_disk), on_disk)
        try:
            engine.validate_doc(cfg, "process.schema.json", doc)
        except engine.EngineError as e:
            raise HTTPException(status_code=422, detail=e.message)
        storage.write_json_atomic(path, doc)
        gitcommit.commit(cfg, [path], pid, "save")
    return shown.redact(doc, storage.dept_of(pid))


@router.post("/{pid}/pending/{index}")
async def resolve(pid: str, index: int, body: PendingDecision, request: Request,
                  user=Depends(requires("edit", _pid_target))):
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
        # The whole stored document, so it carries the same cross-department
        # links `GET /api/processes/{pid}` does — an Editor of this department
        # is not thereby an Editor of the one its parent lives in.
        return Disclosure(request.app.state.db, user).redact(
            storage.read_json(path), storage.dept_of(pid))
