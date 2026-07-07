# transcribe (CLI — to be implemented)

Gemini-on-Vertex transcription with idempotency pre-check (ARD §5.1, FR-P2):

- Skips the Vertex call entirely if `meetings/transcripts/{basename}.txt` exists.
- Env: `VERTEX_PROJECT`, `VERTEX_LOCATION`, `GEMINI_MODEL` (see `config/engine.env.example`).
- Large files via GCS / Vertex file upload, not inline (NFR-2).
- Output: Persian transcript with speaker labels; the Gemini system prompt lives here
  (full text in ARD §5.1). Claude verifies/cleans chrome in the same pipeline stage.
- GCP service account key lives OUTSIDE data-repo (server env / config), never in git.
