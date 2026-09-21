"""The comment rules — the only place they live (addendum D62–D75).

Routing (D63): a Reader's comment climbs Reader supervisors one hop at a time,
then waits in the Admin pool, then reaches the Editors. The next hop is computed
live at every step from the tree as it stands; the comment stores only where it
waits now.

Every writer here expects its caller to hold a transaction on `cc`.
"""
from __future__ import annotations

import re
import sqlite3
from typing import Literal

from . import access, scopes
from .store import comments as S
from .store import users

Kind = Literal["editor", "admin", "reader"]
SYSTEM = "system"
_CMT = re.compile(r"^CMT-([1-9][0-9]*)$")


def cmt(cid: int) -> str:
    return f"CMT-{cid}"


def parse_cmt(s: str) -> int | None:
    m = _CMT.match(s)
    return int(m.group(1)) if m else None


def kind_of(app: sqlite3.Connection, user: sqlite3.Row) -> Kind:
    """D62. Derived from capabilities; a disabled user has none, so reads as reader."""
    caps = access.capabilities_of(app, user)
    if "edit" in caps:
        return "editor"
    if "manage_users" in caps:
        return "admin"
    return "reader"


def covers(app: sqlite3.Connection, user: sqlite3.Row, department: str) -> bool:
    return any(scopes.contains(s, f"dept:{department}")
               for s in access.scopes_of(app, user))


def admins_covering(app: sqlite3.Connection, department: str) -> list[sqlite3.Row]:
    rows = app.execute("SELECT * FROM users WHERE disabled_at IS NULL").fetchall()
    return [u for u in rows
            if kind_of(app, u) == "admin" and covers(app, u, department)]


def _pool(app, cc, c, *, now, reason: str | None = None) -> None:
    """Enter the Admin pool, or — nobody covering — deliver to the Editors (D63.6).

    `reason` (e.g. "cycle") is kept on the trail even on the deliver branch: a
    `pooled` event records it before the `delivered/no_admin` one, so D63.7's
    "chain broken — cycle" is never silently swallowed by "no Admin available".
    """
    if not admins_covering(app, c["department"]):
        if reason:
            S.event(cc, c["id"], kind="pooled", now=now, user_name=SYSTEM,
                    detail={"reason": reason})
        S.event(cc, c["id"], kind="delivered", now=now, user_name=SYSTEM,
                detail={"reason": "no_admin"})
        S.set_state(cc, c["id"], state="approved", now=now)
        return
    S.event(cc, c["id"], kind="pooled", now=now, user_name=SYSTEM,
            detail={"reason": reason} if reason else None)
    S.set_state(cc, c["id"], state="awaiting", stage="pool", now=now)


def advance(app: sqlite3.Connection, cc: sqlite3.Connection, cid: int, *,
            from_user_id: int, now: int) -> None:
    """Route onward from `from_user_id` (the author, or the hop that just approved)."""
    c = S.get(cc, cid)
    visited = {c["author_id"], *S.approvers_since_restart(cc, cid)}
    cur = users.by_id(app, from_user_id)
    while True:
        sup_id = cur["supervisor_id"] if cur is not None else None
        if sup_id is None:
            return _pool(app, cc, c, now=now)
        if sup_id in visited:
            return _pool(app, cc, c, now=now, reason="cycle")
        sup = users.by_id(app, sup_id)
        if sup["disabled_at"] is not None:
            S.event(cc, cid, kind="skipped", now=now, user_id=sup["id"],
                    user_name=sup["display_name"], detail={"reason": "disabled"})
            visited.add(sup["id"])
            cur = sup
            continue
        if kind_of(app, sup) != "reader":
            return _pool(app, cc, c, now=now)
        S.event(cc, cid, kind="assigned", now=now, user_id=sup["id"],
                user_name=sup["display_name"])
        S.set_state(cc, cid, state="awaiting", stage="reader", approver_id=sup["id"],
                    now=now)
        return


def submit(app: sqlite3.Connection, cc: sqlite3.Connection, cid: int, *, now: int) -> None:
    """Route a comment just written or just edited, from its author (D63.1, D63.5)."""
    c = S.get(cc, cid)
    author = users.by_id(app, c["author_id"])
    if kind_of(app, author) == "admin":
        S.set_state(cc, cid, state="approved", now=now)
        return
    advance(app, cc, cid, from_user_id=author["id"], now=now)


def reconcile(app: sqlite3.Connection, cc: sqlite3.Connection, *, now: int) -> int:
    """Move what is stuck (D63.6, D63.7): a named supervisor now disabled or no
    longer a Reader, or a pool nobody active covers. Returns how many moved.

    The two causes at the reader stage part ways here (D63.1): a *disabled*
    supervisor is a hop skipped in passing — the climb keeps going from their
    edge, so a healthy Reader above them can still be found. A supervisor who
    is simply no longer a Reader (promoted to Admin/Editor, still enabled) is
    the climb's own stopping rule — the comment goes straight to the pool, not
    past them to whoever they answer to, and no `skipped/disabled` event is
    written for a hop nobody skipped.
    """
    moved = 0
    for c in cc.execute("SELECT * FROM comments WHERE state = 'awaiting'").fetchall():
        if c["stage"] == "reader":
            who = users.by_id(app, c["approver_id"])
            if who is not None and who["disabled_at"] is None and kind_of(app, who) == "reader":
                continue
            if who is not None and who["disabled_at"] is not None:
                S.event(cc, c["id"], kind="skipped", now=now, user_id=who["id"],
                        user_name=who["display_name"], detail={"reason": "disabled"})
                advance(app, cc, c["id"], from_user_id=c["approver_id"], now=now)
            else:
                _pool(app, cc, c, now=now)
            moved += 1
        elif c["stage"] == "pool" and not admins_covering(app, c["department"]):
            _pool(app, cc, c, now=now)
            moved += 1
    return moved
