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
  duplication is recoverable, loss is not. Measured: a 13-minute chunk transcribes right
  to its end, so 10 seconds is enough and the overlap should not be widened on a hunch.
- **One extra tail chunk covering the last `TAIL_SECONDS` (90) is always appended** for any
  recording longer than that. The primary boundaries cannot promise a short final chunk —
  they advance by `CHUNK_SECONDS` and span `CHUNK_SECONDS + CHUNK_OVERLAP`, so the last one
  lands wherever the file's duration puts it (771 s for `dining-1405-04-11`). That long
  final chunk was measured **dropping the real ending** («هفتاد دقیقه شد» missing) and
  **inventing a closing line** that appears nowhere in the audio, while 41-second and
  60-second clips of the same ending reproduced it exactly. The last 90 seconds therefore
  appear twice in the transcript, deliberately: de-duplicating them needs alignment logic
  that could delete real speech to tidy an ending.
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
  5xx, 429, timeouts, connection resets, **and `MAX_TOKENS`** (D22). A blocked response or
  an invalid argument fails immediately; repeating it only costs time and money.
- `MAX_TOKENS` is retryable because it was measured non-deterministic: the same chunk
  failed that way once and finished twice, at ~4,000 output tokens each time — a repetition
  loop, not a chunk that is too long. Retries after a `MAX_TOKENS` (and only those) use
  `RETRY_TEMPERATURE` (0.2) instead of 0, because greedy decoding replays the identical
  path into the identical loop. Network retries stay at 0.
- `max_output_tokens` is **deliberately unset** — not an omission. Setting it explicitly
  changed nothing in measurement, and the default cap is the circuit breaker that turns a
  runaway repetition into a loud, retryable failure instead of pages of rubbish.
- Every audio is transcoded to mono Opus at `TRANSCODE_BITRATE` (default 16k)
  first. Vertex has **no Files API** — each chunk travels inline under 16 MiB, and
  above that through `gs://$GCS_BUCKET`, deleted after that chunk's call (NFR-2).
  At the default bitrate a chunk is ~1.5 MB, so in practice every chunk goes inline.
- An incomplete response (output limit on every attempt, safety block, empty) fails that
  chunk and
  therefore the whole run (D23) rather than writing a truncated transcript. One narrow
  exception: a chunk that **reaches the end of the recording** and is no longer than
  `MIN_TAIL_SECONDS` (90) — the tail chunk, and a short final primary chunk, which are the
  same silence heard twice — is silence, not a fault when it comes back empty; it
  contributes nothing and the run continues. If *every* chunk comes back empty the run
  fails anyway: forgiven silence must never add up to an empty file on disk. Thirteen minutes
  of a staff meeting transcribing to nothing is a fault; forty seconds of people packing up
  transcribing to nothing is a fact. A short final chunk that returns text keeps it, and a
  blocked or truncated short tail still fails like any other chunk.
- Env: `VERTEX_PROJECT`, `VERTEX_LOCATION`, `GEMINI_MODEL`, `GCS_BUCKET`,
  `TRANSCODE_BITRATE` (see `config/engine.env.example`).
- Output: Persian transcript with speaker labels; the Gemini system prompt lives
  here (full text in ARD §5.1). Claude verifies/cleans chrome in the pipeline.
- GCP service account key lives OUTSIDE data-repo (server env / config), never in git.
