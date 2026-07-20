# 0011 — Extract re-enabled as bounded parallel (batches of 4); supersedes 0003

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-20 |
| **Area** | `data-repo` process-voice `SKILL.md` (Stage 5); verified on the `control-bot` server |
| **Supersedes** | [0003](0003-extract-serial-no-parallel-fan-out.md) |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0005](0005-control-bot-disable-partial-message-streaming.md), [0006](0006-control-bot-disable-background-task-deferral.md), [0007](0007-control-bot-raise-production-budget-caps.md) |

## Context

ADR 0003 forced Stage-5 extract to run **strictly serially** because the `claude-code-telegram`
SDK bridge silently dropped all but one of a parallel `Task` batch. But 0003 was never the fix
that stopped the mid-run stall — that came from a later stack: 0005
(`include_partial_messages=False`), 0006 (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`), and 0007
(raised budget caps). ADR 0005's own A/B repro already showed `include_partial_messages=False`
alone let 3 parallel `Task` agents complete. With 0005/0006 deployed, the original reason for
serial extract no longer held, and serial cost ~15–25 min per multi-process voice on the 2-CPU
host for no remaining benefit.

## Decision

Re-enable Stage-5 extract as **bounded parallel batches of at most 4** `extract` `Task`s per
message (never full N-way fan-out). The change is a single `SKILL.md` edit
(spec `docs/superpowers/specs/2026-07-20-reenable-bounded-parallel-extract-design.md`,
plan `docs/superpowers/plans/2026-07-20-reenable-bounded-parallel-extract.md`), gated on an
objective server test.

### Verification (live, on the 2-CPU server)

The batch-of-4 `SKILL.md` was deployed in-place (with a `.bak`) and a real `/process-voice
dining` run was executed through the deployed control-bot against the empty dining department:

- **11 new processes** (`dining-001..011`) extracted in **bounded batches of 4** (3 batches:
  4+4+3), committed as one pipeline commit.
- Completed in **one ~16-min turn** (started `06:28:47Z`, finished `06:45:03Z`), with **no
  «ادامه بده»**.
- The read-only checker `control-bot/testing/check_run.py` returned **PASS** on all three
  criteria: completion (11/11 candidate artifacts, `meta.finished_at` set), single-turn (no
  `Continue from where you left off.` resume injection), and clean transcript. The session
  transcript's `stop_reason` values were only `tool_use` (75) and `end_turn` (4) — **never**
  `stop_sequence` — with zero `No response requested.` / `Auto-resuming deferred tool`
  signatures.

The operator accepted this single clean run as sufficient (the design's 2-consecutive-run bar
was relaxed by operator decision given the fully-clean result and the multi-batch load).

### Checker correction found during verification

The first checker run false-FAILed `clean_transcript` because it scanned for the bare token
`stop_sequence`, which matches the benign `"stop_sequence": null` field Claude's API attaches
to **every** assistant message (79 hits on a healthy run). Fixed (`b999d3b`) to match the
actual stall value `"stop_reason":"stop_sequence"` and to also flag
`[Tool result missing due to internal error]`; re-run confirmed PASS.

## Consequences

- ✅ Extract wall-clock drops materially (network/model wait dominates each agent, so 4-way
  concurrency overlaps it); the verified run showed no mid-run stall.
- ✅ Any residual stop is bounded to a 4-item batch, not the whole run.
- 📝 ARD §5/§7 (NFR-6): parallel extract is realized (bounded to 4), no longer aspirational.
- 📝 The batch cap stays **4** pending a separate test of full N-way fan-out.
- 🧰 Verification tooling lives in `control-bot/testing/` (`check_run.py` + `parallel_task_probe.py`).

## Lessons

- 0003 was a mitigation for a symptom whose real cause (0005/0006) was fixed separately; once
  the cause was gone, the mitigation was pure cost. Re-test superseded workarounds.
- A gate checker is itself code that can be wrong: a substring that also matches a benign
  field turned a clean run red. Match the signal precisely, and verify the checker against a
  real transcript before trusting its verdict.
