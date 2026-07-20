import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from telegram import Update
from telegram.error import TimedOut
from telegram.ext import Application
from upload_bot.app import _on_error, build_application
from upload_bot.config import Config


def test_build_application_returns_application(tmp_path):
    cfg = Config(bot_token="123:abc", allowed_user_ids=frozenset({1}), data_root=tmp_path,
                 api_base_url=None)
    app = build_application(cfg)
    assert isinstance(app, Application)


def test_build_application_registers_error_handler(tmp_path):
    cfg = Config(bot_token="123:abc", allowed_user_ids=frozenset({1}), data_root=tmp_path,
                 api_base_url=None)
    app = build_application(cfg)
    assert app.error_handlers  # a handler exists, so failures no longer go unreported


def test_on_error_notifies_user():
    update = Update.de_json(
        {"update_id": 1,
         "message": {"message_id": 1, "date": 0, "chat": {"id": 42, "type": "private"}}},
        bot=None)
    ctx = SimpleNamespace(error=TimedOut(), bot=SimpleNamespace(send_message=AsyncMock()))
    asyncio.run(_on_error(update, ctx))
    ctx.bot.send_message.assert_awaited_once()
    assert ctx.bot.send_message.await_args.args[0] == 42


def test_on_error_without_chat_is_silent():
    ctx = SimpleNamespace(error=RuntimeError("boom"), bot=SimpleNamespace(send_message=AsyncMock()))
    asyncio.run(_on_error("not-an-update", ctx))   # non-Update → nothing to reply to
    ctx.bot.send_message.assert_not_awaited()


def test_build_application_uses_local_api_base_url(tmp_path):
    cfg = Config(bot_token="123:abc", allowed_user_ids=frozenset({1}), data_root=tmp_path,
                 api_base_url="http://telegram-bot-api:8081")
    app = build_application(cfg)          # must not raise; base_url wired
    assert isinstance(app, Application)
