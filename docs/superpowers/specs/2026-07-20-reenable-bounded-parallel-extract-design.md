# Re-enable bounded-parallel extract, gated by a server safety test

| | |
|---|---|
| **Status** | Design — approved, pending implementation plan |
| **Date** | 2026-07-20 |
| **Area** | `data-repo` process-voice `SKILL.md` (Stage 5); tested via `control-bot` on the server |
| **Related** | ADRs [0002](../../decisions/0002-control-bot-pipeline-stall-root-cause.md), [0003](../../decisions/0003-extract-serial-no-parallel-fan-out.md), [0005](../../decisions/0005-control-bot-disable-partial-message-streaming.md), [0006](../../decisions/0006-control-bot-disable-background-task-deferral.md), [0007](../../decisions/0007-control-bot-raise-production-budget-caps.md); ARD §5/§7 (NFR-6) |

## Problem & motivation

ADR 0003 made Stage-5 extract **strictly serial** (one `Task` at a time, never two in a
message) because the `claude-code-telegram` SDK bridge silently dropped all but one of a
parallel `Task` batch. That was a genuine mitigation, but it was **not** the fix that
stopped the control-bot halting mid-run — the real stall was cured by a later stack:
0005 (disable partial-message streaming), 0006 (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`),
0007 (raise the `$2` budget cap). Notably, ADR 0005's A/B repro showed that
`include_partial_messages=False` **alone** made 3 parallel `Task` agents complete cleanly.

Serial extract trades away NFR-6 and makes a multi-process dining voice take ~15–25 min on
the 2-CPU host. Because much of each extract agent's 44–108 s is model/network wait rather
than CPU, re-introducing **bounded** parallelism should recover most of that wall-clock time.

**Goal:** re-enable parallel extract (bounded to batches of 4) **if and only if** an
objective server-side test proves the control-bot still never stops mid-work. If the test
fails at any point, revert everything to the current serial behavior — one file, one git
restore.

## Non-goals / scope choices

- **No permanent serial↔parallel toggle.** We keep parallel or we don't; a runtime flag
  is dead weight after the decision (YAGNI).
- **Batch-of-4 only** for this round. Full N-way fan-out (the original pre-0003 pattern) is
  left as a *possible* follow-up, considered only if batch-of-4 passes cleanly.
- **No change to the 0005/0006/0007 mitigations.** They stay exactly as deployed; the only
  behavioral change under test is Stage 5's dispatch pattern.
- Tests run on the **server** through its deployed control-bot, against the **already-empty**
  dining department, so no live data is at risk. (The local `@aiprocessTestinjabo` test bot is
  a laptop-only concern; on the 2-CPU server the deployed bot is the faithful target — the
  emptiness of dining is what makes running through it safe.)

## The change under test

Edit **`data-repo/.claude/skills/process-voice/SKILL.md`**, Stage 5, from strictly serial
to **bounded batches of up to 4 `extract` `Task`s per message**:

- Dispatch a batch of ≤4 `extract` `Task`s in one message, **await the whole batch**, then
  dispatch the next batch — repeat until every `new`/`update`/`merge`/`split` segment (per
  desired process / heir) is extracted.
- The whole sweep still happens **within one turn** (awaiting a batch is a tool call, not a
  turn end); after the last batch returns, proceed to Stage 6 in the same turn.

Sections to update in `SKILL.md`: the Stage 5 heading + body (~L286–300), the
turn-discipline note (~L296), the stage table row for stage 5 (~L605), the key-invariant
line (~L624–625), and the "each serial extract" mention (~L33).

The edit lands on a **data-repo feature branch** so the change is a single, fully
git-reversible file. (This spec lives in `code-repo`; the `SKILL.md` edit itself is made in
`data-repo` per INV-2 code/data separation.)

## Test harness (two tiers, on the 2-CPU server)

Testing must run on the **real server** because the stall only ever reproduced on the slow
2-CPU host — a green run on the multi-core laptop proves nothing (ADR 0002/0006).

### Tier 1 — cheap A/B pre-gate (mechanism check)

Reuse or recreate ADR 0005's standalone `claude_agent_sdk` script, mirroring the bot's
**currently deployed** `ClaudeAgentOptions` (`include_partial_messages=False`, env
`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`). It dispatches **4 parallel `Task` agents** in one
message, each running a forced-slow command (~90–110 s, matching the real extract durations
that tripped the drop), each writing one output file.

- **Pass:** all 4 output files written.
- **Fail:** fewer than 4 → the drop mechanism is still present under batch-of-4; **stop
  here**, do not run Tier 2, revert.

This fails cheaply (~2 min) instead of after a ~20-min real pipeline run.

### Tier 2 — real dining runs

With the branch's `SKILL.md` deployed **in-place** on the server
(`/opt/inja/data-repo/.claude/skills/process-voice/SKILL.md`, `.bak` kept — the bot reads
the file at runtime, no image rebuild), run the dining voice end-to-end through the **test**
control-bot against the empty dining department, **twice**.

## Objective pass/fail checker (read-only)

A script that takes a `runs/<voice>/` dir plus the session transcript
(`/root/.claude/projects/-data/*.jsonl` in the container) and returns PASS/FAIL against the
strict criteria:

1. **Completion (no silent partial loss).** `meta.json.finished_at` is set, `processes[]`
   is non-empty, and exactly one `candidates/*.json` exists for every `new`/`update`/
   `merge`/`split` segment classified for the run.
2. **Single turn / no resume.** The transcript contains no injected
   `Continue from where you left off.` (`isMeta`) message — i.e. the operator never had to
   send «ادامه بده».
3. **Clean transcript.** None of the stall signatures appear: `No response requested.`,
   `Auto-resuming deferred tool`, or `stop_reason: stop_sequence` immediately following an
   extract `Task` batch.

**Overall PASS = 2 consecutive dining runs each satisfying all three criteria** (guards
against a lucky single pass on a timing-dependent bug). Tier 1 must also have passed.

## Revert-on-failure (hard requirement)

Any failing check — Tier 1, or either dining run failing any of the three criteria —
triggers immediate abandonment:

1. Restore serial `SKILL.md` from `.bak` on the server (and `git checkout` / discard the
   data-repo branch locally).
2. Restart the control-bot so it re-reads the serial skill.
3. Delete the feature branch.

Because the change is a single git-tracked file deployed with a `.bak`, "everything goes
back to before this change" is one restore. No other component is touched.

## Documentation outcome (either result)

- **On pass:** new ADR — "extract re-enables bounded-parallel (batch of 4); 0005/0006
  removed the drop, **supersedes 0003**" — plus an update to the ADR README index and the
  ARD §5/§7 NFR-6 note (parallel extract is no longer purely aspirational).
- **On fail:** a short ADR recording the **negative** result (batch-of-4 still drops under
  the current config) so the experiment is not re-chased, and note whether Tier 1 or Tier 2
  caught it.

## Open questions / follow-ups

- If batch-of-4 passes, is full N-way worth a second test round, or is 4 "fast enough"?
  Deferred until batch-of-4 results are in.
- The Tier-1 harness script from ADR 0005 may need locating or recreating; confirm during
  implementation whether the original still exists in the container.
