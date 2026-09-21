"""Comments (spec §7 as amended by the 2026-09-21 addendum).

Rules live in `comment_rules`; this module only speaks HTTP. Reads use the
shared `app.state.comments_db`; writes open their own comments.db connection
under BEGIN IMMEDIATE (see `db.connect`: no transaction on a shared connection).
"""
from __future__ import annotations

import json
import time
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import comment_rules as R
from .. import db, ids, storage
from ..access import FORBIDDEN, NOT_FOUND, allows, log_out_of_scope
from ..auth import record, require_session
from ..disclosure import Disclosure
from ..models import AddressBody, CommentBody, NoteBody, ReasonBody, TextBody
from ..store import comments as S
from ..store import users
from .departments import PROCESS_ID_RE

router = APIRouter(prefix="/api/comments")
LIMIT = 2000
TOO_LONG = "متن بیشتر از ۲۰۰۰ نویسه است"
EMPTY = "متن خالی است"
PAGE = 10
# The engine CLI's actor name is never shown raw (provisional wording, for lili).
_SHOWN = {"agent:control-bot": "دستیار تلگرام"}


def _who(name: str | None) -> str | None:
    return _SHOWN.get(name, name)


def clean(text: str | None) -> str:
    """D71: trimmed, non-empty, at most 2,000 characters."""
    t = (text or "").strip()
    if not t:
        raise HTTPException(status_code=422, detail=EMPTY)
    if len(t) > LIMIT:
        raise HTTPException(status_code=422, detail=TOO_LONG)
    return t


@contextmanager
def write(request: Request):
    cc = db.connect(request.app.state.cfg.comments_db)
    try:
        cc.execute("BEGIN IMMEDIATE")
        yield cc
        cc.execute("COMMIT")
    except BaseException:
        if cc.in_transaction:
            cc.execute("ROLLBACK")
        raise
    finally:
        cc.close()


def _iso(t: int) -> str:
    return datetime.fromtimestamp(t, timezone.utc).isoformat().replace("+00:00", "Z")


def _registry_name(cfg, code: str) -> str | None:
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    return next((d["name"] for d in reg["departments"] if d["code"] == code), None)


def _orphan(cfg, c, docs: dict) -> bool:
    """The anchor no longer stands: its process is gone or tombstoned, or its
    node removed (D31: surfaced, never repointed). `docs` caches one read per
    process for a listing."""
    pid = c["process_id"]
    if pid is None:
        return False
    if pid not in docs:
        path = storage.proc_path(cfg.data_root, pid)
        docs[pid] = storage.read_json(path) if path.is_file() else None
    doc = docs[pid]
    if doc is None or doc.get("tombstoned"):
        return True
    return c["anchor_kind"] == "node" and not any(
        n["id"] == c["anchor_id"] and not n.get("removed") for n in doc.get("nodes", []))


def _waiting(app, c) -> dict | None:
    if c["state"] == "approved":
        return {"kind": "editors"}
    if c["state"] != "awaiting":
        return None
    if c["stage"] == "pool":
        return {"kind": "pool"}
    return {"kind": "person", "name": users.by_id(app, c["approver_id"])["display_name"]}


def present(request: Request, viewer, c, *, trail: bool = False,
            docs: dict | None = None) -> dict:
    app, cc, cfg = request.app.state.db, request.app.state.comments_db, request.app.state.cfg
    snap = json.loads(c["snapshot"])
    evs = S.events(cc, c["id"])
    detail = [json.loads(e["detail"] or "{}") for e in evs]
    notes = [{"by": e["user_name"], "text": e["note"], "at": _iso(e["at"])}
             for e in evs if e["kind"] == "approved" and e["note"]]
    rejected = next((e for e in reversed(evs) if e["kind"] == "rejected"), None)
    addressed = next((e for e in reversed(evs) if e["kind"] == "addressed"), None)
    out = {
        "id": R.cmt(c["id"]),
        "anchor": {"kind": c["anchor_kind"], "id": c["anchor_id"],
                   "processId": c["process_id"], "department": c["department"],
                   "departmentName": snap.get("department_name"),
                   "processName": snap.get("process_name"),
                   "nodeLabel": snap.get("node_label"),
                   "orphan": _orphan(cfg, c, {} if docs is None else docs)},
        "text": c["text"], "state": c["state"], "stage": c["stage"],
        "waitingWith": _waiting(app, c),
        "author": {"name": c["author_name"], "isMe": c["author_id"] == viewer["id"],
                   "role": next((d.get("role") for e, d in zip(evs, detail)
                                 if e["kind"] == "submitted"), None)},
        "createdAt": _iso(c["created_at"]), "updatedAt": _iso(c["updated_at"]),
        "approvals": len(S.approvers_since_restart(cc, c["id"])),
        "notes": notes,
        "rejectReason": rejected["note"] if rejected and c["state"] == "rejected" else None,
        "addressed": ({"by": _who(addressed["user_name"]), "at": _iso(addressed["at"]),
                       "note": addressed["note"],
                       "commit": json.loads(addressed["detail"] or "{}").get("commit")}
                      if addressed else None),
        "actions": R.actions(app, cc, viewer, c),
    }
    if trail:
        out["trail"] = [{"kind": e["kind"], "name": _who(e["user_name"]), "note": e["note"],
                         "reason": d.get("reason"), "commit": d.get("commit"),
                         "role": d.get("role"),
                         "at": _iso(e["at"])} for e, d in zip(evs, detail)]
    return out


def _gate(request: Request, user, dept: str) -> None:
    """Scope before capability (access.requires): 404 out of scope, 403 +
    access.denied when visible but not allowed. D74 refuses an Editor author."""
    app = request.app.state.db
    target = f"dept:{dept}"
    if not allows(app, user, "view", target):
        log_out_of_scope(request, user, target)
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if not allows(app, user, "comment", target) or R.kind_of(app, user) == "editor":
        record(request, "access.denied", actor=user["username"],
               session_id=getattr(request.state, "session_id", None), target=target,
               outcome="denied", detail={"capability": "comment"})
        raise HTTPException(status_code=403, detail=FORBIDDEN)


def _anchor(request: Request, user, body: CommentBody) -> tuple[str | None, str, dict]:
    """(process_id, department, D31 snapshot) for an anchor the caller may see, or 404."""
    cfg, app = request.app.state.cfg, request.app.state.db
    if body.anchorKind == "department":
        dept = body.anchorId
        name = _registry_name(cfg, dept)
        if name is None:
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        _gate(request, user, dept)
        return None, dept, {"department_name": name}
    if body.anchorKind == "node":
        if not (ids.is_real_activity_id(body.anchorId) or ids.is_real_junction_id(body.anchorId)):
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        pid = body.anchorId.rsplit("-", 1)[0]
    else:
        pid = body.anchorId
        # the id becomes a path below: nothing but a real process id gets there
        if not PROCESS_ID_RE.fullmatch(pid):
            raise HTTPException(status_code=404, detail=NOT_FOUND)
    dept = storage.dept_of(pid)
    _gate(request, user, dept)
    path = storage.proc_path(cfg.data_root, pid)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    doc = storage.read_json(path)
    if not Disclosure(app, user).may_serve(doc, dept, pid):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    snap = {"department_name": _registry_name(cfg, dept), "process_name": doc.get("name")}
    if body.anchorKind == "node":
        node = next((n for n in doc.get("nodes", [])
                     if n["id"] == body.anchorId and not n.get("removed")), None)
        if node is None:
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        snap["node_label"] = node.get("label")
    return pid, dept, snap


@router.post("", status_code=201)
def create_comment(body: CommentBody, request: Request, user=Depends(require_session)):
    text = clean(body.text)
    pid, dept, snap = _anchor(request, user, body)
    now = int(time.time())
    with write(request) as cc:
        cid = S.insert(cc, author=user, anchor_kind=body.anchorKind, anchor_id=body.anchorId,
                       process_id=pid, department=dept, snapshot=snap, text=text, now=now)
        S.event(cc, cid, kind="submitted", now=now, user_id=user["id"],
                user_name=user["display_name"], role=R.kind_of(request.app.state.db, user))
        R.submit(request.app.state.db, cc, cid, now=now)
    record(request, "comment.created", actor=user["username"],
           session_id=getattr(request.state, "session_id", None), target=R.cmt(cid),
           detail={"anchor": body.anchorKind, "department": dept})
    return present(request, user, S.get(request.app.state.comments_db, cid), trail=True)


def _visible(request: Request, user, extra: str, params: list, order: str,
             limit: int | None = None, offset: int = 0):
    """D66 in SQL: only what the viewer may see, whatever the surface."""
    where, wp = R.visible_sql(request.app.state.db, user)
    sql = f"SELECT c.* FROM comments c WHERE {where} AND {extra} ORDER BY {order}"
    if limit is not None:
        sql += f" LIMIT {int(limit)} OFFSET {int(offset)}"
    return request.app.state.comments_db.execute(sql, [*wp, *params]).fetchall()


# open before closed, newest first (the design's inbox order)
_INBOX_ORDER = ("CASE WHEN c.state IN ('addressed','rejected','withdrawn') THEN 1 ELSE 0 END,"
                " c.updated_at DESC, c.id DESC")


def _page(request: Request, user, rows) -> list[dict]:
    docs: dict = {}
    return [present(request, user, c, docs=docs) for c in rows]


@router.get("")
def list_comments(request: Request, process: str | None = None,
                  department: str | None = None, user=Depends(require_session)):
    if (process is None) == (department is None):
        raise HTTPException(status_code=422, detail="process یا department")
    if process is not None:
        rows = _visible(request, user, "c.process_id = ?", [process], "c.id")
    else:
        rows = _visible(request, user, "c.anchor_kind = 'department' AND c.department = ?",
                        [department], "c.id")
    return _page(request, user, rows)


@router.get("/inbox")
def inbox(request: Request, tab: str = "waiting", page: int = 1,
          user=Depends(require_session)):
    app, cc = request.app.state.db, request.app.state.comments_db
    if tab == "own":
        rows = _visible(request, user, "c.author_id = ?", [user["id"]], _INBOX_ORDER)
    elif tab == "waiting":
        rows = [c for c in _visible(request, user, "c.state IN ('awaiting','approved')", [],
                                    _INBOX_ORDER)
                if (a := R.actions(app, cc, user, c))["approve"] or a["address"]]
    elif tab == "all":
        # D75: the only paged tab, ten per page
        where, wp = R.visible_sql(app, user)
        total = cc.execute(f"SELECT COUNT(*) FROM comments c WHERE {where}", wp).fetchone()[0]
        pages = max(1, -(-total // PAGE))
        page = min(max(1, page), pages)
        rows = _visible(request, user, "1", [], _INBOX_ORDER, limit=PAGE,
                        offset=(page - 1) * PAGE)
        return {"items": _page(request, user, rows), "total": total, "page": page,
                "pages": pages}
    else:
        raise HTTPException(status_code=422, detail="tab")
    return {"items": _page(request, user, rows), "total": len(rows), "page": 1, "pages": 1}


def load_visible(request: Request, user, ref: str):
    """The comment `ref` names, or 404 — for a bad id, a missing comment and an
    invisible one alike (D66, D56)."""
    cid = R.parse_cmt(ref)
    c = S.get(request.app.state.comments_db, cid) if cid else None
    if c is None or not R.can_see(request.app.state.db, request.app.state.comments_db, user, c):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return c


@router.get("/{ref}")
def get_comment(ref: str, request: Request, user=Depends(require_session)):
    return present(request, user, load_visible(request, user, ref), trail=True)


# ---- the actions (D63, D69, D72, D73) ----

def _sid(request: Request):
    return getattr(request.state, "session_id", None)


def _act(request: Request, user, ref: str, action: str, fn) -> dict:
    """404 unless visible; then, under the write lock, re-read the comment and
    check `action` on that locked state — so two racing Admins cannot both
    approve — and run `fn(cc, c, now)`. Visible but not allowed: 403 + access.denied."""
    cid = load_visible(request, user, ref)["id"]
    now = int(time.time())
    with write(request) as cc:
        c = S.get(cc, cid)
        allowed = R.actions(request.app.state.db, cc, user, c)[action]
        if allowed:
            fn(cc, c, now)
    if not allowed:
        record(request, "access.denied", actor=user["username"], session_id=_sid(request),
               target=R.cmt(cid), outcome="denied", detail={"capability": "comment"})
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return present(request, user, S.get(request.app.state.comments_db, cid), trail=True)


def _audit(request: Request, user, action: str, out: dict) -> None:
    record(request, action, actor=user["username"], session_id=_sid(request),
           target=out["id"])


def _note(note: str | None) -> str | None:
    """An optional note: blank is no note; otherwise D71's cap."""
    return clean(note) if note and note.strip() else None


@router.post("/{ref}/approve")
def approve(ref: str, body: NoteBody, request: Request, user=Depends(require_session)):
    note = _note(body.note)
    app = request.app.state.db

    def go(cc, c, now):
        S.event(cc, c["id"], kind="approved", now=now, user_id=user["id"],
                user_name=user["display_name"], role=R.kind_of(request.app.state.db, user),
                note=note)
        if c["stage"] == "pool":
            S.set_state(cc, c["id"], state="approved", now=now)
        else:
            R.advance(app, cc, c["id"], from_user_id=user["id"], now=now)

    out = _act(request, user, ref, "approve", go)
    _audit(request, user, "comment.approved", out)
    if note:
        _audit(request, user, "comment.noted", out)
    return out


@router.post("/{ref}/reject")
def reject(ref: str, body: ReasonBody, request: Request, user=Depends(require_session)):
    reason = clean(body.reason)

    def go(cc, c, now):
        S.event(cc, c["id"], kind="rejected", now=now, user_id=user["id"],
                user_name=user["display_name"], role=R.kind_of(request.app.state.db, user),
                note=reason)
        S.set_state(cc, c["id"], state="rejected", now=now)

    out = _act(request, user, ref, "reject", go)
    _audit(request, user, "comment.rejected", out)
    return out


@router.put("/{ref}")
def edit(ref: str, body: TextBody, request: Request, user=Depends(require_session)):
    text = clean(body.text)
    app = request.app.state.db

    def go(cc, c, now):
        S.set_text(cc, c["id"], text=text, now=now)
        S.event(cc, c["id"], kind="edited", now=now, user_id=user["id"],
                user_name=user["display_name"], role=R.kind_of(request.app.state.db, user))
        R.submit(app, cc, c["id"], now=now)

    out = _act(request, user, ref, "edit", go)
    _audit(request, user, "comment.edited", out)
    return out


@router.post("/{ref}/withdraw")
def withdraw(ref: str, request: Request, user=Depends(require_session)):
    def go(cc, c, now):
        S.event(cc, c["id"], kind="withdrawn", now=now, user_id=user["id"],
                user_name=user["display_name"], role=R.kind_of(request.app.state.db, user))
        S.set_state(cc, c["id"], state="withdrawn", now=now)

    out = _act(request, user, ref, "withdraw", go)
    _audit(request, user, "comment.withdrawn", out)
    return out


@router.post("/{ref}/address")
def address(ref: str, body: AddressBody, request: Request, user=Depends(require_session)):
    note = _note(body.note)

    def go(cc, c, now):
        S.event(cc, c["id"], kind="addressed", now=now, user_id=user["id"],
                user_name=user["display_name"], role=R.kind_of(request.app.state.db, user),
                note=note)
        S.set_state(cc, c["id"], state="addressed", now=now)

    out = _act(request, user, ref, "address", go)
    _audit(request, user, "comment.addressed", out)
    return out
