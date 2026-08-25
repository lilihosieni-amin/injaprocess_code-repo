"""Automatic transcription of an uploaded voice (design 2026-08-25, D13-D17).

Runs the engine's `transcribe` CLI as a subprocess after the audio is finalized,
writes the RAW transcript, and edits one Telegram message as it goes. The
pipeline promotes raw to the approved transcript after its verbatim gate — this
module deliberately never writes `meetings/transcripts/{basename}.txt`.
"""
import asyncio
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Indirection so the tests can substitute a fake process.
_exec = asyncio.create_subprocess_exec

# One transcription at a time: the server has 2 CPUs and one Vertex quota, and
# two 70-minute meetings encoding at once degrade both plus the bot's own loop.
_LOCK = asyncio.Lock()

TICK = 8               # seconds between progress edits; well under Telegram's edit limits
TIMEOUT = 30 * 60      # watchdog: a run past this is hung, not slow
READER_GRACE = 5       # how long stderr may keep draining after the CLI is gone

# The line the user copies into the control bot. It rides on the LAST word about a
# recording — never on the «ذخیره شد» reply, which lands minutes before this
# transcription finishes and would have Bot 2 re-encoding and re-transcribing the
# same audio alongside us.
START = ("برای شروع پردازش این را در ربات کنترل بفرستید:\n"
         "`Start /process-voice {base}`")

QUEUED = "⏳ در صف رونویسی…"
RUNNING = "⏳ در حال {stage} — {elapsed} گذشته"
DONE = "✅ رونویسی آماده شد\n" + START
# Failure carries it too: the pipeline transcribing the recording itself is exactly
# the recovery path, so this is the one message that must not strand the user.
FAILED = ("⚠️ رونویسی خودکار انجام نشد؛ صوت ذخیره شده و خط لوله خودش رونویسی می‌کند.\n"
          "{detail}\n" + START)
UNAVAILABLE = ("رونویسی خودکار در دسترس نیست؛ خط لوله خودش رونویسی می‌کند.\n" + START)

# Telegram rejects a whole message whose Markdown does not parse, and {detail} is the
# CLI's own stderr — one stray underscore in a Vertex error would swallow the Start
# line along with it.
_MD_UNSAFE = str.maketrans({c: " " for c in "*_`[\\"})

STAGES = {"transcoding": "فشرده‌سازی صدا",
          "uploading": "بارگذاری فایل",
          "transcribing": "رونویسی"}

_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def raw_path(root, basename):
    return Path(root) / "meetings" / "transcripts" / "raw" / f"{basename}.txt"


def fa_elapsed(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}".translate(_FA)


def fa_stage(stage):
    """«رونویسی ۳/۶» — the engine's breadcrumb in Persian, counter and all.

    The chunked transcriber reports `transcribing 3/6`; the name is translated and the
    counter kept, because on a long meeting it is the only sign of movement. Anything
    the map does not know is shown exactly as it arrived.
    """
    name, _, counter = stage.partition(" ")
    label = STAGES.get(name)
    if label is None:
        return stage
    return f"{label} {counter.translate(_FA)}" if counter else label


async def _edit(message, text, parse_mode=None):
    try:
        await message.edit_text(text, parse_mode=parse_mode)
    except Exception:                     # noqa: BLE001 - progress is never worth failing over
        logger.debug("progress edit failed", exc_info=True)


async def _read_stderr(stream, state, tail):
    async for raw in stream:
        line = raw.decode("utf-8", "replace").strip()
        if line.startswith("stage: "):
            state["stage"] = line[len("stage: "):]
        elif line:
            tail.append(line)
            del tail[:-3]                 # keep the last few lines, not the whole log


async def _fail(message, basename, detail):
    """Both failure paths, so the scrub and the Start line cannot drift apart."""
    await _edit(message, FAILED.format(detail=detail.translate(_MD_UNSAFE)[:300].strip()
                                       or "خطای نامشخص", base=basename),
                parse_mode="Markdown")


async def _ticker(message, state, started):
    while True:
        await asyncio.sleep(TICK)
        await _edit(message, RUNNING.format(
            stage=fa_stage(state["stage"]),
            elapsed=fa_elapsed(time.monotonic() - started)))


async def run(message, root, basename):
    """Transcribe one recording. Returns True on success.

    Never raises — except CancelledError, which propagates when the bot shuts down.
    """
    async with _LOCK:
        state, tail = {"stage": "transcoding"}, []
        started = time.monotonic()
        out = raw_path(root, basename)
        try:
            proc = await _exec("transcribe", "--out", str(out), basename,
                               env={**os.environ, "DATA_ROOT": str(root)},
                               stdout=asyncio.subprocess.DEVNULL,
                               stderr=asyncio.subprocess.PIPE)
        except Exception as e:            # noqa: BLE001 - e.g. the CLI is not on PATH
            await _fail(message, basename, str(e))
            return False

        reader = asyncio.create_task(_read_stderr(proc.stderr, state, tail))
        ticker = asyncio.create_task(_ticker(message, state, started))
        try:
            code = await asyncio.wait_for(proc.wait(), timeout=TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            code, tail = 1, [f"از {str(TIMEOUT // 60).translate(_FA)} دقیقه گذشت و پاسخی نیامد"]
        finally:
            ticker.cancel()
            # A killed CLI can leave ffmpeg holding stderr, and then that pipe never reaches
            # EOF — awaiting the reader (or proc.wait()) would block here forever with _LOCK
            # held, and no later upload would ever be transcribed.
            # ponytail: the orphaned grandchild is left to exit on its own; use a process
            # group (start_new_session + killpg) if a stuck ffmpeg ever costs real CPU.
            await asyncio.gather(asyncio.wait_for(reader, READER_GRACE), ticker,
                                 return_exceptions=True)

        if code == 0:
            await _edit(message, DONE.format(base=basename), parse_mode="Markdown")
            return True
        await _fail(message, basename, " ".join(tail))
        return False


async def schedule(ctx, root, basename, chat_id):
    """Start transcription in the background (D13). No-op if Vertex is unconfigured (D17)."""
    if not os.environ.get("VERTEX_PROJECT"):
        return None
    message = await ctx.bot.send_message(chat_id, QUEUED)
    return ctx.application.create_task(run(message, root, basename))
