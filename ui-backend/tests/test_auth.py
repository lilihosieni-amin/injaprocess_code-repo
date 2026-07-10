import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _client(data_root, password="pw"):
    cfg = cfg_for(data_root)
    # replace the dummy hash with a real argon2 hash of `password`
    real = argon2.PasswordHasher().hash(password)
    cfg = cfg.__class__(**{**cfg.__dict__, "ui_password_hash": real,
                           "ui_username": "analyst"})
    return TestClient(create_app(cfg))


def test_login_required_returns_401(data_root):
    c = _client(data_root)
    assert c.get("/api/auth/me").status_code == 401


def test_wrong_password_401(data_root):
    c = _client(data_root)
    r = c.post("/api/auth/login", json={"username": "analyst", "password": "nope"})
    assert r.status_code == 401


def test_correct_login_sets_cookie_and_unlocks(data_root):
    c = _client(data_root)
    r = c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    assert r.status_code == 200
    assert "inja_session" in r.cookies
    assert c.get("/api/auth/me").json()["username"] == "analyst"


def test_hash_is_not_plaintext(data_root):
    cfg = cfg_for(data_root)
    assert cfg.ui_password_hash != "pw"
