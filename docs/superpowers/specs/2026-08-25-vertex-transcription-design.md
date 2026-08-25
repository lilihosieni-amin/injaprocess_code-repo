# Vertex Transcription — Activation and Automatic Transcription at Upload — Design

| | |
|---|---|
| **Date** | 2026-08-25 |
| **Status** | Proposed — awaiting review |
| **Touches** | `engine/transcribe/`, `upload-bot/`, `deploy/`, `config/engine.env.example`, and `data-repo/.claude/skills/process-voice/SKILL.md` |
| **References** | ARD §5.1 (transcription stage), §11 (Bot 1), §16 (deploy); FR-P1, FR-P2, NFR-2 |

---

## 1. Summary

Two things, one dependency chain:

1. **Make `transcribe` actually run on Vertex.** The CLI exists and its unit tests
   pass against a fake, but the real `VertexTranscriber` has never executed a
   Vertex call and cannot: it uses an API that Vertex does not serve (§2.1).
2. **Transcribe automatically at upload time.** When a user sends a voice to Bot 1,
   the bot produces the transcript in the background, shows progress in Telegram,
   and reports success or failure — instead of the transcript being produced later,
   inside the pipeline run.

The pipeline keeps its quality gate. The bot writes a **raw** transcript;
`process-voice` Stage 1 promotes it to the approved transcript after stripping
Gemini's injected chrome and running the verbatim check.

### 1.1 Not in scope

- Splitting long audio into chunks. A meeting past roughly 2½ hours can exceed the
  model's output ceiling; this design **detects and refuses** that case (D6) rather
  than solving it.
- Any change to classification, extraction, merge, or the UI.
- Transcription of the file-upload path (documents). Voice only.

---

## 2. Findings — why this is not a configuration change

### 2.1 The Vertex client has no Files API

`engine/transcribe/__init__.py` calls `client.files.upload(file=audio_path)` with
`genai.Client(vertexai=True, …)`. In `google-genai` (checked against 2.19.0,
`google/genai/files.py:1215`) every `files.*` method begins with

```python
if self._api_client.vertexai:
    raise ValueError('This method is only supported in the Gemini Developer client.')
```

The Files API belongs to the Gemini Developer API (API-key auth). Vertex accepts
audio only as **inline bytes** or a **`gs://` URI**. The current code therefore
raises before it ever reaches the model.

### 2.2 The real audio does not fit inline

Six meetings currently in `data-repo/meetings/audio/`:

| Duration | Size | Bitrate |
|---|---|---|
| 56–73 min (3378–4384 s) | 55–124 MB | 130–260 kbps |

Vertex's inline request cap is ~20 MB. Every real meeting is over it, several by
6×. NFR-2 already anticipated this ("large files via GCS / Vertex file upload,
not inline") — it just was never built.

### 2.3 `control-bot`'s image cannot import the dependency

`deploy/control-bot.Dockerfile` runs `pip install --no-cache-dir /opt/engine`,
without the `[vertex]` extra. `google-genai` is therefore absent from the image
that runs the pipeline, so `transcribe` would fail on import there today,
independently of everything above.

### 2.4 The CLI never writes the transcript

`transcribe/cli.py` prints to stdout. `meetings/transcripts/{basename}.txt` is
written by Claude in `process-voice` Stage 1, **after** it strips Gemini's
preamble/postamble and applies the per-file verbatim gate. Anything else that
wants a transcript file on disk has to write it itself — and inherits the
question of who runs that gate (§5).

---

## 3. Audio → Vertex

### D1 — Always transcode to 16 kbps mono Opus, then route by size

```
ffmpeg -nostdin -v error -y -i <audio> -vn -ac 1 -c:a libopus \
       -b:a $TRANSCODE_BITRATE -f ogg <tmp>.ogg
```

Unconditionally, for every input. Not "only when the file is large": one code path,
one output MIME type (`audio/ogg`), and no format-to-MIME table for the m4a / mp3 /
ogg / wav mix that Telegram and the existing corpus produce. A 73-minute meeting
becomes ~9 MB — a 6–13× reduction that also cuts what the VPS has to push upstream.

`TRANSCODE_BITRATE` defaults to `16k` and is an env var on purpose: speech
intelligibility at a given bitrate is a property of the recordings, not of the
code, and if Persian recognition suffers this is the knob to turn.

### D2 — Inline under 16 MiB, GCS above it

| Transcoded size | Path |
|---|---|
| ≤ 16 MiB | `types.Part.from_bytes(data=…, mime_type="audio/ogg")` |
| > 16 MiB | upload to `gs://$GCS_BUCKET/transcribe/{basename}.ogg`, `types.Part.from_uri(…)`, **delete the object** in a `finally` |

16 MiB, not 20 MB: the cap covers the whole request, and the prompt plus protocol
overhead ride along with the audio.

At 16 kbps the fallback engages past roughly 2.3 hours of audio. It is wired and
provisioned from day one anyway (D3) — an untested fallback is not a fallback, and
it is exercised in testing by lowering the threshold (§8.1).

### D3 — GCS staging bucket, provisioned now

| | |
|---|---|
| Name | `injafood-transcribe-staging` (if the global namespace refuses it, suffix `-1`) |
| Project | `injafood` |
| Location | `us-central1`, single region |
| Access | uniform bucket-level access; no public access; no versioning |
| Lifecycle | delete objects at age 1 day — a backstop for a crash between upload and delete, not the primary cleanup |
| Object path | `transcribe/{basename}.ogg` |

IAM: the server's service account gets `roles/storage.objectAdmin` **scoped to this
bucket**, not project-wide. If Vertex reports it cannot read the object, also grant
`roles/storage.objectViewer` on the bucket to the Vertex service agent
(`service-<PROJECT_NUMBER>@gcp-sa-aiplatform.iam.gserviceaccount.com`).

Meeting audio is confidential. It reaches this bucket compressed, stays for the
duration of one model call, and is deleted by the code; the lifecycle rule bounds
the damage of a crash. `google-cloud-storage` is imported lazily and only on this
branch, so the inline path carries no extra dependency at runtime.

### D4 — Model and endpoint

```
VERTEX_PROJECT=injafood
VERTEX_LOCATION=global
GEMINI_MODEL=gemini-3.1-pro-preview
```

`global` is where Vertex serves the Gemini 3 preview models. Both values are
already env-driven, so if `global` does not serve this model the change is one
line — fall back to `us-central1`, or to `gemini-2.5-pro` if the preview model is
withdrawn. Generation config: `temperature=0` (this is transcription, not
composition) and the model's maximum output budget.

### D5 — Prompt unchanged

`transcribe.PROMPT` stays exactly as it is. It is the ARD §5.1 text and the
existing corpus was produced against it; changing the prompt in the same change
that first makes the call work would make a bad transcript impossible to attribute.

### D6 — Refuse a truncated transcript

After the call, raise (CLI exits non-zero, nothing is written) when:

- `finish_reason` is `MAX_TOKENS` — the transcript is cut mid-meeting,
- the response is empty or has no candidate,
- the response was blocked by a safety filter.

A 73-minute meeting produces ~58 000 characters of Persian, roughly 30 K output
tokens against a 64 K ceiling. A 2½-hour meeting can cross it. A half transcript
that lands on disk looking whole would silently truncate every downstream
extraction, so this fails loudly instead. The error message names the audio and
says the meeting must be split.

---

## 4. CLI surface

### D7 — `--out PATH`

`transcribe [--out PATH] <basename>`. Without it, behaviour is exactly as today
(text to stdout) so `process-voice` Stage 1 is unaffected. With it, the transcript
is written to `PATH` via a temp file plus `os.replace` — atomic, so a killed
process never leaves a partial transcript that the idempotency pre-check would
later mistake for a finished one. An existing `--out` target is left alone and the call is
skipped, mirroring FR-P2, so a bot retry costs nothing.

### D8 — Stage lines on stderr

The CLI writes `stage: transcoding`, `stage: uploading`, `stage: transcribing`,
one per line, to stderr as it proceeds. stdout stays pure transcript. The bot
reads these for its progress message (D11); the pipeline ignores them.

### D9 — Environment

`config/engine.env.example` gains real values for the empty fields and the new
ones:

```
VERTEX_PROJECT=injafood
VERTEX_LOCATION=global
GEMINI_MODEL=gemini-3.1-pro-preview
GCS_BUCKET=injafood-transcribe-staging
TRANSCODE_BITRATE=16k
```

`GCS_BUCKET` unset means the oversize branch fails with an explicit message
naming the variable, never a silent inline attempt that Vertex would reject.

Dependencies: the `vertex` extra becomes
`["google-genai~=2.19", "google-cloud-storage~=2.18"]`, pinned to what is actually
tested (`engine/requirements.txt` currently says `~=1.16`, a version this design
has not been verified against). `ffmpeg` is a system binary, not a Python
dependency.

---

## 5. Raw transcripts and pipeline promotion

### D10 — The bot writes `meetings/transcripts/raw/{basename}.txt`

Not the approved path. `meetings/transcripts/{basename}.txt` keeps its exact
current meaning — *reviewed, chrome-stripped, verbatim-checked* — which is what
FR-P2's idempotency pre-check and Gate A's "has a transcript?" listing both depend
on. Raw files are committed like transcripts (audit trail); `.gitignore` is
untouched. The data-repo write guard permits this path.

### D11 — Stage 1 promotes raw instead of calling Vertex

`data-repo/.claude/skills/process-voice/SKILL.md`, Stage 1, for each confirmed
recording lacking `transcripts/{basename}.txt`:

| Situation | Action |
|---|---|
| `transcripts/raw/{basename}.txt` exists | Read it. Strip any injected preamble, postamble, or heading. Apply the per-file verbatim sanity gate unchanged (STOP with the two Persian options if the text looks summarized). Write the cleaned text to `transcripts/{basename}.txt`. **No Vertex call.** |
| No raw file | `Bash: DATA_ROOT=<data-repo> transcribe {basename}`, then clean and write, exactly as today |

The cleaning and the verbatim gate keep the same owner they have now. The only
thing that changes is where the raw text comes from.

### D12 — Gate A gains a third state

The set listing currently distinguishes "has a transcript" from
«فاقد رونویس — رونویسی می‌شود». It gains
«رونویس خام آماده است — بازبینی می‌شود», so the user can see at Gate A that a
recording will be reviewed rather than re-transcribed, and that no Vertex cost is
coming for it.

---

## 6. Upload-bot flow

### D13 — Transcription is a background task; the conversation does not wait

`v_file` finalizes the audio and replies «ذخیره شد ✅» with the
`Start /process-voice {base}` line **exactly as today**, then schedules the
transcription through `ctx.application.create_task` and ends the conversation. The
user can immediately upload the next voice. The `Start` line is deliberately left
in the first message: if transcription fails, the pipeline still works — it will
transcribe the recording itself.

New module `upload_bot/transcription.py` owns the task, the lock, and the message
text; `handlers.py` gains one call.

### D14 — One progress message, edited

A second message is posted and then edited about every 8 seconds:

```
⏳ در حال رونویسی — ۲:۳۰ گذشته
```

The stage word comes from the last `stage:` line on the CLI's stderr; the elapsed
time comes from the bot's own clock, rendered in Persian digits — this string is prose
aimed at the end user, unlike the Latin file counts elsewhere in the bot. No bar and no
percentage: `generate_content`
is one blocking call and Vertex reports no progress, so a percentage would be a
guess presented as a fact. 8 seconds stays far below Telegram's edit rate limits.

Terminal states, same message:

| | |
|---|---|
| Success | `✅ رونویسی آماده شد` |
| Failure | `⚠️ رونویسی خودکار انجام نشد؛ صوت ذخیره شده و خط لوله خودش رونویسی می‌کند.` plus the last stderr line, truncated, sent as plain text (it is untrusted and may contain Markdown) |

### D15 — One transcription at a time

A module-level `asyncio.Lock`. A voice uploaded while another is transcribing gets
«در صف رونویسی…» in its progress message until the lock frees. The server has 2
CPUs and one Vertex quota; two 70-minute meetings encoding and streaming at once
degrade both and risk the bot's own responsiveness.

### D16 — Failure never costs the audio

The audio is finalized before transcription starts and is never touched again by
this path. Every failure mode — ffmpeg missing, Vertex rejecting, credentials
expired, truncation, the 30-minute watchdog timeout, the bot restarting mid-run —
leaves the recording in place with no raw transcript, which is precisely the state
the pipeline already knows how to handle. No queue is persisted across restarts.

### D17 — No feature flag

`VERTEX_PROJECT` unset ⇒ the bot skips transcription entirely and behaves exactly
as it does today. A separate on/off variable would be a second source of truth for
the same fact.

---

## 7. Deployment

### D18 — Both bot images get ffmpeg and the `vertex` extra

| Image | Change |
|---|---|
| `deploy/upload-bot.Dockerfile` | `apt-get install ffmpeg`; copy `engine/`; `pip install "/opt/engine[vertex]"` |
| `deploy/control-bot.Dockerfile` | `pip install "/opt/engine[vertex]"` (fixes §2.3); `apt-get install ffmpeg` |

Cost: roughly 200 MB per image for ffmpeg and its codec dependencies.

### D19 — Credentials

| Where | Credential |
|---|---|
| Server | Service account `inja-transcribe@injafood.iam.gserviceaccount.com`, roles `roles/aiplatform.user` (project) + `roles/storage.objectAdmin` (bucket-scoped). Key JSON at `/opt/inja/secrets/vertex-sa.json`, mounted read-only, `GOOGLE_APPLICATION_CREDENTIALS` pointing at the mount |
| Local | `~/.config/gcloud` mounted read-only; the existing user ADC. May need `gcloud auth application-default set-quota-project injafood` once |

Both compose files set `VERTEX_PROJECT`, `VERTEX_LOCATION`, `GEMINI_MODEL`,
`GCS_BUCKET` on **both** bots — upload-bot for the automatic path, control-bot for
the pipeline's own fallback when a recording arrived without one. The key stays
outside both repos, per ARD §14.

The server reaches Google directly (confirmed: outside Iran). If the local machine
needs the SOCKS proxy for Google as well as Telegram, that is `HTTPS_PROXY` in
`docker-compose.local.yml` and nothing else.

---

## 8. Testing

### 8.1 Unit — no network, no credentials

| Area | Test |
|---|---|
| engine | ffmpeg is invoked with the expected argv and the configured bitrate |
| engine | ≤ threshold → inline part; > threshold → GCS upload, `from_uri`, and the object deleted afterwards (threshold injected, so the branch runs on a small fixture) |
| engine | GCS branch with `GCS_BUCKET` unset → raises, naming the variable |
| engine | `finish_reason=MAX_TOKENS` / empty / blocked → raises, and `--out` wrote nothing |
| engine | `--out` writes through a temp file and `os.replace`, so the destination exists only on success; a failed call leaves the path absent |
| engine | existing idempotency tests still pass unchanged |
| upload-bot | success → raw file written, message edited to the success text |
| upload-bot | non-zero exit → error text, audio still in place, no raw file |
| upload-bot | two concurrent uploads → the second shows the queued text and runs after the first |
| upload-bot | `VERTEX_PROJECT` unset → no task scheduled, behaviour identical to today |

The genai client and the subprocess are faked, in the style the existing
`FakeTranscriber` tests already use.

### 8.2 Real check 1 — long file through the CLI

`DATA_ROOT` pointed at a scratch tree containing one existing 70-minute `.m4a` and
**no** transcript (the corpus files all have transcripts, so the idempotency
pre-check would otherwise short-circuit). Run `transcribe --out …`, then read the
result: is it verbatim Persian with speaker labels, is it complete to the end of
the meeting, did Gemini inject chrome. This is the only test that covers a real
70-minute file — see below for why the bot cannot be tested with one locally.

### 8.3 Real check 2 — two voices through the bot

Two **short** voices (2–5 minutes) sent to @uploadtestinjsbot on the local stack.
The local stack uses the public Telegram Bot API, capped at 20 MB, so a 70-minute
voice cannot be uploaded to it at all; the server stack runs a local Bot API server
and has no such cap. Verify: «ذخیره شد ✅» is immediate, the progress message ticks
and changes stage, the success message arrives, and both raw transcripts exist and
read correctly.

Then `/process-voice` on one of them through @aiprocessTestinjabo: Gate A shows the
new third state, Stage 1 promotes raw to the approved transcript without a Vertex
call, and the run completes.

### 8.4 Server move

Rebuild both images, create the bucket and service account, place the key in
`/opt/inja/secrets/`, `docker compose up -d`, then one real meeting end to end.

---

## 9. Costs and limits

| | |
|---|---|
| Input tokens | ~32 per second of audio — a 73-minute meeting is ~140 K |
| Output tokens | ~30 K for the same meeting (~58 000 Persian characters) |
| Output ceiling | 64 K for the Gemini 3 Pro family — reached around 2½ hours of speech; refused, not truncated (D6). Confirm the preview model's own figure at 8.2 |
| Wall clock | Several minutes per meeting; the bot's watchdog kills a run at 30 minutes |
| Storage | Bucket objects live for the duration of one call; lifecycle deletes strays at 1 day |

Per-call pricing is not stated here because the preview model's rate should be read
from the Cloud console at the time of the server move rather than copied into a
document that will not track it.

---

## 10. Risks

| Risk | Response |
|---|---|
| `gemini-3.1-pro-preview` not served on `global`, or withdrawn | Both model and location are env vars; fall back to `us-central1` / `gemini-2.5-pro` |
| 16 kbps Opus degrades Persian recognition | `TRANSCODE_BITRATE` is a knob; 8.3 is where it gets judged |
| Meetings past ~2½ hours | Refused with a clear message; chunking is out of scope and deliberately not built |
| Vertex cannot read the GCS object | Grant the Vertex service agent `objectViewer` on the bucket (D3) |
| Bot restarts mid-transcription | Raw transcript absent; the pipeline transcribes as it always has |
| ffmpeg absent from an image | Caught by 8.3 before the server move; the failure message names it |
