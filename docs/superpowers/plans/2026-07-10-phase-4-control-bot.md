# Phase 4 — Control bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the Phase-3 extraction brain to Telegram via `claude-code-telegram@v1.6.0` on a locked, verified runtime profile, and record one live end-to-end run (AC-2).

**Architecture:** This phase writes **no application code**. It produces three checked-in config/doc artifacts under `control-bot/` (a pinned upstream reference, the complete locked `runtime.env.example`, and a runbook README), a verification checklist that is then executed as a human-in-the-loop live run, and a small sync of the design spec to verified reality. Every task's "test" is a **deterministic config check** (grep/`comm` against the pinned upstream reference), not pytest.

**Tech Stack:** `RichardAtCT/claude-code-telegram@v1.6.0` (Python 3.11+, pydantic-settings, `claude-agent-sdk`), installed via `uv tool install` (fallback `pipx`); the Phase-1 engine CLIs (`allocate-id`, `merge`, …) on the bot process's PATH; the Phase-3 extraction brain in `data-repo`.

## Global Constraints

Copied verbatim from the approved spec (`docs/superpowers/specs/2026-07-08-phase-4-control-bot-design.md`) and CLAUDE.md. Every task implicitly includes these:

- **Pin to the tag.** Install `@v1.6.0`, never `main`. Every env key must be a real v1.6.0 setting.
- **Config only.** No application code is written in `control-bot/` (CLAUDE.md, ARD §12).
- **No real secrets in git.** `runtime.env.example` is a sample with blank secret values; the real env file lives outside both repos.
- **INV-2 (code/data separation).** The runtime session can reach `data-repo` **only**, never `code-repo`. Enforced by `APPROVED_DIRECTORY=<data-repo>` plus the data-repo hooks (Phase 3), which `USE_SDK=true` guarantees are loaded via `setting_sources=["project"]`.
- **NFR-1 / AC-8 (single user).** `ALLOWED_USERS` contains only the primary user's numeric Telegram ID.
- **ARD §12 (transcription).** The bot's built-in Whisper/Voxtral transcription and file upload are **not** used; uploads are Bot-1-only (FR-U8), transcription is Vertex.
- **INV-1 (IDs).** IDs are minted only by `allocate-id`, never by the LLM; enforced by the data-repo hooks during the run.

## Verified upstream facts (from source at `v1.6.0`)

These were confirmed by reading the tagged source and are the basis for the profile. The plan does not re-derive them; it pins them.

| Fact | Evidence at v1.6.0 |
|---|---|
| `CLAUDE_MODEL` is a real, optional setting (blank ⇒ CLI default) | `src/config/settings.py:81` `claude_model: Optional[str]` |
| `AGENTIC_MODE` is a real bool, default **true**; `false` ⇒ classic command mode | `src/config/settings.py:246` `agentic_mode: bool` + `src/config/features.py:70` |
| `ENABLE_MCP` already defaults to **false** | `src/config/settings.py:195` `enable_mcp: bool = Field(False, …)` |
| `CLAUDE_ALLOWED_TOOLS` is parsed from a comma list; default is broad | `src/config/settings.py:101,351` |
| SDK path loads project settings + hooks | spec §2, `src/claude/sdk_integration.py:337` `setting_sources=["project"]` |
| Console script is `claude-telegram-bot` | upstream `pyproject.toml` `[project.scripts]` |
| Security guards `ENABLE_TOKEN_AUTH` / `DISABLE_SECURITY_PATTERNS` / `DISABLE_TOOL_VALIDATION` exist and default to the safe value | upstream `.env.example` "SECURITY SETTINGS" |

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `control-bot/reference/claude-code-telegram-v1.6.0.env.example` | Create | Verbatim pinned copy of the upstream `.env.example` (MIT). The ground-truth allowlist of real keys for the reconciliation check. |
| `control-bot/runtime.env.example` | Modify | The complete locked runtime profile (sample, no secrets). Single source of the hardened config. |
| `control-bot/README.md` | Modify | The runbook: install, PATH prerequisites, launch, how to drive a run (classic mode), the `USE_SDK` fallback, and a pointer to the verification record. |
| `control-bot/VERIFICATION.md` | Create | The 7-step verification checklist (step → requirement) and the recorded outcome of the live run. |
| `docs/superpowers/specs/2026-07-08-phase-4-control-bot-design.md` | Modify | Sync §2/§3 to verified reality (correct the `ENABLE_MCP` note; add the security + production-posture vars). |

---

## Task 1: Locked runtime profile + pinned upstream reference

Produces the two config artifacts that everything else depends on: the verbatim upstream reference (the allowlist of real keys) and the complete hardened `runtime.env.example`. The "test" is a deterministic `comm` check proving our file invents no keys.

**Files:**
- Create: `control-bot/reference/claude-code-telegram-v1.6.0.env.example`
- Modify: `control-bot/runtime.env.example`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `control-bot/runtime.env.example` with the exact key set listed in Step 3; `control-bot/reference/claude-code-telegram-v1.6.0.env.example` as the reconciliation allowlist. Task 2 (README) and Task 5 (spec sync) reference these paths and the profile's values verbatim.

- [ ] **Step 1: Save the verbatim upstream reference**

Fetch the upstream `.env.example` at the pinned tag and save it unmodified, with a provenance header prepended (the fetched body follows the header, byte-for-byte). Run:

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p control-bot/reference
{
  printf '# Source: https://github.com/RichardAtCT/claude-code-telegram/blob/v1.6.0/.env.example\n'
  printf '# License: MIT (upstream). Vendored verbatim as the Phase-4 reconciliation reference.\n'
  printf '# Do not edit — regenerate by re-fetching the tag.\n#\n'
  curl -fsSL https://raw.githubusercontent.com/RichardAtCT/claude-code-telegram/v1.6.0/.env.example
} > control-bot/reference/claude-code-telegram-v1.6.0.env.example
```

Expected: the file exists and contains keys like `APPROVED_DIRECTORY`, `USE_SDK`, `CLAUDE_ALLOWED_TOOLS`, `ENABLE_MCP`, `DISABLE_TOOL_VALIDATION`.

- [ ] **Step 2: Verify the two unlisted-but-real keys are pinned in the plan's evidence table**

`AGENTIC_MODE` and `CLAUDE_MODEL` are **not** in the upstream `.env.example` (they live only in `settings.py`). Confirm they are still real at the tag so the profile is not inventing them. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/RichardAtCT/claude-code-telegram/v1.6.0/src/config/settings.py \
  | grep -nE 'agentic_mode|claude_model'
```

Expected: two matches — `claude_model: Optional[str]` (~line 81) and `agentic_mode: bool` (~line 246). If either is absent, STOP: the profile's classic-mode / model-pinning assumption is invalid and the spec must be revised before continuing.

- [ ] **Step 3: Write the complete locked profile**

Replace the entire contents of `control-bot/runtime.env.example` with:

```dotenv
# Runtime profile for claude-code-telegram @ v1.6.0 (ARD §3, §12) — SAMPLE, no real secrets.
# Copy to a real env file OUTSIDE git (or Docker secrets) and fill the blanks.
# Every key below is a real v1.6.0 setting — see control-bot/reference/ for the upstream source.

# --- identity & access (NFR-1, AC-8) ---
TELEGRAM_BOT_TOKEN=            # from @BotFather (secret — real file only)
TELEGRAM_BOT_USERNAME=         # without @
ALLOWED_USERS=                 # ONLY the primary user's numeric Telegram ID

# --- locked profile: the session can reach data-repo ONLY (INV-2) ---
APPROVED_DIRECTORY=/abs/path/to/data-repo
AGENTIC_MODE=false             # classic 13-command interface (settings.py default is true)
USE_SDK=true                   # SDK path -> setting_sources=["project"] -> data-repo hooks fire
CLAUDE_ALLOWED_TOOLS=Read,Write,Edit,Bash,Glob,Grep,Task
CLAUDE_MODEL=                  # optional: pin top-level session to Opus; blank = CLI default
                               # (subagents pin their own model in data-repo/.claude/agents/*.md — NFR-4)

# --- keep the bot's own guards ON (do NOT disable) ---
ENABLE_TOKEN_AUTH=false        # single-user gate is ALLOWED_USERS, not token auth
DISABLE_SECURITY_PATTERNS=false
DISABLE_TOOL_VALIDATION=false  # keep the tool allow/disallow check active

# --- disable everything that isn't our pipeline ---
ENABLE_FILE_UPLOADS=false      # uploads are Bot-1-only (FR-U8)
ENABLE_IMAGE_UPLOADS=false
ENABLE_VOICE_MESSAGES=false    # transcription is Vertex, not the bot's Whisper/Voxtral (ARD §12)
ENABLE_QUICK_ACTIONS=false
ENABLE_CONVERSATION_MODE=false
ENABLE_MCP=false               # no MCP servers -> no external tool/plugin leakage (v1.6.0 default already false)
ENABLE_TELEMETRY=false
ENABLE_PROJECT_THREADS=false
ENABLE_GIT_INTEGRATION=false   # bot's built-in read-only git buttons; the pipeline commits via the Bash tool
                               # independently. Verify the run's `git commit` still works (VERIFICATION step 4).

# --- budget & time, sized for Opus multi-stage runs (NFR-5) ---
CLAUDE_MAX_TURNS=              # high — multi-stage pipeline (v1.6.0 default 10 is too low)
CLAUDE_TIMEOUT_SECONDS=        # high — parallel Opus extract (v1.6.0 default 300)
CLAUDE_MAX_COST_PER_USER=      # sized for Opus (v1.6.0 default 10.0)
CLAUDE_MAX_COST_PER_REQUEST=   # sized for Opus (v1.6.0 default 5.0)

# --- the bot's own state (kept OUTSIDE data-repo) ---
DATABASE_URL=sqlite:////abs/path/outside/data-repo/bot.db

# --- production posture ---
ENVIRONMENT=production
DEVELOPMENT_MODE=false
DEBUG=false
LOG_LEVEL=INFO

# --- auth: `claude auth login` on the host, or an API key ---
ANTHROPIC_API_KEY=             # optional if the CLI is already logged in (USE_SDK=true)
CLAUDE_CLI_PATH=               # optional; e.g. /usr/local/bin/claude
```

- [ ] **Step 4: Run the reconciliation check (no invented keys)**

Every key we set must be a real v1.6.0 setting: it must appear in the upstream reference, except the two verified-in-`settings.py` keys (`AGENTIC_MODE`, `CLAUDE_MODEL`). Run:

```bash
comm -23 \
  <(grep -oE '^[A-Z_]+=' control-bot/runtime.env.example | sed 's/=$//' | sort -u) \
  <(cat <(grep -oE '^[A-Z_]+=' control-bot/reference/claude-code-telegram-v1.6.0.env.example | sed 's/=$//') \
        <(printf 'AGENTIC_MODE\nCLAUDE_MODEL\n') | sort -u)
```

Expected: **no output** (empty). Any printed key is one our profile invented — fix the typo or remove the key.

- [ ] **Step 5: Assert the hardening values are set as intended**

Confirm the security-critical flags carry the exact intended values (guards against an accidental `true`). Run:

```bash
grep -E '^(AGENTIC_MODE|USE_SDK|ENABLE_FILE_UPLOADS|ENABLE_IMAGE_UPLOADS|ENABLE_VOICE_MESSAGES|ENABLE_MCP|ENABLE_CONVERSATION_MODE|ENABLE_QUICK_ACTIONS|DISABLE_TOOL_VALIDATION|DISABLE_SECURITY_PATTERNS)=' control-bot/runtime.env.example
```

Expected, exactly:
```
AGENTIC_MODE=false
USE_SDK=true
ENABLE_FILE_UPLOADS=false
ENABLE_IMAGE_UPLOADS=false
ENABLE_VOICE_MESSAGES=false
ENABLE_QUICK_ACTIONS=false
ENABLE_CONVERSATION_MODE=false
ENABLE_MCP=false
DISABLE_SECURITY_PATTERNS=false
DISABLE_TOOL_VALIDATION=false
```

- [ ] **Step 6: Commit**

```bash
git add control-bot/runtime.env.example control-bot/reference/claude-code-telegram-v1.6.0.env.example
git commit -m "phase-4(control-bot): locked v1.6.0 runtime profile + pinned upstream reference"
```

---

## Task 2: README runbook

Turns the bare README into an operator runbook: install, PATH prerequisites, launch, how to drive a run in classic mode, and the fallback. Reviewable independently — a reviewer can accept the profile (Task 1) but reject the runbook wording.

**Files:**
- Modify: `control-bot/README.md`

**Interfaces:**
- Consumes: the profile and reference paths from Task 1 (`control-bot/runtime.env.example`, `control-bot/reference/…`).
- Produces: a runbook whose "drive a run" section is the exact procedure Task 4 executes.

- [ ] **Step 1: Replace the README with the runbook**

Replace the entire contents of `control-bot/README.md` with:

```markdown
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

`uv` is not on this dev machine; this runs on the server / in the Docker image (see `deploy/`).
Fallback if `uv tool install` fails on the poetry-core/`dynamic` build:

```bash
pipx install "git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0"
```

The console script is `claude-telegram-bot` either way.

## Prerequisites (live run)

- **Engine CLIs on the bot's PATH.** The pipeline calls `merge` / `allocate-id` via the `Bash`
  tool inside the session; they must resolve on the bot process's PATH or the run fails at merge.
  Locally: `pip install -e engine` (Phase 7 bakes these into the control-bot image).
- **Anthropic auth.** `claude auth login` on the host (with `USE_SDK=true`), or set
  `ANTHROPIC_API_KEY` in the real env file.
- **A real env file outside git.** Copy `runtime.env.example`, fill the blanks
  (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS`, `APPROVED_DIRECTORY=<abs data-repo>`, budgets,
  `DATABASE_URL` outside data-repo).
- **Clean `data-repo` tree**, so the run's commit is isolated and reviewable.

## Launch

```bash
set -a && source /abs/path/outside/git/control-bot.env && set +a
claude-telegram-bot
```

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
```

- [ ] **Step 2: Verify the runbook is internally consistent with the profile**

Confirm the README references the same tag and console script as the profile, and names the drive-a-run trigger. Run:

```bash
grep -c "v1.6.0" control-bot/README.md            # expect >= 2
grep -q "claude-telegram-bot" control-bot/README.md && echo "console-script OK"
grep -q "dining-2026-05-06" control-bot/README.md && echo "trigger OK"
grep -q "USE_SDK=false" control-bot/README.md && echo "fallback OK"
```

Expected: the count is ≥ 2 and all three `echo` lines print.

- [ ] **Step 3: Commit**

```bash
git add control-bot/README.md
git commit -m "phase-4(control-bot): README runbook — install, launch, drive-a-run, fallback"
```

---

## Task 3: Verification checklist (VERIFICATION.md template)

Creates the acceptance-criteria checklist as a fillable record. This is the artifact Task 4 completes during the live run. The "Result" fields are intentionally blank here — they are data captured at run time, not plan placeholders.

**Files:**
- Create: `control-bot/VERIFICATION.md`

**Interfaces:**
- Consumes: the drive-a-run procedure from Task 2.
- Produces: `control-bot/VERIFICATION.md` with a 7-row checklist; Task 4 fills each Result and the summary.

- [ ] **Step 1: Write the checklist template**

Create `control-bot/VERIFICATION.md` with:

```markdown
# Phase 4 — Control bot verification record

Maps each launch/run step to the requirement it satisfies. Fill the **Result** column
during the live run (Task 4 of the implementation plan) and complete the summary.

| Env | Value |
|---|---|
| Bot version | claude-code-telegram v1.6.0 |
| Where run | (dev machine / server / Docker — record which) |
| Target | dining-2026-05-06 |
| Date of run | (fill) |

## Checklist

| # | Step | Verifies | Result |
|---|---|---|---|
| 1 | A non-allowlisted Telegram ID sends a message and gets **no reply** | AC-8 (bot half), NFR-1 | |
| 2 | `/new`; send the plain-text process request ("process the voice dining-2026-05-06") | FR-C1 | |
| 3 | Checkpoint process list (A/B/D) appears in chat; user replies to confirm | FR-P4, FR-C3, INV-5 | |
| 4 | Extract → merge → commit produces schema-valid `processes/*.json` with allocated IDs (and the run's `git commit` lands despite `ENABLE_GIT_INTEGRATION=false`) | AC-2, INV-1 | |
| 5 | End-of-run `pending` conflict list is posted in chat | FR-M4 | |
| 6 | An attempted **direct** `processes/*.json` write during the run is blocked by the data-repo hook | AC-7, INV-1/2 | |
| 7 | Inspect the session for Superpowers / dev skills; record present or absent | PLAN §6 exit (empirical) | |

## Superpowers-leak note (step 7)

On this dev machine Superpowers is a **global** plugin (`~/.claude/plugins`).
`setting_sources=["project"]` + `ENABLE_MCP=false` may already keep it out of the runtime
session, but if it leaks locally that is a **dev-machine artifact**: the Phase-7 Docker image
ships without Superpowers, so the guarantee holds in production regardless. Record the observed
local result; do not assert a clean session if it isn't one.

## Summary

- AC-2 end-to-end (deferred from Phase 3) demonstrated over Telegram: (fill: yes/no + commit SHA)
- AC-8 (bot half) — unauthorized ID rejected: (fill)
- FR-C1 / FR-C3 / FR-P4 / FR-M4 — drivable run with checkpoint + conflict list: (fill)
- Superpowers/dev-skill leakage: (fill: absent / leaked-dev-artifact, with Docker resolution)
```

- [ ] **Step 2: Verify the checklist covers every Phase-4 exit criterion**

Confirm each PLAN §6 / spec §6 exit criterion appears. Run:

```bash
for tok in AC-8 AC-2 FR-C1 FR-C3 FR-M4 AC-7 "PLAN §6"; do
  grep -q "$tok" control-bot/VERIFICATION.md && echo "covered: $tok" || echo "MISSING: $tok"
done
```

Expected: every line prints `covered:`.

- [ ] **Step 3: Commit**

```bash
git add control-bot/VERIFICATION.md
git commit -m "phase-4(control-bot): verification checklist (step -> requirement)"
```

---

## Task 4: Execute the live run and record outcomes (human-in-the-loop)

This is the only non-config task and it **cannot be automated by the agent** — it requires a running bot and a human sending Telegram messages. The agent's role is to confirm preconditions, guide the operator, and transcribe observed results into `VERIFICATION.md`. If the bot cannot be installed on this machine (`uv` absent), the run happens on the server and its outcomes are reported back and recorded here.

**Files:**
- Modify: `control-bot/VERIFICATION.md` (fill Results + summary)

**Interfaces:**
- Consumes: the launch/drive procedure (Task 2) and the checklist (Task 3).
- Produces: a completed `VERIFICATION.md` with the run's commit SHA — the Phase-4 acceptance evidence.

- [ ] **Step 1: Confirm preconditions**

With the operator, verify each precondition; do not start until all pass:

```bash
# engine CLIs resolve on the PATH the bot will use
command -v merge && command -v allocate-id
# data-repo working tree is clean
git -C /abs/path/to/data-repo status --porcelain   # expect: empty
```

Also confirm: real env file filled from `runtime.env.example`; Anthropic auth working; bot installed at v1.6.0 (`claude-telegram-bot --help` runs). If `uv`/the bot is not available locally, record "run on server" in `VERIFICATION.md` and have the operator run there.

- [ ] **Step 2: Launch the bot**

```bash
set -a && source /abs/path/outside/git/control-bot.env && set +a
claude-telegram-bot
```

Expected: the bot starts and logs a successful Telegram connection with no config validation error.

- [ ] **Step 3: Execute checklist steps 1–7**

Operator performs each row of `VERIFICATION.md` in Telegram (unauthorized-ID probe; `/new` + process request; confirm at the checkpoint; observe merge/commit; observe the `pending` conflict list; attempt a direct `processes/*.json` write to trip the hook; inspect the session for Superpowers/dev skills). The agent records what the operator observes into each **Result** cell, verbatim, including any failure.

- [ ] **Step 4: Verify the run's artifacts on disk**

After the run, confirm the pipeline's output is real and schema-valid (independent of what chat showed):

```bash
git -C /abs/path/to/data-repo log --oneline -1          # the run's commit
# validate the newly written process files (Phase-1 validate CLI)
validate /abs/path/to/data-repo/processes/*.json        # expect: all valid
```

Expected: a new commit exists and `validate` passes on the new `processes/*.json`. Record the commit SHA in the summary.

- [ ] **Step 5: Complete the summary and commit the record**

Fill the `## Summary` block (AC-2 yes/no + SHA, AC-8, FR-C1/C3/P4/M4, Superpowers result with the Docker caveat). Then:

```bash
git add control-bot/VERIFICATION.md
git commit -m "phase-4(control-bot): record live end-to-end run of dining-2026-05-06 (AC-2)"
```

---

## Task 5: Sync the design spec to verified reality

The approved spec has two small inaccuracies found during reconciliation (the `ENABLE_MCP` default; the omitted security + production-posture vars). Bring §2/§3 in line so the committed design matches the shipped profile. Small and isolated — reviewable on its own.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-08-phase-4-control-bot-design.md`

**Interfaces:**
- Consumes: the final `runtime.env.example` from Task 1.
- Produces: an accurate spec; no downstream consumer.

- [ ] **Step 1: Correct the ENABLE_MCP reconciliation note (§2)**

In the §2 table, the row covering the `ENABLE_*` uploads/voice/MCP flags claims they "all default **on/true**". This is wrong for `ENABLE_MCP` (and `ENABLE_TELEMETRY`), which default to `false` at v1.6.0. Edit that row's "Reality at v1.6.0" cell to read:

```
`ENABLE_FILE_UPLOADS`, `ENABLE_IMAGE_UPLOADS`, `ENABLE_VOICE_MESSAGES`, `ENABLE_QUICK_ACTIONS`, `ENABLE_CONVERSATION_MODE` default **true**; `ENABLE_MCP` and `ENABLE_TELEMETRY` already default **false** (settings.py:195). We set all of them explicitly for an auditable profile.
```

- [ ] **Step 2: Add the security + production-posture vars to the §3 profile**

The §3 profile in the spec omits the guard vars (`ENABLE_TOKEN_AUTH`, `DISABLE_SECURITY_PATTERNS`, `DISABLE_TOOL_VALIDATION`), `ENABLE_GIT_INTEGRATION`, and the production posture (`ENVIRONMENT`, `DEVELOPMENT_MODE`, `DEBUG`, `LOG_LEVEL`). Add a short paragraph after the §3 code block:

```
The shipped `control-bot/runtime.env.example` additionally pins the upstream guard flags
(`ENABLE_TOKEN_AUTH=false`, `DISABLE_SECURITY_PATTERNS=false`, `DISABLE_TOOL_VALIDATION=false`
— keeping the tool allow/disallow check active), disables the bot's read-only git buttons
(`ENABLE_GIT_INTEGRATION=false`; the pipeline commits via the Bash tool), and sets a
production posture (`ENVIRONMENT=production`, `DEVELOPMENT_MODE=false`, `DEBUG=false`,
`LOG_LEVEL=INFO`). These are all real v1.6.0 settings; the sample file is the source of truth.
```

- [ ] **Step 3: Verify the spec now names the added vars**

```bash
for tok in DISABLE_TOOL_VALIDATION ENABLE_GIT_INTEGRATION "ENVIRONMENT=production"; do
  grep -q "$tok" docs/superpowers/specs/2026-07-08-phase-4-control-bot-design.md && echo "OK: $tok"
done
```

Expected: three `OK:` lines.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-08-phase-4-control-bot-design.md
git commit -m "phase-4(spec): sync reconciliation + profile to verified v1.6.0 reality"
```

---

## Self-review notes

- **Spec coverage.** §1 deliverables → Tasks 1 (profile), 2 (runbook), 3 (checklist), 4 (recorded run); §2 reconciliation → Task 1 evidence table + Task 5; §3 profile → Task 1; §4 drive-a-run → Task 2 §"Drive a run"; §5 live run + leak check → Tasks 3–4; §6 exit criteria → Task 3 checklist coverage check + Task 4 summary; §7 risks → surfaced as the Task 1 STOP gate (fields), Task 2 `pipx`/`USE_SDK=false` fallbacks, Task 4 preconditions.
- **No placeholders in config.** The `VERIFICATION.md` "Result" cells are run-time data captured in Task 4, not unfinished plan content.
- **Environment reality.** `uv` is absent locally; Task 4 explicitly branches to a server run and records where it ran. Task 4 is human-in-the-loop by nature (Telegram) and says so.
- **Key-name consistency.** Every env key used across tasks is drawn from the Task 1 profile and validated against the pinned upstream reference by the Task 1 `comm` check.
```