import pytest
from upload_bot.config import Config


def test_from_env_reads_all_fields(data_root):
    env = {"TELEGRAM_BOT_TOKEN": "123:abc", "ALLOWED_USER_IDS": "42, 99",
           "DATA_ROOT": str(data_root), "TELEGRAM_API_BASE_URL": "http://x:8081"}
    cfg = Config.from_env(env)
    assert cfg.bot_token == "123:abc"
    assert cfg.allowed_user_ids == frozenset({42, 99})
    assert str(cfg.data_root) == str(data_root)
    assert cfg.api_base_url == "http://x:8081"


def test_singular_back_compat(data_root):
    cfg = Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "ALLOWED_USER_ID": "1",
                           "DATA_ROOT": str(data_root)})
    assert cfg.allowed_user_ids == frozenset({1})


def test_api_base_url_optional(data_root):
    cfg = Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "ALLOWED_USER_IDS": "1",
                           "DATA_ROOT": str(data_root)})
    assert cfg.api_base_url is None
    assert cfg.proxy_url is None


def test_proxy_url_from_env(data_root):
    cfg = Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "ALLOWED_USER_IDS": "1",
                           "DATA_ROOT": str(data_root),
                           "TELEGRAM_PROXY": "socks5://127.0.0.1:2080"})
    assert cfg.proxy_url == "socks5://127.0.0.1:2080"


def test_missing_allowlist_raises(data_root):
    with pytest.raises(SystemExit):
        Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "DATA_ROOT": str(data_root)})
