import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from telegram.ext import ConversationHandler
from upload_bot import handlers
from upload_bot.config import Config
from upload_bot.session import VoiceUpload


def _update(chat_id=42, user_id=7):
    tg_file = SimpleNamespace(download_as_bytearray=AsyncMock(return_value=bytearray(b"audio")))
    voice = SimpleNamespace(get_file=AsyncMock(return_value=tg_file))
    message = SimpleNamespace(voice=voice, audio=None, reply_text=AsyncMock())
    return SimpleNamespace(message=message,
                           effective_user=SimpleNamespace(id=user_id),
                           effective_chat=SimpleNamespace(id=chat_id))


def _ctx():
    return SimpleNamespace(user_data={"voice": VoiceUpload(date="1405-04-19",
                                                           departments=["cooking"])},
                           bot=SimpleNamespace(send_message=AsyncMock()),
                           application=SimpleNamespace(create_task=lambda c: c))


def test_v_file_saves_then_schedules_transcription(data_root, monkeypatch):
    scheduled = []
    monkeypatch.setattr(handlers, "schedule_transcription",
                        AsyncMock(side_effect=lambda *a: scheduled.append(a)))
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    v_file = handlers.build_handlers(cfg)["v_file"]
    update, ctx = _update(), _ctx()

    assert asyncio.run(v_file(update, ctx)) == ConversationHandler.END

    # The audio is finalized and the user is told, exactly as before.
    assert (data_root / "meetings/audio/cooking-1405-04-19.ogg").read_bytes() == b"audio"
    assert "ذخیره شد" in update.message.reply_text.await_args.args[0]
    # …and transcription was scheduled for that basename and chat.
    assert scheduled == [(ctx, data_root, "cooking-1405-04-19", 42)]


def test_v_file_still_saves_when_scheduling_fails(data_root, monkeypatch):
    monkeypatch.setattr(handlers, "schedule_transcription",
                        AsyncMock(side_effect=RuntimeError("telegram down")))
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    v_file = handlers.build_handlers(cfg)["v_file"]
    update, ctx = _update(), _ctx()

    assert asyncio.run(v_file(update, ctx)) == ConversationHandler.END
    assert (data_root / "meetings/audio/cooking-1405-04-19.ogg").exists()
