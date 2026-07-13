# 0003 — Extract stage runs strictly serially (no parallel `Task` fan-out)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `data-repo` `.claude/skills/process-voice/SKILL.md` (Stage 5); consumed by `control-bot` |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0005](0005-control-bot-disable-partial-message-streaming.md), [0006](0006-control-bot-disable-background-task-deferral.md); ARD §5/§7 (NFR-6, parallel extract) |

## Context

Stage 5 of `process-voice` originally dispatched **all** extract subagents **in
parallel, in one message** ("all in parallel, in one single message, as the first
thing you do this turn"), per NFR-6 (parallel perf/context isolation).

Under the `control-bot` SDK bridge this **loses subagents**. Evidence:

- A live run dispatched 7–8 extract `Task`s in one message; only **1–2**
  `tool_result`s came back, then the turn ended (`stop_sequence` /
  "No response requested."), and only 1–2 `candidates/*.json` existed on disk.
- **A/B repro** (standalone `claude_agent_sdk` script in the container, mirroring the
  bot's options): dispatch **3 parallel `Task` agents**, each running a slow command.
  With the bridge's streaming on it **dropped** the agents (0 files); the interactive
  path completed them. The parallel batch is treated as background/"deferred" tools and
  torn down before completion (see [0005](0005-control-bot-disable-partial-message-streaming.md)/[0006](0006-control-bot-disable-background-task-deferral.md) for the exact mechanism and its bridge-level mitigations).

The interactive Claude Code CLI ran the same parallel fan-out fine, so parallelism is
not *inherently* broken — it is broken **specifically under the bridge**, and worse on
the slow 2-CPU host where subagents run long.

## Decision

**Dispatch extract agents strictly one at a time.** In Stage 5 of the process-voice
skill: dispatch a **single** `extract` `Task`, **await** its result, then dispatch the
next — repeat for every `new`/`update` segment — all **within one turn** (awaiting a
subagent is a tool call, not a turn end), then proceed to Stage 6 (merge). **Never
dispatch two `extract` tasks in the same message.**

The skill was edited accordingly (Stage 5 heading + body, the turn-discipline note, the
stage table, and a new key-invariant line making the serial rule explicit).

### Why serial, not "batch of N"

Serial dispatch guarantees each subagent completes and its `candidate` is written
**before** the next starts, so a mid-run stop can lose at most the work already on disk
(nothing) — the run is fully **resumable** (Stage 0 resume + «ادامه بده»). A batch of N
would still expose N-way fan-out to the bridge's drop behavior.

## Consequences

- ✅ No extract results are dropped: each is durably written before the next begins.
- ✅ Any residual mid-run stop is **lossless** — this is what turned the failure from
  "silently lost half the processes" into "resumes cleanly on the next message" (and,
  after [0006](0006-control-bot-disable-background-task-deferral.md)/[0007](0007-control-bot-raise-production-budget-caps.md), into a clean single-turn run).
- ⚠️ **Trades NFR-6.** Extraction is now sequential — slower, and each agent no longer
  runs in its own concurrent context. On the 2-CPU host a multi-process voice takes
  ~15–25 min. Accepted for a single-user system where reliability > throughput.
- 📝 **ARD §5/§7 must be updated** to record that extract runs strictly serially (the
  parallel/NFR-6 language is now aspirational, gated on the SDK bridge no longer
  dropping parallel `Task` batches).

## Status / deployment note

The skill change lives in **`data-repo`** (not this repo). It was applied to the live
server copy at `/opt/inja/data-repo/.claude/skills/process-voice/SKILL.md` (with a
`.bak` backup) so it takes effect immediately — the bot reads skills from that file at
runtime, no rebuild needed. As of this record the change is **pending a data-repo git
commit** (the server data-repo had diverged from `origin`, so it was updated in place;
reconcile with a proper commit).

## Lessons

- "Parallelism is fine interactively" ≠ "parallelism is fine under the bridge." Test the
  actual execution path.
- When you can't stop a harness from breaking a batch, **remove the batch** — serialize
  and make each unit durable so failure is resumable rather than lossy.
