# Phase 4 — Control bot verification record

Maps each launch/run step to the requirement it satisfies. Results recorded from the
live Telegram-driven run on the date below.

| Env | Value |
|---|---|
| Bot version | claude-code-telegram v1.6.0 (installed via `uv tool install …@v1.6.0`) |
| Where run | dev machine (localhost); Telegram reached through a Nekoray SOCKS proxy `socks5h://127.0.0.1:2080` (see Finding 1) |
| Target | dining-2026-05-06 |
| Date of run | 2026-07-10 |
| Bot | @InjaProcessAI_bot |
| Data-repo commit produced | `dc782e3` pipeline(dining): 0 processes from dining-2026-05-06 (attempt-02, all unchanged) |

## Checklist

| # | Step | Verifies | Result |
|---|---|---|---|
| 1 | A non-allowlisted Telegram ID sends a message and gets **no reply** | AC-8 (bot half), NFR-1 | ◑ **Config-verified.** Bot logged `allowed_users: 1`; only ID `7217498815` authenticated (`WhitelistAuthProvider … success`). Live cross-account probe **deferred** — no second Telegram account available this session. |
| 2 | `/new`; send the process request | FR-C1 | ✅ `/start` + `/new` authenticated; the request drove a Claude command with `cwd = <data-repo>` (`working_directory` in log). |
| 3 | Checkpoint / clarifying question appears in chat; user replies | FR-P4, FR-C3, INV-5 | ✅ Bot posted a conversational checkpoint ("no selection came through … 1 Re-process / 2 Show results / 3 Cancel") and the user replied `1`. Clarifying question surfaced as a plain conversational turn (FR-C3). The A/B/D **new-process** confirmation did not appear — 0 new processes to classify (see step 4). |
| 4 | Extract → merge → commit produces schema-valid `processes/*.json` with allocated IDs; the run's `git commit` lands despite `ENABLE_GIT_INTEGRATION=false` | AC-2, INV-1 | ◑ **Drivability proven; idempotent no-op path.** Pipeline ran end-to-end over Telegram and committed `dc782e3`; the 20 existing `departments/**/processes/*.json` stay schema-valid. **0 new** processes/IDs — `dining-2026-05-06` was already fully extracted in prior runs, so classify matched every segment to an existing ID. Fresh-ID allocation is proven at engine level (Phase-3 `merge`/`allocate-id` tests) and by prior runs (05-07: 8, 05-08: 14), but was **not** re-exercised over Telegram this run. The commit landed with `ENABLE_GIT_INTEGRATION=false` ✅ (pipeline commits via the Bash tool). |
| 5 | End-of-run `pending` conflict list is posted in chat | FR-M4 | ✅ Bot posted "Stage 9 — Conflict report … no `pending[]` conflicts to report" + a run summary table (0 new / 0 updated / 0 conflicts). |
| 6 | An attempted **direct** `processes/*.json` write during the run is blocked by the data-repo hook | AC-7, INV-1/2 | ✅ **Hook fired.** A forced `Write` to `departments/dining/processes/zzz-guardtest.json` was rejected by `PreToolUse:Write` → `.claude/hooks/guard.py`: *"BLOCKED by data-repo guard: processes/*.json is written only by the merge CLI … (INV-1)"*. File not created; process count unchanged (20). (Note: on a softer first prompt the model **also** self-declined per CLAUDE.md before the hook was even reached — defense in depth.) |
| 7 | Inspect the session for Superpowers / dev skills; record present or absent | PLAN §6 exit (empirical) | ◑ **Superpowers ABSENT ✅; other global surface leaked ⚠️.** No `superpowers:*` skills (`brainstorming`, `systematic-debugging`, `writing-plans`, …) surfaced. Project skills `idef-extraction` + `process-voice` present as expected. But ~14 host-global Claude Code skills (`deep-research`, `code-review`, `simplify`, `run`, `verify`, `init`, `review`, `security-review`, `loop`, `schedule`, `claude-api`, `update-config`, `keybindings-help`, `fewer-permission-prompts`) and MCP servers (Figma, Google Drive) were listed — from the host `~/.claude`, not the project. Dev-machine artifact; see Finding 4. |

Legend: ✅ verified · ◑ partial / caveated · ❌ failed.

## Findings surfaced by the live run

**Finding 1 — v1.6.0 has no native proxy setting, but honors httpx env proxy.**
Telegram's API is network-blocked on this host (direct `getMe` → timeout). `claude-code-telegram@v1.6.0`
exposes no proxy config field, but setting `ALL_PROXY` / `HTTPS_PROXY = socks5h://127.0.0.1:2080`
(plus adding `socksio` to the bot venv) made it connect — the bot logged `Proxy configured:
socks5h://127.0.0.1:2080` and all Telegram calls returned 200. `NO_PROXY` excluded `*.anthropic.com`
so the Claude subprocess stayed direct. **Deploy action:** the Phase-7 stack / runbook must document
proxy configuration for restricted networks (env-proxy + `socksio`), or run a local `telegram-bot-api`.

**Finding 2 — `APPROVED_DIRECTORY` with spaces breaks `set -a; source envfile`.**
The data-repo path contains spaces; an unquoted value silently truncated at the first space and the
field arrived empty (`approved_directory … Field required`). The real env file must quote such values:
`APPROVED_DIRECTORY="/…/Inja food/…/data-repo"`. Worth a note in the runbook (the sample uses a
space-free placeholder, so it didn't surface there).

**Finding 3 — the pipeline's `git add -A` is fragile to stray non-regular files.**
During the run a transient non-regular `.bash_profile` appeared in the bot's cwd (data-repo root) and
`git add -A` refused it; the `process-voice` playbook fell back to committing explicit paths. The file
is gone now and the tree is clean. **Recommendation (data-repo / Phase-3):** the playbook should commit
explicit run/process paths rather than `git add -A`, which is more robust in a shared working directory.

**Finding 4 — global skill/MCP surface leaks into the locked session (step 7).**
`setting_sources=["project"]` correctly excludes the **Superpowers** plugin, but host-global CLI skills
and user MCP servers still appear in the session (they live in `~/.claude`, outside project scope, and
the bot's `ENABLE_MCP=false` gates only the *bot's* MCP feature, not the Claude CLI's global MCP config).
None can escape the `APPROVED_DIRECTORY` + tool-allowlist + data-repo-hook fence, so this is a
surface-minimization gap, not a containment breach. **Resolution:** Phase-7 Docker image with a clean
`HOME` (no global skills/plugins/MCP) removes them. **Phase-7 action:** verify the container session
lists only `idef-extraction` + `process-voice`.

**Observation — feature-registry vs env flags.** The bot logged `image_handler` and `conversation`
features "enabled" despite `ENABLE_IMAGE_UPLOADS=false` / `ENABLE_CONVERSATION_MODE=false`; those
registry features key off different internals. Uploads/voice themselves remained disabled. Minor
reconciliation nuance, no security impact.

## Summary

- **AC-2 end-to-end (deferred from Phase 3):** ◑ Run **drivable end-to-end over Telegram** (identifier →
  processing → conversational checkpoint → confirm → commit `dc782e3`); output schema-valid. Fresh-ID
  allocation **not** re-demonstrated here because the target corpus is already exhausted (0 new) — the
  no-op/idempotent path was exercised instead. New-ID minting remains proven at engine level + prior runs.
- **AC-8 (bot half):** ◑ Whitelist enforced in config/logs (`allowed_users: 1`, sole authenticated ID);
  live unauthorized-account probe deferred (needs a 2nd account).
- **FR-C1 / FR-C3 / FR-M4:** ✅ Drivable run with a conversational checkpoint and an end-of-run conflict
  report, all over Telegram.
- **AC-7 / INV-1 / INV-2:** ✅ Direct `processes/*.json` write blocked by the `PreToolUse` hook at runtime.
- **Superpowers/dev-skill leakage:** Superpowers **absent** ✅; other global CLI skills + MCP servers
  present ⚠️ (dev-machine artifact, Phase-7 Docker with clean `HOME` resolves — Finding 4).

### Open items for a fully-green record
1. AC-8 live probe from a non-allowlisted account (record: no reply).
2. A fresh-content Telegram run that yields **new** processes, to demonstrate AC-2 ID allocation over the
   bot (needs an unprocessed transcript).
3. Phase-7: confirm the containerized session exposes only the two project skills and no MCP.
