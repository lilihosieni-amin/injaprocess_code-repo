"""Edits made in the app are recorded with the real user, and their commits
say who acted (addendum D78; D48)."""
import json
import subprocess

from inja_ui_backend.tests_helpers import _USERNAME, audit_events, signed_in_client


def _client(data_root, tmp_path):
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    client.app_db = cfg.app_db
    return client


def _changes(client, action):
    return [(r["target"], json.loads(r["detail"])["change"])
            for r in audit_events(client, action)]


def test_saving_a_process_records_an_update_and_signs_the_commit(data_root, tmp_path):
    client = _client(data_root, tmp_path)
    doc = client.get("/api/processes/cooking-001").json()
    doc["name"] = "نام تازه"
    assert client.put("/api/processes/cooking-001", json=doc).status_code == 200
    assert _changes(client, "process.edited") == [("cooking-001", "updated")]
    trailer = subprocess.run(
        ["git", "-C", str(data_root), "log", "-1",
         "--format=%(trailers:key=Acted-By,valueonly,separator=)"],
        capture_output=True, text=True, check=True).stdout.strip()
    assert trailer == _USERNAME


def test_create_and_delete_record_their_change(data_root, tmp_path):
    client = _client(data_root, tmp_path)
    r = client.post("/api/processes", json={"department": "cooking", "name": "تازه"})
    assert r.status_code == 201
    pid = r.json()["id"]
    assert client.delete(f"/api/processes/{pid}").status_code == 200
    assert _changes(client, "process.edited") == [(pid, "created"), (pid, "deleted")]


def test_overview_and_order_are_department_edits(data_root, tmp_path):
    client = _client(data_root, tmp_path)
    ov = client.get("/api/departments/cooking/overview").json()
    assert client.put("/api/departments/cooking/overview", json=ov).status_code == 200
    assert client.put("/api/departments/cooking/order",
                      json={"order": ["cooking-001"]}).status_code == 200
    assert _changes(client, "department.edited") == [("cooking", "updated"),
                                                     ("cooking", "updated")]
