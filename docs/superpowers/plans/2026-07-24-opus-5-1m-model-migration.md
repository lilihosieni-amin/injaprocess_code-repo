# Opus 5 (1M context) Model Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every data-repo pipeline agent and both control-bot deployments (local + server) from `claude-opus-4-8` to Opus 5 with the 1M context window (`claude-opus-5[1m]`).

**Architecture:** Two config surfaces, no code changes. (1) The four data-repo subagents declare their model in `.claude/agents/*.md` frontmatter — these run as subagents inside the control-bot session and are live via the `data-repo:/data` mount (no image rebuild). (2) The control-bot's *main* session model is `CLAUDE_MODEL` in an env file — one for local test bots (`code-repo/deploy/local/control-bot.env`, git-tracked), one on the server (`/opt/inja/secrets/control-bot.env`, not git-tracked). Roll out to the local TEST bots first, verify, then the server.

**Tech Stack:** Claude Code CLI model resolution, `claude-code-telegram` (control-bot), docker compose.

## Global Constants

- **Target model string (1M):** `claude-opus-5[1m]` — verbatim, brackets included. The `[1m]` suffix is REQUIRED: probing the server credential showed `claude-opus-5` (plain) reports `contextWindow: 200000`, while `claude-opus-5[1m]` reports `contextWindow: 1000000`. Same pattern as `claude-opus-4-8[1m]` (ADR 0015).
- **Eligibility (verified 2026-07-24):** the subscription OAuth credential accepts both `claude-opus-5` and `claude-opus-5[1m]` (both returned `success`, no error).
- **Known behavioral delta vs opus-4-8:** Claude Code reports `maxOutputTokens: 32000` for `claude-opus-5` (opus-4-8 = 64000). Large single-response JSON (a big `extract`/`merge` candidate) risks truncation. **This is the primary risk the local test must exercise.**
- **Do NOT commit until the user has tested** (test-first workflow). Editing is fine; `git commit`/`push`/server-deploy happen only after local verification and explicit approval.

---

### Task 1: Point the four data-repo agents at Opus 5 (1M)

**Files:**
- Modify: `<data-repo>/.claude/agents/classify.md:4`
- Modify: `<data-repo>/.claude/agents/consolidate.md:4`
- Modify: `<data-repo>/.claude/agents/extract.md:4`
- Modify: `<data-repo>/.claude/agents/summarize.md:4`

Each file's line 4 is exactly `model: claude-opus-4-8`.

- [ ] **Step 1: Edit all four frontmatter model lines**

In each of the four files, replace:
```
model: claude-opus-4-8
```
with:
```
model: claude-opus-5[1m]
```

- [ ] **Step 2: Verify the replacement**

Run: `grep -rn '^model:' <data-repo>/.claude/agents/`
Expected: all four lines read `model: claude-opus-5[1m]`; no remaining `claude-opus-4-8`.

> Note: whether the `[1m]` suffix is honored inside subagent frontmatter (vs the main `--model` flag) is confirmed by Task 3's local run — if Claude Code rejects the string, an agent dispatch errors there, before any server change. Fallback if rejected: plain `claude-opus-5` (200K, still functional). Do not pre-emptively downgrade; let the local test decide.

---

### Task 2: Point the local test control-bot at Opus 5 (1M)

**Files:**
- Modify: `<code-repo>/deploy/local/control-bot.env:33`

Line 33 is exactly `CLAUDE_MODEL=claude-opus-4-8`.

- [ ] **Step 1: Edit the model line**

Replace:
```
CLAUDE_MODEL=claude-opus-4-8
```
with:
```
CLAUDE_MODEL=claude-opus-5[1m]
```

- [ ] **Step 2: Verify**

Run: `grep -n '^CLAUDE_MODEL' <code-repo>/deploy/local/control-bot.env`
Expected: `CLAUDE_MODEL=claude-opus-5[1m]`

---

### Task 3: Local verification on the TEST bots (gate before touching the server)

Uses the local Docker stack + TEST bots (`docker-compose.local.yml` + host SOCKS proxy) — never the server tokens.

- [ ] **Step 1: Recreate the local control-bot with the new env**

Run (from `<code-repo>/deploy`):
```
docker compose -f docker-compose.local.yml up -d --force-recreate control-bot
```
Expected: container `Up`, clean startup logs (polling Telegram).

- [ ] **Step 2: Confirm the main session is on Opus 5 / 1M**

Run: `docker compose -f docker-compose.local.yml exec -T control-bot printenv CLAUDE_MODEL`
Expected: `claude-opus-5[1m]`.

- [ ] **Step 3: Exercise a real pipeline run and watch for two failure modes**

Trigger a `/process-voice` (or a merge) on the local TEST bot with a department that produces a large process. Watch specifically for:
1. **Subagent launch errors** — an `invalid model` / rejected-model error when `classify`/`extract`/`consolidate`/`summarize` is dispatched (means `[1m]` isn't honored in frontmatter → fall back to plain `claude-opus-5` in Task 1 and re-test).
2. **Output truncation** — a `merge`/`extract` result cut off mid-JSON or a `stop_reason: max_tokens` (the 32K max-output risk). If it appears, stop and surface it before the server change.

Use `session-view <id> --full` (or `--html`) to inspect the run for either symptom.
Expected: pipeline completes; no invalid-model error; no truncated JSON.

---

### Task 4: Roll out to the server (only after Task 3 passes)

**Files:**
- Modify: `inja:/opt/inja/secrets/control-bot.env:30` (not git-tracked)

Line 30 is exactly `CLAUDE_MODEL=claude-opus-4-8[1m]`.

- [ ] **Step 1: Back up and edit the server env**

Run (on `inja`):
```
cp -a /opt/inja/secrets/control-bot.env /opt/inja/secrets/control-bot.env.bak-opus5
sed -i 's/^CLAUDE_MODEL=claude-opus-4-8\[1m\]$/CLAUDE_MODEL=claude-opus-5[1m]/' /opt/inja/secrets/control-bot.env
grep -n '^CLAUDE_MODEL' /opt/inja/secrets/control-bot.env
```
Expected: `CLAUDE_MODEL=claude-opus-5[1m]`

- [ ] **Step 2: Force-recreate the server control-bot**

Run (on `inja`, from `/opt/inja/code-repo/deploy`):
```
docker compose up -d --force-recreate control-bot
```
Then verify: `docker compose exec -T control-bot printenv CLAUDE_MODEL` → `claude-opus-5[1m]`; container `Up`; startup logs clean.

> The data-repo agent frontmatter is already live on the server via the `data-repo:/data` mount once Task 5 pushes it (or immediately, if the server's data-repo checkout is updated). No image rebuild is needed for either the agents or `CLAUDE_MODEL`.

---

### Task 5: Commit, push, and propagate (after the user confirms the tests)

- [ ] **Step 1: Commit the data-repo agent changes**

Run (in `<data-repo>`):
```
git add .claude/agents/classify.md .claude/agents/consolidate.md .claude/agents/extract.md .claude/agents/summarize.md
git commit -m "chore(agents): move pipeline agents to claude-opus-5[1m] (Opus 5, 1M context)"
git push origin main
```

- [ ] **Step 2: Commit the local control-bot env change**

Run (in `<code-repo>`):
```
git add deploy/local/control-bot.env
git commit -m "chore(control-bot): local test bot on claude-opus-5[1m]"
git push origin main
```

- [ ] **Step 3: Update the server's data-repo checkout** so the new agent frontmatter is live (if the git-push/pull flow doesn't already carry it): pull `main` in `/opt/inja/data-repo`.

---

### Task 6: Update memory

- [ ] **Step 1: Update the subagent-model memory**

The memory `subagents-opus-and-superpowers.md` says "always dispatch subagents on Opus 4.8". Update it to Opus 5 (`claude-opus-5[1m]`) so it stops recommending the old model. Reference [[ask-before-implementing]] and note the 1M-context migration.

---

## Rollback

- **Agents / local env:** `git revert` the two commits (or edit the strings back to `claude-opus-4-8` / `claude-opus-4-8[1m]`) and recreate.
- **Server:** restore `/opt/inja/secrets/control-bot.env.bak-opus5` and force-recreate.

## Open risks (surface to the user before execution)

1. **`maxOutputTokens` drops 64000 → 32000** on Opus 5 in Claude Code. Large `extract`/`merge` outputs could truncate. Task 3 is designed to catch this; if it bites, options are to stay on 4.8, or investigate a Claude-Code max-output override.
2. **Subagent `[1m]` frontmatter support** is unverified until Task 3 runs; fallback is plain `claude-opus-5`.
3. **Cost:** Opus 5 is the same list tier as 4.8 ($5/$25 per MTok) plus the 1M premium — roughly on par with the current `claude-opus-4-8[1m]` spend. The local test bot moving to `[1m]` makes local tests pricier than before.
