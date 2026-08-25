import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from engine_common import data_root

PROMPT = """You are a precise audio transcriber. Reproduce ONLY the spoken content of the
audio file, in Persian.
Rules:
- Separate speakers based on the flow of conversation, and start each speaking
  turn with the speaker's label. If the speaker's name is stated in the audio,
  use it (e.g. «گوینده مرد ۱ (آقای مازندرانی):»); otherwise use «گوینده زن:»,
  «گوینده مرد ۱:», «گوینده مرد ۲:», and so on.
- No timing / timecodes.
- Do not add any preamble, conclusion, heading, commentary, or sentence of your
  own. The output must be the transcript and nothing else.
- Do not remove, summarize, or edit anything; reproduce exactly what was said."""


# Vertex caps the WHOLE request near 20 MB — prompt and protocol overhead ride
# along with the audio, so route to GCS well before that (D2).
INLINE_LIMIT = 16 * 1024 * 1024

# Tuning knobs (D20). One call for a whole meeting silently thinned the transcript and
# stopped two minutes early while reporting a normal finish; 13-minute chunks of the same
# audio produced 28% more text and reached the end. The overlap exists so a sentence on a
# seam cannot fall between two chunks — duplication is recoverable, loss is not.
CHUNK_SECONDS = 13 * 60
CHUNK_OVERLAP = 10
# Not a fold threshold — the length below which an empty FINAL chunk is forgiven rather
# than failed (D23). Folding a short tail into the chunk before it was measured losing the
# end of the meeting: a 41-second final chunk captured «گام به گام بریم جلو», and the same
# audio with that tail merged into a 13.5-minute chunk dropped it. Short tails stay.
MIN_TAIL_SECONDS = 90
# Container and stream durations that disagree by more than this are worth saying out loud.
DURATION_DISAGREEMENT = 2.0

# Bounded retry per chunk (D22).
RETRIES = 3
RETRY_BACKOFF = 2.0


def stage(name):
    """Progress breadcrumb for Bot 1; stdout stays pure transcript (D8)."""
    print(f"stage: {name}", file=sys.stderr, flush=True)


def transcode(src, dst, bitrate=None, start=None, duration=None, run=subprocess.run):
    """Down-mix any input to mono Opus (D1), optionally cutting one time range (D20).

    Unconditional, for every input: one code path and one MIME type instead of a
    format-to-MIME table for the m4a/mp3/ogg/wav mix Telegram and the corpus
    produce. A 13-minute chunk comes out around 1.5 MB at the default bitrate.

    `-ss` goes before `-i` — input seeking, so cutting minute 60 of a long meeting
    does not decode the first 59; it is frame-accurate here because we re-encode.
    """
    bitrate = bitrate or os.environ.get("TRANSCODE_BITRATE") or "16k"
    argv = ["ffmpeg", "-nostdin", "-v", "error", "-y"]
    if start is not None:
        argv += ["-ss", f"{start:.3f}"]
    argv += ["-i", str(src)]
    if duration is not None:
        argv += ["-t", f"{duration:.3f}"]
    argv += ["-vn", "-ac", "1", "-c:a", "libopus", "-b:a", bitrate, "-f", "ogg", str(dst)]
    proc = run(argv, capture_output=True, text=True)
    if proc.returncode != 0:
        detail = (proc.stderr or "").strip()[:500]
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {detail}")
    return Path(dst)


def probe_duration(path, run=subprocess.run):
    """Length of the source audio in seconds — the input to the chunk arithmetic.

    Both the container header and the audio stream are asked, and the longer answer wins.
    A header that under-reports while the stream runs on would shorten the last chunk with
    the coverage check (D24) none the wiser — the one remaining way audio could still be
    dropped in silence. A disagreement is left on the record for whoever reads the log.
    """
    proc = run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
               capture_output=True, text=True)
    values = []
    for line in (proc.stdout or "").splitlines():
        try:
            values.append(float(line.strip()))
        except ValueError:                  # "N/A", or the blank line between sections
            pass
    if proc.returncode != 0 or not values:
        detail = (proc.stderr or "").strip()[:500]
        raise RuntimeError(f"ffprobe could not read the duration of {Path(path).name}: {detail}")
    if max(values) - min(values) > DURATION_DISAGREEMENT:
        print(f"warning: {Path(path).name} reports {min(values):.1f}s in one place and "
              f"{max(values):.1f}s in another; using the longer", file=sys.stderr)
    return max(values)


def chunk_bounds(duration, chunk=CHUNK_SECONDS, overlap=CHUNK_OVERLAP):
    """(start, end) seconds for every chunk, advancing by `chunk` and ending `overlap` late.

    A fixed interval, and the last chunk is however short it turns out to be — measured, a
    41-second final chunk reproduced the end of the meeting exactly, and merging it into
    the chunk before it lost the ending. Short is correct; it is not an error to fix.
    """
    bounds, start = [], 0.0
    while start < duration:
        end = min(float(duration), start + chunk + overlap)
        bounds.append((start, end))
        if end >= duration:
            break
        start += chunk
    return bounds


def assert_coverage(bounds, duration, tolerance=1e-6):
    """D24: the boundaries must tile [0, duration]. A skipped segment is an invisible gap."""
    if not bounds or bounds[0][0] > tolerance or bounds[-1][1] < duration - tolerance:
        raise RuntimeError(f"chunk boundaries do not cover the {duration:.1f}s of audio: "
                           f"{bounds}")
    for (_, prev_end), (start, _) in zip(bounds, bounds[1:]):
        if start > prev_end + tolerance:
            raise RuntimeError(f"chunk boundaries leave a gap between {prev_end:.1f}s and "
                               f"{start:.1f}s")


def clock(seconds):
    return f"{int(seconds) // 60}:{int(seconds) % 60:02d}"


# Retried: a blip the same request could survive next time. Everything else — a blocked
# response, an invalid argument, a truncated one — fails on the first try, because
# repeating it only costs time and money (D22).
TRANSIENT_CODES = {408, 429, 500, 502, 503, 504}
TRANSIENT_MARKERS = ("unavailable", "deadline", "timeout", "timed out", "temporarily",
                     "connection reset", "connection aborted", "connection error",
                     "resource_exhausted", "internal server error", "server error")


def is_transient(exc):
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if isinstance(code, int) and code in TRANSIENT_CODES:
        return True
    msg = str(exc).lower()
    return any(marker in msg for marker in TRANSIENT_MARKERS)


def with_retry(fn, label, attempts=RETRIES):
    """Run `fn`, retrying transient failures; every exit path names the chunk (D21/D22)."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as e:                  # noqa: BLE001 - re-raised, labelled
            if attempt >= attempts or not is_transient(e):
                raise RuntimeError(f"{label} failed: {e}") from e
            time.sleep(RETRY_BACKOFF * attempt)


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


def transcript_path(root, basename):
    return root / "meetings" / "transcripts" / f"{basename}.txt"


def find_audio(root, basename):
    matches = sorted((root / "meetings" / "audio").glob(f"{basename}.*"))
    if not matches:
        raise FileNotFoundError(f"no audio for {basename} in meetings/audio/")
    return matches[0]


def run_transcribe(basename, transcriber, root=None):
    root = root or data_root()
    tp = transcript_path(root, basename)
    if tp.exists():                       # idempotency pre-check (FR-P2)
        return tp.read_text(encoding="utf-8"), False
    audio = find_audio(root, basename)
    return transcriber.transcribe(str(audio)), True


def check_response(resp, allow_empty=False):
    """Refuse a transcript the model did not finish (D6).

    `allow_empty` is the one exception (D23) and the caller decides when it applies:
    a final chunk shorter than MIN_TAIL_SECONDS may legitimately be silence. Every other
    guard still holds — a blocked or truncated short tail fails like any other chunk.

    A half transcript that lands on disk looking whole would silently truncate
    every downstream extraction, so every incomplete outcome raises instead.

    STOP is the only finish reason that means "finished": an allow-list, because a
    deny-list missed SPII, OTHER and seven more of FinishReason's 18 members, each of
    which ends the response holding partial text. An unset reason stays permissive.
    """
    candidates = getattr(resp, "candidates", None) or []
    if not candidates:
        raise RuntimeError("Vertex returned no candidates (blocked or empty response)")
    reason = str(getattr(candidates[0], "finish_reason", "") or "")
    if "MAX_TOKENS" in reason:
        raise RuntimeError("the transcript hit the model's output ceiling and is incomplete — "
                           "split this meeting's audio and transcribe the parts")
    if reason and "STOP" not in reason:
        raise RuntimeError("Vertex did not finish the response — blocked or cut short "
                           f"(finish_reason={reason})")
    text = getattr(resp, "text", None)
    if not text or not text.strip():
        if allow_empty:
            return ""
        raise RuntimeError("Vertex returned an empty transcript")
    return text


def build_part(kind, value):
    """Wrap the audio for the SDK. Lazy import: unit tests never reach this."""
    from google.genai import types
    if kind == "inline":
        return types.Part.from_bytes(data=value, mime_type="audio/ogg")
    return types.Part.from_uri(file_uri=value, mime_type="audio/ogg")


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
        """Transcribe the whole meeting in chunks, all or nothing (D20-D25).

        Every chunk's text is held in memory and returned only once all of them have
        succeeded, so a failure anywhere leaves the caller with an exception instead of a
        transcript that is quietly missing its last thirteen minutes.
        """
        duration = probe_duration(audio_path)
        bounds = chunk_bounds(duration)
        assert_coverage(bounds, duration)
        total = len(bounds)
        texts = []
        with tempfile.TemporaryDirectory() as tmp:
            stage("transcoding")
            for i, (start, end) in enumerate(bounds, 1):
                label = f"chunk {i}/{total} ({clock(start)}–{clock(end)})"
                # Thirteen minutes of a staff meeting transcribing to nothing is a fault;
                # forty seconds of people packing up transcribing to nothing is a fact.
                # As narrow as the evidence: final, short, and empty — nothing else.
                silence_ok = i == total and end - start < MIN_TAIL_SECONDS
                text = self._chunk(audio_path, tmp, i, total, start, end, label, silence_ok)
                if text:
                    texts.append(text)
        return "\n\n".join(texts)

    def _chunk(self, audio_path, tmp, i, total, start, end, label, silence_ok=False):
        # Named after the meeting and the chunk, not the temp dir: the GCS object
        # inherits this name, and two chunks staging `audio.ogg` would collide.
        ogg = Path(tmp) / f"{Path(audio_path).stem}-{i:02d}.ogg"
        transcode(audio_path, ogg, start=start, duration=end - start)
        if ogg.stat().st_size > self.inline_limit:
            stage("uploading")
        # Per chunk now: a 13-minute chunk fits inline at any sane bitrate, but the
        # routing still has to hold if the bitrate or the chunk length is raised.
        kind, value = audio_source(ogg, self.bucket, self.inline_limit)
        uri = value if kind == "uri" else None
        try:
            stage(f"transcribing {i}/{total}")
            return with_retry(lambda: self._call(kind, value, silence_ok), label)
        finally:
            if uri:
                gcs_delete(uri)

    def _call(self, kind, value, silence_ok=False):
        # A plain dict, not types.GenerateContentConfig: keeps the SDK import
        # lazy. max_output_tokens is left unset — the default IS the model
        # maximum, and naming a number here could only lower it.
        # Bound to a local, not chained off `self._client()`: LOAD_ATTR pops the
        # temporary as soon as `.models` is read, and the SDK's finalizer closes
        # the transport under the request ("client has been closed"). Still one
        # client per call — it just has to outlive the call.
        client = self._client()
        resp = client.models.generate_content(
            model=self.model, contents=[PROMPT, build_part(kind, value)],
            config={"temperature": 0})
        return check_response(resp, allow_empty=silence_ok)   # D23: every chunk
