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
    with pytest.raises(RuntimeError, match="output limit"):
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


def test_transcribe_sends_inline_and_returns_text(monkeypatch):
    client = ScriptedClient(_resp("گوینده ۱: سلام"))
    tr = _chunked(monkeypatch, client, duration=60.0)      # one chunk of audio
    assert tr.transcribe("cooking.m4a") == "گوینده ۱: سلام"
    assert client.calls == 1


def test_transcribe_sends_the_prompt_and_the_audio_part(monkeypatch):
    seen = {}

    class Recorder(ScriptedClient):
        def _generate(self, model=None, contents=None, config=None):
            seen.update(model=model, contents=contents, config=config)
            return super()._generate(model, contents, config)

    _chunked(monkeypatch, Recorder(), duration=60.0).transcribe("cooking.m4a")
    assert seen["model"] == "gemini-x"
    assert seen["contents"][0] == T.PROMPT
    assert seen["contents"][1] == ("part", "inline", b"xxxxx")
    assert seen["config"] == {"temperature": 0}      # transcription, not composition (D4)


def test_transcribe_keeps_the_client_alive_for_the_whole_request(monkeypatch):
    """`self._client().models.generate_content(...)` drops the client before it sends.

    LOAD_ATTR pops the temporary as soon as `.models` is read; the SDK's finalizer then
    closes the transport and every real transcription dies with "Cannot send a request,
    as the client has been closed." Binding the client to a local is the whole fix.
    """
    tr = _chunked(monkeypatch, None, duration=60.0)
    tr._client_factory = lambda: ClosingClient(_resp("گوینده ۱: سلام"))
    assert tr.transcribe("cooking.m4a") == "گوینده ۱: سلام"


def test_each_chunk_over_the_inline_limit_goes_to_gcs_and_is_deleted(monkeypatch):
    deleted = []
    monkeypatch.setattr(T, "gcs_upload", lambda p, b, n: f"gs://{b}/{n}")
    monkeypatch.setattr(T, "gcs_delete", lambda uri: deleted.append(uri))
    tr = _chunked(monkeypatch, ScriptedClient(), size=10, bucket="buck", inline_limit=5)
    tr.transcribe("cooking.m4a")                     # 1600s of audio: three chunks
    assert deleted == ["gs://buck/transcribe/cooking-01.ogg",
                       "gs://buck/transcribe/cooking-02.ogg",
                       "gs://buck/transcribe/cooking-03.ogg",
                       "gs://buck/transcribe/cooking-04.ogg"]


def test_a_staged_chunk_is_deleted_even_when_its_call_fails(monkeypatch):
    deleted = []
    monkeypatch.setattr(T, "gcs_upload", lambda p, b, n: f"gs://{b}/{n}")
    monkeypatch.setattr(T, "gcs_delete", lambda uri: deleted.append(uri))
    client = ScriptedClient(_resp("x", finish="SAFETY"))
    tr = _chunked(monkeypatch, client, size=10, bucket="buck", inline_limit=5)
    with pytest.raises(RuntimeError):
        tr.transcribe("cooking.m4a")
    assert deleted == ["gs://buck/transcribe/cooking-01.ogg"]   # no orphan in the bucket


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


# --- chunked transcription (D20-D25) ------------------------------------------------

class FakeTranscode:
    """Stands in for transcode(): records the cut ranges, writes a stub file."""

    def __init__(self, size=5):
        self.size, self.calls = size, []

    def __call__(self, src, dst, start=None, duration=None):
        self.calls.append((start, duration))
        Path(dst).write_bytes(b"x" * self.size)
        return Path(dst)


class ScriptedClient:
    """A fake client driven by a script: each entry is a response or an exception."""

    def __init__(self, *script):
        self.script, self.calls, self.configs = list(script), 0, []
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, model=None, contents=None, config=None):
        self.calls += 1
        self.configs.append(config)
        item = self.script.pop(0) if self.script else _resp()
        if isinstance(item, BaseException):
            raise item
        return item


def _transient(msg="503 UNAVAILABLE: backend unreachable"):
    return RuntimeError(msg)


def _chunked(monkeypatch, client, duration=1860.0, size=5, **kw):
    """A VertexTranscriber wired to fakes: no ffmpeg, no ffprobe, no SDK."""
    monkeypatch.setattr(T, "RETRY_BACKOFF", 0)
    monkeypatch.setattr(T, "probe_duration", lambda p: duration)
    monkeypatch.setattr(T, "transcode", FakeTranscode(size))
    monkeypatch.setattr(T, "build_part", lambda kind, value: ("part", kind, value))
    return T.VertexTranscriber("p", "global", "gemini-x",
                               client_factory=lambda: client, **kw)


def test_chunk_bounds_tile_an_exact_multiple_of_the_chunk_length():
    bounds = T.chunk_bounds(T.CHUNK_SECONDS * 3)
    assert bounds[0][0] == 0
    assert bounds[-1][1] == T.CHUNK_SECONDS * 3
    assert [round(s) for s, _ in bounds] == [0, 780, 1560]


def test_chunk_bounds_last_chunk_is_short_when_duration_is_not_a_multiple():
    duration = 1860.0                       # 2 full chunks and a 5-minute tail
    bounds = T.chunk_bounds(duration)
    assert len(bounds) == 3
    assert bounds[-1] == (1560.0, 1860.0)   # short, and that is normal
    assert bounds[-1][1] == duration


def test_a_short_tail_keeps_its_own_chunk():
    """Measured: a 41-second final chunk captured the end of the meeting; folding it into
    the 13-minute chunk before it lost «گام به گام بریم جلو» entirely. Short is correct.
    """
    duration = 1600.0                       # 2 full chunks and a 40-second tail
    bounds = T.chunk_bounds(duration)
    assert len(bounds) == 3                 # the tail is its own chunk, however short
    assert bounds[-1] == (1560.0, 1600.0)
    T.assert_coverage(bounds, duration)


def test_audio_shorter_than_the_minimum_tail_is_still_transcribed():
    assert T.chunk_bounds(30.0) == [(0.0, 30.0)]     # nothing to fold it into


def test_chunk_bounds_leave_no_gap_and_overlap_at_the_seams():
    bounds = T.chunk_bounds(4000.0)
    for (_, prev_end), (start, _) in zip(bounds, bounds[1:]):
        assert start < prev_end             # overlap, never a gap
        assert round(prev_end - start) == T.CHUNK_OVERLAP


def test_audio_shorter_than_one_chunk_is_a_single_chunk():
    assert T.chunk_bounds(300.0) == [(0.0, 300.0)]


MEETING = 3890.99          # dining-1405-04-11, the run this was measured on


def test_the_final_primary_chunk_is_not_reliably_short():
    """The arithmetic never promised a short tail — it advances by 780 and spans 790.

    dining-1405-04-11's last primary chunk is 771 seconds, and that long final chunk both
    dropped «هفتاد دقیقه شد» and produced «باعث افتخاره بنده است», which is nowhere in the
    audio. A short clip of the same ending reproduced it exactly. Hence the tail chunk.
    """
    primary = T.chunk_bounds(MEETING)
    assert len(primary) == 5
    assert primary[-1][1] - primary[-1][0] > 700       # not short, and nothing said it would be


def test_a_tail_chunk_always_covers_the_last_ninety_seconds(monkeypatch):
    fake = FakeTranscode()
    tr = _chunked(monkeypatch, ScriptedClient(), duration=MEETING)
    monkeypatch.setattr(T, "transcode", fake)
    tr.transcribe("meeting.m4a")
    assert len(fake.calls) == 6                        # five primary chunks and the tail
    assert fake.calls[-1] == (MEETING - T.TAIL_SECONDS, float(T.TAIL_SECONDS))


def test_no_tail_chunk_when_the_recording_is_shorter_than_the_tail(monkeypatch):
    fake = FakeTranscode()
    tr = _chunked(monkeypatch, ScriptedClient(), duration=60.0)
    monkeypatch.setattr(T, "transcode", fake)
    tr.transcribe("meeting.m4a")
    assert fake.calls == [(0.0, 60.0)]                 # one chunk already covers everything


def test_the_tail_chunk_is_counted_in_the_stage_progress(monkeypatch, capsys):
    _chunked(monkeypatch, ScriptedClient(), duration=MEETING).transcribe("meeting.m4a")
    assert "stage: transcribing 6/6" in capsys.readouterr().err


def test_a_failing_tail_chunk_fails_the_whole_run(monkeypatch):
    """The tail is a chunk like any other for D21: it cannot be quietly dropped."""
    client = ScriptedClient(*[_resp("متن")] * 3, _transient(), _transient(), _transient())
    with pytest.raises(RuntimeError, match=r"chunk 4/4 \(25:10–26:40\)"):
        _chunked(monkeypatch, client, duration=1600.0).transcribe("meeting.m4a")


def test_an_empty_tail_chunk_is_forgiven(monkeypatch):
    """Ninety seconds of goodbyes can genuinely transcribe to nothing (D23's exception)."""
    client = ScriptedClient(*[_resp("متن")] * 3, _resp("   "))
    text = _chunked(monkeypatch, client, duration=1600.0).transcribe("meeting.m4a")
    assert text.count("متن") == 3


def test_a_transcription_that_is_empty_all_through_still_fails(monkeypatch):
    """The silence exception must never add up to an empty transcript on disk (D21)."""
    client = ScriptedClient(_resp("   "))
    with pytest.raises(RuntimeError, match="nothing"):
        _chunked(monkeypatch, client, duration=60.0).transcribe("meeting.m4a")


def test_coverage_check_rejects_a_gap_between_chunks():
    with pytest.raises(RuntimeError, match="gap"):
        T.assert_coverage([(0.0, 700.0), (780.0, 1560.0)], 1560.0)


def test_coverage_check_rejects_boundaries_that_stop_short_of_the_audio():
    with pytest.raises(RuntimeError, match="do not cover"):
        T.assert_coverage([(0.0, 780.0)], 1600.0)


def test_coverage_check_rejects_boundaries_that_do_not_start_at_zero():
    with pytest.raises(RuntimeError, match="do not cover"):
        T.assert_coverage([(10.0, 1600.0)], 1600.0)


def test_transcribe_asserts_coverage_before_calling_vertex(monkeypatch):
    client = ScriptedClient()
    tr = _chunked(monkeypatch, client)
    monkeypatch.setattr(T, "chunk_bounds", lambda d: [(0.0, 700.0)])   # a rounding bug
    with pytest.raises(RuntimeError, match="do not cover"):
        tr.transcribe("meeting.m4a")
    assert client.calls == 0                # nothing was sent, nothing was paid for


def test_transcribe_joins_every_chunk_in_order(monkeypatch):
    client = ScriptedClient(_resp("یک"), _resp("دو"), _resp("سه"), _resp("چهار"))
    text = _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 4                          # three chunks and the tail
    assert text.index("یک") < text.index("دو") < text.index("سه") < text.index("چهار")
    assert "یک" in text and "دو" in text and "سه" in text


def test_transcribe_cuts_each_chunks_own_time_range(monkeypatch):
    fake = FakeTranscode()
    tr = _chunked(monkeypatch, ScriptedClient())
    monkeypatch.setattr(T, "transcode", fake)
    tr.transcribe("meeting.m4a")
    assert fake.calls == [(0.0, 790.0), (780.0, 790.0), (1560.0, 300.0),
                          (1770.0, 90.0)]      # …and the last 90 seconds again


def test_stage_reports_the_chunk_counter(monkeypatch, capsys):
    _chunked(monkeypatch, ScriptedClient()).transcribe("meeting.m4a")
    err = capsys.readouterr().err
    assert "stage: transcribing 1/4" in err
    assert "stage: transcribing 4/4" in err            # the tail chunk is counted too


def test_a_transient_failure_is_retried_and_the_transcript_is_complete(monkeypatch):
    client = ScriptedClient(_transient(), _resp("یک"), _resp("دو"), _resp("سه"), _resp("چهار"))
    text = _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 5                # 1 failed attempt + 3 chunks + the tail
    assert "یک" in text and "دو" in text and "سه" in text


def test_a_non_transient_failure_is_not_retried(monkeypatch):
    client = ScriptedClient(ValueError("400 INVALID_ARGUMENT: unsupported mime type"))
    with pytest.raises(RuntimeError, match="INVALID_ARGUMENT"):
        _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 1                # no point repeating what cannot succeed


def test_a_chunk_that_exhausts_its_retries_names_the_chunk_and_the_time_range(monkeypatch):
    client = ScriptedClient(_resp("یک"), _transient(), _transient(), _transient())
    with pytest.raises(RuntimeError, match=r"chunk 2/4 \(13:00–26:10\)"):
        _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 4                # chunk 1, then 3 bounded attempts at chunk 2


def _ceiling(text="نیمه نیمه نیمه"):
    return _resp(text, finish="FinishReason.MAX_TOKENS")


def test_a_repetition_loop_is_retried_and_the_transcript_completes(monkeypatch):
    """Measured: the same chunk hit MAX_TOKENS once and finished twice, ~4,000 tokens each.

    A ceiling on identical audio is non-deterministic, so it is the model getting stuck,
    not the meeting being too long — and one unlucky chunk must not cost a 90-minute run.
    """
    client = ScriptedClient(_ceiling(), _resp("یک"), _resp("دو"), _resp("سه"), _resp("چهار"))
    text = _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 5
    assert "یک" in text and "دو" in text and "سه" in text


def test_the_retry_after_a_repetition_loop_bumps_the_temperature(monkeypatch):
    """Replaying the identical greedy path would land in the identical loop."""
    client = ScriptedClient(_ceiling(), _resp("یک"), _resp("دو"), _resp("سه"), _resp("چهار"))
    _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.configs[0] == {"temperature": 0}
    assert client.configs[1] == {"temperature": T.RETRY_TEMPERATURE}
    assert T.RETRY_TEMPERATURE > 0
    assert client.configs[2] == {"temperature": 0}      # a fresh chunk starts greedy again


def test_a_network_retry_stays_at_temperature_zero(monkeypatch):
    """A 503 is not the model's fault; determinism is worth keeping where it is free."""
    client = ScriptedClient(_transient(), _resp("یک"))
    _chunked(monkeypatch, client, duration=60.0).transcribe("meeting.m4a")
    assert client.configs == [{"temperature": 0}, {"temperature": 0}]


def test_no_max_output_tokens_is_ever_sent(monkeypatch):
    """The default cap is the circuit breaker that turns a runaway into a loud failure."""
    client = ScriptedClient(_resp("یک"))
    _chunked(monkeypatch, client, duration=60.0).transcribe("meeting.m4a")
    assert "max_output_tokens" not in client.configs[0]


def test_a_repetition_loop_on_every_attempt_fails_the_whole_run(monkeypatch):
    client = ScriptedClient(_ceiling(), _ceiling(), _ceiling())
    with pytest.raises(RuntimeError, match=r"chunk 1/4 \(0:00–13:10\).*output limit"):
        _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 3                            # the bounded budget, not forever


def test_a_repetition_loop_on_every_attempt_leaves_no_transcript_on_disk(data_root, tmp_path,
                                                                        monkeypatch):
    """D21 outlives the retry: an unfixable ceiling still writes nothing at all."""
    (data_root / "meetings/audio/dining-1405-04-11.ogg").write_bytes(b"x")
    client = ScriptedClient(_resp("یک"), _ceiling(), _ceiling(), _ceiling())
    tr = _chunked(monkeypatch, client)
    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: tr)
    out = tmp_path / "raw" / "dining-1405-04-11.txt"
    assert cli.main(["--out", str(out), "dining-1405-04-11"]) == 1
    assert not out.exists()


def test_a_blocked_chunk_fails_the_whole_run(monkeypatch):
    client = ScriptedClient(_resp("یک"), _resp("x", finish="SAFETY"))
    with pytest.raises(RuntimeError, match="blocked"):
        _chunked(monkeypatch, client).transcribe("meeting.m4a")
    assert client.calls == 2                            # chunk 1, then chunk 2 once, no retry


def test_an_empty_chunk_fails_the_whole_run(monkeypatch):
    client = ScriptedClient(_resp("یک"), _resp("   "))
    with pytest.raises(RuntimeError, match="empty"):
        _chunked(monkeypatch, client).transcribe("meeting.m4a")


def test_a_short_final_chunk_that_comes_back_empty_is_treated_as_silence(monkeypatch):
    """Forty seconds of people packing up transcribing to nothing is a fact, not a fault.

    The narrowest exception the evidence supports: final, shorter than MIN_TAIL_SECONDS,
    and empty. It contributes nothing and the meeting still succeeds.
    """
    client = ScriptedClient(_resp("یک"), _resp("دو"), _resp("   "), _resp("   "))
    text = _chunked(monkeypatch, client, duration=1600.0).transcribe("meeting.m4a")
    assert client.calls == 4                          # the tail was transcribed, not skipped
    assert "یک" in text and "دو" in text
    assert not text.rstrip().endswith("\n")           # no empty block glued on the end


def test_a_short_final_chunk_that_returns_text_keeps_it(monkeypatch):
    client = ScriptedClient(_resp("یک"), _resp("دو"), _resp("سه"),
                            _resp("گام به گام بریم جلو"))
    text = _chunked(monkeypatch, client, duration=1600.0).transcribe("meeting.m4a")
    assert text.endswith("گام به گام بریم جلو")        # the ending is the whole point


def test_a_long_final_chunk_that_comes_back_empty_still_fails_the_run(monkeypatch):
    """1860s leaves a 5-minute final chunk — far too long for silence to be plausible."""
    client = ScriptedClient(_resp("یک"), _resp("دو"), _resp(""))
    with pytest.raises(RuntimeError, match="empty"):
        _chunked(monkeypatch, client, duration=1860.0).transcribe("meeting.m4a")


def test_a_short_but_not_final_chunk_that_comes_back_empty_still_fails(monkeypatch):
    client = ScriptedClient(_resp("   "), _resp("دو"))
    tr = _chunked(monkeypatch, client, duration=100.0)
    monkeypatch.setattr(T, "chunk_bounds", lambda d: [(0.0, 40.0), (30.0, 100.0)])
    with pytest.raises(RuntimeError, match="empty"):
        tr.transcribe("meeting.m4a")


def test_check_response_returns_empty_text_when_silence_is_allowed():
    assert T.check_response(_resp("   "), allow_empty=True) == ""


def test_check_response_still_refuses_a_blocked_response_when_silence_is_allowed():
    with pytest.raises(RuntimeError, match="blocked"):
        T.check_response(_resp("", finish="SAFETY"), allow_empty=True)


def test_a_failed_chunk_leaves_no_transcript_on_disk(data_root, tmp_path, monkeypatch):
    """D21, the binding rule: partial output is worse than no output.

    Two chunks succeed, the third exhausts its retries. Nothing may reach --out —
    a transcript missing its final minutes is invisible to every reader downstream.
    """
    (data_root / "meetings/audio/dining-1405-04-11.ogg").write_bytes(b"x")
    client = ScriptedClient(_resp("یک"), _resp("دو"),
                            _transient(), _transient(), _transient())
    tr = _chunked(monkeypatch, client)
    monkeypatch.setattr(cli, "VertexTranscriber", lambda *a, **k: tr)
    out = tmp_path / "raw" / "dining-1405-04-11.txt"
    assert cli.main(["--out", str(out), "dining-1405-04-11"]) == 1
    assert not out.exists()                             # the whole point
    assert not out.parent.exists() or not list(out.parent.glob("*"))


def _probe(stdout, returncode=0, stderr=""):
    def run(argv, capture_output=False, text=False):
        run.argv = argv
        return subprocess.CompletedProcess(argv, returncode, stdout, stderr)
    return run


def test_probe_duration_reads_the_length_from_ffprobe(tmp_path):
    run = _probe("3888.024000\n")
    assert T.probe_duration(tmp_path / "a.m4a", run=run) == pytest.approx(3888.024)
    assert run.argv[0] == "ffprobe"
    assert "format=duration:stream=duration" in run.argv    # both, not just the container


def test_probe_duration_trusts_the_longer_of_stream_and_container(tmp_path, capsys):
    """A header that under-reports is the one way audio can still be skipped silently.

    The last chunk would stop early and D24's arithmetic would agree with itself, so the
    stream's own length wins and the disagreement is on the record.
    """
    # ffprobe prints the stream first and the container second; either of the two can be
    # the one that under-reports, so the longer must win whichever line it arrives on.
    short_second = _probe("3888.024000\n3600.000000\n")
    short_first = _probe("3600.000000\n3888.024000\n")
    assert T.probe_duration(tmp_path / "a.m4a", run=short_second) == pytest.approx(3888.024)
    assert T.probe_duration(tmp_path / "a.m4a", run=short_first) == pytest.approx(3888.024)
    err = capsys.readouterr().err
    assert "3600.0" in err and "3888.0" in err and "warning" in err


def test_probe_duration_stays_quiet_when_the_two_agree(tmp_path, capsys):
    run = _probe("3888.024000\n3888.100000\n")
    assert T.probe_duration(tmp_path / "a.m4a", run=run) == pytest.approx(3888.1)
    assert capsys.readouterr().err == ""


def test_probe_duration_ignores_a_stream_without_a_duration(tmp_path):
    assert T.probe_duration(tmp_path / "a.m4a",
                            run=_probe("N/A\n3888.024000\n")) == pytest.approx(3888.024)


def test_probe_duration_raises_when_neither_value_is_usable(tmp_path):
    with pytest.raises(RuntimeError, match="ffprobe"):
        T.probe_duration(tmp_path / "a.m4a", run=_probe("N/A\n\n"))


def test_probe_duration_raises_when_ffprobe_fails(tmp_path):
    with pytest.raises(RuntimeError, match="ffprobe"):
        T.probe_duration(tmp_path / "a.m4a", run=_probe("", returncode=1,
                                                        stderr="moov atom not found"))


def test_transcode_cuts_a_time_range(tmp_path):
    run = FakeRun()
    src = tmp_path / "in.m4a"
    src.write_bytes(b"x")
    T.transcode(src, tmp_path / "out.ogg", start=780, duration=790, run=run)
    argv = run.argv
    assert argv.index("-ss") < argv.index("-i")        # input seeking: fast on a long file
    assert argv[argv.index("-ss") + 1] == "780.000"
    assert argv[argv.index("-t") + 1] == "790.000"
