# 0007 — control-bot raises the production SDK budget/turn/bash caps

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `control-bot` — `control-bot/patches/0005-raise-production-budget-caps.patch`, `deploy/docker-compose.yml` (env) |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0006](0006-control-bot-disable-background-task-deferral.md); commit `63fdb51` |

## Context

With background-task deferral disabled (ADR [0006](0006-control-bot-disable-background-task-deferral.md)), the run got further but then
stopped with a **new** message: **«متأسفانه بودجهٔ این اجرا در حال اتمام است…»**
("the budget of this run is running out"), resetting each message.

The transcript carried the exact injected signal:

```json
{"type": "budget_usd", "used": 1.97, "total": 2, "remaining": 0.026}
```

So there was a **$2 per-turn cost budget**. It comes from
`claude_max_cost_per_request`, which `sdk_integration.py` passes to the SDK as
`ClaudeAgentOptions.max_budget_usd` — a **per-query (per-turn)** cap. A full pipeline
turn costs ~$2, so the model was told it was nearly out and stopped.

### Why the env var didn't help

The container sets `CLAUDE_MAX_COST_PER_REQUEST=50`, but the effective value was **2**.
`ENVIRONMENT=production` makes `loader._apply_environment_overrides()` apply
`ProductionConfig`, which **clobbers env vars** for the fields it names:

```python
overrides = ProductionConfig.as_dict()
for key, value in overrides.items():
    setattr(settings, key, value)   # profile > env var > default
```

`ProductionConfig` hardcoded `claude_max_cost_per_request = 2.0` and
`claude_max_cost_per_user = 5.0`, silently overriding the env.

### Audit of every other run-stopping limit

A full read-only audit of the installed bot (config precedence, `max_turns`, timeout,
rate limiter, sessions, retries, hooks, SDK internals) found the **$2 budget was the
only hard blocker**. Notable effective values (post production-override):

- `max_turns` = **200** (env applied; not overridden) vs ~100–150 real turns → thin margin.
- `claude_timeout_seconds` = **3600 s**, whole-run (not per message) → comfortable.
- `claude_max_cost_per_user` = **$5** but **effectively inert** (actual Claude cost is
  never fed back into the per-user tracker; only tiny pre-run estimates accumulate, reset daily).
- Rate limiter, sessions (12 h, updated only after a run), retries, `guard.py` hook →
  **no** mid-run interruption risk.
- Per-**Bash-command** timeout defaults to **120 s** (hard max 600 s) — could kill a slow
  `transcribe` on a fresh long audio.

## Decision

1. **Patch 0005** raises the `ProductionConfig` caps to **`100.0`** each
   (`claude_max_cost_per_request`, `claude_max_cost_per_user`) so a full multi-stage run
   (~$6–10) fits in one turn. Source patch, applied in the Dockerfile with a `grep` guard.
2. **`deploy/docker-compose.yml` env** (defensive, from the audit):
   - `CLAUDE_MAX_TURNS=300` — headroom over the ~100–150 real turns (env is not
     overridden by the profile, so this takes effect).
   - `BASH_DEFAULT_TIMEOUT_MS=600000` / `BASH_MAX_TIMEOUT_MS=600000` — so a slow
     `transcribe`/`merge` command isn't killed at the 120 s default.

Verified on the live container: `load_config()` logs
`Applied environment override … claude_max_cost_per_request value=100.0` (and `…_user
value=100.0`); env shows `CLAUDE_MAX_TURNS=300`, `BASH_*_TIMEOUT_MS=600000`.

## Consequences

- ✅ The `$2` budget stop is removed; a full pipeline turn now fits under the cap.
- ✅ With ADRs [0003](0003-extract-serial-no-parallel-fan-out.md)+[0005](0005-control-bot-disable-partial-message-streaming.md)+[0006](0006-control-bot-disable-background-task-deferral.md) stacked, the expected behavior is a **single-turn**
  end-to-end run (extract → merge → summarize → finish) with no «ادامه بده».
- 📝 `claude_max_cost_per_user=100` is a real per-user cap only if a future bot version
  starts feeding back actual cost; today it's harmless headroom.
- ⚠️ Cost governance now relies on the operator, not the profile — acceptable for a
  single trusted user.

## Lessons

- **Environment profiles can silently override env vars.** `CLAUDE_MAX_COST_PER_REQUEST=50`
  in the container looked authoritative but was dead — always check *effective* config
  (`load_config()`), not just the env.
- The model's stated reason ("budget") was literally true and pointed straight at the
  injected `budget_usd` signal — read what the model was *told*, not just what it did.
