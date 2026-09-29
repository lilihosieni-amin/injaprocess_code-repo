"""Queries behind the activity reports (spec D44; addendum D83).

Read-only. Nothing here returns a raw session id (a live one is a bearer
credential — `audit.session_tag` instead) or a comment's text (D44).
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from .. import comment_rules, storage
from ..scopes import dept_of as scope_dept
from . import audit

#: A process id, exactly `routers/departments.PROCESS_ID_RE` — duplicated
#: rather than imported to keep this module free of `routers` (it is imported
#: the other way already, and a cycle here would be a new one, not this one).
_PROCESS_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")
#: A fact id, exactly `routers/facts._FACT_ID_RE` — duplicated for the same
#: reason; `routers/activity._servable` reads it from here.
FACT_ID_RE = re.compile(r"^F-[0-9]{5}$")

#: D42 as amended by D76 — every event the record holds, by the one-user page's
#: three kinds. `tests/test_activity_catalogue.py` pins it against the writers.
CATALOGUE: dict[str, str] = {
    "login.success": "access", "login.failure": "access", "login.throttled": "access",
    "logout": "access", "session.revoked": "access", "password.changed": "access",
    "access.denied": "access",
    "department.viewed": "content", "process.viewed": "content",
    "report.downloaded": "content", "process.edited": "content",
    "department.edited": "content", "fact.edited": "content",
    "confirmation.set": "content", "confirmation.revoked": "content",
    "confirmation.invalidated": "content",
    "user.created": "governance", "user.modified": "governance",
    "user.disabled": "governance", "user.enabled": "governance",
    "password.set_by_admin": "governance", "role.assigned": "governance",
    "scope.granted": "governance", "scope.revoked": "governance",
    "supervisor.changed": "governance", "supervisor_flag.changed": "governance",
    "visibility.policy.changed": "governance",
    "comment.created": "governance", "comment.edited": "governance",
    "comment.withdrawn": "governance", "comment.restored": "governance",
    "comment.approved": "governance",
    "comment.noted": "governance", "comment.rejected": "governance",
    "comment.addressed": "governance", "projection.discontinuity": "governance",
}
#: The permission-history tab: every change to who may do what. `user.modified`
#: is left out — its permission fields each have their own event below, and its
#: remaining field (the display name) is not a permission.
PERMISSIONS = ("user.created", "role.assigned", "scope.granted", "scope.revoked",
               "supervisor.changed", "supervisor_flag.changed", "user.disabled",
               "user.enabled", "password.set_by_admin", "visibility.policy.changed")
#: Iran's fixed UTC+03:30. ponytail: no DST since 2022; a zone change means
#: zoneinfo here and in ui/src/lib/format.ts.
TEHRAN_OFFSET_S = 12600
PAGE = 6
_SIGN_IN_FAILURES = ("login.failure", "login.throttled")


def _in(names) -> str:
    return ",".join("?" * len(names))


def users(conn: sqlite3.Connection, user_id: int | None = None) -> list[dict]:
    # ponytail: `logins`/`failures` are keyed on the CURRENT username, same
    # ceiling as `user_events` below (see its docstring) — a number change
    # zeroes both here too.
    where = "WHERE u.id = ?" if user_id is not None else ""
    rows = conn.execute(f"""
        SELECT u.id, u.username, u.display_name, r.name AS role, u.disabled_at,
          (SELECT COUNT(*) FROM audit_events a
            WHERE a.actor = u.username AND a.action = 'login.success') AS logins,
          (SELECT COUNT(*) FROM audit_events a
            WHERE a.actor = u.username
              AND a.action IN ('login.failure', 'login.throttled')) AS failures,
          (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
          (SELECT COALESCE(SUM(i.ended_at - i.started_at), 0) FROM activity_intervals i
            JOIN sessions s ON s.id = i.session_id WHERE s.user_id = u.id) AS active,
          (SELECT MAX(s.last_seen) FROM sessions s WHERE s.user_id = u.id) AS last_seen
        FROM users u JOIN roles r ON r.id = u.role_id {where}
        ORDER BY u.display_name""", (() if user_id is None else (user_id,))).fetchall()
    scopes: dict[int, list[str]] = {}
    for s in conn.execute("SELECT user_id, scope FROM user_scopes ORDER BY scope"):
        scopes.setdefault(s["user_id"], []).append(s["scope"])
    return [{"id": r["id"], "username": r["username"], "displayName": r["display_name"],
             "role": r["role"], "scopes": scopes.get(r["id"], []),
             "disabled": r["disabled_at"] is not None, "logins": r["logins"],
             "failures": r["failures"], "sessions": r["sessions"],
             "activeSeconds": r["active"], "lastSeen": r["last_seen"]} for r in rows]


def user_events(conn: sqlite3.Connection, username: str, *, day: int | None,
                kind: str | None, outcome: str | None, offset: int,
                servable) -> dict:
    # ponytail: keyed on the CURRENT username (`actor = username`), not the
    # user id — `PATCH /api/users/{id}` can change a username (D57's phone
    # number). After a number change this page shows only events recorded
    # under the number the account holds *now*; logins/failures restart from
    # zero (sessions/active time/last seen are keyed by user id in `users()`
    # above and keep their history across the change). A number later handed
    # to a different account would show that new holder this history's old
    # rows. Upgrade path: follow former usernames too, each with the time
    # window it held them, read off `user.modified`'s `detail.changed.username`
    # rows in the governance record.
    #
    # `servable(pid)` is the caller's own disclosure gate (D56, review round
    # 2): this timeline is an Admin's read of somebody else's history, and an
    # Editor's `process.viewed` row for a process D22 withholds from that
    # Admin must not hand its id over here either, even though the row's
    # *action* and *kind* still stand — the event happened, only the process
    # it names is not this caller's to be told about. A fact id is gated the
    # same way (final review I3: an Editor's `fact.edited` row for an
    # unconfirmed entry). Every other target (a department code, a `CMT-n`,
    # a `dept:x/report:k`) passes through unchanged; `_PROCESS_ID_RE` and
    # `FACT_ID_RE` are what tell them apart.
    where, args = ["actor = ?"], [username]
    if day is not None:
        start = day * 86400 - TEHRAN_OFFSET_S
        where.append("at >= ? AND at < ?")
        args += [start, start + 86400]
    if kind is not None:
        names = [a for a, k in CATALOGUE.items() if k == kind]
        where.append(f"action IN ({_in(names)})")
        args += names
    if outcome == "ok":
        where.append("outcome = 'ok'")
    elif outcome == "fail":
        where.append("outcome != 'ok'")
    sql = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM audit_events WHERE {sql}",
                         args).fetchone()[0]
    rows = conn.execute(
        f"SELECT id, at, action, target, ip, user_agent, outcome, session_id"
        f" FROM audit_events WHERE {sql} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?",
        [*args, PAGE, offset]).fetchall()
    days = {str(d): n for d, n in conn.execute(
        "SELECT (at + ?) / 86400, COUNT(*) FROM audit_events WHERE actor = ? GROUP BY 1",
        (TEHRAN_OFFSET_S, username))}

    def visible_target(t: str | None) -> str | None:
        gated = t and (_PROCESS_ID_RE.match(t) or FACT_ID_RE.match(t))
        return None if gated and not servable(t) else t

    return {"total": total, "days": days, "rows": [
        {"id": r["id"], "at": r["at"], "action": r["action"],
         "kind": CATALOGUE.get(r["action"], "governance"),
         "target": visible_target(r["target"]), "ip": r["ip"],
         "userAgent": r["user_agent"], "outcome": r["outcome"],
         "session": audit.session_tag(r["session_id"])} for r in rows]}


def user_sessions(conn: sqlite3.Connection, user_id: int, *, ttl: int,
                  now: int) -> list[dict]:
    """The one-user page's «نشست‌های این کاربر» card, newest first. The ending
    of an unrevoked session is derived from its age (D42: no `session.expired`)."""
    rows = conn.execute("""
        SELECT s.id, s.issued_at, s.last_seen, s.ip, s.user_agent, s.revoked_at,
          (SELECT COALESCE(SUM(i.ended_at - i.started_at), 0)
             FROM activity_intervals i WHERE i.session_id = s.id) AS active
        FROM sessions s WHERE s.user_id = ? ORDER BY s.issued_at DESC""",
        (user_id,)).fetchall()
    return [{"session": audit.session_tag(r["id"]), "issuedAt": r["issued_at"],
             "lastSeen": r["last_seen"], "ip": r["ip"], "userAgent": r["user_agent"],
             "activeSeconds": r["active"],
             "state": ("revoked" if r["revoked_at"] is not None
                       else "expired" if now - r["issued_at"] >= ttl else "active")}
            for r in rows]


def failures(conn: sqlite3.Connection) -> list[dict]:
    """Sign-in failures by attempted username and address — throttled attempts
    included, since hammering a locked account is exactly the signal (D44)."""
    return [{"username": r["actor"], "ip": r["ip"], "attempts": r["n"],
             "first": r["first"], "last": r["last"]}
            for r in conn.execute(
                f"SELECT actor, ip, COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last"
                f" FROM audit_events WHERE action IN ({_in(_SIGN_IN_FAILURES)})"
                f" GROUP BY actor, ip ORDER BY last DESC", _SIGN_IN_FAILURES)]


def permissions(conn: sqlite3.Connection) -> list[dict]:
    names = {r["username"]: r["display_name"]
             for r in conn.execute("SELECT username, display_name FROM users")}
    by_id = {r["id"]: r["display_name"]
             for r in conn.execute("SELECT id, display_name FROM users")}
    roles = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM roles")}
    out = []
    for r in conn.execute(
            f"SELECT at, actor, action, target, detail FROM audit_events"
            f" WHERE action IN ({_in(PERMISSIONS)}) ORDER BY at DESC, id DESC",
            PERMISSIONS):
        d = json.loads(r["detail"]) if r["detail"] else {}
        a = r["action"]
        before, after = d.get("before"), d.get("after")
        if a == "role.assigned":
            before, after = roles.get(before, before), roles.get(after, after)
        elif a == "supervisor.changed":
            before, after = by_id.get(before, before), by_id.get(after, after)
        elif a == "scope.granted":
            before, after = None, d.get("scope")
        elif a == "scope.revoked":
            before, after = d.get("scope"), None
        elif a == "user.created":
            before, after = None, d.get("role")
        elif a in ("user.disabled", "user.enabled"):
            before, after = a == "user.enabled", a == "user.disabled"
        elif a == "password.set_by_admin":
            before, after = None, None
        out.append({"at": r["at"], "actor": names.get(r["actor"], r["actor"]),
                    "action": a, "subject": names.get(r["target"], r["target"]),
                    "before": before, "after": after})
    return out


_VIEWS = ("department.viewed", "process.viewed")


def _target_department(action: str, target: str | None) -> str | None:
    """The department a view or download row belongs to, from its `target`
    alone — a department code for `department.viewed`, a process id (resolved
    through `storage.dept_of`) for `process.viewed`, and a `dept:{code}/report:
    {kind}` scope (resolved through `scopes.dept_of`) for a download."""
    if not target:
        return None
    if action == "report.downloaded":
        return scope_dept(target)
    return storage.dept_of(target) if action == "process.viewed" else target


def departments(conn: sqlite3.Connection, root: Path, codes: set[str] | None,
                servable) -> list[dict]:
    """The board's activity report (D83): one row per department the caller
    reaches, registry order, with its readership and its most-viewed process.

    `servable(pid) -> bool` is the caller's own disclosure gate (`Disclosure.
    may_serve`, built by the router from the request's user) — a `process.
    viewed` row that names a process this caller may not be told exists is
    excluded entirely, from the view/reader counts and from `topProcess`
    alike (D56, review round 1): an Editor's view of an unconfirmed or
    tombstoned process is recorded exactly like any other view, and an Admin's
    activity report is not a back door onto its id or its name. `department.
    viewed` and `report.downloaded` rows name no single process and are
    unaffected.
    """
    reg = storage.read_json(storage.registry_path(root))["departments"]
    stats = {d["code"]: {"code": d["code"], "name": d.get("name", d["code"]),
                         "readers": set(), "views": 0, "downloads": 0,
                         "top": {}, "lastViewed": None}
             for d in reg if codes is None or d["code"] in codes}
    for r in conn.execute(
            "SELECT action, target, actor, COUNT(*) AS n, MAX(at) AS last"
            " FROM audit_events WHERE action IN (?, ?, 'report.downloaded')"
            " GROUP BY action, target, actor", _VIEWS):
        s = stats.get(_target_department(r["action"], r["target"]))
        if s is None:
            continue
        if r["action"] == "report.downloaded":
            s["downloads"] += r["n"]
            continue
        if r["action"] == "process.viewed" and not servable(r["target"]):
            continue
        s["views"] += r["n"]
        s["readers"].add(r["actor"])
        s["lastViewed"] = max(s["lastViewed"] or 0, r["last"])
        if r["action"] == "process.viewed":
            s["top"][r["target"]] = s["top"].get(r["target"], 0) + r["n"]
    out = []
    for s in stats.values():
        top = max(s["top"], key=s["top"].get) if s["top"] else None
        path = storage.proc_path(root, top) if top else None
        name = (storage.read_json(path).get("name") or top) if path and path.is_file() else top
        out.append({"code": s["code"], "name": s["name"], "readers": len(s["readers"]),
                    "views": s["views"], "downloads": s["downloads"],
                    "topProcess": {"id": top, "name": name} if top else None,
                    "lastViewed": s["lastViewed"]})
    return out


def comments(conn: sqlite3.Connection, cc: sqlite3.Connection,
             codes: set[str] | None) -> list[dict]:
    """Where each comment sits — metadata only, never its text (D44)."""
    names = {r["id"]: r["display_name"]
             for r in conn.execute("SELECT id, display_name FROM users")}
    rows = cc.execute("""
        SELECT c.id, c.department, c.author_name, c.state, c.stage, c.approver_id,
          (SELECT MAX(e.at) FROM comment_events e WHERE e.comment_id = c.id) AS moved
        FROM comments c ORDER BY c.id DESC""").fetchall()
    return [{"ref": comment_rules.cmt(r["id"]), "department": r["department"],
             "author": r["author_name"], "state": r["state"], "stage": r["stage"],
             "holder": names.get(r["approver_id"]) if r["stage"] == "reader" else None,
             "waitingSince": r["moved"] if r["state"] in ("awaiting", "approved") else None}
            for r in rows if codes is None or r["department"] in codes]


def summary(conn: sqlite3.Connection, cc: sqlite3.Connection, root: Path,
            codes: set[str] | None, servable) -> dict:
    """The report's headline numbers (D83). `activeUsers` and `failedSignIns`
    name no department, so — like the access/governance tabs — they show only
    to a `*` holder; a scoped caller gets `None` rather than a number that
    would silently answer a question about accounts outside their scope.

    `servable` is the same disclosure gate `departments()` takes, and is passed
    straight through: `views` is derived from `departments()`'s own counts, so
    it must exclude a process this caller may not be told exists exactly as
    that report does (review round 1)."""
    star = codes is None
    return {
        "activeUsers": (conn.execute("SELECT COUNT(*) FROM users"
                                     " WHERE disabled_at IS NULL").fetchone()[0]
                        if star else None),
        "views": sum(d["views"] for d in departments(conn, root, codes, servable)),
        "failedSignIns": (conn.execute(
            f"SELECT COUNT(*) FROM audit_events WHERE action IN ({_in(_SIGN_IN_FAILURES)})",
            _SIGN_IN_FAILURES).fetchone()[0] if star else None),
        "commentsAwaiting": sum(1 for c in comments(conn, cc, codes)
                                if c["state"] == "awaiting"),
    }
