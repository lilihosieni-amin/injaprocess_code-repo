# Phase 4 — Control bot: design spec

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Repo** | `code-repo/control-bot/` (config only — no custom code) |
| **Basis** | PRD v0.2 (FR-C1…C3, FR-M4, NFR-1, AC-2, AC-8), ARD v0.1 (§3, §7, §12), PLAN §6 |
| **Upstream** | `RichardAtCT/claude-code-telegram` **@ v1.6.0** (verified against source at that tag) |
| **Goal** | Bridge the Phase-3 extraction brain to Telegram on a locked runtime profile, and prove a full run is drivable end-to-end (AC-2). |

> This phase writes **no application code**. It produces a verified configuration
> profile, an install/launch runbook, and the recorded result of a live run.

---

## 1. What Phase 4 delivers

1. A correct, complete **runtime profile** for `claude-code-telegram@v1.6.0`
   (`control-bot/runtime.env.example`, all real v1.6.0 variables set to the right
   values), plus a real secrets-bearing env file kept **outside git**.
2. An updated **README runbook** (`control-bot/README.md`): install via `uv`, launch,
   and the exact steps to drive a run.
3. A **verification checklist** tying each launch/run step to its requirement
   (FR-C1/C3, FR-M4, AC-2, AC-8, INV-2/AC-7).
4. The **recorded outcome** of one live Telegram-driven run of `dining-2026-05-06`
   (AC-2 end-to-end), including the empirical Superpowers-leak check.

Out of scope: Docker packaging (Phase 7), the upload bot (Phase 2, done), the UI
(Phases 5–6). The `git-push` schedule and in-container hook re-verification are Phase 7.

---

## 2. Upstream reconciliation (verified against v1.6.0 source)

The ARD was written before pinning to the exact tag. These are the deltas found by
reading `.env.example`, `pyproject.toml`, `docs/`, and `src/claude/sdk_integration.py`
at `v1.6.0`. Each is a config-correctness fact, not a preference.

| ARD statement | Reality at v1.6.0 | Resolution |
|---|---|---|
| `AGENTIC_MODE=false` for the classic 13-command interface | Real config var (default `true`); **not** listed in `.env.example` but honored in `src/config`. | Keep `AGENTIC_MODE=false`. Confirmed correct. |
| "SDK first, **CLI auto-fallback**" | No auto-fallback exists. `USE_SDK` is a manual boolean (`true`=Python SDK via `claude-agent-sdk`, `false`=CLI subprocess). | Use `USE_SDK=true`. Documented fallback = manually flip to `false` if skills/hooks don't load. |
| Runtime hooks fire (§7, AC-7) | The SDK path builds `ClaudeAgentOptions(..., setting_sources=["project"], cwd=<data-repo>)` → project `.claude/settings.json` (and its `PreToolUse` guard) **is loaded**. | Confirmed at source (`sdk_integration.py:337`). The Phase-3 guard fires. |
| CLAUDE.md is loaded | The bot reads `<cwd>/CLAUDE.md` into the system prompt **and** `setting_sources=["project"]` loads it via the engine. | Confirmed. |
| `CLAUDE_ALLOWED_TOOLS` minimum set | Default list is broad (WebFetch, Skill, etc.). | Override to `Read,Write,Edit,Bash,Glob,Grep,Task`. |
| Uploads/voice disabled | `ENABLE_FILE_UPLOADS`, `ENABLE_IMAGE_UPLOADS`, `ENABLE_VOICE_MESSAGES`, `ENABLE_QUICK_ACTIONS`, `ENABLE_CONVERSATION_MODE`, `ENABLE_MCP` all default **on/true**. | Explicitly set all to `false`. Uploads are Bot-1-only (FR-U8); transcription is Vertex, not the bot's Whisper/Voxtral (ARD §12). |
| Install command | Console script is `claude-telegram-bot` (poetry-core build). | `uv tool install git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0`, then run `claude-telegram-bot`. |

**Additional live-run prerequisites (implied by ARD §16, not in the env profile):**

- **Engine CLIs on PATH.** The pipeline's `merge`/`allocate-id` are invoked via `Bash`
  inside the session; they must resolve on the bot process's PATH or the run fails at
  merge. Locally: `pip install -e engine`. (Phase 7 bakes these into the control-bot image.)
- **Model.** The top-level session model can be pinned with `CLAUDE_MODEL`
  (Opus). Subagent models stay set in their `data-repo/.claude/agents/*.md` frontmatter (NFR-4).

---

## 3. The locked runtime profile

`control-bot/runtime.env.example` — sample (no secrets); the real file lives outside git.

```dotenv
# --- identity & access (NFR-1) ---
TELEGRAM_BOT_TOKEN=            # from @BotFather (secret, real file only)
TELEGRAM_BOT_USERNAME=         # without @
ALLOWED_USERS=                 # the single primary user's numeric Telegram ID

# --- locked profile: session can reach data-repo ONLY (INV-2) ---
APPROVED_DIRECTORY=/abs/path/to/data-repo
AGENTIC_MODE=false             # classic 13-command interface (ARD §3)
USE_SDK=true                   # SDK path; wires setting_sources=["project"] → hooks fire
CLAUDE_ALLOWED_TOOLS=Read,Write,Edit,Bash,Glob,Grep,Task
CLAUDE_MODEL=                  # pin top-level session to Opus (subagents set in agent frontmatter)

# --- disable everything that isn't our pipeline ---
ENABLE_FILE_UPLOADS=false      # uploads via Bot 1 only (FR-U8)
ENABLE_IMAGE_UPLOADS=false
ENABLE_VOICE_MESSAGES=false    # transcription is Vertex, not the bot's Whisper (ARD §12)
ENABLE_QUICK_ACTIONS=false
ENABLE_CONVERSATION_MODE=false
ENABLE_MCP=false               # no MCP servers → no plugin leakage vector
ENABLE_TELEMETRY=false

# --- budget & time, sized for Opus multi-stage runs (NFR-5) ---
CLAUDE_MAX_TURNS=              # high (multi-stage pipeline)
CLAUDE_TIMEOUT_SECONDS=        # high (parallel Opus extract)
CLAUDE_MAX_COST_PER_USER=      # sized for Opus
CLAUDE_MAX_COST_PER_REQUEST=   # sized for Opus

# --- the bot's own state (separate from data-repo) ---
DATABASE_URL=sqlite:////abs/path/outside/data-repo/bot.db

# --- auth: `claude auth` on the host, or an API key ---
ANTHROPIC_API_KEY=             # optional if the CLI is already logged in
CLAUDE_CLI_PATH=               # optional; e.g. /usr/local/bin/claude
```

**Why each hardening line matters** — every disabled feature removes a way for the
runtime to step outside "read/write data-repo through the pipeline": no uploads
(INV/FR-U8), no MCP (no external tool surface), the minimal tool allowlist, and the
`APPROVED_DIRECTORY` fence that the SDK enforces via `cwd` + its `can_use_tool` callback.
The hard INV-1/INV-2 guarantee still comes from the **data-repo hooks** (Phase 3), which
`setting_sources=["project"]` guarantees are loaded.

---

## 4. How a run is driven (classic mode)

1. `/new` in Telegram → starts a session with `cwd = APPROVED_DIRECTORY = data-repo`.
2. User sends a normal message naming the voice and asking to process it (e.g.
   *"process the voice dining-2026-05-06"*). Because the message is plain text (not one
   of the 13 built-in commands), it passes to Claude, which — seeing the `process-voice`
   skill and `CLAUDE.md` in data-repo — runs the pipeline.
3. **Human checkpoint (FR-P4/INV-5):** the skill posts the process list (A/B/D categories)
   as a conversational turn; the user replies to confirm/correct (FR-C3). No `AskUserQuestion`
   tool is needed (it's not in the allowlist) — the checkpoint is plain text + the user's reply.
4. On confirm: `extract` (parallel Opus subagents) → `merge` (allocates IDs, writes
   `processes/*.json` **only via the CLI**, which the hook enforces) → `summarize` → `git commit`.
5. **Conflict report (FR-M4):** the end-of-run `pending` list is posted to chat.

The literal slash-command form (`/process-voice`) is **not** relied on in classic mode
(the bot may intercept slashes); natural-language invocation is the contract. This is
verified empirically in the live run.

---

## 5. The live verification run

Target: **`dining-2026-05-06`** (only transcript present; `transcribe`/Vertex is deferred).
Phase 3 built only `cashier-001` from it, so a fresh run legitimately produces new
processes → this is the deferred **AC-2 end-to-end**, now over Telegram.

**Preconditions:** engine CLIs installed on PATH (`pip install -e engine`); data-repo on a
clean working tree (so the run's commit is isolated and reviewable); Anthropic auth working;
real env file filled.

**Checklist (each step → requirement):**

| # | Step | Verifies |
|---|---|---|
| 1 | A non-allowlisted Telegram ID gets no reply | AC-8 (bot half), NFR-1 |
| 2 | `/new`; send the process request | FR-C1 |
| 3 | Checkpoint list appears in chat; user confirms | FR-P4, FR-C3, INV-5 |
| 4 | Extract→merge→commit produces schema-valid `processes/*.json` with allocated IDs | AC-2 |
| 5 | End-of-run `pending` conflict list posted in chat | FR-M4 |
| 6 | Attempted direct `processes/*.json` write during the run is blocked by the hook | AC-7, INV-1/2 |
| 7 | Inspect the session for Superpowers/dev skills; record present/absent | PLAN §6 exit (empirical) |

**Known caveat (step 7).** On this dev machine Superpowers is a *global* plugin
(`~/.claude/plugins`). `setting_sources=["project"]` + `ENABLE_MCP=false` may already keep
it out, but if it leaks locally that is a **dev-machine artifact**: Phase 7's Docker image
ships without Superpowers, so the guarantee holds in production regardless. We record the
observed local result and note the Docker resolution rather than assert a clean session.

---

## 6. Exit criteria (PLAN §6)

- A run is fully drivable from Telegram: paste identifier → processing → checkpoint in chat
  → confirm → end-of-run conflict list (FR-C1/C3, FR-M4). ✔ via §5 steps 2–5.
- **AC-8 (bot half):** unauthorized ID cannot use the control bot. ✔ via §5 step 1.
- Superpowers/dev skills leakage checked and recorded (with the Docker caveat). ✔ via §5 step 7.
- **AC-2 end-to-end** (deferred from Phase 3) demonstrated over Telegram. ✔ via §5 step 4.

## 7. Risks

| Risk | Mitigation |
|---|---|
| `uv tool install` from a poetry-core/`dynamic` project fails | Fall back to `pipx`/venv + `pip install`; the console script `claude-telegram-bot` is the entry point either way. |
| SDK path doesn't surface skills/hooks | Documented fallback: `USE_SDK=false` (CLI subprocess), which loads project settings/hooks directly. |
| Live Opus run cost | Budgets capped by `CLAUDE_MAX_COST_PER_*`; single small transcript; run once. |
| Classic mode intercepts the process request as a command | Use natural-language phrasing, not a literal `/process-voice`; verified in the live run. |
| Superpowers leak on local run | Dev-machine only; Phase 7 Docker image excludes it (documented, not hidden). |
