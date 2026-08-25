import subprocess
from pathlib import Path

import pytest
import transcribe as T
from transcribe import find_audio, run_transcribe, transcript_path


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
