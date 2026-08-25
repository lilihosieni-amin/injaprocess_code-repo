# transcribe (CLI — implemented)

Console command: `transcribe` → `transcribe.cli:main`


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
