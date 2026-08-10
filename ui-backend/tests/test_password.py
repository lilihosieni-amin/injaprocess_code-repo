import asyncio
import time

from fastapi.testclient import TestClient

from inja_ui_backend import auth as auth_module
from inja_ui_backend import db
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.routers import auth as auth_router
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import signed_in_client

PW = "test-password"

#: The two refusal messages, written out rather than imported. Importing them
#: would bind nothing: `detail == auth.SOME_CONSTANT` is true of any text at all,
#: including the same text for both refusals.
WRONG_CURRENT = "گذرواژهٔ فعلی درست نیست"
TOO_SHORT = "گذرواژه باید دست‌کم 6 نویسه باشد"


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


def test_the_two_refusals_do_not_say_the_same_thing(data_root, tmp_path):
    """Both refusals answer 400, so the status code cannot tell them apart — the
    message is the only thing that says which of the two fields to correct.

    Unasserted, the two could collapse into one text, or into `"no"`, and every
    other test in this file stays green.
    """
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    wrong = client.post("/api/auth/password",
                        json={"current": "wrong1", "next": "brandnew"})
    short = client.post("/api/auth/password",
                        json={"current": PW, "next": "five5"})
    assert wrong.status_code == 400 and short.status_code == 400
    assert wrong.json()["detail"] == WRONG_CURRENT
    assert short.json()["detail"] == TOO_SHORT
    # Stated separately from the two above, because it is the property the
    # comment in the route claims and it must not depend on reading both
    # literals correctly.
    assert wrong.json()["detail"] != short.json()["detail"]


def test_the_revocation_records_when_it_happened(data_root, tmp_path):
    """`revoked_at` has to be the instant, not merely non-NULL.

    `sessions.resolve` only asks `revoked_at is not None`, so passing `now=0` — or
    any wrong constant — down to `revoke_all_for_user` signs the other devices out
    exactly as expected and every other test here passes. The column is what
    answers "when was this person's access taken away", which is the question an
    activity record exists for.
    """
    app_db = tmp_path / "app.db"
    first, cfg = signed_in_client(data_root, app_db)
    second, _ = signed_in_client(data_root, app_db)
    kept = first.cookies.get("inja_session")
    revoked = second.cookies.get("inja_session")
    assert kept != revoked

    before = int(time.time())
    assert first.post("/api/auth/password",
                      json={"current": PW, "next": "brandnew"}).status_code == 204
    after = int(time.time())

    stamps = {r["id"]: r["revoked_at"]
              for r in _rows(cfg, "SELECT id, revoked_at FROM sessions")}
    assert stamps[kept] is None
    assert stamps[revoked] is not None
    assert before <= stamps[revoked] <= after


def test_both_argon2_calls_run_off_the_loop_and_under_the_limiter(
        data_root, tmp_path, monkeypatch):
    """Where the expensive work runs, proven rather than assumed.

    Two ways to get this wrong that no other test can see. A plain `def` handler
    runs the verify and the hash on Starlette's *default* 40-slot threadpool — the
    pool every other sync route shares — so ~2.5 GB of argon2 arenas and stalled
    export downloads. An `async def` that simply calls them runs 122 ms of argon2
    **on the event loop**, blocking the whole server per request. Both answer 204
    and pass everything else in this file.

    So: assert that at the moment each argon2 call happens there is no running
    event loop in this thread (it is a worker), and that `_VERIFY_LIMITER` — that
    object, not the default limiter — has a token borrowed. The first fails if the
    work moves onto the loop; the second fails if it moves onto the default pool,
    where the borrow count stays 0.
    """
    client, _ = signed_in_client(data_root, tmp_path / "app.db")
    seen: list[tuple[str, bool, int]] = []

    def watching(name, real):
        def spy(*args, **kw):
            try:
                asyncio.get_running_loop()
                on_loop = True
            except RuntimeError:
                on_loop = False
            seen.append((name, on_loop, auth_router._VERIFY_LIMITER.borrowed_tokens))
            return real(*args, **kw)
        return spy

    # Patched after sign-in, so what is recorded is this endpoint's work only.
    monkeypatch.setattr(auth_module, "verify_hash",
                        watching("verify", auth_module.verify_hash))
    monkeypatch.setattr(auth_module, "hash_password",
                        watching("hash", auth_module.hash_password))

    assert client.post("/api/auth/password",
                       json={"current": PW, "next": "brandnew"}).status_code == 204

    # Both of them, in this order — the verify gates the hash.
    assert [name for name, _, _ in seen] == ["verify", "hash"]
    for name, on_loop, borrowed in seen:
        assert on_loop is False, f"the {name} ran on the event loop"
        assert borrowed == 1, f"the {name} ran outside _VERIFY_LIMITER"
