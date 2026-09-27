"""Queries behind the activity reports (spec D44; addendum D83).

Read-only. Nothing here returns a raw session id (a live one is a bearer
credential — `audit.session_tag` instead) or a comment's text (D44).
"""
from __future__ import annotations

import json
import sqlite3

from . import audit

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
    "comment.withdrawn": "governance", "comment.approved": "governance",
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
            WHERE a.actor = u.username AND a.action = 'login.failure') AS failures,
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
                kind: str | None, outcome: str | None, offset: int) -> dict:
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
    return {"total": total, "days": days, "rows": [
        {"id": r["id"], "at": r["at"], "action": r["action"],
         "kind": CATALOGUE.get(r["action"], "governance"),
         "target": r["target"], "ip": r["ip"],
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
