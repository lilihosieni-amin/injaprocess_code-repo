# 0006 — control-bot disables Claude Code background-task deferral (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `control-bot` — `deploy/docker-compose.yml` (env) |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0003](0003-extract-serial-no-parallel-fan-out.md), [0005](0005-control-bot-disable-partial-message-streaming.md); commit `69f4a27` |

## Context

After serializing extract (ADR [0003](0003-extract-serial-no-parallel-fan-out.md)) and disabling partial streaming (ADR [0005](0005-control-bot-disable-partial-message-streaming.md)),
the run still **stopped mid-extract** on the server — but now **losslessly** (serial),
so «ادامه بده» resumed it and it eventually finished. The stop signature was unchanged:
`stop_reason: stop_sequence`, text **"No response requested."**, i.e. Claude Code's
*"Auto-resuming deferred tool"* path.

### The trigger is subagent duration, and the host makes agents slow

Measured per-subagent durations in a real run (tool_use → tool_result gap):

| subagent | duration |
|---|---|
| classify | 103 s |
| extract dining-005 | 80 s |
| extract dining-002 | 61 s |
| extract dining-001 | 52 s |
| **extract dining-006** | **108 s** ← turn stopped right after this |
| extract dining-008 | 44 s |
| summarize | 101 s |

The stop consistently follows the **longest** subagent. The host is a **2-CPU, 3.7 GB
box running 7 containers**; heavy extract agents (large IDEF JSON) run 44–108 s. On a
multi-core laptop the same agents finish fast and never trip the deferral — which is why
the laptop bot "ran clean." Adding CPU was **not** an option.

### Finding the knob (decompiled bundled Claude Code)

The relevant timeouts are already generous — `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`
defaults to **600 000** (10 min), the auto-background threshold `bp_()` is **120 000**
(2 min) *and only when enabled* — so "raise a timeout" was the wrong lever. The lever is
the **master switch that disables the background/deferral machinery**:
`process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`.

This was an **empirical** fix — the decompiled binary did not let us *prove* the switch
gates the exact stall path (the timeout constants don't cleanly match the 108 s trip),
so it was deployed and verified on a live run.

## Decision

Set **`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`** in the `control-bot` service env
(`deploy/docker-compose.yml`). Subagents then run **synchronously to completion** and are
never deferred/backgrounded — exactly what the pipeline wants. Env-only; a
`docker compose up -d control-bot` recreates the container (no image rebuild).

## Consequences

- ✅ **Verified**: the deferred-tool stop is **gone** — the next live run no longer
  produced "Continue from where you left off." / "No response requested." / `stop_sequence`.
- ➡️ Disabling it **revealed the next blocker**: a `$2` per-turn cost budget
  (`budget_usd` injection) then stopped the run — fixed in ADR [0007](0007-control-bot-raise-production-budget-caps.md).
- ➖ Loses Claude Code's `run_in_background` capability, which this pipeline never uses —
  no downside here.

## Lessons

- When timeouts are already generous, the fix is often to **disable the feature**, not
  raise the limit. Read the actual defaults before proposing "increase the timeout."
- An empirical switch (proven on a live run) is a legitimate outcome when a decompiled
  wrapper can't be traced exhaustively — but say so, and verify.
- Peeling one blocker often exposes the next; expect a **stack** of causes, not one.
