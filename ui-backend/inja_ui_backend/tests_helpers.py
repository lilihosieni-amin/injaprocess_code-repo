"""Test-only helpers. Not imported by production code."""
from __future__ import annotations

import time
from pathlib import Path

from .config import load_settings

_PW = "test-password"
_USERNAME = "09120000000"


def cfg_for(data_root: Path, app_db: Path | None = None, comments_db: Path | None = None):
    env = {
        "DATA_ROOT": str(data_root),
        "SCHEMA_DIR": str(Path(__file__).resolve().parents[2] / "schemas"),
        "SESSION_SIGNING_KEY": "k",
        "APP_DB": str(app_db if app_db is not None else data_root.parent / "app.db"),
    }
    if comments_db is not None:
        env["COMMENTS_DB"] = str(comments_db)
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


def comment_people(data_root: Path, tmp_path: Path) -> dict:
    """Signed-in clients over ONE app.db and ONE comments.db, so they all see
    the same comments: editor (*), admin (*), cadmin (admin, dept:cashier),
    head (reader, cooking, can_supervise), viewer (reader, cooking, supervisor
    head), other (reader, cooking). Display names are the keys. Confirms
    cooking-001 and the cooking overview, because a non-editor is served only
    confirmed content (D22). Each client carries `.app_db` for `audit_events`.
    """
    import json

    from fastapi.testclient import TestClient

    from . import db
    from .app import create_app
    from .auth import hash_password
    from .fingerprint import fingerprint
    from .store import confirmations, users

    cfg = cfg_for(data_root, tmp_path / "people-app.db", tmp_path / "people-comments.db")
    seed_editor(cfg)
    pw = hash_password(_PW)
    people = [("editor", "editor", ("*",), None, False),
              ("admin", "admin", ("*",), None, False),
              ("cadmin", "admin", ("dept:cashier",), None, False),
              ("head", "reader", ("dept:cooking",), None, True),
              ("viewer", "reader", ("dept:cooking",), "head", False),
              ("other", "reader", ("dept:cooking",), None, False)]
    conn = db.connect(cfg.app_db)
    try:
        ids: dict[str, int] = {}
        for n, (name, role, scopes, sup, can_sup) in enumerate(people):
            rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
            ids[name] = users.create(conn, username=f"0915{n:07d}", display_name=name,
                                     password_hash=pw, role_id=rid,
                                     supervisor_id=ids.get(sup), can_supervise=can_sup)
            for s in scopes:
                conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                             (ids[name], s))
        base = data_root / "departments" / "cooking"
        for target, path in (("cooking-001", base / "processes" / "cooking-001.json"),
                             ("cooking", base / "overview.json")):
            confirmations.set_confirmation(
                conn, target=target, by=_USERNAME, at=int(time.time()),
                fingerprint=fingerprint(json.loads(path.read_text(encoding="utf-8"))))
    finally:
        conn.close()
    app = create_app(cfg)
    out = {}
    for n, (name, *_rest) in enumerate(people):
        client = TestClient(app, base_url="https://testserver")
        r = client.post("/api/auth/login",
                        json={"username": f"0915{n:07d}", "password": _PW})
        assert r.status_code == 200, r.text
        client.app_db = cfg.app_db
        out[name] = client
    return out


def audit_events(client, action: str) -> list[dict]:
    """The activity record's rows for `action`, oldest first."""
    from . import db

    conn = db.connect(client.app_db)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, target, outcome, detail FROM audit_events"
            " WHERE action = ? ORDER BY id", (action,))]
    finally:
        conn.close()
