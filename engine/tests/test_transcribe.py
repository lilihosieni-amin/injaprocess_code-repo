import gc
import subprocess
import weakref
from pathlib import Path
from types import SimpleNamespace

import pytest
import transcribe as T
from transcribe import cli, find_audio, run_transcribe, transcript_path


class FakeTranscriber:
    def __init__(self):
        self.calls = 0

    def transcribe(self, audio_path):
        self.calls += 1
        return "گوینده مرد ۱: سلام"


def test_idempotency_skips_vertex_when_transcript_exists(data_root):
    root = data_root
    (root / "meetings/audio/cooking-2026-07-06.ogg").write_bytes(b"x")
    transcript_path(root, "cooking-2026-07-06").write_text("cached", encoding="utf-8")
    fake = FakeTranscriber()
    text, called = run_transcribe("cooking-2026-07-06", fake, root=root)
    assert text == "cached" and called is False and fake.calls == 0


def test_calls_transcriber_when_no_transcript(data_root):
    root = data_root
    (root / "meetings/audio/cooking-2026-07-06.ogg").write_bytes(b"x")
    fake = FakeTranscriber()
    text, called = run_transcribe("cooking-2026-07-06", fake, root=root)
    assert called is True and fake.calls == 1 and "گوینده" in text


def test_missing_audio_raises(data_root):
    with pytest.raises(FileNotFoundError):
        find_audio(data_root, "does-not-exist")


@pytest.mark.integration
@pytest.mark.skip(reason="real Vertex call — needs GCP creds; run manually when set up")
def test_real_vertex_transcription():
    pass


class FakeRun:
    """Stands in for subprocess.run so no real ffmpeg is needed."""

    def __init__(self, returncode=0, stderr="", writes=b"opus-bytes"):
        self.returncode, self.stderr, self.writes = returncode, stderr, writes
        self.argv = None

    def __call__(self, argv, capture_output=False, text=False):
        self.argv = argv
        if self.returncode == 0:
            Path(argv[-1]).write_bytes(self.writes)
        return subprocess.CompletedProcess(argv, self.returncode, "", self.stderr)


def test_transcode_builds_mono_opus_argv(tmp_path, monkeypatch):
    monkeypatch.delenv("TRANSCODE_BITRATE", raising=False)
    run = FakeRun()
    src, dst = tmp_path / "in.m4a", tmp_path / "out.ogg"
    src.write_bytes(b"x")
    T.transcode(src, dst, run=run)
    argv = run.argv
    assert argv[0] == "ffmpeg"
    assert "-ac" in argv and argv[argv.index("-ac") + 1] == "1"
    assert argv[argv.index("-c:a") + 1] == "libopus"
    assert argv[argv.index("-b:a") + 1] == "16k"          # the documented default
    assert argv[-1] == str(dst)


def test_transcode_honours_bitrate_env(tmp_path, monkeypatch):
    monkeypatch.setenv("TRANSCODE_BITRATE", "24k")
    run = FakeRun()
    src = tmp_path / "in.m4a"
    src.write_bytes(b"x")
    T.transcode(src, tmp_path / "out.ogg", run=run)
    assert run.argv[run.argv.index("-b:a") + 1] == "24k"


def test_transcode_raises_with_ffmpeg_stderr(tmp_path):
    src = tmp_path / "in.m4a"
    src.write_bytes(b"x")
    with pytest.raises(RuntimeError, match="ffmpeg failed"):
        T.transcode(src, tmp_path / "out.ogg", run=FakeRun(returncode=1, stderr="no such codec"))


def test_small_file_goes_inline(tmp_path):
    f = tmp_path / "a.ogg"
    f.write_bytes(b"12345")
    assert T.audio_source(f, bucket="b") == ("inline", b"12345")


def test_large_file_goes_to_gcs(tmp_path):
    f = tmp_path / "a.ogg"
    f.write_bytes(b"0123456789")
    seen = {}

    def uploader(path, bucket, name):
        seen.update(path=Path(path), bucket=bucket, name=name)
        return f"gs://{bucket}/{name}"

    kind, value = T.audio_source(f, bucket="my-bucket", inline_limit=5, uploader=uploader)
    assert (kind, value) == ("uri", "gs://my-bucket/transcribe/a.ogg")
    assert seen["bucket"] == "my-bucket" and seen["name"] == "transcribe/a.ogg"


def test_large_file_without_bucket_names_the_variable(tmp_path):
    f = tmp_path / "a.ogg"
    f.write_bytes(b"0123456789")
    with pytest.raises(RuntimeError, match="GCS_BUCKET"):
        T.audio_source(f, bucket=None, inline_limit=5)


def test_stage_writes_to_stderr(capsys):
    T.stage("transcoding")
    captured = capsys.readouterr()
    assert captured.err.strip() == "stage: transcoding"
    assert captured.out == ""          # stdout stays pure transcript


def _resp(text="متن", finish="STOP"):
    return SimpleNamespace(text=text,
                           candidates=[SimpleNamespace(finish_reason=finish)])


class FakeClient:
    """Mimics google-genai's client surface without importing it."""

    def __init__(self, resp=None):
        self.resp = resp or _resp()
        self.contents = self.model = self.config = None
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, model=None, contents=None, config=None):
        self.model, self.contents, self.config = model, contents, config
        return self.resp


class ClosingClient:
    """Reproduces google-genai's real failure mode.

    The SDK closes its httpx transport from the client's finalizer, so a client built
    as a temporary is already closed by the time the request goes out. `models` holds
    only a weak reference back, exactly like that: the request works while the caller
    still holds the client, and raises the production error once it has been dropped.
    """

    def __init__(self, resp=None):
        self.resp = resp or _resp()
        self.contents = self.model = self.config = None
        ref = weakref.ref(self)                 # no strong ref back — a bound method would keep

        def generate_content(model=None, contents=None, config=None):
            gc.collect()                        # leave no doubt about when the temporary died
            client = ref()
            if client is None:
                raise RuntimeError("Cannot send a request, as the client has been closed.")
            client.model, client.contents, client.config = model, contents, config
            return client.resp

        self.models = SimpleNamespace(generate_content=generate_content)


def test_check_response_returns_text():
    assert T.check_response(_resp("گوینده ۱: سلام")) == "گوینده ۱: سلام"


def test_check_response_refuses_truncation():
    with pytest.raises(RuntimeError, match="output ceiling"):
        T.check_response(_resp("نیمه", finish="FinishReason.MAX_TOKENS"))


def test_check_response_refuses_empty():
    with pytest.raises(RuntimeError, match="empty"):
        T.check_response(_resp("   "))


def test_check_response_refuses_no_candidates():
    with pytest.raises(RuntimeError, match="no candidates"):
        T.check_response(SimpleNamespace(text="x", candidates=[]))


def test_check_response_refuses_blocked():
    with pytest.raises(RuntimeError, match="blocked"):
        T.check_response(_resp("x", finish="SAFETY"))


def test_check_response_refuses_any_non_stop_reason():
    # SPII is a live risk for staff-name-heavy meeting audio, and it is not on any deny-list
    with pytest.raises(RuntimeError, match="SPII"):
        T.check_response(_resp("نیمه", finish="FinishReason.SPII"))


def test_check_response_accepts_an_unset_finish_reason():
    # absence is not a refusal — only a value that says the model stopped for another reason
    assert T.check_response(_resp("گوینده ۱: سلام", finish=None)) == "گوینده ۱: سلام"


def test_transcribe_sends_inline_and_returns_text(tmp_path, monkeypatch):
    audio = tmp_path / "cooking.m4a"
    audio.write_bytes(b"raw")
    client = FakeClient(_resp("گوینده ۱: سلام"))
    monkeypatch.setattr(T, "transcode",
                        lambda src, dst: Path(dst).write_bytes(b"small") or Path(dst))
    monkeypatch.setattr(T, "build_part", lambda kind, value: ("part", kind))
    tr = T.VertexTranscriber("p", "global", "gemini-x", client_factory=lambda: client)
    assert tr.transcribe(str(audio)) == "گوینده ۱: سلام"
    assert client.model == "gemini-x"
    assert client.contents[0] == T.PROMPT
    assert client.contents[1] == ("part", "inline")
    assert client.config == {"temperature": 0}      # transcription, not composition (D4)


def test_transcribe_keeps_the_client_alive_for_the_whole_request(tmp_path, monkeypatch):
    """`self._client().models.generate_content(...)` drops the client before it sends.

    LOAD_ATTR pops the temporary as soon as `.models` is read; the SDK's finalizer then
    closes the transport and every real transcription dies with "Cannot send a request,
    as the client has been closed." Binding the client to a local is the whole fix.
    """
    audio = tmp_path / "cooking.m4a"
    audio.write_bytes(b"raw")
    monkeypatch.setattr(T, "transcode",
                        lambda src, dst: Path(dst).write_bytes(b"small") or Path(dst))
    monkeypatch.setattr(T, "build_part", lambda kind, value: ("part", kind))
    tr = T.VertexTranscriber("p", "global", "gemini-x",
                             client_factory=lambda: ClosingClient(_resp("گوینده ۱: سلام")))
    assert tr.transcribe(str(audio)) == "گوینده ۱: سلام"


def test_transcribe_uses_gcs_and_deletes_the_object(tmp_path, monkeypatch):
    audio = tmp_path / "cooking.m4a"
    audio.write_bytes(b"raw")
    deleted = []
    monkeypatch.setattr(T, "transcode",
                        lambda src, dst: Path(dst).write_bytes(b"0123456789") or Path(dst))
    monkeypatch.setattr(T, "gcs_upload", lambda p, b, n: f"gs://{b}/{n}")
    monkeypatch.setattr(T, "gcs_delete", lambda uri: deleted.append(uri))
    monkeypatch.setattr(T, "build_part", lambda kind, value: ("part", kind, value))
    tr = T.VertexTranscriber("p", "global", "gemini-x", bucket="buck", inline_limit=5,
                             client_factory=lambda: FakeClient())
    tr.transcribe(str(audio))
    assert deleted == ["gs://buck/transcribe/cooking.ogg"]


def test_transcribe_deletes_the_object_even_when_the_call_fails(tmp_path, monkeypatch):
    audio = tmp_path / "cooking.m4a"
    audio.write_bytes(b"raw")
    deleted = []
    monkeypatch.setattr(T, "transcode",
                        lambda src, dst: Path(dst).write_bytes(b"0123456789") or Path(dst))
    monkeypatch.setattr(T, "gcs_upload", lambda p, b, n: f"gs://{b}/{n}")
    monkeypatch.setattr(T, "gcs_delete", lambda uri: deleted.append(uri))
    monkeypatch.setattr(T, "build_part", lambda kind, value: ("part", kind, value))
    tr = T.VertexTranscriber("p", "global", "gemini-x", bucket="buck", inline_limit=5,
                             client_factory=lambda: FakeClient(_resp("x", finish="MAX_TOKENS")))
    with pytest.raises(RuntimeError):
        tr.transcribe(str(audio))
    assert deleted == ["gs://buck/transcribe/cooking.ogg"]     # no orphan left in the bucket


def test_out_writes_the_transcript_atomically(data_root, tmp_path, monkeypatch):
    (data_root / "meetings/audio/cooking-1405-04-19.ogg").write_bytes(b"x")
    monkeypatch.setattr(cli, "VertexTranscriber",
                        lambda *a, **k: FakeTranscriber())
    out = tmp_path / "raw" / "cooking-1405-04-19.txt"
    assert cli.main(["--out", str(out), "cooking-1405-04-19"]) == 0
    assert out.read_text(encoding="utf-8") == "گوینده مرد ۱: سلام"
    assert not list(out.parent.glob("*.tmp"))          # no temp left behind


def test_out_is_skipped_when_it_already_exists(data_root, tmp_path, monkeypatch):
    (data_root / "meetings/audio/cooking-1405-04-19.ogg").write_bytes(b"x")
    fake = FakeTranscriber()
    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: fake)
    out = tmp_path / "cooking-1405-04-19.txt"
    out.write_text("already here", encoding="utf-8")
    assert cli.main(["--out", str(out), "cooking-1405-04-19"]) == 0
    assert fake.calls == 0                              # FR-P2, mirrored for --out
    assert out.read_text(encoding="utf-8") == "already here"


def test_failure_returns_1_and_writes_nothing(data_root, tmp_path, monkeypatch):
    (data_root / "meetings/audio/cooking-1405-04-19.ogg").write_bytes(b"x")

    class Boom:
        def transcribe(self, path):
            raise RuntimeError("the transcript hit the model's output ceiling")

    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: Boom())
    out = tmp_path / "cooking-1405-04-19.txt"
    assert cli.main(["--out", str(out), "cooking-1405-04-19"]) == 1
    assert not out.exists()


def test_failure_message_goes_to_stderr(data_root, tmp_path, monkeypatch, capsys):
    (data_root / "meetings/audio/cooking-1405-04-19.ogg").write_bytes(b"x")

    class Boom:
        def transcribe(self, path):
            raise RuntimeError("ffmpeg failed (127): not found")

    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: Boom())
    cli.main(["--out", str(tmp_path / "x.txt"), "cooking-1405-04-19"])
    assert "ffmpeg failed" in capsys.readouterr().err


def test_unwritable_out_reports_an_error_not_a_traceback(data_root, tmp_path, monkeypatch,
                                                         capsys):
    """A write failure is a failure like any other: one `error:` line and exit 1."""
    (data_root / "meetings/audio/cooking-1405-04-19.ogg").write_bytes(b"x")
    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: FakeTranscriber())
    blocked = tmp_path / "raw"
    blocked.write_text("not a directory", encoding="utf-8")   # so --out can never be created
    assert cli.main(["--out", str(blocked / "cooking-1405-04-19.txt"),
                     "cooking-1405-04-19"]) == 1
    captured = capsys.readouterr()
    assert captured.err.startswith("error: ")
    assert captured.out == ""                                 # no half-transcript on stdout


def test_out_pointing_at_a_directory_reports_an_error(data_root, tmp_path, monkeypatch, capsys):
    """The idempotency pre-check reads --out; a directory there must not raise either."""
    (data_root / "meetings/audio/cooking-1405-04-19.ogg").write_bytes(b"x")
    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: FakeTranscriber())
    out = tmp_path / "raw"
    out.mkdir()
    assert cli.main(["--out", str(out), "cooking-1405-04-19"]) == 1
    assert capsys.readouterr().err.startswith("error: ")


def test_write_text_atomic_creates_parents(tmp_path):
    from engine_common import write_text_atomic
    target = tmp_path / "a" / "b" / "c.txt"
    write_text_atomic(target, "متن")
    assert target.read_text(encoding="utf-8") == "متن"
