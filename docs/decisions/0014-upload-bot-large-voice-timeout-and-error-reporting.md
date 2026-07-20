# 0014 — upload-bot: raise Bot API timeouts for large voices + report handler errors to the user

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-20 |
| **Area** | `upload-bot` (python-telegram-bot 22.8, local `telegram-bot-api` in `--local` mode) |
| **Related** | commit `2886ea6`; `deploy/docker-compose.yml` (`telegram-bot-api` + `upload-bot`); runbook `05-operations.md` |

## Context

An operator uploaded a voice through the upload-bot and **nothing happened** — no
file staged into `data-repo`, no confirmation, no error. The bot appeared dead.

Systematic debugging (evidence before fixes) traced it through the server logs:

```
File ".../upload_bot/handlers.py", line 90, in v_file
    data = bytes(await (await tg.get_file()).download_as_bytearray())
telegram.error.TimedOut: Timed out
```

The decisive evidence was on the `telegram-bot-api` server volume — the file it was
asked to fetch **had downloaded successfully**:

```
/var/lib/telegram-bot-api/<token>/music/file_19.m4a   123,990,388 bytes   Jul 20 10:28
```

**Mechanism.** In `--local` mode, `getFile` makes the local Bot API server download
the whole file (up to 2 GB) from Telegram's DC *before* it responds — the download is
synchronous inside the `getFile` HTTP call. The bot waited on that call with PTB's
**default 5 s read timeout**. The server needed longer than 5 s for a ~124 MB file, so
the bot's HTTP client timed out mid-download (traceback dies in
`_receive_response_headers`). `get_file()` raised `TimedOut`, the exception propagated,
and the file was **never staged**.

**Why it was silent.** The upload-bot registered **no error handler**, so PTB only
logged `"No error handlers are registered, logging exception"` — the user got zero
feedback and could not tell the upload had failed.

**Why it worked before but not now.** Earlier successful uploads were 53–69 MB and
finished downloading inside 5 s on the datacenter link. This voice was ~124 MB — roughly
2× — and crossed the 5 s line. Same code, bigger file: a latent bug that only surfaces
above a size threshold. The bug was in the **timeout/feedback**, not the pipeline logic.

## Decision

Two independent changes in `upload-bot/upload_bot/app.py`:

1. **Generous Bot API timeouts** on the `ApplicationBuilder` —
   `connect_timeout(30)`, `read_timeout(600)`, `write_timeout(600)`,
   `media_write_timeout(600)`. `--local` mode exists precisely to handle files up to
   2 GB; a 5 s read timeout was never compatible with that. 600 s gives `getFile`/
   downloads room for large voices.

2. **A registered error handler** (`_on_error`, via `add_error_handler`) — logs the
   traceback **and** notifies the user (Persian, matching the runtime end-user). A
   `TimedOut` gets a "took too long, try again" note; any other error reports the
   exception type/message. Sent as **plain text** (no `parse_mode`) so an error string
   containing Markdown can't itself fail to send.

Tests (`tests/test_app_build.py`): the error handler is registered; a user is notified
on error; nothing is sent when there is no chat to reply to. Driven with `asyncio.run()`
rather than adding a `pytest-asyncio` dependency, to match the all-sync test style.

## Consequences

- ✅ Large voices (up to 2 GB) now have 600 s to download instead of 5 s — the 124 MB
  upload goes through.
- ✅ Handler failures are no longer silent: the user always hears that something went
  wrong instead of facing a dead bot.
- 📝 Timeouts apply to **all** Bot API calls uniformly (builder-level), not just
  `getFile`; this is intentional and harmless for the small calls.
- 🧹 The failed attempt left an orphaned `file_19.m4a` in the `telegram-bot-api-data`
  volume (never named/staged). It is inert; re-uploading creates a fresh, properly
  named copy. Delete it only to reclaim space.

## Lessons

- **The server-side artifact was the smoking gun.** The downloaded file sitting in the
  bot-api volume proved the server succeeded and the *bot* gave up — isolating the fault
  to the client timeout, not the network or Telegram.
- **A default is a decision.** PTB's 5 s read timeout is fine for normal calls but wrong
  for `--local` mode, whose entire purpose is large files. Adopting a mode means
  auditing the defaults it invalidates.
- **Silent failure is its own bug.** Even after the timeout is fixed, a bot that dies
  without telling the user is unacceptable; the error handler is the durable fix for the
  *whole class* of unreported handler crashes, not just this one.
