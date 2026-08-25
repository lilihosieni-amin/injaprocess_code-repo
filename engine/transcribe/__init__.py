import os
import subprocess
import sys
import tempfile
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
        detail = (proc.stderr or "").strip()[:500]
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {detail}")
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


def check_response(resp):
    """Refuse a transcript the model did not finish (D6).

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
