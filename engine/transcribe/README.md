# transcribe (CLI — implemented)

Console command: `transcribe` → `transcribe.cli:main`


Gemini-on-Vertex transcription with idempotency pre-check (ARD §5.1, FR-P2):

- Skips the Vertex call entirely if `meetings/transcripts/{basename}.txt` exists,
  and — with `--out PATH` — if `PATH` exists.
- `transcribe [--out PATH] <basename>`. Without `--out`, the transcript goes to
  stdout and the pipeline stores it. With it, the transcript is also written to
  `PATH` atomically (Bot 1 uses this for `meetings/transcripts/raw/`).
- Progress breadcrumbs (`stage: transcoding` / `uploading` /
  `stage: transcribing 3/6`) go to stderr; stdout is only ever the transcript.
- **Chunked (D20).** The meeting is cut into 13-minute segments with 10 seconds of
  overlap (`CHUNK_SECONDS` / `CHUNK_OVERLAP`), each transcoded from the source with
  ffmpeg `-ss`/`-t` and transcribed in its own call, then concatenated. One call for
  a whole meeting was measured thinning the transcript throughout and stopping two
  minutes early *while reporting a normal finish*; the same audio in chunks produced
  28% more text. The overlap duplicates a few words at each seam on purpose —
  duplication is recoverable, loss is not. A final tail under `MIN_TAIL_SECONDS` (90) is
  folded into the chunk before it rather than becoming a chunk of its own — meetings end
  with people packing up, and an empty chunk is a failure (D23), so a 40-second tail of
  room noise must not fail a 90-minute meeting.
- Duration comes from `ffprobe`, so **ffmpeg and ffprobe must both be on PATH**. Both the
  container and the stream duration are read and the **longer** wins: a header that
  under-reports while the stream runs on would shorten the last chunk with the coverage
  check none the wiser. A disagreement over `DURATION_DISAGREEMENT` (2 s) prints a warning
  naming both values; no usable number at all is a failure, never a guess.
- **All or nothing (D21).** Every chunk's text is held in memory and `--out` is written
  only after all of them succeed. If any chunk fails after its retries, the run raises,
  exits 1, writes nothing, and the message names the chunk and its time range
  (`chunk 4/6 (39:00–52:00) failed: …`). A transcript quietly missing thirteen minutes
  is invisible to every reader downstream — partial output is worse than no output.
- Coverage is asserted arithmetically before the first call (D24): the boundaries must
  tile the audio from 0 to its full duration, so a rounding bug cannot skip a segment.
  A short final chunk is normal.
- Each chunk retries up to 3 times with a short backoff on transient failures only —
  5xx, 429, timeouts, connection resets (D22). A blocked response or an invalid
  argument fails immediately; repeating it only costs time and money.
- Every audio is transcoded to mono Opus at `TRANSCODE_BITRATE` (default 16k)
  first. Vertex has **no Files API** — each chunk travels inline under 16 MiB, and
  above that through `gs://$GCS_BUCKET`, deleted after that chunk's call (NFR-2).
  At the default bitrate a chunk is ~1.5 MB, so in practice every chunk goes inline.
- An incomplete response (output ceiling, safety block, empty) fails that chunk and
  therefore the whole run (D23) rather than writing a truncated transcript.
- Env: `VERTEX_PROJECT`, `VERTEX_LOCATION`, `GEMINI_MODEL`, `GCS_BUCKET`,
  `TRANSCODE_BITRATE` (see `config/engine.env.example`).
- Output: Persian transcript with speaker labels; the Gemini system prompt lives
  here (full text in ARD §5.1). Claude verifies/cleans chrome in the pipeline.
- GCP service account key lives OUTSIDE data-repo (server env / config), never in git.
