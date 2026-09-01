"""Vouching for content, and withdrawing it (spec D20, D61).

Two acts, one capability. `confirm` permits **setting** a confirmation and
**withdrawing** one, and both apply to either target: a process id or a
department code. The events are therefore `confirmation.set` and
`confirmation.revoked`, each naming its target — **not** `process.confirmed`,
which cannot describe confirming a department overview.

`confirmation.revoked` is deliberate withdrawal and is a different fact from
`confirmation.invalidated`, which is what happens when content changes and the
fingerprint stops matching (D60, and a later sub-project's to emit). Same visible
outcome; *"the editor decided this was wrong"* and *"a pipeline run touched it"*
are not the same event, and nothing here may write the second.

There is no `process.confirmed` field on any document and none may be added
(D20). The confirmation lives in `app.db` and is served by this router alone, so
no reader's body carries it — which is also why the listing is gated on `confirm`
rather than on `view`: everything a non-editor can see is confirmed by
construction, so the only person who needs to know what is *not* confirmed is the
person who can act on it.
"""
from __future__ import annotations

import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import facts_store, gitcommit, storage
from ..access import NOT_FOUND, requires, requires_every
from ..auth import record, require_session
from ..fingerprint import fact_fingerprint, fingerprint
from ..models import ConfirmBody
from ..store import confirmations

# The scope requirement of a fact entry, derived once for both gates — see
# `_fact_departments`. `routers/facts` imports nothing from here, so there is
# no cycle.
from .facts import _targets as fact_targets

router = APIRouter(prefix="/api/confirmations")

#: Anchored, not a `startswith` check — a department literally named `F`, or
#: a process id that merely begins with `F-`, must not collide with a real
#: 5-digit fact id (QF-24's global id grammar).
_FACT_ID_RE = re.compile(r"^F-[0-9]{5}$")


def _target_scope(request: Request) -> str:
    """`dept:{code}` for the target in the path — lexical, and one line for both
    target shapes.

    `storage.dept_of` is `pid.rsplit("-", 1)[0]`, so `dining-001` gives `dining`
    and `dining` — which carries no hyphen — gives itself. That is what lets the
    gate run before anything is loaded, exactly like `routers/processes`'
    `_pid_target`, and it is the whole of D56's existence rule on these two
    routes: read the department out of the stored document and an out-of-scope
    caller learns from the status whether their guess was real.

    A target the grammar refuses (`dining-001-x` → `dept:dining-001`) reaches
    nothing under `contains`, `*` holders included, so it is the same 404 as
    anything else out of scope rather than a 500.
    """
    return f"dept:{storage.dept_of(request.path_params['target'])}"


def _query_scope(request: Request) -> str:
    """`dept:{code}` for the listing, read straight out of the query string.

    Deliberately not a declared `department: str` parameter: FastAPI validates
    declared parameters alongside dependencies, so a missing one could answer 422
    — a different status for "you left it out" than for "not yours" — and the
    gate would no longer be the first thing that speaks. Read raw, an absent
    parameter is `dept:`, which the grammar refuses and which answers the uniform
    404 like every other unreachable target.
    """
    return f"dept:{request.query_params.get('department', '')}"


def _kind(target: str) -> str:
    """`process`, `department` or `fact`, from the shape of the id and nothing
    else. Tested against the anchored regex rather than a prefix check — see
    `_FACT_ID_RE`."""
    if _FACT_ID_RE.fullmatch(target):
        return "fact"
    return "process" if "-" in target else "department"


def _fingerprint_of(target: str, doc: dict) -> str:
    """The canonicaliser `target`'s kind is confirmed under: `fact_fingerprint`
    for an `F-` id (QF-24's top-level-only exclusion), `fingerprint` — D21's
    deep one — for a process or a department."""
    return fact_fingerprint(doc) if _kind(target) == "fact" else fingerprint(doc)


def _fact_departments(request: Request) -> list[str] | None:
    """The scope strings `requires_every` needs for the `F-` target in the
    path (QF-27): every department in the entry's `scope.departments`, or
    `["*"]` when it names none — a universal entry needs `confirm` at `*`.
    `None` when the id is not in the store, which `requires_every` turns into
    the same uniform 404 an out-of-scope target gets.

    The derivation is `routers/facts._targets` **called**, not restated. The
    two copies had already drifted: this one read `entry.get("scope", {})`,
    which answers `None.get` — a 500 — on a stored `"scope": null`, where the
    read gate's `isinstance(scope, dict)` answered the uniform 404. A gate that
    crashes has stopped refusing, and one function is the only way two gates
    stay one answer.
    """
    cfg = request.app.state.cfg
    entry = facts_store.load_entry(cfg.data_root, request.path_params["target"])
    if entry is None:
        return None
    return fact_targets(entry.get("scope"))


def _confirm_gate(request: Request, user=Depends(require_session)):
    """`confirm` on the path's `target` — `requires`'s single-string gate for
    a process or department id, `requires_every`'s AND-over-departments gate
    for an `F-` id (QF-27): a fact's required scope cannot be reduced to the
    one string `requires` compares against a held scope, since an entry may
    name several departments that all have to agree.
    """
    dep = (requires_every("confirm", _fact_departments)
           if _kind(request.path_params["target"]) == "fact"
           else requires("confirm", _target_scope))
    return dep(request, user)


def _row(conn, target: str, doc: dict) -> dict:
    """One confirmable target as this router reports it.

    `fingerprint` is the document's **current** one — what a `POST` must echo —
    and `confirmed` is whether the stored mark equals it. Reporting both is what
    lets the client show the state and act on it without ever computing a
    fingerprint of its own.
    """
    now = _fingerprint_of(target, doc)
    stored = confirmations.get(conn, target)
    ok = stored is not None and stored["fingerprint"] == now
    return {
        "target": target,
        "kind": _kind(target),
        "fingerprint": now,
        "confirmed": ok,
        "confirmed_by": stored["confirmed_by"] if ok else None,
        "confirmed_at": stored["confirmed_at"] if ok else None,
    }


def _load(cfg, target: str) -> dict:
    """The document `target` names, or the uniform 404.

    Safe to touch the filesystem here because the gate has already run: nobody
    outside `dept:{dept_of(target)}` reaches this line, so what is or is not on
    disk is only ever disclosed to someone already inside the department. For a
    fact the gate has already loaded the entry too (`_fact_departments`), so
    this branch's own 404 is unreachable in practice through these two routes —
    kept because `_load` is a general-purpose helper and "absent reads as the
    uniform 404" is a property it must hold on its own, not one borrowed from
    whichever caller happens to check first.

    Shared by `POST` and `DELETE` — but the tombstone/red-entry refusal is not,
    and does not belong here. See `set_confirmation` for why it is checked
    there alone.
    """
    kind = _kind(target)
    if kind == "fact":
        entry = facts_store.load_entry(cfg.data_root, target)
        if entry is None:
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        return entry
    path = (storage.overview_path(cfg.data_root, target) if kind == "department"
            else storage.proc_path(cfg.data_root, target))
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return storage.read_json(path)


@router.get("")
def list_confirmations(request: Request,
                       _=Depends(requires("confirm", _query_scope))):
    """Every confirmable target in one department, with its current fingerprint.

    The department itself first, then its **active** processes in curated order.
    Tombstones are absent: D17 excludes them entirely, so confirming one would
    vouch for a document no reader can ever be served.
    """
    cfg = request.app.state.cfg
    conn = request.app.state.db
    code = request.query_params.get("department", "")
    out = []
    overview = storage.overview_path(cfg.data_root, code)
    if overview.is_file():
        out.append(_row(conn, code, storage.read_json(overview)))
    for doc in storage.ordered_processes(cfg.data_root, code):
        if doc.get("tombstoned"):
            continue
        # `doc["id"]` here, and the **path** on POST/DELETE below. In a consistent
        # data-repo they are the same string — `storage.list_process_files` only
        # admits a stem matching `^{code}-\d{3}$`, and every writer names the file
        # after the id — so this is not two rules, it is one rule read two ways.
        #
        # It is `doc["id"]` deliberately rather than the filename: this listing is
        # the surface an Editor clicks to confirm, and the key it shows has to be
        # the key the department listing will later look the mark up under, which
        # is `disclosure.servable`'s `d["id"]`. Keying it on the stem instead would
        # let an Editor confirm a record that then stays invisible to readers, with
        # nothing to tell them why. `may_serve` — the by-id read — is lexical, so a
        # hand-planted copy whose stored `id` disagrees with its filename is served
        # by one of the two and not the other; that divergence is `disclosure`'s and
        # predates this router, and the write paths below stay lexical so nothing
        # here widens it.
        out.append(_row(conn, doc["id"], doc))
    return out


@router.post("/{target}")
def set_confirmation(target: str, body: ConfirmBody, request: Request,
                     user=Depends(_confirm_gate)):
    """Vouch for `target` at exactly the fingerprint the caller was shown.

    **409 when the fingerprints disagree**, and that is the point rather than a
    formality: a confirmation vouches for the bytes an Editor read, so a document
    that moved under them — another Editor's Save, a `merge` run — must not come
    away marked as reviewed by somebody who never saw it. 409 rather than 422
    because the body is well formed and the *state* is what conflicts, and rather
    than 404 because the caller is inside the department and learns nothing from
    being told so.
    """
    conn = request.app.state.db
    doc = _load(request.app.state.cfg, target)
    # **403, not 404, for a tombstone** (access.py's partition, D56). The 404 in
    # `_load` answers "not on disk at all" — indistinguishable from a typo,
    # because a caller inside the department learns nothing from it they could
    # not have guessed. A tombstoned process is neither: it *is* on disk and it
    # *is* in scope, and `confirm` is never granted without `edit`
    # (`seed._EDITOR`), so whoever reaches this line may already read this exact
    # document from `GET /api/processes/{pid}` — `get_process` serves a
    # tombstone to anyone who may edit here. What they may not do is vouch for
    # it: `list_confirmations` excludes tombstones from the listing for the
    # reason its own comment gives — confirming one would vouch for a document
    # no reader can ever be served (D17). That is "the caller can see the
    # target but may not do this to it", which is 403's definition and not
    # 404's.
    #
    # Checked here and not in `_load`, which `revoke_confirmation` shares:
    # `tombstoned` is in `fingerprint.EXCLUDED`, so retiring a process never
    # moves its fingerprint, and a confirmation made before the retirement
    # survives underneath it, inert only while the record gate withholds the
    # document from non-editors. Restore that document and the stale mark is
    # visible again on a fingerprint nobody re-affirmed, with withdrawal the
    # only thing that can clear it first. A blanket refusal in `_load` would
    # take that tool away from exactly the records that need it.
    #
    # A fact takes the equivalent refusal on its `status` instead of on
    # `tombstoned` — a red entry (`disputed` or `unknown`, QF-6) is not "gone",
    # it is "not yet reconciled", and 409 rather than 403 says that: the state
    # conflicts with what confirming means, the same reason a stale fingerprint
    # is 409 and not something else. Checked before the fingerprint comparison
    # so a caller cannot dodge it by echoing whatever print they were shown —
    # red wins over green regardless of which bytes were read (QF-25).
    if _kind(target) == "fact":
        if doc.get("status") in ("disputed", "unknown"):
            raise HTTPException(
                status_code=409,
                detail="دادهٔ قرمز قابل تأیید نیست — اول تعارض یا بی‌پاسخی را رفع کنید")
    elif doc.get("tombstoned"):
        raise HTTPException(status_code=403,
                            detail="این فرآیند حذف شده و دیگر قابل تأیید نیست")
    now = _fingerprint_of(target, doc)
    if body.fingerprint != now:
        raise HTTPException(
            status_code=409,
            detail="این محتوا از زمانی که آن را دیدید تغییر کرده است؛"
                   " دوباره بررسی و تأیید کنید.")
    # `now` and not `body.fingerprint`, though the branch above has just proved
    # them equal. What is stored must be the hash of the document **as read from
    # disk** — the two strings only ever differ in the case the check exists for,
    # so storing the caller's copy is a mutant no test can catch *while the check
    # is there* and a silent forgery the moment it is loosened. The source of the
    # stored value is not something to leave depending on a guard three lines up.
    confirmations.set_confirmation(conn, target=target, fingerprint=now,
                                   by=user["username"], at=int(time.time()),
                                   data_repo_commit=gitcommit.head(request.app.state.cfg))
    record(request, "confirmation.set", actor=user["username"],
           session_id=request.state.session_id, target=target,
           detail={"fingerprint": now, "kind": _kind(target)})
    return _row(conn, target, doc)


@router.delete("/{target}")
def revoke_confirmation(target: str, request: Request,
                        user=Depends(_confirm_gate)):
    """Withdraw the mark (D61). Deliberate, and recorded as such.

    No fingerprint in the body: withdrawing says *"whatever is there is wrong"*,
    which does not depend on which version it was. Requiring one would refuse the
    withdrawal precisely when the document has drifted, which is when it is most
    likely to be needed.

    The event is written **only when something was withdrawn**, because a
    decision nobody made must not appear in the record. The response is the same
    200 either way: whether a mark was there is not something the status code has
    to say, and saying it would make this endpoint an existence probe for the
    confirmation state of every id in the department.
    """
    conn = request.app.state.db
    doc = _load(request.app.state.cfg, target)
    if confirmations.revoke(conn, target):
        record(request, "confirmation.revoked", actor=user["username"],
               session_id=request.state.session_id, target=target,
               detail={"kind": _kind(target)})
    return _row(conn, target, doc)
