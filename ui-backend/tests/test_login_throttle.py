"""Three failed sign-ins a minute, per account (spec §13's first open item).

`VERIFY_LIMITER` bounds what guessing *costs* the host and never what it
*achieves*. These tests are about the second thing: that a fourth guess inside a
minute is refused without the password being looked at, that the refusal is
recoverable, and — the one that is easy to get wrong — that a refused attempt
does not extend its own window.
"""
import argon2
import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import auth, db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for

BASE_URL = "https://testserver"   # the cookie is Secure; http:// silently drops it
PW = "sixchars"
USER = "09120000000"


def _seeded(data_root, tmp_path):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__, "app_db": tmp_path / "app.db"})
    app = create_app(cfg)
    conn = db.connect(cfg.app_db)
    db.migrate(conn)
    seed.seed(conn, editor_username=USER, editor_display_name="تحلیل‌گر",
              editor_password_hash=argon2.PasswordHasher().hash(PW))
    conn.close()
    return TestClient(app, base_url=BASE_URL), cfg


def _try(client, password, username=USER):
    return client.post("/api/auth/login",
                       json={"username": username, "password": password})


def _events(cfg, action):
    conn = db.connect(cfg.app_db)
    try:
        return conn.execute(
            "SELECT actor, at FROM audit_events WHERE action = ? ORDER BY at",
            (action,)).fetchall()
    finally:
        conn.close()


def test_the_ceiling_is_three_a_minute(data_root, tmp_path):
    """The owner's number, asserted as the number rather than as behaviour, so a
    change to it is a change somebody made on purpose."""
    assert auth.LOGIN_MAX_FAILURES == 3
    assert auth.LOGIN_WINDOW_S == 60


def test_a_fourth_wrong_password_inside_a_minute_is_refused(data_root, tmp_path):
    client, _ = _seeded(data_root, tmp_path)
    for _ in range(3):
        assert _try(client, "wrongpw").status_code == 401
    r = _try(client, "wrongpw")
    assert r.status_code == 429
    # Recoverable without support: the wait is on the response, inside the window.
    assert 1 <= int(r.headers["Retry-After"]) <= auth.LOGIN_WINDOW_S


def test_the_right_password_is_refused_too_while_the_window_holds(data_root, tmp_path):
    """A lockout that let the correct password through would stop nothing — the
    attacker's fourth guess is the one that might be right.

    It also may not answer 401: telling somebody who has just typed their own
    password correctly that it is wrong is how a real user concludes the account
    is broken and stops trying.
    """
    client, _ = _seeded(data_root, tmp_path)
    for _ in range(3):
        _try(client, "wrongpw")
    r = _try(client, PW)
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_a_throttled_attempt_does_not_extend_its_own_window(data_root, tmp_path):
    """The bug this whole design turns on.

    The counter reads `login.failure` rows in a sliding window. Were a refused
    attempt to record one, every retry would push the window forward and the
    account would never be let back in — by anybody, the owner included. So the
    refusal is recorded under a different action, and the count of real failures
    must stay at exactly the three that earned the lockout however long somebody
    hammers it.
    """
    client, cfg = _seeded(data_root, tmp_path)
    for _ in range(3):
        _try(client, "wrongpw")
    first = int(_events(cfg, "login.failure")[0][1])

    for _ in range(6):
        assert _try(client, "wrongpw").status_code == 429

    failures = _events(cfg, "login.failure")
    assert len(failures) == 3, "a throttled attempt was counted as a failure"
    assert int(failures[0][1]) == first, "the window's oldest failure moved"
    # …and the attack is still legible in the record rather than silent.
    assert len(_events(cfg, "login.throttled")) == 6


def test_the_wait_ends_when_the_oldest_failure_ages_out(data_root, tmp_path,
                                                        monkeypatch):
    """Sliding, not a fixed minute: the window is measured from the oldest failure
    still in it. Driven by moving the clock forward rather than by sleeping."""
    client, cfg = _seeded(data_root, tmp_path)
    for _ in range(3):
        _try(client, "wrongpw")
    assert _try(client, PW).status_code == 429

    # One patch, on the stdlib module itself: `auth` and `routers.auth` both do
    # `import time`, so they hold the same module object and there is no second
    # place to reach. monkeypatch puts it back.
    real = auth.time.time
    monkeypatch.setattr(auth.time, "time",
                        lambda: real() + auth.LOGIN_WINDOW_S + 1)
    assert _try(client, PW).status_code == 200


def test_one_account_being_locked_does_not_lock_another(data_root, tmp_path):
    """Keyed on the account. A shared office address must not mean one person's
    typos refuse everybody — which is the reason the key is not the IP."""
    client, cfg = _seeded(data_root, tmp_path)
    for _ in range(4):
        _try(client, "wrongpw", username="09121112233")   # an account that is not real
    # The seeded Editor, from the same client and the same address, is untouched.
    assert _try(client, PW).status_code == 200


def test_guesses_at_one_number_count_together_however_they_are_typed(data_root,
                                                                     tmp_path):
    """The key is `attempted_actor`'s canonical form, so an attacker cannot buy
    three more attempts by writing the same number a different way."""
    client, _ = _seeded(data_root, tmp_path)
    for typed in ("09120000000", "+989120000000", "989120000000"):
        assert _try(client, "wrongpw", username=typed).status_code == 401
    assert _try(client, "wrongpw", username="0912-000-0000").status_code == 429


def test_an_unknown_number_is_throttled_on_the_same_terms(data_root, tmp_path):
    """Otherwise the refusal itself is an oracle: an account that could be guessed
    at forever is one that does not exist, and D56 spends real effort making a
    miss cost exactly what a wrong password costs."""
    client, _ = _seeded(data_root, tmp_path)
    for _ in range(3):
        assert _try(client, "wrongpw", username="09129999999").status_code == 401
    assert _try(client, "wrongpw", username="09129999999").status_code == 429


@pytest.mark.parametrize("action", ["login.throttled"])
def test_the_refusal_is_recorded_against_the_account_it_protected(data_root,
                                                                 tmp_path, action):
    client, cfg = _seeded(data_root, tmp_path)
    for _ in range(4):
        _try(client, "wrongpw")
    rows = _events(cfg, action)
    assert rows and all(r[0] == USER for r in rows)
