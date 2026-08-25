import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from telegram.ext import ConversationHandler
from upload_bot import handlers
from upload_bot.config import Config
from upload_bot.session import VoiceUpload


def _update(events=None, duration=275, file_size=3_355_443, chat_id=42, user_id=7):
    """`events` is a shared log so a test can see what happened in which order."""
    log = [] if events is None else events

    async def download_as_bytearray():
        log.append("download")
        return bytearray(b"audio")

    async def get_file():
        log.append("get_file")
        return SimpleNamespace(download_as_bytearray=download_as_bytearray)

    voice = SimpleNamespace(get_file=get_file, duration=duration, file_size=file_size)
    message = SimpleNamespace(voice=voice, audio=None, reply_text=AsyncMock())
    return SimpleNamespace(message=message,
                           effective_user=SimpleNamespace(id=user_id),
                           effective_chat=SimpleNamespace(id=chat_id))


def _ctx(events=None, send_message=None):
    log = [] if events is None else events
    ack = SimpleNamespace(edit_text=AsyncMock())

    async def default_send(chat_id, text, **kw):
        log.append("ack")
        return ack

    return SimpleNamespace(user_data={"voice": VoiceUpload(date="1405-04-19",
                                                           departments=["cooking"])},
                           bot=SimpleNamespace(
                               send_message=AsyncMock(side_effect=send_message or default_send)),
                           application=SimpleNamespace(create_task=lambda c: c),
                           ack=ack)


def _run(data_root, monkeypatch, ctx=None, **kw):
    monkeypatch.setattr(handlers, "schedule_transcription", AsyncMock(return_value="task"))
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    update, ctx = _update(**kw), ctx or _ctx()
    asyncio.run(handlers.build_handlers(cfg)["v_file"](update, ctx))
    return update, ctx


def _acked(ctx):
    return ctx.bot.send_message.await_args.args[1]


def _edited(ctx):
    return ctx.ack.edit_text.await_args.args[0]


def _said(update):
    return [c.args[0] for c in update.message.reply_text.await_args_list]


def test_v_file_saves_then_schedules_transcription(data_root, monkeypatch):
    scheduled = []

    async def fake_schedule(*a):
        scheduled.append(a)
        return "task"                     # the real schedule() returns the background task

    monkeypatch.setattr(handlers, "schedule_transcription", fake_schedule)
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    v_file = handlers.build_handlers(cfg)["v_file"]
    update, ctx = _update(), _ctx()

    assert asyncio.run(v_file(update, ctx)) == ConversationHandler.END

    # The audio is finalized and the user is told, exactly as before.
    assert (data_root / "meetings/audio/cooking-1405-04-19.ogg").read_bytes() == b"audio"
    assert "ذخیره شد" in _edited(ctx)
    # …but the Start line no longer rides on it: transcription is still running, and
    # starting Bot 2 now would transcribe the same recording a second time.
    assert not any("Start /process-voice" in said for said in _said(update))
    # …and transcription was scheduled for that basename and chat.
    assert scheduled == [(ctx, data_root, "cooking-1405-04-19", 42)]


def test_v_file_gives_the_start_line_when_no_transcription_is_coming(data_root, monkeypatch):
    """VERTEX_PROJECT unset (D17): nothing else will ever speak, so this reply must."""
    monkeypatch.setattr(handlers, "schedule_transcription", AsyncMock(return_value=None))
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    v_file = handlers.build_handlers(cfg)["v_file"]
    update, ctx = _update(), _ctx()

    assert asyncio.run(v_file(update, ctx)) == ConversationHandler.END
    assert "ذخیره شد" in _edited(ctx)
    assert "`Start /process-voice cooking-1405-04-19`" in _said(update)[-1]
    assert update.message.reply_text.await_args.kwargs["parse_mode"] == "Markdown"


def test_v_file_still_saves_when_scheduling_fails(data_root, monkeypatch):
    monkeypatch.setattr(handlers, "schedule_transcription",
                        AsyncMock(side_effect=RuntimeError("telegram down")))
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    v_file = handlers.build_handlers(cfg)["v_file"]
    update, ctx = _update(), _ctx()

    assert asyncio.run(v_file(update, ctx)) == ConversationHandler.END
    assert (data_root / "meetings/audio/cooking-1405-04-19.ogg").exists()
    # A saved file the user was never told about is not a successful upload.
    assert "ذخیره شد" in _edited(ctx)


def test_acknowledgement_is_sent_before_the_download_starts(data_root, monkeypatch):
    """The whole point: a 2 GB fetch through the local Bot API must not be silent."""
    monkeypatch.setattr(handlers, "schedule_transcription", AsyncMock(return_value="task"))
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    v_file = handlers.build_handlers(cfg)["v_file"]
    events = []
    update, ctx = _update(events), _ctx(events)

    asyncio.run(v_file(update, ctx))

    assert events[:3] == ["ack", "get_file", "download"]


def test_acknowledgement_reports_duration_and_size_in_persian_digits(data_root, monkeypatch):
    _, ctx = _run(data_root, monkeypatch, duration=275, file_size=3_355_443)

    text = _acked(ctx)
    assert text == "● صوت ۴:۳۵ (۳.۲ مگابایت) دریافت شد — در حال ذخیره‌سازی…"
    assert not any(ch.isascii() and ch.isdigit() for ch in text)


def test_an_hour_long_meeting_is_acknowledged_as_hours(data_root, monkeypatch):
    _, ctx = _run(data_root, monkeypatch, duration=3725, file_size=None)

    assert "۱:۰۲:۰۵" in _acked(ctx)


@pytest.mark.parametrize("duration, file_size, expected", [
    (None, 3_355_443, "● صوت (۳.۲ مگابایت) دریافت شد — در حال ذخیره‌سازی…"),
    (275, None, "● صوت ۴:۳۵ دریافت شد — در حال ذخیره‌سازی…"),
    (None, None, "● صوت دریافت شد — در حال ذخیره‌سازی…"),
])
def test_acknowledgement_omits_what_telegram_did_not_send(data_root, monkeypatch,
                                                          duration, file_size, expected):
    """Both fields are optional in the API; «None مگابایت» is worse than saying nothing."""
    _, ctx = _run(data_root, monkeypatch, duration=duration, file_size=file_size)

    assert _acked(ctx) == expected


def test_the_acknowledgement_becomes_the_saved_confirmation(data_root, monkeypatch):
    """One message that evolves — not an acknowledgement followed by a second reply."""
    update, ctx = _run(data_root, monkeypatch)

    assert _edited(ctx) == ("ذخیره شد ✅\n"
                            "رونویسی خودکار شروع شد؛ چند دقیقه طول می‌کشد و همین‌جا خبر می‌دهم.")
    assert _said(update) == []


def test_a_failed_acknowledgement_does_not_cost_the_recording(data_root, monkeypatch):
    """The progress cosmetics are optional; the meeting audio is not."""
    async def boom(*a, **kw):
        raise RuntimeError("telegram down")

    update, _ = _run(data_root, monkeypatch, ctx=_ctx(send_message=boom))

    assert (data_root / "meetings/audio/cooking-1405-04-19.ogg").read_bytes() == b"audio"
    assert "ذخیره شد" in _said(update)[0]


def test_a_failed_edit_does_not_cost_the_recording(data_root, monkeypatch):
    ctx = _ctx()
    ctx.ack.edit_text = AsyncMock(side_effect=RuntimeError("message to edit not found"))

    _run(data_root, monkeypatch, ctx=ctx)

    assert (data_root / "meetings/audio/cooking-1405-04-19.ogg").read_bytes() == b"audio"
