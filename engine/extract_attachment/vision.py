"""Vertex vision for extract-attachment's `.pdf` and image rows (QF-30).

Mirrors `engine/transcribe`'s client pattern: everything that touches the SDK is
imported lazily, so the unit suite needs neither the dependency nor credentials.
`AVAILABLE` is decided once at import time and gates the dispatcher's Vertex rows —
false here means "vertex extra not installed" (a normal, advisory skip), never a
runtime failure the caller has to guess at.
"""
import os
from pathlib import Path

try:
    import google.genai  # noqa: F401 — presence probe only; the client itself is built lazily below
    AVAILABLE = True
except ImportError:
    AVAILABLE = False


# Fixed per QF-30: the same structured description for every `.pdf`/image row, so
# two runs of the same file are comparable — the model is not deterministic, but
# the question it is asked is. The final `handwriting:` line is load-bearing: it is
# how a filled-in form is told apart from a blank master (QF-1).
PROMPT = """Describe this document precisely and completely, in this order:
1. The document's title.
2. Every header field (label and value) printed at the top of the document.
3. Every column, naming its unit if one is printed or implied.
4. Every fixed row, in the order it appears on the page.
5. Any section headings, and any document-number or reference-number fields.
6. Any shaded or read-only cells, and what marks them as such.
7. Any signature bands: their label, whether they are signed, and by whom if legible.
8. A verbatim transcription of all printed text on the page.

End your reply with exactly one final line, and nothing after it:
handwriting: yes
or
handwriting: no
— "yes" if any handwritten marks (filled-in values, ticks, signatures) are visible
anywhere on the page, "no" if the page is blank of handwriting."""

MIME_TYPES = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


def describe(path, kind):
    """Ask Vertex Gemini to describe one `.pdf` or image file; returns the reply text.

    `kind` is the source extension without its dot (`pdf`, `jpg`, `jpeg`, `png`,
    `webp`) — it selects the MIME type for the upload. The model comes from
    `VERTEX_VISION_MODEL`, never a literal, so it can move independently of
    `GEMINI_MODEL` (transcription's pin). Callers gate on `AVAILABLE` before
    reaching here; this function assumes the SDK is importable.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(vertexai=True,
                           project=os.environ.get("VERTEX_PROJECT"),
                           location=os.environ.get("VERTEX_LOCATION"))
    model = os.environ.get("VERTEX_VISION_MODEL")
    data = Path(path).read_bytes()
    part = types.Part.from_bytes(data=data, mime_type=MIME_TYPES[kind])
    resp = client.models.generate_content(model=model, contents=[PROMPT, part])
    text = getattr(resp, "text", None)
    if not text or not text.strip():
        raise RuntimeError(f"Vertex returned no description for {Path(path).name}")
    return text
