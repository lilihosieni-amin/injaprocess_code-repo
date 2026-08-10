from fastapi.testclient import TestClient

from inja_ui_backend import db
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import signed_in_client

PW = "test-password"


def test_changing_your_password_needs_the_current_one(data_root, tmp_path):
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    r = client.post("/api/auth/password", json={"current": "wrong1", "next": "newpass"})
    assert r.status_code == 400


def test_the_new_password_must_clear_the_floor(data_root, tmp_path):
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    r = client.post("/api/auth/password", json={"current": PW, "next": "five5"})
    assert r.status_code == 400


def test_changing_it_works_and_the_old_one_stops(data_root, tmp_path):
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    assert client.post("/api/auth/password",
                       json={"current": PW, "next": "brandnew"}).status_code == 204
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login",
                       json={"username": "09120000000", "password": PW}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"username": "09120000000", "password": "brandnew"}).status_code == 200


def test_it_revokes_other_sessions_but_not_the_one_you_used(data_root, tmp_path):
    # "We think this account is compromised, change the password" has to mean
    # something — but it should not sign you out of the tab you did it in.
    app_db = tmp_path / "app.db"
    first, cfg = signed_in_client(data_root, app_db)
    second, _ = signed_in_client(data_root, app_db)   # a second device
    assert second.get("/api/auth/me").status_code == 200

    assert first.post("/api/auth/password",
                      json={"current": PW, "next": "brandnew"}).status_code == 204
    assert first.get("/api/auth/me").status_code == 200
    assert second.get("/api/auth/me").status_code == 401


def test_the_change_is_recorded(data_root, tmp_path):
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    client.post("/api/auth/password", json={"current": PW, "next": "brandnew"})
    conn = db.connect(cfg.app_db)
    n = conn.execute(
        "SELECT COUNT(*) FROM audit_events WHERE action='password.changed'").fetchone()[0]
    assert n == 1


# --------------------------------------------------------------------------
# Beyond the plan's cases. Each one below exists because a predicate, an
# argument or a written value could be deleted from `apply_password_change` /
# the route with the five above still green.
# --------------------------------------------------------------------------

def _rows(cfg, sql, *args):
    conn = db.connect(cfg.app_db)
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def test_a_six_character_password_is_accepted(data_root, tmp_path):
    """The floor, bound from below as well as above.

    `test_the_new_password_must_clear_the_floor` alone is satisfied by a floor of
    any length at all — seven, twelve, or "refuse everything". D58 is six.
    """
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    assert client.post("/api/auth/password",
                       json={"current": PW, "next": "sixchr"}).status_code == 204
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login",
                       json={"username": "09120000000",
                             "password": "sixchr"}).status_code == 200


def test_it_does_not_touch_anybody_else_s_sessions(data_root, tmp_path):
    """The `user_id` scope of the revoke.

    An `UPDATE sessions SET revoked_at = ?` that forgot its `WHERE user_id = ?`
    signs out the whole restaurant, and every test above still passes — they only
    ever look at one person's sessions.
    """
    app_db = tmp_path / "app.db"
    mine, cfg = signed_in_client(data_root, app_db)

    conn = db.connect(cfg.app_db)
    try:
        reader = conn.execute("SELECT id FROM roles WHERE name='reader'").fetchone()[0]
        users.create(conn, username="09121111111", display_name="سحر",
                     password_hash=hash_password(PW), role_id=reader)
    finally:
        conn.close()

    theirs = TestClient(create_app(cfg), base_url="https://testserver")
    assert theirs.post("/api/auth/login",
                       json={"username": "09121111111",
                             "password": PW}).status_code == 200

    assert mine.post("/api/auth/password",
                     json={"current": PW, "next": "brandnew"}).status_code == 204
    # Somebody else changing their password is not a reason to sign this person
    # out, and their credential is untouched.
    assert theirs.get("/api/auth/me").status_code == 200
    theirs.post("/api/auth/logout")
    assert theirs.post("/api/auth/login",
                       json={"username": "09121111111",
                             "password": PW}).status_code == 200


def test_a_refused_change_writes_nothing_at_all(data_root, tmp_path):
    """Both refusals, and neither may half-apply.

    A check that runs *after* the writes refuses with a 400 and still leaves the
    password changed and the other devices signed out.
    """
    app_db = tmp_path / "app.db"
    first, cfg = signed_in_client(data_root, app_db)
    second, _ = signed_in_client(data_root, app_db)

    assert first.post("/api/auth/password",
                      json={"current": "wrong1",
                            "next": "brandnew"}).status_code == 400
    assert first.post("/api/auth/password",
                      json={"current": PW, "next": "five5"}).status_code == 400

    assert second.get("/api/auth/me").status_code == 200
    assert _rows(cfg, "SELECT id FROM audit_events WHERE action='password.changed'") == []
    first.post("/api/auth/logout")
    assert first.post("/api/auth/login",
                      json={"username": "09120000000",
                            "password": PW}).status_code == 200
    # The rejected value never became the credential either.
    assert first.post("/api/auth/login",
                      json={"username": "09120000000",
                            "password": "brandnew"}).status_code == 401


def test_the_record_names_the_actor_the_session_and_the_outcome(data_root, tmp_path):
    """`outcome` is asserted without ever being passed, which is the only way the
    default in `audit.record` is bound by anything."""
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    sid = client.cookies.get("inja_session")
    client.post("/api/auth/password", json={"current": PW, "next": "brandnew"},
                headers={"user-agent": "kitchen-tablet"})
    row = _rows(cfg, "SELECT actor, session_id, outcome, ip, user_agent, target,"
                     " detail FROM audit_events WHERE action='password.changed'")[0]
    assert row["actor"] == "09120000000"
    assert row["session_id"] == sid
    assert row["outcome"] == "ok"
    assert row["ip"] == "testclient"
    assert row["user_agent"] == "kitchen-tablet"
    # Self-service: nobody else is the target, and there is no reason to record.
    # `password.set_by_admin` (D15) is the event with a target, and it is a later
    # sub-project.
    assert row["target"] is None
    assert row["detail"] is None


def test_it_is_not_open_to_a_stranger(data_root, tmp_path):
    """`require_session` is the gate. Without it the endpoint would 500 on the
    missing user rather than refuse, which is not the same answer."""
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    client.cookies.clear()
    r = client.post("/api/auth/password", json={"current": PW, "next": "brandnew"})
    assert r.status_code == 401


def test_the_two_writes_run_without_opening_a_transaction(data_root, tmp_path):
    """The invariant in `db.connect`: no handler may `BEGIN` on the shared
    connection, and this handler is the one the comment there names.

    A `BEGIN…COMMIT` around the two writes passes every other test in this file
    — one request at a time never notices — and then fails in production the
    first time two requests overlap.
    """
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    conn = client.app.state.db
    statements: list[str] = []
    conn.set_trace_callback(statements.append)
    try:
        assert client.post("/api/auth/password",
                           json={"current": PW, "next": "brandnew"}).status_code == 204
    finally:
        conn.set_trace_callback(None)
    assert statements, "the trace callback saw nothing; this test proves nothing"
    opened = [s for s in statements
              if s.strip().upper().startswith(("BEGIN", "COMMIT", "ROLLBACK",
                                               "SAVEPOINT", "RELEASE"))]
    assert opened == []
    assert conn.in_transaction is False
