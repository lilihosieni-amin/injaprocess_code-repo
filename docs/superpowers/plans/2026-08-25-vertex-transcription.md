# Vertex Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `engine/transcribe` actually run on Vertex AI, and have Bot 1 transcribe every uploaded voice in the background with progress in Telegram.

**Architecture:** The CLI transcodes any audio to 16 kbps mono Opus, then sends it to Gemini on Vertex either inline (≤ 16 MiB) or via a `gs://` URI, refusing any response the model did not finish. Bot 1 runs that CLI as a subprocess after finalizing the audio, writes the result to `meetings/transcripts/raw/`, and edits a single Telegram message as it goes. The `process-voice` pipeline promotes the raw file to the approved transcript after its existing chrome-strip and verbatim gate.

**Tech Stack:** Python 3.11, `google-genai` (Vertex mode), `google-cloud-storage`, `ffmpeg`/`libopus`, `python-telegram-bot` 22, pytest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-25-vertex-transcription-design.md`

## Global Constraints

- Engine CLIs stay deterministic and check their preconditions (ARD §7). Components communicate only through the filesystem (`DATA_ROOT`); no direct network calls between components.
- IDs are allocated only by `allocate-id` (INV-1). Nothing in this plan allocates IDs.
- Real secrets never enter either repo. The Vertex key lives at `/opt/inja/secrets/vertex-sa.json` on the server and is mounted read-only.
- **Unit tests must not require `google-genai` or `google-cloud-storage`.** `requirements-dev.txt` installs `-e ./engine` *without* the `[vertex]` extra, so the SDK is absent from the dev venv. Every SDK import stays lazy and every unit test fakes above it.
- Exact values, copied from the spec: `VERTEX_PROJECT=injafood`, `VERTEX_LOCATION=global`, `GEMINI_MODEL=gemini-3.1-pro-preview`, `GCS_BUCKET=injafood-transcribe-staging`, `TRANSCODE_BITRATE=16k`, inline limit `16 * 1024 * 1024` bytes, bot watchdog 30 minutes, progress tick 8 seconds.
- `transcribe.PROMPT` is not modified by this plan (D5).
- Persian is the only language for user-facing bot strings; the elapsed timer uses Persian digits (D14).
- Run only the tests related to what you changed (`pytest engine/tests/test_transcribe.py -q`, etc.), not the full sweep, until the final task.
- Commit style follows the repo: `feat(engine): …`, `fix(upload-bot): …`.

---

### Task 1: Transcode and size routing

Pure functions with no SDK involvement: turn any audio into one uniform Opus file, then decide whether it travels inline or through GCS.

**Files:**
- Modify: `engine/transcribe/__init__.py` (add to the existing module; `PROMPT`, `transcript_path`, `find_audio`, `run_transcribe` are untouched)
- Test: `engine/tests/test_transcribe.py` (append to the existing file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `INLINE_LIMIT: int` — `16 * 1024 * 1024`
  - `transcode(src, dst, bitrate=None, run=subprocess.run) -> pathlib.Path`
  - `audio_source(path, bucket, inline_limit=INLINE_LIMIT, uploader=None) -> tuple[str, bytes | str]` returning `("inline", data)` or `("uri", "gs://…")`
  - `stage(name) -> None` — writes `stage: {name}` to stderr

- [ ] **Step 1: Branch off main**

```bash
git checkout -b feat/vertex-transcription
```

- [ ] **Step 2: Write the failing tests**

Add to the **top import block** of `engine/tests/test_transcribe.py` (ruff's isort rule
fails on imports appended mid-file):

```python
import subprocess
from pathlib import Path

import pytest
import transcribe as T
from transcribe import find_audio, run_transcribe, transcript_path
```

Then append the tests:

```python
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `python -m pytest engine/tests/test_transcribe.py -q`
Expected: FAIL — `AttributeError: module 'transcribe' has no attribute 'transcode'`

- [ ] **Step 4: Implement**

At the top of `engine/transcribe/__init__.py`, replace the single import line with:

```python
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from engine_common import data_root
```

After the `PROMPT` string, add:

```python
# Vertex caps the WHOLE request near 20 MB — prompt and protocol overhead ride
# along with the audio, so route to GCS well before that (D2).
INLINE_LIMIT = 16 * 1024 * 1024


def stage(name):
    """Progress breadcrumb for Bot 1; stdout stays pure transcript (D8)."""
    print(f"stage: {name}", file=sys.stderr, flush=True)


def transcode(src, dst, bitrate=None, run=subprocess.run):
    """Down-mix any input to mono Opus (D1).

    Unconditional, for every input: one code path and one MIME type instead of a
    format-to-MIME table for the m4a/mp3/ogg/wav mix Telegram and the corpus
    produce. A 73-minute meeting comes out around 9 MB.
    """
    bitrate = bitrate or os.environ.get("TRANSCODE_BITRATE") or "16k"
    proc = run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(src),
                "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", bitrate,
                "-f", "ogg", str(dst)],
               capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {(proc.stderr or '').strip()[:500]}")
    return Path(dst)


def audio_source(path, bucket, inline_limit=INLINE_LIMIT, uploader=None):
    """Decide how the transcoded audio reaches Vertex (D2).

    Returns ("inline", bytes) or ("uri", "gs://..."). Kept free of the SDK so the
    routing decision is testable without credentials.
    """
    path = Path(path)
    size = path.stat().st_size
    if size <= inline_limit:
        return ("inline", path.read_bytes())
    if not bucket:
        raise RuntimeError(
            f"{path.name} is {size} bytes after transcoding, over the {inline_limit}-byte "
            "inline limit, and GCS_BUCKET is not set")
    upload = uploader or gcs_upload
    return ("uri", upload(path, bucket, f"transcribe/{path.name}"))
```

`gcs_upload` is referenced here and defined in Task 2; it is only reached on the oversize branch, which every test in this task injects around.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest engine/tests/test_transcribe.py -q`
Expected: PASS, including the three pre-existing idempotency tests.

- [ ] **Step 6: Commit**

```bash
git add engine/transcribe/__init__.py engine/tests/test_transcribe.py
git commit -m "feat(engine): transcode to mono opus and route audio inline or via GCS"
```

---

### Task 2: The Vertex call, the truncation guard, and GCS staging

**Files:**
- Modify: `engine/transcribe/__init__.py` (replace `class VertexTranscriber`)
- Modify: `engine/pyproject.toml:12` (the `vertex` extra), `engine/requirements.txt`
- Test: `engine/tests/test_transcribe.py`

**Interfaces:**
- Consumes: `transcode`, `audio_source`, `stage`, `INLINE_LIMIT` from Task 1.
- Produces:
  - `check_response(resp) -> str` — returns the transcript text or raises
  - `gcs_upload(path, bucket, name) -> str`, `gcs_delete(uri) -> None`
  - `VertexTranscriber(project, location, model, bucket=None, inline_limit=INLINE_LIMIT, client_factory=None)` with `.transcribe(audio_path) -> str`

- [ ] **Step 1: Write the failing tests**

Add `from types import SimpleNamespace` to the top import block, then append:

```python
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


def test_transcribe_sends_inline_and_returns_text(tmp_path, monkeypatch):
    audio = tmp_path / "cooking.m4a"
    audio.write_bytes(b"raw")
    client = FakeClient(_resp("گوینده ۱: سلام"))
    monkeypatch.setattr(T, "transcode", lambda src, dst: Path(dst).write_bytes(b"small") or Path(dst))
    monkeypatch.setattr(T, "build_part", lambda kind, value: ("part", kind))
    tr = T.VertexTranscriber("p", "global", "gemini-x", client_factory=lambda: client)
    assert tr.transcribe(str(audio)) == "گوینده ۱: سلام"
    assert client.model == "gemini-x"
    assert client.contents[0] == T.PROMPT
    assert client.contents[1] == ("part", "inline")
    assert client.config == {"temperature": 0}      # transcription, not composition (D4)


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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest engine/tests/test_transcribe.py -q`
Expected: FAIL — `AttributeError: module 'transcribe' has no attribute 'check_response'`

- [ ] **Step 3: Implement**

Replace the whole `class VertexTranscriber` block at the end of `engine/transcribe/__init__.py` with:

```python
def check_response(resp):
    """Refuse a transcript the model did not finish (D6).

    A half transcript that lands on disk looking whole would silently truncate
    every downstream extraction, so every incomplete outcome raises instead.
    """
    candidates = getattr(resp, "candidates", None) or []
    if not candidates:
        raise RuntimeError("Vertex returned no candidates (blocked or empty response)")
    reason = str(getattr(candidates[0], "finish_reason", "") or "")
    if "MAX_TOKENS" in reason:
        raise RuntimeError("the transcript hit the model's output ceiling and is incomplete — "
                           "split this meeting's audio and transcribe the parts")
    if any(word in reason for word in ("SAFETY", "BLOCK", "PROHIBITED", "RECITATION")):
        raise RuntimeError(f"Vertex blocked the response (finish_reason={reason})")
    text = getattr(resp, "text", None)
    if not text or not text.strip():
        raise RuntimeError("Vertex returned an empty transcript")
    return text


def build_part(kind, value):
    """Wrap the audio for the SDK. Lazy import: unit tests never reach this."""
    from google.genai import types
    if kind == "inline":
        return types.Part.from_bytes(data=value, mime_type="audio/ogg")
    return types.Part.from_uri(file_uri=value, mime_type="audio/ogg")


def gcs_upload(path, bucket, name):
    """Stage oversize audio for Vertex (D3). Lazy import: only this branch needs it."""
    from google.cloud import storage
    blob = storage.Client().bucket(bucket).blob(name)
    blob.upload_from_filename(str(path), content_type="audio/ogg")
    return f"gs://{bucket}/{name}"


def gcs_delete(uri):
    """Best-effort cleanup; the bucket's 1-day lifecycle rule is the backstop (D3).

    A failed delete must never turn a finished transcription into a failure.
    """
    from google.cloud import storage
    bucket, _, name = uri[len("gs://"):].partition("/")
    try:
        storage.Client().bucket(bucket).blob(name).delete()
    except Exception as e:                      # noqa: BLE001 - cleanup is advisory
        print(f"warning: could not delete {uri}: {e}", file=sys.stderr)


class VertexTranscriber:
    """Gemini-on-Vertex transcription (ARD §5.1, D1-D6).

    Vertex has no Files API — audio travels inline or as a gs:// URI. Everything
    that talks to the SDK is imported lazily so the unit suite needs neither the
    dependency nor credentials.
    """

    def __init__(self, project, location, model, bucket=None,
                 inline_limit=INLINE_LIMIT, client_factory=None):
        self.project, self.location, self.model = project, location, model
        self.bucket, self.inline_limit = bucket, inline_limit
        self._client_factory = client_factory

    def _client(self):
        if self._client_factory:
            return self._client_factory()
        from google import genai
        return genai.Client(vertexai=True, project=self.project, location=self.location)

    def transcribe(self, audio_path):
        with tempfile.TemporaryDirectory() as tmp:
            # Named after the meeting, not the temp dir: the GCS object inherits this
            # name, and two runs staging `audio.ogg` would collide in the bucket.
            ogg = Path(tmp) / f"{Path(audio_path).stem}.ogg"
            stage("transcoding")
            transcode(audio_path, ogg)
            if ogg.stat().st_size > self.inline_limit:
                stage("uploading")
            kind, value = audio_source(ogg, self.bucket, self.inline_limit)
            uri = value if kind == "uri" else None
            try:
                stage("transcribing")
                # A plain dict, not types.GenerateContentConfig: keeps the SDK import
                # lazy. max_output_tokens is left unset — the default IS the model
                # maximum, and naming a number here could only lower it.
                resp = self._client().models.generate_content(
                    model=self.model, contents=[PROMPT, build_part(kind, value)],
                    config={"temperature": 0})
                return check_response(resp)
            finally:
                if uri:
                    gcs_delete(uri)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest engine/tests/test_transcribe.py -q`
Expected: PASS

- [ ] **Step 5: Pin the dependencies this task introduced**

In `engine/pyproject.toml`, replace the `vertex` extra:

```toml
[project.optional-dependencies]
vertex = ["google-genai~=2.19", "google-cloud-storage~=2.18"]
```

In `engine/requirements.txt`, replace the `google-genai~=1.16` line with:

```
# transcribe: Gemini on Vertex AI (ARD §5.1) + GCS staging for oversize audio (D3)
google-genai~=2.19
google-cloud-storage~=2.18
```

`~=1.16` was never exercised against a working Vertex call; pin to the version this design was verified against.

- [ ] **Step 6: Commit**

```bash
git add engine/transcribe/__init__.py engine/tests/test_transcribe.py \
        engine/pyproject.toml engine/requirements.txt
git commit -m "feat(engine): real Vertex transcription with GCS staging and a truncation guard"
```

---

### Task 3: CLI `--out`, atomic writes, clean errors

**Files:**
- Modify: `engine/transcribe/cli.py` (whole file)
- Modify: `engine/engine_common/__init__.py` (add `write_text_atomic`)
- Modify: `config/engine.env.example`
- Modify: `engine/transcribe/README.md`
- Test: `engine/tests/test_transcribe.py`

**Interfaces:**
- Consumes: `VertexTranscriber`, `run_transcribe` from Tasks 1–2.
- Produces:
  - `engine_common.write_text_atomic(path, text) -> pathlib.Path`
  - `transcribe.cli.main(argv=None) -> int`, accepting `[--out PATH] BASENAME`

- [ ] **Step 1: Write the failing tests**

Add `from transcribe import cli` to the top import block, then append:

```python
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


def test_write_text_atomic_creates_parents(tmp_path):
    from engine_common import write_text_atomic
    target = tmp_path / "a" / "b" / "c.txt"
    write_text_atomic(target, "متن")
    assert target.read_text(encoding="utf-8") == "متن"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest engine/tests/test_transcribe.py -q`
Expected: FAIL — `TypeError: main() takes …` / `ImportError: cannot import name 'write_text_atomic'`

- [ ] **Step 3: Add `write_text_atomic` beside its JSON sibling**

In `engine/engine_common/__init__.py`, directly after `write_json_atomic`:

```python
def write_text_atomic(path, text):
    """Same guarantee as write_json_atomic, for plain text (transcripts).

    A killed process must never leave a partial transcript at the destination —
    the idempotency pre-check would later read it as a finished one.
    """
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return path
```

- [ ] **Step 4: Rewrite the CLI**

Replace the whole of `engine/transcribe/cli.py`:

```python
import argparse
import os
import sys
from pathlib import Path

from engine_common import write_text_atomic
from transcribe import VertexTranscriber, run_transcribe


def main(argv=None):
    ap = argparse.ArgumentParser(prog="transcribe")
    ap.add_argument("basename")
    ap.add_argument("--out", help="also write the transcript here, atomically; "
                                  "an existing file is left alone and no call is made")
    args = ap.parse_args(argv)

    out = Path(args.out) if args.out else None
    if out and out.exists():          # FR-P2 idempotency, mirrored for --out
        print(out.read_text(encoding="utf-8"), end="")
        return 0

    tr = VertexTranscriber(os.environ.get("VERTEX_PROJECT"),
                           os.environ.get("VERTEX_LOCATION"),
                           os.environ.get("GEMINI_MODEL"),
                           bucket=os.environ.get("GCS_BUCKET"))
    try:
        text, _called = run_transcribe(args.basename, tr)
    except Exception as e:            # noqa: BLE001 - the message is the product here
        # Bot 1 shows this line to the user and the pipeline reads it from the
        # Bash output, so a clean sentence beats a traceback.
        print(f"error: {e}", file=sys.stderr)
        return 1
    if out:
        write_text_atomic(out, text)
    print(text, end="")               # raw transcript to stdout; the pipeline cleans + stores
    return 0
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest engine/tests/test_transcribe.py -q`
Expected: PASS

- [ ] **Step 6: Fill in the environment example**

Replace the transcribe block in `config/engine.env.example`:

```
# transcribe: Gemini on Vertex AI (model configurable so version bumps don't break code)
VERTEX_PROJECT=injafood
VERTEX_LOCATION=global
GEMINI_MODEL=gemini-3.1-pro-preview
# Oversize audio (past ~2.3 h at 16 kbps) is staged here and deleted after the call.
# Unset, the oversize branch fails loudly instead of attempting an inline call Vertex rejects.
GCS_BUCKET=injafood-transcribe-staging
# Opus bitrate for the pre-Vertex transcode. A knob, not a constant: speech
# intelligibility at a given bitrate is a property of the recordings.
TRANSCODE_BITRATE=16k
# GCP auth: ADC or service-account key — the key file lives OUTSIDE data-repo and git
GOOGLE_APPLICATION_CREDENTIALS=/path/outside/repos/service-account.json
```

- [ ] **Step 7: Update the CLI's README**

Replace the body of `engine/transcribe/README.md` under the console-command line:

```markdown
Gemini-on-Vertex transcription with idempotency pre-check (ARD §5.1, FR-P2):

- Skips the Vertex call entirely if `meetings/transcripts/{basename}.txt` exists,
  and — with `--out PATH` — if `PATH` exists.
- `transcribe [--out PATH] <basename>`. Without `--out`, the transcript goes to
  stdout and the pipeline stores it. With it, the transcript is also written to
  `PATH` atomically (Bot 1 uses this for `meetings/transcripts/raw/`).
- Progress breadcrumbs (`stage: transcoding` / `uploading` / `transcribing`) go to
  stderr; stdout is only ever the transcript.
- Every audio is transcoded to mono Opus at `TRANSCODE_BITRATE` (default 16k)
  first. Vertex has **no Files API** — audio travels inline under 16 MiB, and
  above that through `gs://$GCS_BUCKET`, deleted after the call (NFR-2).
- An incomplete response (output ceiling, safety block, empty) raises and exits 1
  rather than writing a truncated transcript.
- Env: `VERTEX_PROJECT`, `VERTEX_LOCATION`, `GEMINI_MODEL`, `GCS_BUCKET`,
  `TRANSCODE_BITRATE` (see `config/engine.env.example`).
- Output: Persian transcript with speaker labels; the Gemini system prompt lives
  here (full text in ARD §5.1). Claude verifies/cleans chrome in the pipeline.
- GCP service account key lives OUTSIDE data-repo (server env / config), never in git.
```

- [ ] **Step 8: Commit**

```bash
git add engine/transcribe/cli.py engine/engine_common/__init__.py \
        engine/tests/test_transcribe.py config/engine.env.example engine/transcribe/README.md
git commit -m "feat(engine): transcribe --out writes the transcript atomically"
```

---

### Task 4: Bot 1's background transcription module

**Files:**
- Create: `upload-bot/upload_bot/transcription.py`
- Test: `upload-bot/tests/test_transcription.py`

**Interfaces:**
- Consumes: the `transcribe` console script from Tasks 1–3 (invoked as a subprocess, not imported — the bot and the engine stay separate installs).
- Produces:
  - `raw_path(root, basename) -> pathlib.Path`
  - `fa_elapsed(seconds) -> str`
  - `schedule(ctx, root, basename, chat_id) -> asyncio.Task | None`
  - `run(message, root, basename) -> bool` — the coroutine `schedule` dispatches
  - Module constants `TICK`, `TIMEOUT`, `QUEUED`, `RUNNING`, `DONE`, `FAILED`, `STAGES`, `_exec`

- [ ] **Step 1: Write the failing tests**

Create `upload-bot/tests/test_transcription.py`:

```python
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
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


def test_schedule_is_a_noop_without_vertex_project(monkeypatch, tmp_path):
    monkeypatch.delenv("VERTEX_PROJECT", raising=False)
    ctx = SimpleNamespace(bot=SimpleNamespace(send_message=AsyncMock()),
                          application=SimpleNamespace(create_task=lambda c: c))
    assert asyncio.run(tx.schedule(ctx, tmp_path, "cooking-1405-04-19", 42)) is None
    ctx.bot.send_message.assert_not_awaited()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest upload-bot/tests/test_transcription.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'upload_bot.transcription'`

- [ ] **Step 3: Implement**

Create `upload-bot/upload_bot/transcription.py`:

```python
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

QUEUED = "⏳ در صف رونویسی…"
RUNNING = "⏳ در حال {stage} — {elapsed} گذشته"
DONE = "✅ رونویسی آماده شد"
FAILED = ("⚠️ رونویسی خودکار انجام نشد؛ صوت ذخیره شده و خط لوله خودش رونویسی می‌کند.\n"
          "{detail}")

STAGES = {"transcoding": "فشرده‌سازی صدا",
          "uploading": "بارگذاری فایل",
          "transcribing": "رونویسی"}

_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def raw_path(root, basename):
    return Path(root) / "meetings" / "transcripts" / "raw" / f"{basename}.txt"


def fa_elapsed(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}".translate(_FA)


async def _edit(message, text):
    try:
        await message.edit_text(text)
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


async def _ticker(message, state, started):
    while True:
        await asyncio.sleep(TICK)
        await _edit(message, RUNNING.format(
            stage=STAGES.get(state["stage"], state["stage"]),
            elapsed=fa_elapsed(time.monotonic() - started)))


async def run(message, root, basename):
    """Transcribe one recording. Returns True on success. Never raises."""
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
            await _edit(message, FAILED.format(detail=str(e)[:300]))
            return False

        reader = asyncio.create_task(_read_stderr(proc.stderr, state, tail))
        ticker = asyncio.create_task(_ticker(message, state, started))
        try:
            code = await asyncio.wait_for(proc.wait(), timeout=TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            code, tail = 1, [f"از {TIMEOUT // 60} دقیقه گذشت و پاسخی نیامد"]
        finally:
            ticker.cancel()
            await asyncio.gather(reader, ticker, return_exceptions=True)

        if code == 0:
            await _edit(message, DONE)
            return True
        # Plain text, never Markdown: the detail is the CLI's own stderr.
        await _edit(message, FAILED.format(detail=" ".join(tail)[:300] or "خطای نامشخص"))
        return False


async def schedule(ctx, root, basename, chat_id):
    """Start transcription in the background (D13). No-op if Vertex is unconfigured (D17)."""
    if not os.environ.get("VERTEX_PROJECT"):
        return None
    message = await ctx.bot.send_message(chat_id, QUEUED)
    return ctx.application.create_task(run(message, root, basename))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest upload-bot/tests/test_transcription.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add upload-bot/upload_bot/transcription.py upload-bot/tests/test_transcription.py
git commit -m "feat(upload-bot): background transcription with a live progress message"
```

---

### Task 5: Wire it into the voice handler

**Files:**
- Modify: `upload-bot/upload_bot/handlers.py:85-103` (the `v_file` handler) and its import block
- Test: `upload-bot/tests/test_handlers_voice.py` (new file — the repo has no handler test yet)

**Interfaces:**
- Consumes: `transcription.schedule` from Task 4.
- Produces: nothing new; `v_file` keeps its signature and its return value (`ConversationHandler.END`).

- [ ] **Step 1: Write the failing test**

Create `upload-bot/tests/test_handlers_voice.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest upload-bot/tests/test_handlers_voice.py -q`
Expected: FAIL — `AttributeError: module 'upload_bot.handlers' has no attribute 'schedule_transcription'`

- [ ] **Step 3: Implement**

In `upload-bot/upload_bot/handlers.py`, add to the import block (alphabetical, after `from upload_bot.staging import …`):

```python
from upload_bot.transcription import schedule as schedule_transcription
```

Then, in `v_file`, replace everything from the `await update.message.reply_text(` call to `return ConversationHandler.END` with:

```python
        await update.message.reply_text(
            f"ذخیره شد ✅\nبرای شروع پردازش این را در ربات کنترل بفرستید:\n"
            f"`Start /process-voice {base}`", parse_mode="Markdown")
        # Transcription runs in the background (D13): the conversation ends now so
        # the next voice can be uploaded immediately. The Start line above stays in
        # this message on purpose — if transcription fails, the pipeline still
        # transcribes the recording itself.
        try:
            await schedule_transcription(ctx, root, base, update.effective_chat.id)
        except Exception:                 # noqa: BLE001 - the audio is already safe
            logger.exception("could not schedule transcription for %s", base)
        ctx.user_data.pop("voice", None)
        return ConversationHandler.END
```

Add at the top of `handlers.py`, below the imports:

```python
logger = logging.getLogger(__name__)
```

and `import logging` as the first import line.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest upload-bot/tests/ -q`
Expected: PASS — the new file plus the eight existing bot test modules.

- [ ] **Step 5: Commit**

```bash
git add upload-bot/upload_bot/handlers.py upload-bot/tests/test_handlers_voice.py
git commit -m "feat(upload-bot): transcribe every uploaded voice in the background"
```

---

### Task 6: The pipeline promotes raw transcripts

This task edits the **other repository** (`data-repo`), which is a separate git checkout with its own history. Nothing here is unit-testable; Task 10 verifies it against a real run.

**Files:**
- Modify: `../data-repo/.claude/skills/process-voice/SKILL.md` — Stage 1 (lines ~122-142) and Gate A's listing (lines ~97-117)

**Interfaces:**
- Consumes: `meetings/transcripts/raw/{basename}.txt` written by Task 4.
- Produces: no code interface; the approved transcript contract is unchanged.

- [ ] **Step 1: Rewrite Stage 1**

Replace the numbered list under `## Stage 1 — Transcribe-missing reconcile (FR-P1, FR-P2)` with:

```markdown
Runs **after** Gate A, only for the confirmed set. Idempotent. For **each** confirmed recording
that lacks a transcript at `meetings/transcripts/{basename}.txt`:

1. **If `meetings/transcripts/raw/{basename}.txt` exists** — Bot 1 already transcribed this
   recording at upload time. Read that file. **No Vertex call is needed or allowed.**
2. **Otherwise** run the transcription CLI (idempotent — skips Vertex AI if the transcript
   already exists) and read its stdout:
   ```
   Bash: DATA_ROOT=<data-repo> transcribe {basename}
   ```
3. Either way, the text you now hold is **raw**: strip any Gemini preamble, postamble, or
   section headings injected by the model.
   - **Per-file verbatim sanity gate:** if the text appears summarized or rewritten (rather than
     verbatim speech), flag it to the user and STOP. When stopping, tell the user (in Persian) their
     options: «(الف) پردازش را دوباره اجرا کنید تا رونویسی از نو انجام شود؛ یا (ب) یک رونویسِ
     اصلاح‌شده را به‌صورت دستی در `meetings/transcripts/{basename}.txt` قرار دهید و دوباره اجرا کنید
     — در این حالت خط لوله به‌دلیل ایدمپوتنسی از Vertex عبور می‌کند و همان فایل شما را استفاده
     می‌کند.» (For a bot-produced raw file, re-running means deleting
     `meetings/transcripts/raw/{basename}.txt` first — otherwise the same raw text is read again.)
   - Write the cleaned text to `meetings/transcripts/{basename}.txt`. Leave the raw file in
     place; it is the audit trail of what the model actually returned.
4. Confirm every recording in the set now has a transcript before continuing. (Recordings that
   already had a transcript are untouched.) This whole reconcile runs **in one turn** (each
   `transcribe` is a CLI call, not a turn end) — proceed to Stage 2 in the same turn.
```

- [ ] **Step 2: Add the third state to Gate A's listing**

In the Gate A example listing, where recordings are enumerated with their transcript state, add
the new state alongside the existing «فاقد رونویس — رونویسی می‌شود»:

```
   ۳. dining-1405-04-15 (رونویس خام آماده است — بازبینی می‌شود)
```

and state in the surrounding instruction that a recording with a raw transcript costs no Vertex
call, so the user can tell at Gate A which recordings will merely be reviewed.

- [ ] **Step 3: Verify the guard permits the new path**

Run:

```bash
cd ../data-repo && python3 - <<'EOF'
import json, subprocess
payload = {"tool_name": "Write", "cwd": ".",
           "tool_input": {"file_path": "meetings/transcripts/raw/x.txt"}}
p = subprocess.run(["python3", ".claude/hooks/guard.py"], input=json.dumps(payload),
                   capture_output=True, text=True)
print("exit", p.returncode, p.stderr)
EOF
```

Expected: `exit 0` — reading raw and writing the approved transcript are both permitted; only
`departments/**/processes/*.json`, `order.json` and `.claude/**` are guarded.

- [ ] **Step 4: Commit in the data-repo**

```bash
cd ../data-repo
git add .claude/skills/process-voice/SKILL.md
git commit -m "feat(pipeline): promote bot-produced raw transcripts instead of re-transcribing"
```

---

### Task 7: Images and compose

**Files:**
- Modify: `deploy/upload-bot.Dockerfile`, `deploy/control-bot.Dockerfile`
- Modify: `deploy/docker-compose.yml` (upload-bot and control-bot services)
- Modify: `deploy/docker-compose.local.yml` (upload-bot and control-bot services)

**Interfaces:**
- Consumes: the `transcribe` console script and the `[vertex]` extra from Tasks 1–3.
- Produces: `transcribe` on PATH inside both bot containers, with `VERTEX_*`, `GCS_BUCKET` and `GOOGLE_APPLICATION_CREDENTIALS` set.

- [ ] **Step 1: Give Bot 1's image ffmpeg and the engine**

Replace `deploy/upload-bot.Dockerfile` entirely:

```dockerfile
# Bot 1 — raw voice/file intake (ARD §11) + automatic transcription (design 2026-08-25).
FROM python:3.11-slim
WORKDIR /app
# ffmpeg/libopus: every audio is transcoded to mono Opus before the Vertex call (D1).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY upload-bot/ /app/upload-bot/
# The engine CLIs are baked in so `transcribe` is on PATH; the bot invokes it as a
# subprocess rather than importing it (the two stay separate installs).
COPY engine/ /opt/engine/
RUN pip install --no-cache-dir "/app/upload-bot[socks]" "/opt/engine[vertex]"
# data-repo bind-mounted at runtime; DATA_ROOT + ALLOWED_USER_IDS via env_file
CMD ["upload-bot"]
```

- [ ] **Step 2: Fix Bot 2's image**

In `deploy/control-bot.Dockerfile`, add `ffmpeg` to the existing apt list:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates patch nodejs npm ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

and change the engine install line to pull the extra:

```dockerfile
# [vertex] is load-bearing: without it google-genai is absent from this image and
# the pipeline's own `transcribe` fails on import, which is the state before this change.
RUN pip install --no-cache-dir "/opt/engine[vertex]"
```

- [ ] **Step 3: Wire the server stack**

In `deploy/docker-compose.yml`, `upload-bot` service, extend `environment` and `volumes`:

```yaml
    environment:
      DATA_ROOT: /data
      TELEGRAM_API_BASE_URL: http://telegram-bot-api:8081
      # Automatic transcription at upload (design 2026-08-25). VERTEX_PROJECT unset
      # would turn the whole feature off, which is the only switch it has (D17).
      VERTEX_PROJECT: injafood
      VERTEX_LOCATION: global
      GEMINI_MODEL: gemini-3.1-pro-preview
      GCS_BUCKET: injafood-transcribe-staging
      GOOGLE_APPLICATION_CREDENTIALS: /secrets/vertex-sa.json
    volumes:
      - /opt/inja/data-repo:/data
      - telegram-bot-api-data:/var/lib/telegram-bot-api:ro
      - /opt/inja/secrets/vertex-sa.json:/secrets/vertex-sa.json:ro
```

Add the same five environment entries and the same secret mount to the `control-bot` service, so
the pipeline can still transcribe a recording that arrived without a raw transcript.

- [ ] **Step 4: Wire the local stack**

In `deploy/docker-compose.local.yml`, `upload-bot` service:

```yaml
    environment:
      DATA_ROOT: /data
      # (No TELEGRAM_API_BASE_URL -> uses public api.telegram.org, 20MB file cap.)
      VERTEX_PROJECT: injafood
      VERTEX_LOCATION: global
      GEMINI_MODEL: gemini-3.1-pro-preview
      GCS_BUCKET: injafood-transcribe-staging
      # The host's own gcloud ADC, read-only. Needs a quota project set once:
      #   gcloud auth application-default set-quota-project injafood
      GOOGLE_APPLICATION_CREDENTIALS: /root/.config/gcloud/application_default_credentials.json
      GOOGLE_CLOUD_PROJECT: injafood
      # Google is reached through the same host SOCKS proxy as Telegram. Telegram
      # itself is unaffected: app.py passes TELEGRAM_PROXY explicitly, which makes
      # httpx ignore env proxies.
      HTTPS_PROXY: "socks5h://host.docker.internal:2080"
      NO_PROXY: "localhost,127.0.0.1"
    volumes:
      - "../../data-repo:/data"
      - "${HOME}/.config/gcloud:/root/.config/gcloud:ro"
```

Add the same block to the local `control-bot` service, merging `HTTPS_PROXY`/`NO_PROXY` with the
entries it already has (keep `NO_PROXY` including `api.anthropic.com,.anthropic.com`).

- [ ] **Step 5: Build and check the tools are present**

```bash
cd deploy
docker compose -f docker-compose.local.yml build upload-bot
docker compose -f docker-compose.local.yml run --rm --entrypoint sh upload-bot -c \
  'ffmpeg -version | head -1 && transcribe --help'
```

Expected: an ffmpeg version line, then the CLI's usage line showing `[--out OUT] basename`.

- [ ] **Step 6: Rewrite the transcription runbook**

`docs/runbooks/04-transcription.md` currently tells the operator that enabling Vertex is three
config lines plus the extra. That was never true and is now demonstrably wrong. Keep its
"pre-placed transcript" section (it is still the escape hatch and still correct), and replace
the **"Enabling Vertex later"** section with:

```markdown
## Vertex transcription

Both bots transcribe through Gemini on Vertex. Bot 1 does it automatically when a voice is
uploaded; the pipeline does it for any recording that arrives without one.

Required in the env of **both** `upload-bot` and `control-bot` (see `deploy/docker-compose.yml`):

| Variable | Value |
|---|---|
| `VERTEX_PROJECT` | `injafood` |
| `VERTEX_LOCATION` | `global` |
| `GEMINI_MODEL` | `gemini-3.1-pro-preview` |
| `GCS_BUCKET` | `injafood-transcribe-staging` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/secrets/vertex-sa.json` (mounted read-only from `/opt/inja/secrets/`) |
| `TRANSCODE_BITRATE` | optional, default `16k` |

Both images also need **ffmpeg** and the engine installed with the `[vertex]` extra — every
audio is transcoded to mono Opus before the call, because Vertex has no Files API and takes
audio only as inline bytes (under 16 MiB) or a `gs://` URI. Files above the limit are staged in
the bucket and deleted right after the call; the bucket's 1-day lifecycle rule catches strays.

**Transcripts arrive in two stages.** Bot 1 writes `meetings/transcripts/raw/{name}.txt` — the
model's unedited output. The pipeline's Stage 1 strips any injected preamble, runs the verbatim
check, and writes the approved `meetings/transcripts/{name}.txt`. Only the approved file counts
as a transcript; the raw file is the audit trail.

**When transcription fails**, the audio is still saved and the user is told. Nothing is lost:
the pipeline transcribes the recording itself on the next run.

**A meeting past roughly 2½ hours** can exceed the model's output ceiling. That is refused with
an explicit error rather than written as a truncated transcript — split the audio and upload
the parts.
```

- [ ] **Step 7: Commit**

```bash
git add deploy/upload-bot.Dockerfile deploy/control-bot.Dockerfile \
        deploy/docker-compose.yml deploy/docker-compose.local.yml \
        docs/runbooks/04-transcription.md
git commit -m "feat(deploy): ffmpeg + vertex extra in both bot images, Vertex env wired"
```

---

### Task 8: Provision the bucket and the service account

Real cloud resources. **Run these with the user present** — they cost money and create IAM.
`gcloud` is already authenticated locally against project `injafood`.

**Files:** none in the repo. The outputs are a bucket, a service account, and a key file placed outside both repos.

**Interfaces:**
- Consumes: `GCS_BUCKET=injafood-transcribe-staging` from Task 3's env example and Task 7's compose files.
- Produces: `gs://injafood-transcribe-staging` and `/opt/inja/secrets/vertex-sa.json` on the server.

- [ ] **Step 1: Create the bucket**

```bash
gcloud storage buckets create gs://injafood-transcribe-staging \
  --project=injafood --location=us-central1 --uniform-bucket-level-access
```

If the name is taken globally, use `injafood-transcribe-staging-1` and update `GCS_BUCKET`
in `config/engine.env.example`, `deploy/docker-compose.yml` and `deploy/docker-compose.local.yml`.

- [ ] **Step 2: Add the 1-day lifecycle backstop**

```bash
cat > /tmp/lifecycle.json <<'EOF'
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 1}}]}
EOF
gcloud storage buckets update gs://injafood-transcribe-staging --lifecycle-file=/tmp/lifecycle.json
```

The code deletes each object right after its call; this only catches a crash in between.

- [ ] **Step 3: Create the service account and grant it exactly what it needs**

```bash
gcloud iam service-accounts create inja-transcribe \
  --project=injafood --display-name="inja transcription"

gcloud projects add-iam-policy-binding injafood \
  --member="serviceAccount:inja-transcribe@injafood.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Bucket-scoped, not project-wide.
gcloud storage buckets add-iam-policy-binding gs://injafood-transcribe-staging \
  --member="serviceAccount:inja-transcribe@injafood.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

- [ ] **Step 4: Enable the API and mint the key**

```bash
gcloud services enable aiplatform.googleapis.com storage.googleapis.com --project=injafood
gcloud iam service-accounts keys create ./vertex-sa.json \
  --iam-account=inja-transcribe@injafood.iam.gserviceaccount.com
```

The key file goes to the server at `/opt/inja/secrets/vertex-sa.json` in Task 11 and is never
committed. Delete the local copy once it is in place.

- [ ] **Step 5: Confirm the model answers on the `global` endpoint**

```bash
DATA_ROOT=$PWD python3 - <<'EOF'
from google import genai
c = genai.Client(vertexai=True, project="injafood", location="global")
print(c.models.generate_content(model="gemini-3.1-pro-preview",
                                contents=["Reply with the single word OK"]).text)
EOF
```

Expected: `OK`. A 404/`not found` here means `global` does not serve this model — switch
`VERTEX_LOCATION` to `us-central1` in the three files from Step 1 and re-run. A model-not-found
for `gemini-3.1-pro-preview` specifically means the preview was withdrawn — fall back to
`gemini-2.5-pro` and note it in the spec's D4.

---

### Task 9: Real transcription of a long meeting

Verifies §8.2 of the spec — the only check that exercises a genuine 70-minute file end to end.

**Files:** none. Working files go in the scratchpad.

- [ ] **Step 1: Build a scratch DATA_ROOT with one untranscribed meeting**

The corpus files all have transcripts, so the idempotency pre-check would short-circuit.

```bash
SCRATCH=$(mktemp -d)
mkdir -p "$SCRATCH/meetings/audio" "$SCRATCH/meetings/transcripts"
cp "../data-repo/meetings/audio/dining-1405-04-11.m4a" "$SCRATCH/meetings/audio/"
```

- [ ] **Step 2: Transcribe it for real**

```bash
# The dev venv installs the engine WITHOUT the extra, so add it here.
uv pip install -q --python .venv/bin/python -e "./engine[vertex]"
time env DATA_ROOT=$SCRATCH VERTEX_PROJECT=injafood VERTEX_LOCATION=global \
  GEMINI_MODEL=gemini-3.1-pro-preview GCS_BUCKET=injafood-transcribe-staging \
  .venv/bin/transcribe --out "$SCRATCH/raw.txt" dining-1405-04-11
```

Expected on stderr: `stage: transcoding`, then `stage: transcribing` (not `uploading` — a
65-minute meeting transcodes to roughly 8 MB, under the inline limit). Exit code 0.

- [ ] **Step 3: Judge the transcript against the existing one**

```bash
wc -m "$SCRATCH/raw.txt" ../data-repo/meetings/transcripts/dining-1405-04-11.txt
head -20 "$SCRATCH/raw.txt"
tail -20 "$SCRATCH/raw.txt"
```

Check four things and report them to the user:
1. **Length** is in the same range as the existing transcript (~44 000 characters). Far shorter
   means the model summarized, or the output was truncated — the guard should have caught the
   latter, so a short-and-clean exit is a prompt/model problem worth stopping for.
2. **Verbatim Persian speech with speaker labels**, matching the style of the existing corpus.
3. **The end of the file is the end of the meeting**, not a sentence cut mid-word.
4. **Injected chrome** — a preamble like «متن کامل و یکپارچه … خدمت شما:». Its presence is
   expected and fine; the pipeline strips it (Task 6). Note whether it appeared.

- [ ] **Step 4: Exercise the GCS branch once**

Force the oversize path on the same file with a low inline limit, to prove upload, `from_uri`
and delete all work against the real bucket:

```bash
DATA_ROOT=$SCRATCH VERTEX_PROJECT=injafood VERTEX_LOCATION=global \
GEMINI_MODEL=gemini-3.1-pro-preview GCS_BUCKET=injafood-transcribe-staging \
.venv/bin/python -c "
import os, transcribe
tr = transcribe.VertexTranscriber(os.environ['VERTEX_PROJECT'], os.environ['VERTEX_LOCATION'],
                                  os.environ['GEMINI_MODEL'],
                                  bucket=os.environ['GCS_BUCKET'], inline_limit=1)
print(tr.transcribe('$SCRATCH/meetings/audio/dining-1405-04-11.m4a')[:200])
"
gcloud storage ls gs://injafood-transcribe-staging/transcribe/ || echo "empty — object deleted"
```

Expected: transcript text, and an empty listing afterwards. A leftover object means `gcs_delete`
failed — read its warning on stderr. A Vertex permission error here is the known case in spec
D3: grant `roles/storage.objectViewer` on the bucket to
`service-<PROJECT_NUMBER>@gcp-sa-aiplatform.iam.gserviceaccount.com` and re-run.

- [ ] **Step 5: Report before continuing**

Stop and give the user: wall-clock time, transcript length vs the existing one, whether chrome
appeared, and whether the GCS branch cleaned up. If the transcript quality is poor, the knob is
`TRANSCODE_BITRATE` — raise it to `24k` and repeat Step 2 before changing anything else.

---

### Task 10: Two voices through the bot

Verifies §8.3. The voices must be **short** (2–5 minutes): the local stack talks to the public
Telegram Bot API, which caps files at 20 MB, so a real 70-minute voice cannot reach the bot here
at all. Task 9 is what covers long files.

- [ ] **Step 1: Confirm the container can reach Vertex through the proxy**

Google is reached from this machine through the host SOCKS proxy, and credential refresh uses a
different HTTP stack than the model call — verify both before blaming the bot:

```bash
cd deploy
docker compose -f docker-compose.local.yml up -d --build upload-bot
docker compose -f docker-compose.local.yml exec upload-bot python3 -c "
from google import genai
c = genai.Client(vertexai=True, project='injafood', location='global')
print(c.models.generate_content(model='gemini-3.1-pro-preview', contents=['say OK']).text)
"
```

Expected: `OK`. If it fails on the token refresh rather than the model call, install PySocks in
the image (`pip install pysocks` in `deploy/upload-bot.Dockerfile`) and rebuild — google-auth
refreshes through `requests`, which needs it for SOCKS.

- [ ] **Step 2: Send the first voice**

In Telegram, to **@uploadtestinjsbot**: `/start` → «صوت» → a date → a department → «تمام شد» →
send a 2–5 minute voice message.

Expected, in order:
1. «ذخیره شد ✅» with the `Start /process-voice …` line — **immediately**, not after the transcript.
2. A second message «⏳ در صف رونویسی…» that becomes «⏳ در حال رونویسی — ۰:۰۸ گذشته» and keeps
   ticking in Persian digits.
3. «✅ رونویسی آماده شد».

- [ ] **Step 3: Send the second voice while the first is still running**

Repeat Step 2 without waiting. Expected: the second voice's progress message sits at
«⏳ در صف رونویسی…» until the first finishes — the lock from D15 in action.

- [ ] **Step 4: Check what landed on disk**

```bash
ls -la ../../data-repo/meetings/audio/ ../../data-repo/meetings/transcripts/raw/
head -5 ../../data-repo/meetings/transcripts/raw/*.txt
```

Expected: both audio files, both raw transcripts, and **no** new files directly in
`meetings/transcripts/` — the approved transcript is the pipeline's to write.

- [ ] **Step 5: Prove the failure path keeps the audio**

```bash
docker compose -f docker-compose.local.yml exec upload-bot \
  sh -c 'mv /usr/bin/ffmpeg /usr/bin/ffmpeg.off'
```

Send a third short voice. Expected: «ذخیره شد ✅» as always, then
«⚠️ رونویسی خودکار انجام نشد…» with an ffmpeg detail — and the audio file present in
`meetings/audio/` with no raw transcript. Restore afterwards:

```bash
docker compose -f docker-compose.local.yml exec upload-bot \
  sh -c 'mv /usr/bin/ffmpeg.off /usr/bin/ffmpeg'
```

- [ ] **Step 6: Run the pipeline on one of them**

In Telegram, to **@aiprocessTestinjabo**: `Start /process-voice <basename>` for the first voice.

Expected: Gate A lists it as «رونویس خام آماده است — بازبینی می‌شود»; after confirmation Stage 1
writes `meetings/transcripts/{basename}.txt` **without** a `transcribe` Bash call (watch the
bot's message stream for it), the raw file stays in place, and the run proceeds to classify.

- [ ] **Step 7: Run the full suite and lint**

```bash
make test
make lint
```

Expected: all green. This is the one point in the plan where the whole suite runs.

- [ ] **Step 8: Commit any fixes and merge**

```bash
git add -A && git commit -m "fix(transcribe): <whatever the real runs surfaced>"
git checkout main && git merge --no-ff feat/vertex-transcription
```

---

### Task 11: Move it to the server

Verifies §8.4. Only after Tasks 9 and 10 both pass.

The server's host and SSH details are in `docs/runbooks/01-server-setup.md` and
`docs/runbooks/03-deploy.md`; substitute them for `<server>` below.

- [ ] **Step 1: Place the credential**

```bash
scp vertex-sa.json <server>:/opt/inja/secrets/vertex-sa.json
ssh <server> 'chmod 600 /opt/inja/secrets/vertex-sa.json'
```

Then delete the local copy. It is never committed to either repo.

- [ ] **Step 2: Pull and rebuild both bots**

```bash
ssh <server> 'cd /opt/inja/code-repo && git pull && cd deploy && \
  docker compose build upload-bot control-bot && \
  docker compose up -d upload-bot control-bot'
```

- [ ] **Step 3: Pull the data-repo change**

The pipeline reads its playbook from the mounted data-repo, so Task 6's commit has to reach the
server too:

```bash
ssh <server> 'cd /opt/inja/data-repo && git pull'
```

- [ ] **Step 4: Verify the tools inside the running containers**

```bash
ssh <server> 'cd /opt/inja/code-repo/deploy && \
  docker compose exec upload-bot sh -c "ffmpeg -version | head -1; transcribe --help | head -2" && \
  docker compose exec control-bot sh -c "ffmpeg -version | head -1; python3 -c \"from google import genai; print(genai.__name__)\""'
```

Expected: ffmpeg in both, the CLI usage line in Bot 1, and `google.genai` importing in Bot 2 —
that last one is the §2.3 defect this plan fixes.

- [ ] **Step 5: One real meeting end to end**

Through the production bots: upload one real meeting voice (the server runs a local Bot API
server, so the 20 MB cap does not apply), watch the progress message, confirm the raw transcript
appears, then run `/process-voice` on it and confirm Stage 1 promotes without a Vertex call.

- [ ] **Step 6: Watch the logs for one day**

```bash
ssh <server> 'cd /opt/inja/code-repo/deploy && docker compose logs --tail=200 upload-bot'
gcloud storage ls gs://injafood-transcribe-staging/transcribe/
```

Expected: no repeated transcription errors, and an empty bucket listing — every staged object
deleted by the code, with the lifecycle rule never needing to fire.
