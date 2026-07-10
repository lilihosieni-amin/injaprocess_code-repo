import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_create_process_allocates_id(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={"department": "warehouse", "name": "دریافت کالا"})
    assert r.status_code == 201
    doc = r.json()
    assert doc["id"] == "warehouse-001"
    assert doc["source"]["type"] == "manual"
    assert [n["id"] for n in doc["nodes"]] == ["start", "end"]
    # persisted + readable
    assert c.get("/api/processes/warehouse-001").status_code == 200


def test_create_process_unknown_dept_400(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={"department": "nosuch"})
    assert r.status_code == 400


def test_create_subprocess_links_parent_node(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking", "name": "زیرفرآیند",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert r.status_code == 201
    child = r.json()
    assert child["parent"] == {"process": "cooking-001", "node": "cooking-001-n010"}
    parent = c.get("/api/processes/cooking-001").json()
    node = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert node["subprocess"] == child["id"]


def test_subprocess_unknown_node_404(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n999"}})
    assert r.status_code == 404


def test_subprocess_non_activity_node_400(data_root):
    c = _c(data_root)
    r = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "start"}})  # terminal, not activity
    assert r.status_code == 400


def test_subprocess_already_linked_409(data_root):
    c = _c(data_root)
    first = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert first.status_code == 201
    again = c.post("/api/processes", json={
        "department": "cooking",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}})
    assert again.status_code == 409  # never silently overwrite an existing link
