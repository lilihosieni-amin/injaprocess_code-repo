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


def _first_open(doc):
    for i, row in enumerate(doc["pending"]):
        if row["status"] == "open":
            return i, row
    return None, None


def test_accept_applies_proposal_and_commits(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, row = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    out = c.post(f"/api/processes/cooking-001/pending/{i}",
                 json={"decision": "accept"}).json()
    node = next(n for n in out["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == row["proposed"]
    assert out["pending"][i]["status"] == "accepted"


def test_reject_leaves_node_and_flags_row(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, row = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    node_before = next(n for n in doc["nodes"] if n["id"] == row["node"])[row["field"]]
    out = c.post(f"/api/processes/cooking-001/pending/{i}",
                 json={"decision": "reject"}).json()
    node = next(n for n in out["nodes"] if n["id"] == row["node"])
    assert node[row["field"]] == node_before
    assert out["pending"][i]["status"] == "rejected"


def test_double_resolve_409(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    i, _ = _first_open(doc)
    if i is None:
        import pytest
        pytest.skip("fixture has no open pending row")
    c.post(f"/api/processes/cooking-001/pending/{i}", json={"decision": "accept"})
    again = c.post(f"/api/processes/cooking-001/pending/{i}", json={"decision": "accept"})
    assert again.status_code == 409
