"""`session.revoked` — one row per session an act ended (D42, addendum D78)."""
import json

from fastapi.testclient import TestClient

from inja_ui_backend import db
from inja_ui_backend.auth import COOKIE_NAME
from inja_ui_backend.tests_helpers import _PW, _USERNAME, audit_events, signed_in_client


def _user_id(app_db, display_name):
    conn = db.connect(app_db)
    try:
        return conn.execute("SELECT id FROM users WHERE display_name = ?",
                            (display_name,)).fetchone()[0]
    finally:
        conn.close()


def test_a_password_change_records_each_other_session_it_ended(data_root, tmp_path):
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    other = TestClient(client.app, base_url="https://testserver")
    assert other.post("/api/auth/login",
                      json={"username": _USERNAME, "password": _PW}).status_code == 200
    r = client.post("/api/auth/password", json={"current": _PW, "next": "new-pass-1"})
    assert r.status_code == 204
    client.app_db = cfg.app_db
    rows = audit_events(client, "session.revoked")
    assert len(rows) == 1
    assert rows[0]["actor"] == _USERNAME and rows[0]["target"] == _USERNAME
    tag = json.loads(rows[0]["detail"])["session"]
    assert len(tag) == 6 and other.cookies.get(COOKIE_NAME) not in rows[0]["detail"]


def test_disabling_records_the_sessions_it_ended(people):
    uid = _user_id(people["editor"].app_db, "other")
    r = people["editor"].post(f"/api/users/{uid}/disabled", json={"disabled": True})
    assert r.status_code == 200
    rows = audit_events(people["editor"], "session.revoked")
    assert [row["target"] for row in rows] == ["09150000005"]


def test_an_admin_setting_a_password_records_every_session_it_ended(people):
    uid = _user_id(people["editor"].app_db, "viewer")
    r = people["editor"].post(f"/api/users/{uid}/password", json={"password": "abcdef"})
    assert r.status_code == 204
    assert [row["target"] for row in audit_events(people["editor"], "session.revoked")] \
        == ["09150000004"]
