import json

import pytest
from inja_ui_backend.config import load_settings


def _valid_env(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "schemas").mkdir()
    return {
        "DATA_ROOT": str(tmp_path / "data"),
        "SCHEMA_DIR": str(tmp_path / "schemas"),
        "UI_USERNAME": "analyst",
        "UI_PASSWORD_HASH": "$argon2id$dummy",
        "SESSION_SIGNING_KEY": "s3cr3t",
    }


def test_load_settings_reads_all_fields(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.ui_username == "analyst"
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


def test_users_file_loads_multiple(tmp_path):
    env = _valid_env(tmp_path)
    del env["UI_USERNAME"]; del env["UI_PASSWORD_HASH"]
    users = {"alice": "$argon2id$h1", "bob": "$argon2id$h2"}
    p = tmp_path / "ui-users.json"
    p.write_text(json.dumps(users))
    env["UI_USERS_FILE"] = str(p)
    s = load_settings(env)
    assert s.users == users


def test_users_file_non_dict_raises(tmp_path):
    env = _valid_env(tmp_path)
    del env["UI_USERNAME"]; del env["UI_PASSWORD_HASH"]
    p = tmp_path / "ui-users.json"
    p.write_text(json.dumps(["not", "a", "map"]))
    env["UI_USERS_FILE"] = str(p)
    with pytest.raises(RuntimeError):
        load_settings(env)


def test_users_file_empty_object_raises(tmp_path):
    env = _valid_env(tmp_path)
    del env["UI_USERNAME"]; del env["UI_PASSWORD_HASH"]
    p = tmp_path / "ui-users.json"
    p.write_text("{}")
    env["UI_USERS_FILE"] = str(p)
    with pytest.raises(RuntimeError):
        load_settings(env)


def test_single_user_env_populates_users_map(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.users == {"analyst": "$argon2id$dummy"}


def test_no_auth_source_raises(tmp_path):
    env = _valid_env(tmp_path)
    del env["UI_USERNAME"]; del env["UI_PASSWORD_HASH"]
    with pytest.raises(RuntimeError, match="UI_USERS_FILE|UI_USERNAME"):
        load_settings(env)
