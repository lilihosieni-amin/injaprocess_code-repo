from telegram.ext import Application
from upload_bot.app import build_application
from upload_bot.config import Config


def test_build_application_returns_application(tmp_path):
    cfg = Config(bot_token="123:abc", allowed_user_ids=frozenset({1}), data_root=tmp_path,
                 api_base_url=None)
    app = build_application(cfg)
    assert isinstance(app, Application)


def test_build_application_uses_local_api_base_url(tmp_path):
    cfg = Config(bot_token="123:abc", allowed_user_ids=frozenset({1}), data_root=tmp_path,
                 api_base_url="http://telegram-bot-api:8081")
    app = build_application(cfg)          # must not raise; base_url wired
    assert isinstance(app, Application)
