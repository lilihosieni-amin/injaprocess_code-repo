# upload-bot — Bot 1: raw voice/file intake (ARD §11)

The only path files enter the system (FR-U8). Deterministic logic (naming,
validation, staging, allowlist, session) is unit-tested via the root `make test`;
the async Telegram layer is thin and verified live.

## Run
1. Copy `config/upload-bot.env.example` to a real env file OUTSIDE git and fill in:
   `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_ID` (your Telegram numeric id), `DATA_ROOT`
   (the data-repo path). `TELEGRAM_API_BASE_URL` is optional (only for >20 MB files).
2. `pip install -e upload-bot` (or use the repo `.venv`).
3. `set -a; . your.env; set +a; upload-bot`   (or `python -m upload_bot`)

## Flows
- **Voice:** `/start` → صوت → enter the **Shamsi** meeting date (Persian or Latin digits,
  `/` or `-`, e.g. `۱۴۰۵/۰۴/۱۹`) → pick departments → «تمام شد»
  → send the voice → bot stores `meetings/audio/{basename}.ogg` and replies with the
  copyable identifier (paste into the control bot to start processing).
- **File:** `/start` → فایل → pick ONE department → send documents → `/done` →
  bot stores them under `departments/{dept}/attachments/`. `/cancel` discards staged files.

## Proxy (if Telegram needs one)
If Telegram is only reachable through a proxy (e.g. a local SOCKS proxy), set
`TELEGRAM_PROXY` to its URL and, for SOCKS, install the extra first:
```bash
uv pip install --python .venv/bin/python "httpx[socks]"      # SOCKS support (socksio)
export TELEGRAM_PROXY=socks5://127.0.0.1:2080                 # use socks5h:// to resolve DNS via the proxy
```
Passing it explicitly makes httpx ignore ambiguous shell proxies (`ALL_PROXY` with a
bare `socks://` scheme, which httpx rejects). `http://…` proxies work without the extra.

## Large files (>20 MB, NFR-2)
The standard Telegram Bot API caps downloads at 20 MB. For large meeting audio, run a
local Bot API server and set `TELEGRAM_API_BASE_URL` to it, e.g.:
`docker run -p 8081:8081 -e TELEGRAM_API_ID=… -e TELEGRAM_API_HASH=… tdlib/telegram-bot-api`
(the full stack wires this in Phase 7).

## Notes
- Voice date is **Shamsi** (Jalali), stored in the filename as Latin `YYYY-MM-DD`
  (e.g. `cooking-1405-04-19`). Input accepts Persian/Latin digits and `/` or `-`
  and is validated with `jdatetime`. Machine timestamps in the data stay Gregorian ISO.
- Only `ALLOWED_USER_ID` is served; other users are silently ignored (NFR-1).
- Staged files from an abandoned file batch are discarded when the user re-runs `/start`
  or sends `/cancel`. A fully-abandoned batch (no further interaction at all) leaves
  residual files in `.staging/`; these are cleaned by a periodic `.staging/` sweep wired
  in Phase 7.
