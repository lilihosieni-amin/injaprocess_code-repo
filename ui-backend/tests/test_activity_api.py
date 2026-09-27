"""The activity reports (addendum D83). `people`: editor (*), admin (*),
cadmin (admin, dept:cashier), head/viewer/other (readers, cooking)."""
import json

from inja_ui_backend import db
from inja_ui_backend.auth import COOKIE_NAME


def _uid(people, name):
    conn = db.connect(people["editor"].app_db)
    try:
        return conn.execute("SELECT id FROM users WHERE display_name = ?",
                            (name,)).fetchone()[0]
    finally:
        conn.close()


def test_every_user_is_listed_with_their_counts(people):
    rows = people["editor"].get("/api/activity/users").json()
    viewer = next(r for r in rows if r["displayName"] == "viewer")
    assert viewer["logins"] == 1 and viewer["sessions"] == 1
    assert viewer["role"] == "reader" and viewer["scopes"] == ["dept:cooking"]
    assert set(viewer) == {"id", "username", "displayName", "role", "scopes", "disabled",
                           "logins", "failures", "sessions", "activeSeconds", "lastSeen"}


def test_one_users_events_filter_and_never_carry_a_session_id(people):
    people["viewer"].get("/api/processes/cooking-001")
    uid = _uid(people, "viewer")
    body = people["editor"].get(f"/api/activity/users/{uid}").json()
    assert [r["action"] for r in body["rows"]] == ["process.viewed", "login.success"]
    assert body["total"] == 2 and sum(body["days"].values()) == 2
    content = people["editor"].get(f"/api/activity/users/{uid}?kind=content").json()
    assert [r["action"] for r in content["rows"]] == ["process.viewed"]
    assert people["editor"].get(f"/api/activity/users/{uid}?outcome=fail").json()["total"] == 0
    sid = people["viewer"].cookies.get(COOKIE_NAME)
    raw = people["editor"].get(f"/api/activity/users/{uid}").text
    assert sid not in raw and len(body["rows"][0]["session"]) == 6
    assert body["sessions"][0]["state"] == "active"


def test_a_bad_filter_is_refused(people):
    uid = _uid(people, "viewer")
    assert people["editor"].get(f"/api/activity/users/{uid}?kind=secret").status_code == 422


def test_failed_sign_ins_group_by_username_and_ip(people):
    for _ in range(2):
        people["other"].post("/api/auth/login",
                             json={"username": "09159999999", "password": "nope-nope"})
    rows = people["editor"].get("/api/activity/failures").json()
    row = next(r for r in rows if r["username"] == "09159999999")
    assert row["attempts"] == 2 and row["first"] <= row["last"]


def test_permission_history_names_people_and_values(people):
    uid = _uid(people, "other")
    people["editor"].post(f"/api/users/{uid}/disabled", json={"disabled": True})
    rows = people["editor"].get("/api/activity/permissions").json()
    assert rows[0] == {"at": rows[0]["at"], "actor": "editor", "action": "user.disabled",
                       "subject": "other", "before": False, "after": True}


def test_the_star_tabs_are_404_to_a_scoped_admin_and_a_reader(people):
    uid = _uid(people, "viewer")
    for who in ("cadmin", "viewer"):
        for path in ("/api/activity/users", f"/api/activity/users/{uid}",
                     "/api/activity/failures", "/api/activity/permissions"):
            assert people[who].get(path).status_code == 404, (who, path)


def test_a_report_drains_and_projects_first(people, monkeypatch):
    from inja_ui_backend import comment_jobs, projection
    calls = []
    monkeypatch.setattr(comment_jobs, "drain", lambda *a: calls.append("drain"))
    monkeypatch.setattr(projection, "run", lambda cfg: calls.append("project"))
    people["editor"].get("/api/activity/users")
    assert calls == ["drain", "project"]
