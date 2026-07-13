# 04 — Transcription: the no-Vertex workflow

The pipeline's `transcribe` step turns a voice file into a text transcript using
Gemini on Vertex AI. Vertex is **not** required to run the stack: if a transcript
already exists on disk, `transcribe` is a no-op and returns the existing text
without ever touching Vertex. This runbook covers that no-Vertex workflow and how
to enable Vertex later.

## Why pre-placing a transcript works

`transcribe {name}` looks for `meetings/transcripts/{name}.txt` first. If that
file exists, it is returned as-is (the idempotency pre-check, FR-P2) and no Vertex
call is made. Only when the transcript is missing does it read
`meetings/audio/{name}.*` and call Vertex.

So you can run the full pipeline with **no Vertex credentials** by supplying the
transcripts yourself.

## Steps

1. For each voice, create the transcript file inside data-repo:

   ```
   /opt/inja/data-repo/meetings/transcripts/{name}.txt
   ```

   where `{name}` is the voice's basename (the same basename the pipeline uses
   for that meeting). Paste in the human/manual transcript text. This is the
   source of record — the raw audio under `meetings/audio/` is gitignored and not
   pushed off-site.

2. Drive the pipeline from `control-bot` as usual (via Telegram). When it reaches
   the `transcribe` step, the pre-check finds your `.txt` and skips the Vertex
   call — the rest of the pipeline (extract → merge → layout) runs normally.

Because the transcript already exists, this is idempotent: re-running the
pipeline over the same meeting will not re-transcribe.

## Enabling Vertex later

To have `transcribe` call Gemini on Vertex instead of relying on pre-placed
transcripts:

1. Fill the Vertex settings (in the control-bot env / engine config): `VERTEX_PROJECT`, `VERTEX_LOCATION`, and `GEMINI_MODEL`.
2. Provide GCP credentials: mount `GOOGLE_APPLICATION_CREDENTIALS` (a
   service-account key file, kept outside both repos) into the `control-bot`
   container.
3. Install the Vertex extra in the control-bot image: `pip install "inja-engine[vertex]"` (pulls in the `google-genai` client the transcriber lazy-imports).

After that, any meeting **without** a pre-placed transcript will be transcribed
via Vertex; meetings that already have a `.txt` still skip.

## Next

See [`05-operations.md`](05-operations.md) for logs, health, and backups.
