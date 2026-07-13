# 0002 — control-bot `/process-voice` stalls mid-run: root-cause analysis and fix stack

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `control-bot` (claude-code-telegram v1.6.0 SDK bridge), `data-repo` process-voice skill |
| **Related** | ADRs [0003](0003-extract-serial-no-parallel-fan-out.md)–[0007](0007-control-bot-raise-production-budget-caps.md); commits `39713ad`, `3f0ebf8`, `69f4a27`, `63fdb51` |

## Context

When operators ran `/process-voice <voice>` through the Telegram **control-bot**, the
run repeatedly **stopped in the middle** (typically right after the Stage-5 extract
stage) and the bot reported **`✅ Task completed`** — while the run was actually
incomplete (`runs/<voice>/meta.json` had `finished_at: null`, `processes: []`, and
only a subset of `candidates/` written). The operator had to keep sending
**«ادامه بده»** ("continue"), and often work was silently lost (e.g. "15 processes
but only 7 made").

Crucially: the **same** `process-voice` skill, run through the **interactive Claude
Code CLI** in the same container (`docker compose run … control-bot claude`),
completed the whole pipeline end-to-end in one go. So the agent flow / skill was
**not** at fault — the fault was in how the **`claude-code-telegram` SDK bridge**
drives Claude Code.

### How the bridge runs a turn (the key architectural fact)

`claude-code-telegram` (v1.6.0, SDK-only — `USE_SDK` is not even read by the code)
executes **each Telegram message as one bounded `claude_agent_sdk` query**. That
query ends the instant the model emits an assistant message with no tool call (or the
SDK returns a `ResultMessage`), at which point the bot prints `✅ Task completed`. The
`process-voice` playbook, by contrast, assumes **one long continuous agent turn** that
flows Stage 3 → 4 (pause) → 5 → 6 → 7 → 8 → 9. Any premature end of the SDK query =
a mid-pipeline stall that looks like success to the bot.

### Investigation method and the honest dead-ends

Followed systematic debugging (evidence before fixes). Two early hypotheses were
**formed and then refuted by evidence** — recorded here so they aren't re-chased:

1. **"Turn-discipline: the model ends its turn on a prose-only status message."** The
   skill warns about this, but the transcripts showed the turns ended via
   `stop_reason: stop_sequence` **after** subagents were dispatched, not on prose.
   Refuted.
2. **"The bridge replaces the system prompt, stripping agentic persistence."** True
   and worth fixing (ADR [0004](0004-control-bot-system-prompt-preset-append.md)),
   but deploying that fix (patch 0003) did **not** stop the stall. Refuted as the
   primary cause.

The decisive evidence came from the raw session transcripts (`/root/.claude/projects/
-data/*.jsonl` inside the container) and the bundled Claude Code binary's own strings:
`"Auto-resuming deferred tool"`, `"Continue from where you left off."` (injected,
`isMeta`), `"No response requested."`, `"[Tool result missing due to internal error]"`.
The turn was being **interrupted** because Claude Code **deferred long-running `Task`
subagents to the background**, then tore the query down before they finished.

### The amplifier: an underpowered host

The server (`ssh inja`) is a **2-CPU, 3.7 GB host running 7 containers**. Extract
subagents are heavy (they generate large IDEF0/IDEF3 JSON) and ran **44–108 s each**;
the stall consistently followed the **longest** one (108 s). On a normal multi-core
laptop the same agents finish fast enough to never trip Claude Code's deferral — which
is exactly why the operator's laptop bot "ran clean" while the docker/server bot did
not. The root cause is a **timing/deferral interaction, amplified by the slow host**,
not the pipeline logic.

## Decision

Treat the SDK bridge as the fragile layer and harden the run in **independent layers**,
each its own decision record. In order of discovery:

| ADR | Fix | What it addresses |
|---|---|---|
| [0003](0003-extract-serial-no-parallel-fan-out.md) | Extract **strictly serial** (data-repo skill) | Parallel `Task` fan-out is dropped by the bridge; serial makes any stop lossless/resumable |
| [0004](0004-control-bot-system-prompt-preset-append.md) | Append to the Claude Code **system-prompt preset** (patch 0003) | Keeps the default agentic harness (correct baseline; not the primary stall fix) |
| [0005](0005-control-bot-disable-partial-message-streaming.md) | Disable **partial-message streaming** (patch 0004) | Stops the deferred-tool **drop** of parallel subagents |
| [0006](0006-control-bot-disable-background-task-deferral.md) | Disable **background-task deferral** (env) | Stops the `stop_sequence`/"No response requested" turn-end on long subagents |
| [0007](0007-control-bot-raise-production-budget-caps.md) | Raise **production budget/turn/bash caps** (patch 0005 + env) | Removes the `$2` per-turn `max_budget_usd` cap that stopped the run next |

## Consequences

- ✅ Each layer was verified on the live server bot; the deferred-tool stop and the
  `$2` budget stop are both eliminated; residual stops (if any) are lossless because
  extract is serial.
- ⚠️ The pipeline runs **slower** on this host (serial extract, ~15–25 min for a
  multi-process voice) — an accepted trade for reliability on a single-user system.
- 📝 The real durable fix for the *timing* class of bug is more CPU; since that's not
  available, the deferral is disabled and the run is made resumable instead.

## Lessons

- The bug lived in the **harness/bridge**, not the agent flow. Comparing the *same*
  work across two execution paths (interactive CLI vs SDK bridge) isolated it fast.
- **Decompiled-binary strings are ground truth** when a wrapper's behavior is opaque:
  `"Auto-resuming deferred tool"` / `"No response requested."` named the mechanism no
  amount of config-reading would have.
- Server **capacity is part of correctness**: a 2-CPU box changed *model/tool timing*
  enough to trip a deferral that never fires on a laptop. "Works on my machine" was
  literally a hardware difference.
