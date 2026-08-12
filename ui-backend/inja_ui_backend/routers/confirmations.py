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

import time

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import storage
from ..access import NOT_FOUND, requires
from ..auth import record
from ..fingerprint import fingerprint
from ..models import ConfirmBody
from ..store import confirmations

router = APIRouter(prefix="/api/confirmations")


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
    """`process` or `department`, from the shape of the id and nothing else."""
    return "process" if "-" in target else "department"


def _row(conn, target: str, doc: dict) -> dict:
    """One confirmable target as this router reports it.

    `fingerprint` is the document's **current** one — what a `POST` must echo —
    and `confirmed` is whether the stored mark equals it. Reporting both is what
    lets the client show the state and act on it without ever computing a
    fingerprint of its own.
    """
    now = fingerprint(doc)
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
    """The document `target` names, or the uniform 404 — and not a tombstoned
    one either.

    Safe to touch the filesystem here because the gate has already run: nobody
    outside `dept:{dept_of(target)}` reaches this line, so what is or is not on
    disk is only ever disclosed to someone already inside the department.

    **403, not 404, for a tombstone** (access.py's partition, D56). The 404
    above answers "not on disk at all" — indistinguishable from a typo, because
    a caller inside the department learns nothing from it they could not have
    guessed. A tombstoned process is neither: it *is* on disk and it *is* in
    scope, and `confirm` is never granted without `edit` (`seed._EDITOR`), so
    whoever reaches this line may already read this exact document from
    `GET /api/processes/{pid}` — `get_process` serves a tombstone to anyone who
    may edit here. What they may not do is vouch for it: `list_confirmations`
    excludes tombstones from the listing for the reason its own comment gives —
    confirming one would vouch for a document no reader can ever be served
    (D17). That is "the caller can see the target but may not do this to it",
    which is 403's definition and not 404's.
    """
    path = (storage.overview_path(cfg.data_root, target) if _kind(target) == "department"
            else storage.proc_path(cfg.data_root, target))
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    doc = storage.read_json(path)
    if doc.get("tombstoned"):
        raise HTTPException(status_code=403,
                            detail="این فرآیند حذف شده و دیگر قابل تأیید نیست")
    return doc


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
                     user=Depends(requires("confirm", _target_scope))):
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
    now = fingerprint(doc)
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
                                   by=user["username"], at=int(time.time()))
    record(request, "confirmation.set", actor=user["username"],
           session_id=request.state.session_id, target=target,
           detail={"fingerprint": now, "kind": _kind(target)})
    return _row(conn, target, doc)


@router.delete("/{target}")
def revoke_confirmation(target: str, request: Request,
                        user=Depends(requires("confirm", _target_scope))):
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
