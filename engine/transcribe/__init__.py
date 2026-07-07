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
