from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.tests_helpers import audit_events, comment_people

from .test_reports_api import confirm_everything   # the shared helper


def test_a_view_holder_is_served_the_payload(data_root, tmp_path):
    people = comment_people(data_root, tmp_path)
    r = people["viewer"].get("/api/departments/cooking/reports/steps")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dept"]["department"] == "cooking"
    assert [p["id"] for p in body["processes"]] == ["cooking-001"]
    assert body["generated_at"]


def test_only_confirmed_processes_reach_the_payload(data_root, tmp_path):
    people = comment_people(data_root, tmp_path)   # confirms cooking-001 only
    body = people["viewer"].get("/api/departments/cooking/reports/steps").json()
    assert all(p["id"] == "cooking-001" for p in body["processes"])


def test_a_department_with_nothing_confirmed_reads_as_empty(data_root, tmp_path):
    people = comment_people(data_root, tmp_path)
    r = people["editor"].get("/api/departments/dining/reports/steps")
    assert r.status_code == 200, r.text
    assert r.json()["dept"] is None
    assert r.json()["processes"] == []


def test_another_department_is_not_found(data_root, tmp_path):
    people = comment_people(data_root, tmp_path)
    r = people["viewer"].get("/api/departments/dining/reports/steps")
    assert r.status_code == 404 and r.json()["detail"] == NOT_FOUND


def test_an_unknown_kind_is_not_found(data_root, tmp_path):
    people = comment_people(data_root, tmp_path)
    r = people["viewer"].get("/api/departments/cooking/reports/audit")
    assert r.status_code == 404 and r.json()["detail"] == NOT_FOUND


def test_a_report_scoped_reader_reaches_only_that_report(data_root, tmp_path):
    """`dept:cooking/report:steps` covers steps and nothing else (D10)."""
    people = comment_people(data_root, tmp_path)
    _rescope(people["other"], "dept:cooking/report:steps")   # helper in this file
    assert people["other"].get("/api/departments/cooking/reports/steps").status_code == 200
    assert people["other"].get("/api/departments/cooking/reports/flowchart").status_code == 404


def test_reading_is_recorded(data_root, tmp_path):
    people = comment_people(data_root, tmp_path)
    people["viewer"].get("/api/departments/cooking/reports/steps")
    rows = audit_events(people["viewer"], "report.viewed")
    assert [r["target"] for r in rows] == ["dept:cooking/report:steps"]
    assert rows[0]["outcome"] == "ok"


def _rescope(client, scope: str) -> None:
    from inja_ui_backend import db
    conn = db.connect(client.app_db)
    try:
        uid = conn.execute("SELECT id FROM users WHERE display_name = 'other'").fetchone()[0]
        conn.execute("DELETE FROM user_scopes WHERE user_id = ?", (uid,))
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)", (uid, scope))
        conn.commit()
    finally:
        conn.close()
