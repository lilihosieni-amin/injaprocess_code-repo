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


def test_delete_removes_file(data_root):
    c = _c(data_root)
    # cooking-001 node n060 links subprocess cooking-014 in the fixture; create it first
    sub = c.post("/api/processes", json={
        "department": "cooking", "name": "زیر",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}}).json()
    r = c.delete(f"/api/processes/{sub['id']}")
    assert r.status_code == 200
    assert c.get(f"/api/processes/{sub['id']}").status_code == 404


def test_delete_unlinks_parent_node(data_root):
    c = _c(data_root)
    sub = c.post("/api/processes", json={
        "department": "cooking", "name": "زیر",
        "parent": {"process": "cooking-001", "node": "cooking-001-n010"}}).json()
    c.delete(f"/api/processes/{sub['id']}")
    parent = c.get("/api/processes/cooking-001").json()
    node = next(n for n in parent["nodes"] if n["id"] == "cooking-001-n010")
    assert node["subprocess"] is None


def test_delete_missing_404(data_root):
    c = _c(data_root)
    assert c.delete("/api/processes/cooking-999").status_code == 404
