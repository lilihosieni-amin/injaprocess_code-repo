import os
import subprocess
import sys
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


class VertexTranscriber:
    """Real Gemini-on-Vertex transcriber. Lazy-imports google.genai so unit
    tests (which use a fake) never require the dependency or credentials."""

    def __init__(self, project, location, model):
        self.project, self.location, self.model = project, location, model

    def transcribe(self, audio_path):
        from google import genai  # lazy
        client = genai.Client(vertexai=True, project=self.project,
                              location=self.location)
        uploaded = client.files.upload(file=audio_path)   # large files via upload
        resp = client.models.generate_content(
            model=self.model, contents=[PROMPT, uploaded])
        return resp.text
