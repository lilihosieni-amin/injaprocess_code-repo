import threading
import time

import argon2
import pytest
from fastapi.testclient import TestClient

from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.routers import auth as auth_router
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

BASE_URL = "https://testserver"   # the cookie is Secure; http:// silently drops it
PW = "sixchars"


def _client(data_root, tmp_path, **overrides):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__, "app_db": tmp_path / "app.db",
                           **overrides})
    app = create_app(cfg)
    return TestClient(app, base_url=BASE_URL), cfg


def _seeded(data_root, tmp_path, **overrides):
    client, cfg = _client(data_root, tmp_path, **overrides)
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username="09120000000", editor_display_name="تحلیل‌گر",
              editor_password_hash=argon2.PasswordHasher().hash(PW))
    conn.close()
    return client, cfg


def test_sign_in_sets_a_session_cookie_and_me_returns_the_user(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/login",
                    json={"username": "09120000000", "password": PW})
    assert r.status_code == 200
    # The whole body, not a field of it: the SPA's `useLogin` reads `username`
    # from here, and an endpoint answering `{"ok": true}` would pass any check
    # that only looks at the status.
    assert r.json() == {"username": "09120000000"}
    assert client.cookies.get("inja_session")
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == "09120000000"
    assert body["role"] == "editor"
    assert "edit" in body["capabilities"]
    assert body["scopes"] == ["*"]


def test_a_persian_typed_number_signs_in(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/login",
                    json={"username": "۰۹۱۲۰۰۰۰۰۰۰", "password": PW})
    assert r.status_code == 200
    # Canonical in the answer as well, so the SPA holds one spelling of the
    # person however they typed themselves in.
    assert r.json() == {"username": "09120000000"}


def test_a_country_code_with_the_leading_zero_signs_in(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/login",
                    json={"username": "+98 0912 000 0000", "password": PW})
    assert r.status_code == 200


def test_wrong_password_unknown_number_and_disabled_look_identical(data_root, tmp_path):
    # D56: the response must not distinguish them. The RECORD does.
    client, cfg = _seeded(data_root, tmp_path)
    wrong = client.post("/api/auth/login",
                        json={"username": "09120000000", "password": "nope123"})
    unknown = client.post("/api/auth/login",
                          json={"username": "09129999999", "password": PW})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    # Headers too, not only status and body: D56 says "identical response", and a
    # `Set-Cookie` or a header present on one path alone would answer "does this
    # person work here?" as plainly as a different message would. Compared whole,
    # so it is not only `set-cookie` that is pinned.
    assert dict(wrong.headers) == dict(unknown.headers)
    assert "set-cookie" not in wrong.headers


def test_the_record_distinguishes_them(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "09120000000",
                                         "password": "nope123"})
    client.post("/api/auth/login", json={"username": "09129999999",
                                         "password": PW})
    conn = db.connect(cfg.app_db)
    reasons = [r["detail"] for r in conn.execute(
        "SELECT detail FROM audit_events WHERE action = 'login.failure' ORDER BY id")]
    assert "bad_password" in reasons[0]
    assert "no_such_user" in reasons[1]


def test_a_successful_sign_in_is_recorded(data_root, tmp_path):
    # Today nothing records one — "no line marking the moment guessing stops
    # being guessing".
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "09120000000", "password": PW})
    conn = db.connect(cfg.app_db)
    n = conn.execute(
        "SELECT COUNT(*) FROM audit_events WHERE action='login.success'").fetchone()[0]
    assert n == 1


def test_an_unknown_username_costs_the_same_time_as_a_wrong_password(data_root, tmp_path):
    # D56: returning instantly on a miss is a timing oracle, and with phone
    # numbers as usernames it answers "does this person work here?".
    client, _ = _seeded(data_root, tmp_path)

    def elapsed(username, password):
        start = time.perf_counter()
        client.post("/api/auth/login",
                    json={"username": username, "password": password})
        return time.perf_counter() - start

    known = min(elapsed("09120000000", "nope123") for _ in range(3))
    miss = min(elapsed("09129999999", "nope123") for _ in range(3))
    # A dummy-hash verify costs ~58ms; an early return costs microseconds.
    assert miss > known / 4


def test_logout_revokes_the_session(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "09120000000", "password": PW})
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_me_without_a_cookie_is_401(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    assert client.get("/api/auth/me").status_code == 401


def test_a_forged_cookie_is_refused(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    client.cookies.set("inja_session", "not-a-real-session-id")
    assert client.get("/api/auth/me").status_code == 401


def test_a_short_password_cannot_be_used_at_all(data_root, tmp_path):
    # D58: six characters, and nothing else.
    from inja_ui_backend.auth import validate_password
    assert validate_password("sixchr") is None
    assert validate_password("five5") is not None


# --------------------------------------------------------------------------
# Beyond the plan's cases: each one below exists because deleting a predicate,
# a written value or an attribute in `auth.py` / `routers/auth.py` left the
# eleven above green.
# --------------------------------------------------------------------------

def _sign_in(client, username="09120000000", password=PW, **kw):
    r = client.post("/api/auth/login",
                    json={"username": username, "password": password}, **kw)
    assert r.status_code == 200, r.text
    return r


def _rows(cfg, sql, *args):
    conn = db.connect(cfg.app_db)
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def test_the_cookie_carries_the_session_id_and_every_attribute_it_needs(
        data_root, tmp_path):
    """A cookie attribute no test names is a cookie attribute that can be dropped.

    `secure` because this cookie is the whole session and may not cross a
    cleartext hop; `httponly` because script must never read it; `samesite=lax`
    against cross-site posts; `path=/` because that is the identity a user agent
    matches on at logout; `max-age` because a session cookie that outlives the
    row is a browser holding a key to a locked door.
    """
    client, cfg = _seeded(data_root, tmp_path)
    r = _sign_in(client)
    raw = r.headers["set-cookie"].lower()
    assert raw.startswith("inja_session=")
    assert "; secure" in raw
    assert "; httponly" in raw
    assert "samesite=lax" in raw
    assert "path=/" in raw
    assert f"max-age={cfg.session_ttl}" in raw

    # The value is the opaque row id (D7) and nothing else — not a signed blob
    # carrying a username, which could not be revoked.
    sid = client.cookies.get("inja_session")
    rows = _rows(cfg, "SELECT s.id, u.username FROM sessions s"
                      " JOIN users u ON u.id = s.user_id WHERE s.id = ?", sid)
    assert [tuple(r) for r in rows] == [(sid, "09120000000")]


def test_the_session_row_records_where_the_sign_in_came_from(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client, headers={"user-agent": "kitchen-tablet"})
    row = _rows(cfg, "SELECT ip, user_agent FROM sessions")[0]
    assert row["user_agent"] == "kitchen-tablet"
    assert row["ip"] == "testclient"


def test_a_disabled_account_is_refused_and_looks_like_any_other_refusal(
        data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    conn = db.connect(cfg.app_db)
    users.set_disabled(conn, 1, True, now=1000)
    conn.close()

    refused = client.post("/api/auth/login",
                          json={"username": "09120000000", "password": PW})
    wrong = client.post("/api/auth/login",
                        json={"username": "09120000000", "password": "nope123"})
    assert refused.status_code == 401
    assert refused.json() == wrong.json()
    assert "set-cookie" not in refused.headers
    assert client.get("/api/auth/me").status_code == 401


def test_the_record_says_disabled(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    conn = db.connect(cfg.app_db)
    users.set_disabled(conn, 1, True, now=1000)
    conn.close()
    client.post("/api/auth/login", json={"username": "09120000000", "password": PW})
    detail = _rows(cfg, "SELECT detail FROM audit_events WHERE action='login.failure'")
    assert "disabled" in detail[0]["detail"]


def test_disabling_someone_ends_the_session_they_already_hold(data_root, tmp_path):
    """"Takes effect on their next request" (D7) — an ex-employee with an open
    tab is exactly the case this exists for."""
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client)
    assert client.get("/api/auth/me").status_code == 200

    conn = db.connect(cfg.app_db)
    users.set_disabled(conn, 1, True, now=1000)
    conn.close()
    assert client.get("/api/auth/me").status_code == 401


def test_a_revoked_session_stops_working_over_http(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client)
    conn = db.connect(cfg.app_db)
    conn.execute("UPDATE sessions SET revoked_at = 1000")
    conn.close()
    assert client.get("/api/auth/me").status_code == 401


def test_an_expired_session_stops_working_over_http(data_root, tmp_path):
    """Absolute expiry from `issued_at` (D7), reached through the HTTP layer and
    not only through the store."""
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client)
    conn = db.connect(cfg.app_db)
    conn.execute("UPDATE sessions SET issued_at = issued_at - ?",
                 (cfg.session_ttl + 1,))
    conn.close()
    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_the_row_and_clears_the_cookie_as_it_was_set(
        data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client)
    sid = client.cookies.get("inja_session")

    out = client.post("/api/auth/logout")
    assert out.status_code == 200
    raw = out.headers["set-cookie"].lower()
    assert raw.startswith("inja_session=")
    assert "path=/" in raw
    assert "; secure" in raw
    assert "max-age=0" in raw

    revoked = _rows(cfg, "SELECT revoked_at FROM sessions WHERE id = ?", sid)
    assert revoked[0]["revoked_at"] is not None


def test_logout_without_a_session_still_answers(data_root, tmp_path):
    """It behaves as it did before sessions were rows: nothing to revoke is not
    an error, and the browser is told to drop the cookie either way."""
    client, cfg = _seeded(data_root, tmp_path)
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert _rows(cfg, "SELECT id FROM audit_events WHERE action='logout'") == []


def test_logout_is_recorded_against_the_session_it_ended(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client)
    sid = client.cookies.get("inja_session")
    client.post("/api/auth/logout")
    rows = _rows(cfg, "SELECT actor, session_id, outcome FROM audit_events"
                      " WHERE action='logout'")
    assert len(rows) == 1
    assert rows[0]["actor"] == "09120000000"
    assert rows[0]["session_id"] == sid
    assert rows[0]["outcome"] == "ok"


def test_a_persian_typed_sign_in_is_recorded_against_the_canonical_number(
        data_root, tmp_path):
    """The success record files the account, not the keyboard it was typed on.

    Recording the raw text would split one person's history in two — a Persian
    sign-in under `۰۹۱۲۰۰۰۰۰۰۰` and a latin one under `09120000000` — which is
    exactly what `attempted_actor` exists to prevent on the failure side, and the
    activity report joins on this column.
    """
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client, username="۰۹۱۲۰۰۰۰۰۰۰")
    row = _rows(cfg, "SELECT actor FROM audit_events WHERE action='login.success'")
    assert [r["actor"] for r in row] == ["09120000000"]


def test_the_successful_sign_in_record_names_actor_session_outcome_and_origin(
        data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client, headers={"user-agent": "kitchen-tablet"})
    sid = client.cookies.get("inja_session")
    row = _rows(cfg, "SELECT actor, session_id, outcome, ip, user_agent, detail"
                     " FROM audit_events WHERE action='login.success'")[0]
    assert row["actor"] == "09120000000"
    assert row["session_id"] == sid
    assert row["outcome"] == "ok"
    assert row["ip"] == "testclient"
    assert row["user_agent"] == "kitchen-tablet"
    assert row["detail"] is None


def test_a_failed_sign_in_is_recorded_as_a_failure_against_who_was_tried(
        data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "۰۹۱۲۹۹۹۹۹۹۹",
                                         "password": "nope123"},
                headers={"user-agent": "kitchen-tablet"})
    row = _rows(cfg, "SELECT actor, session_id, outcome, ip, user_agent"
                     " FROM audit_events WHERE action='login.failure'")[0]
    # Canonical, so repeated guesses at one account group together in the
    # failed-sign-in report however each attempt was typed.
    assert row["actor"] == "09129999999"
    assert row["session_id"] is None
    assert row["outcome"] == "fail"
    assert row["ip"] == "testclient"
    assert row["user_agent"] == "kitchen-tablet"


def test_a_username_that_is_not_a_number_is_recorded_as_it_was_typed(
        data_root, tmp_path):
    """`normalise_phone` is a normaliser, not a validator: it answers "0cashier"
    for "cashier". Recording that would turn someone walking a namespace into a
    row that reads like a mistyped phone number."""
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "cashier", "password": "x"})
    row = _rows(cfg, "SELECT actor FROM audit_events WHERE action='login.failure'")[0]
    assert row["actor"] == "cashier"


def test_a_very_long_attempted_username_is_bounded(data_root, tmp_path):
    """Both fields are attacker-supplied, and the actor column is read by the
    failed-sign-in report; a megabyte of it per attempt is a write amplifier."""
    client, cfg = _seeded(data_root, tmp_path)
    client.post("/api/auth/login", json={"username": "x" * 5000, "password": "y"})
    row = _rows(cfg, "SELECT actor FROM audit_events WHERE action='login.failure'")[0]
    assert len(row["actor"]) == 64


def test_me_returns_the_whole_descriptor(data_root, tmp_path):
    """D47. The reader shell draws a badge from `pendingApprovals` and the header
    from `displayName`; a key missing here is `undefined` there."""
    client, _ = _seeded(data_root, tmp_path)
    _sign_in(client)
    body = client.get("/api/auth/me").json()
    assert body == {
        "username": "09120000000",
        "displayName": "تحلیل‌گر",
        "role": "editor",
        "capabilities": ["comment", "confirm", "edit", "export_pdf",
                         "manage_peers", "manage_users", "set_visibility",
                         "view", "view_audit"],
        "scopes": ["*"],
        "supervisor": None,
        "canSupervise": False,
        "pendingApprovals": 0,
    }


def test_the_descriptor_reports_the_supervisor_and_the_flag(data_root, tmp_path):
    client, cfg = _seeded(data_root, tmp_path)
    conn = db.connect(cfg.app_db)
    reader = conn.execute("SELECT id FROM roles WHERE name='reader'").fetchone()[0]
    uid = users.create(conn, username="09121111111", display_name="سحر",
                       password_hash=argon2.PasswordHasher().hash(PW),
                       role_id=reader, supervisor_id=1, can_supervise=True)
    for scope in ("dept:dining", "dept:cashier"):
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                     (uid, scope))
    conn.close()

    _sign_in(client, username="09121111111")
    body = client.get("/api/auth/me").json()
    assert body["role"] == "reader"
    assert body["displayName"] == "سحر"
    assert body["supervisor"] == "09120000000"
    assert body["canSupervise"] is True
    # Ordered, not insertion-ordered: the descriptor is compared across requests
    # by the client's cache, and a set that arrives in a different order each
    # time is a re-render for nothing.
    assert body["scopes"] == ["dept:cashier", "dept:dining"]
    assert body["capabilities"] == ["comment", "export_pdf", "view"]


def test_authenticate_names_the_reason_it_refused(data_root, tmp_path):
    from inja_ui_backend.auth import authenticate
    _, cfg = _seeded(data_root, tmp_path)
    conn = db.connect(cfg.app_db)

    user, reason = authenticate(conn, "09120000000", PW)
    assert reason == "ok" and user["username"] == "09120000000"
    assert authenticate(conn, "09120000000", "nope123") == (None, "bad_password")
    assert authenticate(conn, "09129999999", PW) == (None, "no_such_user")
    assert authenticate(conn, "", PW) == (None, "no_such_user")

    users.set_disabled(conn, 1, True, now=1000)
    assert authenticate(conn, "09120000000", PW) == (None, "disabled")
    # A disabled account with the wrong password is still a wrong password: the
    # check that costs argon2 runs first, so the two are indistinguishable in
    # time as well as in the response.
    assert authenticate(conn, "09120000000", "nope123") == (None, "bad_password")
    conn.close()


def test_a_hash_is_a_hash_and_verifies_only_its_own_password():
    from inja_ui_backend.auth import hash_password, verify_hash
    h = hash_password(PW)
    assert h != PW and h.startswith("$argon2")
    assert verify_hash(h, PW) is True
    assert verify_hash(h, "nope123") is False
    assert verify_hash("not-a-hash-at-all", PW) is False
    # What it tolerates is argon2 refusing the *data*, and nothing wider. A caller
    # passing `None` where a hash belongs is a bug in this codebase, and a bare
    # `except Exception` would answer it with a clean False — i.e. dress a
    # programming error up as a member of staff mistyping their password.
    with pytest.raises(AttributeError):
        verify_hash(None, PW)


def test_the_store_is_opened_and_migrated_at_startup(data_root, tmp_path):
    """No test seeds or migrates here: `create_app` must do it, or the first
    request touches a table that does not exist and answers 500."""
    client, cfg = _client(data_root, tmp_path)
    assert cfg.app_db.exists()
    client.cookies.set("inja_session", "not-a-real-session-id")
    assert client.get("/api/auth/me").status_code == 401
    assert _rows(cfg, "SELECT name FROM sqlite_master WHERE name='sessions'")


def test_only_two_password_checks_run_at_once(data_root, tmp_path, monkeypatch):
    """ARD §19.2: sign-in keeps a `CapacityLimiter(2)`.

    One argon2 verify is 64 MiB and ~61 ms, and this is the one unauthenticated
    endpoint in the service; on Starlette's default threadpool of 40, forty
    concurrent POSTs from anybody at all reserve ~2.5 GB on a 3.7 GB host. This is
    a memory ceiling, not a rate limit — the eight attempts below all complete.
    """
    client, _ = _seeded(data_root, tmp_path)
    live = peak = 0
    counting = threading.Lock()
    real = auth_router.authenticate

    def watched(conn, username, password):
        nonlocal live, peak
        with counting:
            live += 1
            peak = max(peak, live)
        time.sleep(0.05)        # long enough for the others to pile up behind it
        with counting:
            live -= 1
        return real(conn, username, password)

    monkeypatch.setattr(auth_router, "authenticate", watched)
    answers = []

    def attempt():
        answers.append(client.post("/api/auth/login",
                                   json={"username": "09120000000",
                                         "password": "nope123"}).status_code)

    # One event loop for every request — outside the context manager each request
    # gets a portal of its own and they cannot contend at all.
    with client:
        threads = [threading.Thread(target=attempt) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert peak == 2
    assert answers == [401] * 8


# --------------------------------------------------------------------------
# Where a request came from (D7). The address is the only thing the
# failed-sign-in report has to say who was guessing, and it is also the one
# field of the record a caller can try to write themselves.
# --------------------------------------------------------------------------

def test_a_forged_forwarded_for_from_a_direct_client_cannot_poison_the_record(
        data_root, tmp_path):
    """No proxy configured, so the header is somebody's writing and nothing more.

    An audit record a stranger can author is not evidence: it is worse than the
    honest peer address, because it names someone else.
    """
    client, cfg = _seeded(data_root, tmp_path)
    _sign_in(client, headers={"x-forwarded-for": "203.0.113.9"})
    client.post("/api/auth/login", json={"username": "09120000000",
                                         "password": "nope123"},
                headers={"x-forwarded-for": "203.0.113.9"})

    assert [r["ip"] for r in _rows(cfg, "SELECT ip FROM sessions")] == ["testclient"]
    assert [r["ip"] for r in _rows(cfg, "SELECT ip FROM audit_events ORDER BY id")] \
        == ["testclient", "testclient"]


def test_behind_one_trusted_proxy_the_address_the_proxy_saw_is_recorded(
        data_root, tmp_path):
    """Caddy appends the peer it really saw, so with one proxy the LAST entry is
    the vouched-for one and everything before it is the client's own writing."""
    client, cfg = _seeded(data_root, tmp_path, trusted_proxy_hops=1)
    _sign_in(client, headers={"x-forwarded-for": "10.9.9.9, 203.0.113.9"})
    assert [r["ip"] for r in _rows(cfg, "SELECT ip FROM sessions")] == ["203.0.113.9"]
    row = _rows(cfg, "SELECT ip FROM audit_events WHERE action='login.success'")[0]
    assert row["ip"] == "203.0.113.9"


def test_a_trusted_proxy_that_added_nothing_leaves_the_peer_recorded(
        data_root, tmp_path):
    """A chain shorter than the hop count did not come through the proxies this
    deployment has, so it cannot be read positionally — the peer stands."""
    client, cfg = _seeded(data_root, tmp_path, trusted_proxy_hops=2)
    _sign_in(client, headers={"x-forwarded-for": "203.0.113.9"})
    assert [r["ip"] for r in _rows(cfg, "SELECT ip FROM sessions")] == ["testclient"]

    other, cfg2 = _seeded(data_root, tmp_path / "b", trusted_proxy_hops=1)
    _sign_in(other)
    assert [r["ip"] for r in _rows(cfg2, "SELECT ip FROM sessions")] == ["testclient"]


# --------------------------------------------------------------------------
# The export gate. `require_export_access` was rewritten by this task, and the
# three modules that used to cover it are red until the suite is migrated —
# leaving a live authorisation gate that could be deleted outright with every
# test still green.
# --------------------------------------------------------------------------

def _with_exports(data_root, tmp_path):
    published = tmp_path / "exports"
    published.mkdir()
    (published / "cooking.html").write_text("<p>سند آشپزخانه</p>", encoding="utf-8")
    return _seeded(data_root, tmp_path, export_dir=published)


def test_the_export_gate_opens_for_a_signed_in_person(data_root, tmp_path):
    """D29: an admin session reaches the exports without a second credential."""
    client, _ = _with_exports(data_root, tmp_path)
    _sign_in(client)
    r = client.get("/exports/cooking.html")
    assert r.status_code == 200
    assert "سند آشپزخانه" in r.text


def test_the_export_gate_refuses_a_request_with_no_cookie(data_root, tmp_path):
    """No export credential is configured here, so there is nothing to type and
    the gate answers 401 rather than offering a form (D30)."""
    client, _ = _with_exports(data_root, tmp_path)
    r = client.get("/exports/cooking.html")
    assert r.status_code == 401
    assert "سند آشپزخانه" not in r.text


def test_the_export_gate_refuses_a_cookie_that_names_no_session(data_root, tmp_path):
    """Holding *a* cookie is not holding a session: the value is an opaque row id
    and the store is what decides, not the presence of the header."""
    client, _ = _with_exports(data_root, tmp_path)
    client.cookies.set("inja_session", "not-a-real-session-id")
    r = client.get("/exports/cooking.html")
    assert r.status_code == 401
    assert "سند آشپزخانه" not in r.text


def test_the_export_gate_closes_again_when_the_session_ends(data_root, tmp_path):
    """The gate asks the session store on every request, which is what makes a
    revoked or disabled account lose its way into the exports (D7)."""
    client, cfg = _with_exports(data_root, tmp_path)
    _sign_in(client)
    assert client.get("/exports/cooking.html").status_code == 200
    conn = db.connect(cfg.app_db)
    users.set_disabled(conn, 1, True, now=1000)
    conn.close()
    assert client.get("/exports/cooking.html").status_code == 401


def test_the_other_routers_still_open_for_a_signed_in_person(data_root, tmp_path):
    """The fourteen routes keep behaving exactly as they did — `require_session`
    changed what it returns, not what it lets through."""
    client, _ = _seeded(data_root, tmp_path)
    assert client.get("/api/departments").status_code == 401
    _sign_in(client)
    r = client.get("/api/departments")
    assert r.status_code == 200
    assert [d["code"] for d in r.json()]
