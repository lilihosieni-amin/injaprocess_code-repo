import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from upload_bot import transcription as tx


class FakeProc:
    """Stands in for an asyncio subprocess running the `transcribe` CLI."""

    def __init__(self, returncode=0, stderr=b"", writes=None, delay=0):
        self._returncode, self._stderr = returncode, stderr
        self._writes, self._delay = writes, delay
        self.killed = False

    async def _drain(self):
        for line in self._stderr.splitlines(keepends=True):
            yield line

    @property
    def stderr(self):
        return self._drain()

    async def wait(self):
        await asyncio.sleep(self._delay)
        if self._writes:
            path, text = self._writes
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        return self._returncode

    def kill(self):
        self.killed = True


def _message():
    return SimpleNamespace(edit_text=AsyncMock())


def test_raw_path_is_under_transcripts_raw(tmp_path):
    assert tx.raw_path(tmp_path, "cooking-1405-04-19") == \
        tmp_path / "meetings" / "transcripts" / "raw" / "cooking-1405-04-19.txt"


def test_elapsed_uses_persian_digits():
    assert tx.fa_elapsed(150) == "۲:۳۰"
    assert tx.fa_elapsed(9) == "۰:۰۹"


def test_success_writes_raw_and_reports_done(data_root, monkeypatch):
    raw = tx.raw_path(data_root, "cooking-1405-04-19")
    monkeypatch.setattr(tx, "TICK", 0.01)
    monkeypatch.setattr(tx, "_exec", AsyncMock(return_value=FakeProc(
        stderr=b"stage: transcoding\nstage: transcribing\n",
        writes=(raw, "گوینده ۱: سلام"))))
    msg = _message()
    assert asyncio.run(tx.run(msg, data_root, "cooking-1405-04-19")) is True
    assert raw.read_text(encoding="utf-8") == "گوینده ۱: سلام"
    assert msg.edit_text.await_args.args[0] == tx.DONE


def test_failure_reports_the_last_stderr_line_and_keeps_the_audio(data_root, monkeypatch):
    audio = data_root / "meetings/audio/cooking-1405-04-19.ogg"
    audio.write_bytes(b"x")
    monkeypatch.setattr(tx, "TICK", 0.01)
    monkeypatch.setattr(tx, "_exec", AsyncMock(return_value=FakeProc(
        returncode=1, stderr=b"stage: transcribing\nerror: Vertex returned an empty transcript\n")))
    msg = _message()
    assert asyncio.run(tx.run(msg, data_root, "cooking-1405-04-19")) is False
    said = msg.edit_text.await_args.args[0]
    assert "رونویسی خودکار انجام نشد" in said
    assert "empty transcript" in said
    assert audio.exists()
    assert not tx.raw_path(data_root, "cooking-1405-04-19").exists()


def test_invocation_passes_out_and_data_root(data_root, monkeypatch):
    exec_mock = AsyncMock(return_value=FakeProc())
    monkeypatch.setattr(tx, "TICK", 0.01)
    monkeypatch.setattr(tx, "_exec", exec_mock)
    asyncio.run(tx.run(_message(), data_root, "cooking-1405-04-19"))
    argv = exec_mock.await_args.args
    assert argv[0] == "transcribe"
    assert "--out" in argv and argv[argv.index("--out") + 1] == \
        str(tx.raw_path(data_root, "cooking-1405-04-19"))
    assert argv[-1] == "cooking-1405-04-19"
    assert exec_mock.await_args.kwargs["env"]["DATA_ROOT"] == str(data_root)


def test_second_upload_waits_for_the_first(data_root, monkeypatch):
    monkeypatch.setattr(tx, "TICK", 0.01)
    order = []

    def make(delay, tag):
        async def _exec(*a, **k):
            order.append(f"start:{tag}")
            return FakeProc(delay=delay)
        return _exec

    async def scenario():
        monkeypatch.setattr(tx, "_exec", make(0.15, "a"))
        first = asyncio.create_task(tx.run(_message(), data_root, "a"))
        await asyncio.sleep(0.02)
        monkeypatch.setattr(tx, "_exec", make(0, "b"))
        second = asyncio.create_task(tx.run(_message(), data_root, "b"))
        await asyncio.gather(first, second)

    asyncio.run(scenario())
    assert order == ["start:a", "start:b"]      # serialized, not interleaved


def test_timeout_kills_the_process(data_root, monkeypatch):
    proc = FakeProc(delay=5)
    monkeypatch.setattr(tx, "TICK", 0.01)
    monkeypatch.setattr(tx, "TIMEOUT", 0.05)
    monkeypatch.setattr(tx, "_exec", AsyncMock(return_value=proc))
    msg = _message()
    assert asyncio.run(tx.run(msg, data_root, "cooking-1405-04-19")) is False
    assert proc.killed


def test_timeout_ends_the_run_when_a_grandchild_holds_stderr(data_root, monkeypatch):
    """A real killed CLI can leave ffmpeg holding the stderr pipe, so it never EOFs.

    FakeProc cannot express that — its stderr ends on its own. Waiting on the reader
    unconditionally would hang inside `finally` with _LOCK held, and every later upload
    would queue behind it forever.
    """
    spawned = []

    async def _exec(*a, **k):
        proc = await asyncio.create_subprocess_exec("sh", "-c", "sleep 5 & sleep 5", **k)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(tx, "TICK", 0.01)
    monkeypatch.setattr(tx, "TIMEOUT", 0.1)
    monkeypatch.setattr(tx, "READER_GRACE", 0.2)
    monkeypatch.setattr(tx, "_exec", _exec)
    msg = _message()

    async def bounded():
        try:
            return await asyncio.wait_for(tx.run(msg, data_root, "cooking-1405-04-19"), 5)
        finally:
            # Its pipes are still held, so the transport would otherwise be closed by __del__
            # after this loop is gone, which pytest reports as an unraisable exception.
            spawned[0]._transport.close()

    assert asyncio.run(bounded()) is False
    assert not tx._LOCK.locked()
    assert "رونویسی خودکار انجام نشد" in msg.edit_text.await_args.args[0]


def test_schedule_is_a_noop_without_vertex_project(monkeypatch, tmp_path):
    monkeypatch.delenv("VERTEX_PROJECT", raising=False)
    ctx = SimpleNamespace(bot=SimpleNamespace(send_message=AsyncMock()),
                          application=SimpleNamespace(create_task=lambda c: c))
    assert asyncio.run(tx.schedule(ctx, tmp_path, "cooking-1405-04-19", 42)) is None
    ctx.bot.send_message.assert_not_awaited()
