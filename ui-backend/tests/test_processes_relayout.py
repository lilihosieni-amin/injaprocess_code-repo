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


def test_relayout_returns_doc_without_persisting(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    on_disk_before = c.get("/api/processes/cooking-001").json()
    r = c.post("/api/processes/cooking-001/relayout", json=doc)
    assert r.status_code == 200
    out = r.json()
    assert len(out["nodes"]) == len(doc["nodes"])
    # unchanged on disk (compute-only)
    assert c.get("/api/processes/cooking-001").json() == on_disk_before


def test_relayout_with_unsaved_temp_node_does_not_422(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    on_disk_before = c.get("/api/processes/cooking-001").json()
    doc["nodes"].append({
        "id": "tmp-Z", "type": "activity", "label": "z", "description": "",
        "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 0, "y": 0}, "layout": "manual",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-Z", "label": ""})
    r = c.post("/api/processes/cooking-001/relayout", json=doc)
    assert r.status_code == 200                     # temp id realized before layout, not 422
    out = r.json()
    assert not any(n["id"] == "tmp-Z" for n in out["nodes"])   # got a real allocate-id id
    assert not any(e["to"] == "tmp-Z" for e in out["edges"])
    assert c.get("/api/processes/cooking-001").json() == on_disk_before  # still no persistence
