# 04 — Transcription: the no-Vertex workflow

The pipeline's `transcribe` step turns a voice file into a text transcript using
Gemini on Vertex AI. Vertex is **not** required to run the stack: if a transcript
already exists on disk, `transcribe` is a no-op and returns the existing text
without ever touching Vertex. This runbook covers that escape hatch first, then
how Vertex transcription is actually wired on this stack.

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

## Next

See [`05-operations.md`](05-operations.md) for logs, health, and backups.
