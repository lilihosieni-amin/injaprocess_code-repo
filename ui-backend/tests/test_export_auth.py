"""The shared export credential and its session.

The point of this module is separation: an export session must be structurally
incapable of reaching the admin panel, and the admin session must not be
mistakable for an export one. Both directions are tested explicitly.
"""
import contextlib
import logging
import re
from types import SimpleNamespace

import argon2
import pytest
from fastapi import HTTPException
from inja_ui_backend import auth, export_auth
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for
from starlette.requests import Request

EXPORT_PASSWORD = "throwaway-export-pw"


def _cfg(data_root, password=EXPORT_PASSWORD):
    """A config carrying an export credential (hash generated here, never real)."""
    cfg = cfg_for(data_root)
    return cfg.__class__(**{
        **cfg.__dict__,
        "export_username": "guest",
        "export_password_hash": argon2.PasswordHasher().hash(password),
    })


def _cfg_without_credential(data_root):
    """cfg_for sets no EXPORT_* env, so both fields are None."""
    return cfg_for(data_root)


def _request(cfg, **cookies):
    header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return Request({
        "type": "http",
        "headers": [(b"cookie", header.encode())] if header else [],
        "app": SimpleNamespace(state=SimpleNamespace(cfg=cfg)),
    })


# --- authenticate -----------------------------------------------------------

def test_correct_credential_authenticates(data_root):
    assert export_auth.authenticate(_cfg(data_root), "guest", EXPORT_PASSWORD) is True


def test_wrong_password_never_authenticates(data_root):
    assert export_auth.authenticate(_cfg(data_root), "guest", "nope") is False


def test_wrong_username_never_authenticates(data_root):
    assert export_auth.authenticate(_cfg(data_root), "analyst", EXPORT_PASSWORD) is False


def test_unset_credential_never_authenticates(data_root):
    """D30: a misconfiguration closes the gate, it never opens it."""
    cfg = _cfg_without_credential(data_root)
    assert cfg.export_username is None and cfg.export_password_hash is None
    assert export_auth.authenticate(cfg, "guest", EXPORT_PASSWORD) is False
    assert export_auth.authenticate(cfg, "", "") is False


# --- the two sessions cannot be confused for one another --------------------

def test_export_token_is_rejected_by_the_admin_session(data_root):
    cfg = _cfg(data_root)
    assert auth.read_cookie(cfg, export_auth.issue_cookie(cfg)) is None


def test_admin_token_is_rejected_by_the_export_session(data_root):
    cfg = _cfg(data_root)
    assert export_auth.read_cookie(cfg, auth.issue_cookie(cfg, "analyst")) is False


def test_the_two_cookies_have_different_names(data_root):
    assert export_auth.EXPORT_COOKIE != auth.COOKIE_NAME


# --- the credential stays out of the admin credential store -----------------

def test_export_credential_is_absent_from_the_users_map(data_root):
    cfg = _cfg(data_root)
    assert "guest" not in cfg.users
    assert cfg.export_password_hash not in cfg.users.values()


def test_admin_authenticate_rejects_the_export_credential(data_root):
    """Neither cfg.users nor the single-user env fallback may accept it."""
    cfg = _cfg(data_root)
    assert auth.authenticate(cfg, "guest", EXPORT_PASSWORD) is False
    assert cfg.ui_username != cfg.export_username
    assert cfg.ui_password_hash != cfg.export_password_hash


# --- the export session cookie ----------------------------------------------

def test_issued_cookie_round_trips(data_root):
    cfg = _cfg(data_root)
    assert export_auth.read_cookie(cfg, export_auth.issue_cookie(cfg)) is True


def test_tampered_cookie_rejected(data_root):
    assert export_auth.read_cookie(_cfg(data_root), "forged-not-a-valid-signed-token") is False


def test_export_session_honours_the_ttl(data_root):
    cfg = _cfg(data_root)
    expired = cfg.__class__(**{**cfg.__dict__, "session_ttl": -1})
    assert export_auth.read_cookie(expired, export_auth.issue_cookie(expired)) is False


def test_cookie_is_no_way_in_when_the_credential_is_unset(data_root):
    """D30: without a configured credential, nothing authenticates -- not even a
    correctly signed token."""
    cfg = _cfg_without_credential(data_root)
    assert export_auth.read_cookie(cfg, export_auth.issue_cookie(cfg)) is False


# --- require_export_access ---------------------------------------------------

def test_export_session_grants_access(data_root):
    cfg = _cfg(data_root)
    req = _request(cfg, **{export_auth.EXPORT_COOKIE: export_auth.issue_cookie(cfg)})
    export_auth.require_export_access(req)  # does not raise


def test_admin_session_grants_access(data_root):
    """D29: an admin already sees everything."""
    cfg = _cfg(data_root)
    req = _request(cfg, **{auth.COOKIE_NAME: auth.issue_cookie(cfg, "analyst")})
    export_auth.require_export_access(req)  # does not raise


def test_an_admin_session_grants_access_with_no_export_credential(data_root):
    """D29 ∩ D30: the gate being shut for readers must not shut out the admin.

    The two decisions meet in one branch and nothing else covers it. `configured()`
    appears twice in this module — in `authenticate` and in `read_cookie` — and the
    obvious "harden it" edit is to hoist that check to the top of
    `require_export_access`, which reads as strictly safer and would silently
    revoke the admin's access with a green suite.

    It is the branch that matters first: the code ships before anyone sets
    `EXPORT_*`, so an unset credential is very likely the first production state of
    this feature, and in it the admin's own "let me look at what I just generated"
    is the only way anything under /exports opens at all.
    """
    cfg = _cfg_without_credential(data_root)
    req = _request(cfg, **{auth.COOKIE_NAME: auth.issue_cookie(cfg, "analyst")})
    export_auth.require_export_access(req)  # does not raise


def test_no_session_is_401(data_root):
    with pytest.raises(HTTPException) as e:
        export_auth.require_export_access(_request(_cfg(data_root)))
    assert e.value.status_code == 401


def test_forged_cookies_are_401(data_root):
    cfg = _cfg(data_root)
    req = _request(cfg, **{export_auth.EXPORT_COOKIE: "forged", auth.COOKIE_NAME: "forged"})
    with pytest.raises(HTTPException) as e:
        export_auth.require_export_access(req)
    assert e.value.status_code == 401


def test_unset_credential_is_401_even_with_a_signed_cookie(data_root):
    cfg = _cfg_without_credential(data_root)
    req = _request(cfg, **{export_auth.EXPORT_COOKIE: export_auth.issue_cookie(cfg)})
    with pytest.raises(HTTPException) as e:
        export_auth.require_export_access(req)
    assert e.value.status_code == 401


# --- what the operator is told at startup ------------------------------------

def _app_lines(caplog, level):
    return [r.getMessage() for r in caplog.records
            if r.name == "inja_ui_backend.app" and r.levelno == level]


def test_a_half_configured_credential_warns_at_startup(data_root, caplog):
    """`EXPORT_PASSWORD_HAS=` (one keystroke) closes the gate to everyone and looks
    exactly like "the feature is off on purpose".

    It fails safe, which is right, but not *visibly*, and this is the first deploy
    where anyone types these two variables by hand. The warning names which half
    arrived, and neither the password hash nor the username's value is a thing the
    line is allowed to leak beyond the name of the setting.
    """
    cfg = _cfg(data_root)
    both = (cfg.export_username, cfg.export_password_hash)
    only_username = cfg.__class__(**{**cfg.__dict__, "export_password_hash": None})
    only_hash = cfg.__class__(**{**cfg.__dict__, "export_username": None})
    for broken, present, absent in ((only_username, "EXPORT_USERNAME", "EXPORT_PASSWORD_HASH"),
                                    (only_hash, "EXPORT_PASSWORD_HASH", "EXPORT_USERNAME")):
        caplog.clear()
        with caplog.at_level(logging.INFO):
            create_app(broken)
        warnings = _app_lines(caplog, logging.WARNING)
        assert len(warnings) == 1, warnings
        assert present in warnings[0] and absent in warnings[0]
        assert both[1] not in caplog.text     # the hash is never in a log line
        # …and the gate really is shut, which is what the warning is about
        assert export_auth.configured(broken) is False


def test_a_configured_credential_says_the_gate_is_open(data_root, caplog):
    cfg = _cfg(data_root)
    with caplog.at_level(logging.INFO):
        create_app(cfg)
    infos = _app_lines(caplog, logging.INFO)
    assert len(infos) == 1, infos
    assert "export gate" in infos[0] and "configured" in infos[0]
    assert _app_lines(caplog, logging.WARNING) == []
    assert cfg.export_password_hash not in caplog.text


def test_no_credential_at_all_says_the_gate_is_closed(data_root, caplog):
    """The intended default, and it must be as legible as the broken one."""
    cfg = _cfg_without_credential(data_root)
    with caplog.at_level(logging.INFO):
        create_app(cfg)
    infos = _app_lines(caplog, logging.INFO)
    assert len(infos) == 1, infos
    assert "export gate" in infos[0] and "401" in infos[0]
    assert _app_lines(caplog, logging.WARNING) == []


# --- …and whether it can reach the operator at all ----------------------------
#
# The three tests above pass through `caplog`, which installs its own root
# handler and lowers the root level — so they pin the *message*, and cannot see
# whether the message ever leaves the process. It does not, by default: uvicorn's
# LOGGING_CONFIG configures the `uvicorn*` loggers only and leaves root with no
# handlers, so every `inja_ui_backend.*` record falls through to
# `logging.lastResort` (a WARNING-level stderr handler with no formatter). The
# real evidence for these two is the out-of-process uvicorn run in
# docs/runbooks/02-secrets-and-auth.md's commit; these pin the mechanism.

@contextlib.contextmanager
def _bare_root_logger(*handlers):
    """Root as uvicorn really leaves it, for the body of the `with`.

    A fixture cannot do this: pytest's logging plugin re-adds its own
    `LogCaptureHandler` to root at the *start of the call phase*, i.e. after
    fixture setup has finished, so anything stripped in a fixture is back before
    the first statement of the test runs.
    """
    root = logging.getLogger()
    saved, saved_level = root.handlers[:], root.level
    root.handlers[:] = list(handlers)
    root.setLevel(logging.WARNING)
    try:
        yield root
    finally:
        for h in root.handlers:
            if h not in saved and h not in handlers:
                h.close()
        root.handlers[:] = saved
        root.setLevel(saved_level)


def test_a_bare_root_logger_gets_a_dated_handler(data_root):
    """Without this, the startup INFO line is dropped outright and the
    `export login failed` WARNING prints bare — no date to correlate it with."""
    with _bare_root_logger() as root:
        create_app(_cfg(data_root))
        assert len(root.handlers) == 1, root.handlers
        assert root.getEffectiveLevel() <= logging.INFO
        record = logging.LogRecord("inja_ui_backend.app", logging.INFO,
                                   __file__, 1, "export gate: open", None, None)
        line = root.handlers[0].format(record)
    assert re.match(
        r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} "
        r"INFO inja_ui_backend\.app: export gate: open$", line), line


def test_a_root_logger_someone_else_configured_is_left_alone(data_root):
    """A host with its own `--log-config` — and pytest, which is why the three
    caplog tests above still see what they expect — must win."""
    existing = logging.NullHandler()
    with _bare_root_logger(existing) as root:
        root.setLevel(logging.ERROR)
        create_app(_cfg(data_root))
        handlers, level = root.handlers[:], root.level
    assert handlers == [existing]
    assert level == logging.ERROR
