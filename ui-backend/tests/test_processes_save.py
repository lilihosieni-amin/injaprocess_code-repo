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


def test_save_ignores_body_id_and_department(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    doc["id"] = "hacked-999"
    doc["department"] = "management"
    doc["name"] = "ذخیره‌شده"
    r = c.put("/api/processes/cooking-001", json=doc)
    assert r.status_code == 200
    saved = r.json()
    assert saved["id"] == "cooking-001" and saved["department"] == "cooking"
    assert saved["name"] == "ذخیره‌شده"


def test_save_allocates_new_node_ids_and_rewrites_edges(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    doc["nodes"].append({
        "id": "tmp-A", "type": "activity", "label": "فعالیت تازه",
        "description": "", "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 900, "y": 500}, "layout": "manual",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-A", "label": ""})
    r = c.put("/api/processes/cooking-001", json=doc)
    assert r.status_code == 200
    saved = r.json()
    new_ids = [n["id"] for n in saved["nodes"] if n["id"].endswith(("n060", "n070", "n080"))]
    assert any(nid.startswith("cooking-001-n") for nid in new_ids)
    assert not any(n["id"] == "tmp-A" for n in saved["nodes"])
    assert not any(e["to"] == "tmp-A" for e in saved["edges"])


def test_save_forces_manual_on_new_node_only_and_trusts_incoming(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    pre_ids = {n["id"] for n in doc["nodes"]}  # every existing real id (before adding temp)
    # An existing node the client reports as auto stays auto (server trusts the client);
    # inferring manual from a move would freeze it against future merges.
    existing = next(n for n in doc["nodes"] if n["id"] == "cooking-001-n010")
    existing["layout"] = "auto"
    existing["position"] = {"x": existing["position"]["x"] + 50, "y": existing["position"]["y"]}
    # A brand-new node must come back pinned manual regardless of what was sent.
    doc["nodes"].append({
        "id": "tmp-M", "type": "activity", "label": "تازه", "description": "",
        "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 700, "y": 400}, "layout": "auto",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-M", "label": ""})
    saved = c.put("/api/processes/cooking-001", json=doc).json()
    kept = next(n for n in saved["nodes"] if n["id"] == "cooking-001-n010")
    assert kept["layout"] == "auto"                       # trusted, not forced to manual
    created = [n for n in saved["nodes"] if n["id"] not in pre_ids]  # tmp-M, now a real id
    assert len(created) == 1 and created[0]["layout"] == "manual"


def test_save_invalid_doc_422_leaves_file_unchanged(data_root):
    c = _c(data_root)
    before = c.get("/api/processes/cooking-001").json()
    bad = {"id": "cooking-001", "department": "cooking", "nodes": "not-a-list"}
    r = c.put("/api/processes/cooking-001", json=bad)
    assert r.status_code == 422
    assert c.get("/api/processes/cooking-001").json() == before
