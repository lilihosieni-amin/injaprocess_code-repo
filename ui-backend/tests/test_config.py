from pathlib import Path

import pytest
from inja_ui_backend.config import load_settings


def _valid_env(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "schemas").mkdir()
    return {
        "DATA_ROOT": str(tmp_path / "data"),
        "SCHEMA_DIR": str(tmp_path / "schemas"),
        "SESSION_SIGNING_KEY": "s3cr3t",
    }


def test_load_settings_reads_all_fields(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.data_root == (tmp_path / "data")
    assert s.session_ttl == 86400  # default one day
    assert s.static_dir is None      # not provided


def test_missing_required_var_raises_listing_it(tmp_path):
    env = _valid_env(tmp_path)
    del env["SESSION_SIGNING_KEY"]
    with pytest.raises(RuntimeError, match="SESSION_SIGNING_KEY"):
        load_settings(env)


def test_missing_data_root_dir_raises(tmp_path):
    env = _valid_env(tmp_path)
    env["DATA_ROOT"] = str(tmp_path / "nope")
    with pytest.raises(RuntimeError, match="DATA_ROOT"):
        load_settings(env)


def test_no_credential_is_read_from_the_environment(tmp_path):
    """The single-credential and UI_USERS_FILE branches are gone (D1).

    A username and hash in the environment would be a second way in that the
    session store, `disabled_at` and the activity record cannot see, so it is not
    enough that nothing reads them: `Settings` must have nowhere to put them.
    """
    env = _valid_env(tmp_path)
    env["UI_USERNAME"] = "analyst"
    env["UI_PASSWORD_HASH"] = "$argon2id$dummy"
    env["UI_USERS_FILE"] = str(tmp_path / "ui-users.json")   # not even read
    s = load_settings(env)                                   # and never required
    assert not hasattr(s, "users")
    assert not hasattr(s, "ui_username")
    assert not hasattr(s, "ui_password_hash")


def test_export_dirs_default_to_none(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.export_dir is None
    assert s.export_template_dir is None


def test_chromium_path_defaults_to_none(tmp_path):
    """Unset means "no PDF", exactly as an unset EXPORT_DIR means "no export"."""
    assert load_settings(_valid_env(tmp_path)).chromium_path is None


def test_chromium_path_read_from_env(tmp_path):
    env = _valid_env(tmp_path)
    env["CHROMIUM_PATH"] = "/usr/bin/chromium-headless-shell"
    assert load_settings(env).chromium_path == Path("/usr/bin/chromium-headless-shell")


def test_export_credential_defaults_to_none(tmp_path):
    """Unset means nobody can open an export -- never that everybody can."""
    s = load_settings(_valid_env(tmp_path))
    assert s.export_username is None
    assert s.export_password_hash is None


def test_export_credential_read_from_env(tmp_path):
    env = _valid_env(tmp_path)
    env["EXPORT_USERNAME"] = "guest"
    env["EXPORT_PASSWORD_HASH"] = "$argon2id$export-dummy"
    s = load_settings(env)
    assert s.export_username == "guest"
    assert s.export_password_hash == "$argon2id$export-dummy"


def test_export_dirs_read_from_env(tmp_path):
    env = _valid_env(tmp_path)
    env["EXPORT_DIR"] = str(tmp_path / "exports")
    env["UI_EXPORT_TEMPLATE_DIR"] = str(tmp_path / "templates")
    s = load_settings(env)
    assert s.export_dir == (tmp_path / "exports")
    assert s.export_template_dir == (tmp_path / "templates")


def test_app_db_defaults_beside_data_root_not_inside_it(tmp_path):
    """The store is operational state; inside DATA_ROOT it would land in the
    data-repo working tree and get committed."""
    s = load_settings(_valid_env(tmp_path))
    assert s.app_db == (tmp_path / "app.db")
    assert s.data_root not in s.app_db.parents


def test_app_db_read_from_env(tmp_path):
    env = _valid_env(tmp_path)
    env["APP_DB"] = str(tmp_path / "elsewhere" / "app.db")
    assert load_settings(env).app_db == (tmp_path / "elsewhere" / "app.db")


def test_app_db_inside_data_root_refuses_to_start(tmp_path):
    """`APP_DB: /data/app.db` is a natural-looking consolidation and a disaster.

    DATA_ROOT is bind-mounted read-write into `control-bot`, whose hooks block
    writes and not reads, so the store there hands the pipeline agent every argon2
    hash and every live `sessions.id` — and a session id in an `inja_session`
    cookie authenticates as that person. It is also a git working tree that is
    pushed. Prose in four documents is not enough; startup must refuse.
    """
    env = _valid_env(tmp_path)
    env["APP_DB"] = str(tmp_path / "data" / "app.db")
    with pytest.raises(RuntimeError) as exc:
        load_settings(env)
    message = str(exc.value)
    assert "APP_DB" in message and "DATA_ROOT" in message
    assert str(tmp_path / "data" / "app.db") in message   # names both paths
    assert str(tmp_path / "data") in message


def test_app_db_deeper_inside_data_root_also_refuses(tmp_path):
    """Containment, not a parent-directory equality check."""
    env = _valid_env(tmp_path)
    (tmp_path / "data" / "state").mkdir()
    env["APP_DB"] = str(tmp_path / "data" / "state" / "app.db")
    with pytest.raises(RuntimeError, match="APP_DB"):
        load_settings(env)


def test_app_db_traversing_back_into_data_root_refuses(tmp_path):
    """Resolved on both sides, so `..` cannot walk around the guard.

    `Path.parents` is pure lexical splitting: it never collapses `..`, so a path
    that leaves by one directory and re-enters DATA_ROOT by another has DATA_ROOT
    nowhere among its parents while still landing squarely inside it. Only
    resolving both sides catches this one.
    """
    env = _valid_env(tmp_path)
    (tmp_path / "state").mkdir()
    env["APP_DB"] = str(tmp_path / "state" / ".." / "data" / "app.db")
    with pytest.raises(RuntimeError, match="APP_DB"):
        load_settings(env)


def test_app_db_outside_data_root_is_accepted(tmp_path):
    """The guard must not refuse the paths the deployment actually uses."""
    env = _valid_env(tmp_path)
    env["APP_DB"] = str(tmp_path / "state" / "app.db")
    assert load_settings(env).app_db == (tmp_path / "state" / "app.db")


def test_default_app_db_survives_the_guard(tmp_path):
    """The default is DATA_ROOT's *parent*; a guard that rejected it would make
    every host run and every test unstartable."""
    assert load_settings(_valid_env(tmp_path)).app_db == (tmp_path / "app.db")


def test_blank_trusted_proxy_hops_means_unset(tmp_path):
    """`config/ui-backend.env.example` leaves settings blank on purpose, so a blank
    line must not be a bare `int('')` ValueError at startup."""
    env = _valid_env(tmp_path)
    env["TRUSTED_PROXY_HOPS"] = ""
    assert load_settings(env).trusted_proxy_hops == 0


def test_blank_session_ttl_means_unset(tmp_path):
    env = _valid_env(tmp_path)
    env["SESSION_TTL"] = ""
    assert load_settings(env).session_ttl == 86400


def test_set_trusted_proxy_hops_and_session_ttl_still_read(tmp_path):
    """Blank-is-unset must not swallow a real value."""
    env = _valid_env(tmp_path)
    env["TRUSTED_PROXY_HOPS"] = "1"
    env["SESSION_TTL"] = "3600"
    s = load_settings(env)
    assert s.trusted_proxy_hops == 1
    assert s.session_ttl == 3600
