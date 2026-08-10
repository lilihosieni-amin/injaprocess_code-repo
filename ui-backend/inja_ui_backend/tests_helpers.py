"""Test-only helpers. Not imported by production code."""
from __future__ import annotations

import time
from pathlib import Path

from .config import load_settings

_PW = "test-password"
_USERNAME = "09120000000"


def cfg_for(data_root: Path, app_db: Path | None = None):
    env = {
        "DATA_ROOT": str(data_root),
        "SCHEMA_DIR": str(Path(__file__).resolve().parents[2] / "schemas"),
        "SESSION_SIGNING_KEY": "k",
        "APP_DB": str(app_db if app_db is not None else data_root.parent / "app.db"),
    }
    return load_settings(env)


def seed_editor(cfg) -> None:
    """Put one active Editor in `cfg.app_db`, on a connection of its own.

    Its own, and closed again, because `seed()` opens an explicit transaction and
    the app's shared connection may never carry one (see `db.connect`). Idempotent
    — `seed()` skips quietly once an active Editor is there — so a test that
    builds two clients over one database does not have to care which came first.
    """
    from . import db, seed
    from .auth import hash_password

    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username=_USERNAME, editor_display_name="تحلیل‌گر",
                  editor_password_hash=hash_password(_PW))
    finally:
        conn.close()


def signed_in_client(data_root: Path, app_db: Path):
    """A TestClient already holding an Editor session.

    Every router test needs a session now. The https base URL is load-bearing:
    the cookie is Secure and TestClient's jar will not send it over http.
    """
    from fastapi.testclient import TestClient

    from .app import create_app

    cfg = cfg_for(data_root, app_db)
    seed_editor(cfg)
    client = TestClient(create_app(cfg), base_url="https://testserver")
    r = client.post("/api/auth/login", json={"username": _USERNAME, "password": _PW})
    assert r.status_code == 200, r.text
    return client, cfg


def seeded_session(cfg) -> str:
    """A live session id for a seeded Editor of `cfg.app_db`.

    For the tests that must hand a *request* an admin cookie without going through
    the login endpoint — the export gate's, which ask what a session opens rather
    than how one is obtained, and several of which drive a plain `http://` client
    whose jar would never store the Secure cookie login sets.
    """
    from . import db
    from .store import sessions, users

    seed_editor(cfg)
    conn = db.connect(cfg.app_db)
    try:
        user = users.by_username(conn, _USERNAME)
        return sessions.issue(conn, user["id"], ip="", user_agent="",
                              now=int(time.time()))
    finally:
        conn.close()
