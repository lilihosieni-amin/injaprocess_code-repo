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
