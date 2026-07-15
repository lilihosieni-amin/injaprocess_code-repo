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


import json


def _write_tombstone(data_root, pid="cooking-002"):
    src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
    doc = json.loads(src.read_text(encoding="utf-8"))
    doc["id"] = pid
    doc["tombstoned"] = True
    doc["superseded_by"] = ["cooking-050"]
    dst = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # commit so the delete route's git commit has a clean tree to work from
    import subprocess
    subprocess.run(["git", "-C", str(data_root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(data_root), "-c", "user.name=t",
                    "-c", "user.email=t@t", "commit", "-q", "-m", "tombstone"], check=True)


def test_permanent_delete_of_tombstone(data_root):
    _write_tombstone(data_root)
    c = _c(data_root)
    r = c.delete("/api/processes/cooking-002")
    assert r.status_code == 200
    assert r.json() == {"deleted": "cooking-002"}
    assert c.get("/api/processes/cooking-002").status_code == 404
