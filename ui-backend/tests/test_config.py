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
