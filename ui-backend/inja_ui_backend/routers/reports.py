"""Every report route: the registry, the read, the build and the download.

One module because they are one feature and they share three things that must
never drift — the scope target (`_report_target`), the cache key
(`_current_key`) and the registry itself. The download has to land on exactly
the file the build wrote, and the two computing that name separately is how a
download 404s for a department nothing is wrong with.
"""
from __future__ import annotations

import dataclasses
import logging

from fastapi import APIRouter, Depends

from .. import exports
from ..auth import require_session

logger = logging.getLogger(__name__)

#: Its own router because its path is not under `/api/departments`. Registered
#: beside the other one and, like it, **before** the SPA catch-all (D24 — route
#: ordering is load-bearing; a mount at "/" swallows everything after it).
registry_router = APIRouter(prefix="/api/reports")

router = APIRouter(prefix="/api/departments")


@registry_router.get("")
def list_reports(_user=Depends(require_session)):
    """The registry, for the dialog that lists reports and the scope picker.

    Behind the session and gated on nothing else: it is the catalogue of kinds,
    not of anybody's departments, and it names no content. What a given caller
    may *do* with a kind is decided per department, at the routes below, from
    the session row — never from this list.
    """
    return {"reports": [dataclasses.asdict(r) for r in exports.REGISTRY]}
