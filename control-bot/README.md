# control-bot — launch profile for claude-code-telegram (ARD §3, §12)

No custom code lives here. This folder is the **config + launch profile** for
[`RichardAtCT/claude-code-telegram`](https://github.com/RichardAtCT/claude-code-telegram),
pinned to **`v1.6.0`**. It bridges the Phase-3 extraction brain (in `data-repo`) to
Telegram on a locked runtime that can reach `data-repo` only (INV-2).

## Files

- `runtime.env.example` — the locked runtime profile (sample, no secrets). Every key is a
  real v1.6.0 setting.
- `reference/claude-code-telegram-v1.6.0.env.example` — the upstream `.env.example`,
  vendored verbatim at the tag, as the reconciliation reference.
- `VERIFICATION.md` — the acceptance checklist and the recorded outcome of the live run.

## Install (pinned tag)

```bash
uv tool install "git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0"
```

Fallback if `uv tool install` fails on the poetry-core/`dynamic` build:

```bash
pipx install "git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0"
```

The console script is `claude-telegram-bot` either way. (Verified working via `uv` on
2026-07-10 — see `VERIFICATION.md`.)

## Prerequisites (live run)

- **Engine CLIs on the bot's PATH.** The pipeline calls `merge` / `allocate-id` via the `Bash`
  tool inside the session; they must resolve on the bot process's PATH or the run fails at merge.
  Locally: `pip install -e engine` (Phase 7 bakes these into the control-bot image).
- **Anthropic auth.** `claude auth login` on the host (with `USE_SDK=true`), or set
  `ANTHROPIC_API_KEY` in the real env file.
- **A real env file outside git.** Copy `runtime.env.example`, fill the blanks
  (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS`, `APPROVED_DIRECTORY=<abs data-repo>`, budgets,
  `DATABASE_URL` outside data-repo). **Quote any value containing spaces** — e.g.
  `APPROVED_DIRECTORY="/abs/path with spaces/data-repo"` — or `set -a && source` truncates it
  at the first space and the bot fails with `approved_directory … Field required`.
- **Clean `data-repo` tree**, so the run's commit is isolated and reviewable.

## Launch

```bash
set -a && source /abs/path/outside/git/control-bot.env && set +a
claude-telegram-bot
```

## Restricted networks (proxy)

If `api.telegram.org` is blocked on the host (verify: `curl -m5 https://api.telegram.org` times
out), route the bot through a proxy. **v1.6.0 has no proxy config field**, but it honors httpx
environment proxies. With a local SOCKS proxy (e.g. Nekoray on `127.0.0.1:2080`):

```bash
# add the SOCKS backend to the bot's venv once:
uv tool install --with socksio "git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0"

# then export before launch (exclude Anthropic so the Claude subprocess stays direct):
export ALL_PROXY="socks5h://127.0.0.1:2080" HTTPS_PROXY="socks5h://127.0.0.1:2080"
export NO_PROXY="api.anthropic.com,.anthropic.com,localhost,127.0.0.1"
```

On success the bot logs `Proxy configured: socks5h://127.0.0.1:2080`. (v1.6.0 has no custom
API-base-URL setting, so the env-proxy is the mechanism; a local `telegram-bot-api` server would
require an upstream patch to point the bot at it.)

## Drive a run (classic mode, AGENTIC_MODE=false)

1. `/new` in Telegram → starts a session with `cwd = APPROVED_DIRECTORY = data-repo`.
2. Send a **plain-text** message naming the voice and asking to process it, e.g.
   *"process the voice dining-2026-05-06"*. Because it is not one of the 13 built-in
   commands, it passes to Claude, which — seeing the `process-voice` skill + `CLAUDE.md`
   in data-repo — runs the pipeline. Do **not** rely on a literal `/process-voice` slash
   command; the bot may intercept slashes.
3. **Human checkpoint (FR-P4/INV-5):** the skill posts the process list (A/B/D categories)
   as a normal chat turn; reply to confirm or correct (FR-C3). No `AskUserQuestion` tool is
   used (not in the allowlist) — the checkpoint is plain text + your reply.
4. On confirm: extract (parallel Opus subagents) → `merge` (allocates IDs, writes
   `processes/*.json` **only via the CLI**, which the hook enforces) → summarize → `git commit`.
5. **Conflict report (FR-M4):** the end-of-run `pending` list is posted to chat.

## Fallback: skills/hooks not loading

If skills or the data-repo hook don't surface on the SDK path, flip `USE_SDK=false` (CLI
subprocess mode), which loads project settings/hooks directly, and relaunch.

## References

Upstream docs to read during setup: the repo's `docs/setup.md`, `docs/configuration.md`,
`docs/tools.md`, and the vendored `reference/claude-code-telegram-v1.6.0.env.example`.
