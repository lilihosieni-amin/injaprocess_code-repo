import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for

#: Every client here signs in over `https://`, not the `http://testserver` default.
#:
#: `TestClient` drives a real `http.cookiejar`, and its policy's `return_ok_secure`
#: refuses to *send* a `Secure` cookie on a request whose scheme is not secure —
#: measured on the installed httpx 0.28.1: over `http://` the jar still stores the
#: cookie (`dict(client.cookies)` shows it) but the server sees an empty
#: `request.cookies`; over `https://` it sees the cookie. So an `http://` base URL
#: would make every authenticated request here a silent 401.
#:
#: The base URL is the honest fix rather than the assertion: `deploy/Caddyfile`
#: publishes 443 and nothing else, so `https` is the scheme these requests really
#: arrive on, and a jar that behaves like a browser is the whole value of this
#: client.
BASE_URL = "https://testserver"


def _client(data_root, password="pw"):
    cfg = cfg_for(data_root)
    # replace the dummy hash with a real argon2 hash of `password`
    real = argon2.PasswordHasher().hash(password)
    cfg = cfg.__class__(**{**cfg.__dict__, "ui_password_hash": real,
                           "ui_username": "analyst", "users": {"analyst": real}})
    return TestClient(create_app(cfg), base_url=BASE_URL)


def _multi_client(data_root):
    cfg = cfg_for(data_root)
    ph = argon2.PasswordHasher()
    users = {"alice": ph.hash("apw"), "bob": ph.hash("bpw")}
    cfg = cfg.__class__(**{**cfg.__dict__, "users": users,
                           "ui_username": "", "ui_password_hash": ""})
    return TestClient(create_app(cfg), base_url=BASE_URL)


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


def test_the_session_cookie_is_secure(data_root):
    """The admin session must never be transmitted in cleartext.

    `deploy/Caddyfile` publishes 443 and nothing else, so there is no plain-HTTP
    path to production today — but that is one config edit away from not being
    true, and `Secure` is the attribute that makes the browser refuse rather than
    the deployment. Asserted alongside the flags it travels with, so a future edit
    to this `set_cookie` cannot drop one of them unnoticed.
    """
    c = _client(data_root)
    r = c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    raw = r.headers["set-cookie"].lower()
    assert raw.startswith("inja_session=")
    assert "; secure" in raw
    assert "; httponly" in raw
    assert "samesite=lax" in raw
    assert "path=/" in raw


def test_logout_really_clears_the_session(data_root):
    """A `delete_cookie` that does not match how the cookie was set leaves the
    browser holding it.

    Verified in the installed starlette 1.3.1: `delete_cookie(key, path, domain,
    secure, httponly, samesite)` is a thin wrapper that forwards those straight to
    `set_cookie` with `max_age=0, expires=0`, so every attribute it does not
    receive is silently re-sent as the *default* — which for `secure` is False.
    The identity a user agent matches on is name/domain/path (RFC 6265 §5.3), so
    `path` is what strictly must agree; `secure` is asserted too because under RFC
    6265bis's "leave secure cookies alone" rule a non-secure Set-Cookie arriving
    over an insecure channel may not overwrite a secure one, and because a delete
    that mirrors the set is the only version that stays obviously correct.

    Driven through a real cookie jar, not just the header, so the assertion is
    that the session is actually gone.
    """
    c = _client(data_root)
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    assert c.get("/api/auth/me").status_code == 200

    out = c.post("/api/auth/logout")
    assert out.status_code == 200
    raw = out.headers["set-cookie"].lower()
    assert raw.startswith("inja_session=")
    assert "path=/" in raw
    assert "; secure" in raw
    assert "max-age=0" in raw
    assert c.get("/api/auth/me").status_code == 401


def test_hash_is_not_plaintext(data_root):
    cfg = cfg_for(data_root)
    assert cfg.ui_password_hash != "pw"


def test_tampered_cookie_rejected(data_root):
    c = _client(data_root)
    c.cookies.set("inja_session", "forged-not-a-valid-signed-token")
    assert c.get("/api/auth/me").status_code == 401


def test_multiple_users_can_log_in(data_root):
    assert _multi_client(data_root).post(
        "/api/auth/login", json={"username": "bob", "password": "bpw"}).status_code == 200
    assert _multi_client(data_root).post(
        "/api/auth/login", json={"username": "alice", "password": "apw"}).status_code == 200


def test_multi_user_mode_rejects_blank_and_unknown(data_root):
    c = _multi_client(data_root)
    assert c.post("/api/auth/login", json={"username": "", "password": ""}).status_code == 401
    assert c.post("/api/auth/login", json={"username": "", "password": "apw"}).status_code == 401
    assert c.post("/api/auth/login", json={"username": "root", "password": "apw"}).status_code == 401


def test_multi_unknown_user_or_wrong_password_401(data_root):
    c = _multi_client(data_root)
    assert c.post("/api/auth/login", json={"username": "bob", "password": "apw"}).status_code == 401
    assert c.post("/api/auth/login", json={"username": "carol", "password": "x"}).status_code == 401
