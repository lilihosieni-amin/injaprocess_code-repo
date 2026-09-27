"""The activity reports (spec D44; addendum D83). GET only — the record has no
write surface of any kind (D45)."""
from __future__ import annotations

import logging
import time
from typing import Callable, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from .. import comment_jobs, projection, storage
from ..access import NOT_FOUND, reachable_departments, requires
from ..auth import require_session
from ..disclosure import Disclosure
from ..store import activity

router = APIRouter(prefix="/api/activity")
log = logging.getLogger(__name__)


def _fresh(request: Request) -> None:
    """Drain the outbox and project git first, so a report never reads a stale
    record (D59 rule 4, D79). A failure is logged, not answered: a report one
    pass behind is better than none."""
    cfg = request.app.state.cfg
    try:
        comment_jobs.drain(cfg.app_db, cfg.comments_db)
    except Exception:
        log.exception("outbox drain before a report failed")
    try:
        projection.run(cfg)
    except Exception:
        log.exception("git projection before a report failed")


def star(request: Request, user=Depends(requires("view_audit", "*"))):
    """Access and governance events name no department, so only a `*` holder
    sees them (D44). A scoped holder is 404'd, as for any `*` surface (D56)."""
    _fresh(request)
    return user


def reach(request: Request, user=Depends(require_session)) -> set[str] | None:
    """The departments the caller's `view_audit` covers — `None` for every one.
    No `view_audit` anywhere: the surface does not exist for them (404)."""
    codes = reachable_departments(request.app.state.db, user, "view_audit")
    if codes is not None and not codes:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    _fresh(request)
    return codes


@router.get("/users")
def list_users(request: Request, _=Depends(star)):
    return activity.users(request.app.state.db)


@router.get("/users/{user_id}")
def one_user(request: Request, user_id: int = Path(..., ge=1, le=2**62),
             _=Depends(star),
             day: int | None = Query(None, ge=0, le=1_000_000),
             kind: Literal["access", "content", "governance"] | None = None,
             outcome: Literal["ok", "fail"] | None = None,
             offset: int = Query(0, ge=0, le=1_000_000)):
    conn = request.app.state.db
    found = activity.users(conn, user_id)
    if not found:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    body = activity.user_events(conn, found[0]["username"], day=day, kind=kind,
                                outcome=outcome, offset=offset)
    return {"user": found[0], **body,
            "sessions": activity.user_sessions(
                conn, user_id, ttl=request.app.state.cfg.session_ttl,
                now=int(time.time()))}


@router.get("/failures")
def list_failures(request: Request, _=Depends(star)):
    return activity.failures(request.app.state.db)


@router.get("/permissions")
def list_permissions(request: Request, _=Depends(star)):
    return activity.permissions(request.app.state.db)


def _servable(request: Request, user) -> Callable[[str | None], bool]:
    """The department report's own disclosure gate (review round 1): a
    `process.viewed` row naming a process this caller may not be told exists —
    unconfirmed or tombstoned, D22/D17 — must not surface its id, its name, or
    even its count through the activity record. `Disclosure.may_serve` is the
    same question `GET /api/processes/{pid}` answers for the document itself;
    memoised per pid so a report with many rows for one process reads its file
    once. A missing, unreadable or invalid document is never servable — the
    activity record's own dubious row must not raise, only be excluded."""
    cfg = request.app.state.cfg
    shown = Disclosure(request.app.state.db, user)
    cache: dict[str, bool] = {}

    def servable(pid: str | None) -> bool:
        if not pid:
            return False
        if pid not in cache:
            try:
                doc = storage.read_json(storage.proc_path(cfg.data_root, pid))
                cache[pid] = shown.may_serve(doc, storage.dept_of(pid), pid)
            except (OSError, ValueError):
                cache[pid] = False
        return cache[pid]

    return servable


@router.get("/departments")
def list_departments(request: Request, codes=Depends(reach),
                     user=Depends(require_session)):
    return activity.departments(request.app.state.db,
                                request.app.state.cfg.data_root, codes,
                                _servable(request, user))


@router.get("/comments")
def list_comments(request: Request, codes=Depends(reach)):
    return activity.comments(request.app.state.db, request.app.state.comments_db, codes)


@router.get("/summary")
def get_summary(request: Request, codes=Depends(reach),
                user=Depends(require_session)):
    return activity.summary(request.app.state.db, request.app.state.comments_db,
                            request.app.state.cfg.data_root, codes,
                            _servable(request, user))
