import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def test_static_served_when_configured(data_root, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>inja</title>", encoding="utf-8")
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw"),
                           "static_dir": dist})
    c = TestClient(create_app(cfg))
    r = c.get("/")
    assert r.status_code == 200 and "inja" in r.text


def test_no_static_dir_is_fine(data_root):
    cfg = cfg_for(data_root)
    c = TestClient(create_app(cfg))
    # API still works; no crash from missing static
    assert c.get("/api/auth/me").status_code == 401
