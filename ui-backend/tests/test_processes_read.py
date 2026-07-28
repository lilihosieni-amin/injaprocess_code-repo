import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _c(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    # `https://`: the session cookie is `Secure`, and the real cookie jar behind
    # `TestClient` will not send one over `http://`. See `test_auth.py`.
    c = TestClient(create_app(cfg), base_url="https://testserver")
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_get_process(data_root):
    c = _c(data_root)
    p = c.get("/api/processes/cooking-001").json()
    assert p["id"] == "cooking-001"
    assert "nodes" in p and "edges" in p


def test_get_process_404(data_root):
    c = _c(data_root)
    assert c.get("/api/processes/cooking-999").status_code == 404
