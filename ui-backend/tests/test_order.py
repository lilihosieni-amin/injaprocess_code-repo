import json
import subprocess

import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _auth_client(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def _clone(data_root, pid):
    """Copy the seeded cooking-001 to a second id so the department has two."""
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    for n in doc["nodes"]:
        if n["id"].startswith("cooking-001-"):
            n["id"] = n["id"].replace("cooking-001-", f"{pid}-")
    doc["edges"] = [{**e,
                     "from": e["from"].replace("cooking-001-", f"{pid}-"),
                     "to": e["to"].replace("cooking-001-", f"{pid}-")}
                    for e in doc["edges"]]
    doc["pending"] = []
    (src.parent / f"{pid}.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _order_on_disk(data_root):
    p = data_root / "departments" / "cooking" / "order.json"
    return json.loads(p.read_text(encoding="utf-8"))["order"] if p.is_file() else None


def test_put_order_saves_and_returns(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-002", "cooking-001"]})
    assert r.status_code == 200
    assert r.json() == {"order": ["cooking-002", "cooking-001"]}
    assert _order_on_disk(data_root) == ["cooking-002", "cooking-001"]


def test_put_order_commits_the_file(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    log = subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                          "HEAD"], capture_output=True, text=True).stdout
    assert "ui-edit(cooking): update process order" in log
    assert "departments/cooking/order.json" in log


def test_put_order_missing_id_is_409(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    assert r.status_code == 409
    assert "set mismatch" in r.json()["detail"]


def test_put_order_stale_id_is_409(data_root):
    c = _auth_client(data_root)
    r = c.put("/api/departments/cooking/order",
              json={"order": ["cooking-001", "cooking-099"]})
    assert r.status_code == 409


def test_put_order_bad_body_is_422(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/cooking/order",
                 json={"order": "cooking-001"}).status_code == 422
    assert c.put("/api/departments/cooking/order",
                 json={"order": [1, 2]}).status_code == 422


def test_put_order_unknown_department_is_404(data_root):
    c = _auth_client(data_root)
    assert c.put("/api/departments/nope/order",
                 json={"order": []}).status_code == 404


def test_put_order_requires_auth(data_root):
    c = TestClient(create_app(cfg_for(data_root)))
    assert c.put("/api/departments/cooking/order",
                 json={"order": []}).status_code == 401


def _tombstone(data_root, pid):
    p = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["tombstoned"] = True
    doc["superseded_by"] = []
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                 encoding="utf-8")


def test_processes_follow_the_curated_order(data_root):
    _clone(data_root, "cooking-002")
    _clone(data_root, "cooking-003")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-003", "cooking-001", "cooking-002"]})
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-003", "cooking-001", "cooking-002"]


def test_processes_fall_back_to_id_order_without_a_file(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-002"]


def test_unordered_actives_land_after_the_ordered_ones(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    _clone(data_root, "cooking-003")  # created behind the backend's back
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-002", "cooking-001", "cooking-003"]


def test_tombstones_come_last_in_id_order(data_root):
    _clone(data_root, "cooking-002")
    _clone(data_root, "cooking-003")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-003", "cooking-001", "cooking-002"]})
    _tombstone(data_root, "cooking-003")
    ids = [p["id"] for p in c.get("/api/departments/cooking/processes").json()]
    assert ids == ["cooking-001", "cooking-002", "cooking-003"]


def test_create_appends_to_the_order_in_one_commit(data_root):
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order", json={"order": ["cooking-001"]})
    r = c.post("/api/processes", json={"department": "cooking", "name": "نو"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert _order_on_disk(data_root) == ["cooking-001", new_id]
    log = subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                          "HEAD"], capture_output=True, text=True).stdout
    assert "departments/cooking/order.json" in log
    assert log.count("create process") == 1


def test_delete_drops_from_the_order_in_one_commit(data_root):
    _clone(data_root, "cooking-002")
    c = _auth_client(data_root)
    c.put("/api/departments/cooking/order",
          json={"order": ["cooking-002", "cooking-001"]})
    assert c.delete("/api/processes/cooking-002").status_code == 200
    assert _order_on_disk(data_root) == ["cooking-001"]
    log = subprocess.run(["git", "-C", str(data_root), "show", "--stat", "--oneline",
                          "HEAD"], capture_output=True, text=True).stdout
    assert "departments/cooking/order.json" in log
