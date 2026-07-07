import pytest
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
