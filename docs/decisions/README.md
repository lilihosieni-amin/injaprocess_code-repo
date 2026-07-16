# Decision records (ADRs)

Short records of notable technical decisions and the problem/investigation that
led to them — so the *why* survives, not just the diff. One file per decision,
numbered, newest facts win.

| # | Decision |
|---|---|
| [0001](0001-control-bot-no-read-only-ac7-via-hooks.md) | control-bot runs without `read_only`; AC-7 is enforced by the Phase-3 hooks + `can_use_tool` callback, not the filesystem |
| [0002](0002-control-bot-pipeline-stall-root-cause.md) | Why `/process-voice` stalled mid-run through the control-bot SDK bridge — root-cause analysis, method (incl. refuted hypotheses), and the layered fix stack (0003–0007) |
| [0003](0003-extract-serial-no-parallel-fan-out.md) | Extract runs **strictly serially** (data-repo skill) — the SDK bridge drops parallel `Task` fan-out; serial makes any stop lossless/resumable (trades NFR-6) |
| [0004](0004-control-bot-system-prompt-preset-append.md) | control-bot **appends** to the Claude Code system-prompt preset instead of replacing it (patch 0003) — correct baseline; not the primary stall fix |
| [0005](0005-control-bot-disable-partial-message-streaming.md) | control-bot disables **partial-message streaming** (patch 0004) — stops the deferred-tool drop of parallel subagents (A/B-proven) |
| [0006](0006-control-bot-disable-background-task-deferral.md) | control-bot sets **`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`** — long subagents on the 2-CPU host were deferred (`stop_sequence`/"No response requested."); disabling background tasks removes it |
| [0007](0007-control-bot-raise-production-budget-caps.md) | control-bot raises the **production SDK budget caps to $100** (patch 0005) + turn/bash headroom — the `ProductionConfig` `$2` per-turn cap (which clobbered the env var) was the last blocker |
| [0008](0008-segmentation-node-visibility-semantic-subprocess.md) | **Prompt-only extraction-quality round** — 3-parameter process segmentation + anti-inference guard; node/title visibility (flow readable from titles, 2–6-word cap lifted); sub-process criterion becomes **semantic, not numeric** (resolves the threshold open item) |
| [0009](0009-set-based-extraction-and-restructuring.md) | **Set-based department extraction + restructuring** — read the whole transcript set raw every run (no per-voice patching); `supersedes` relation + `merge restructure`/`attach-subprocess`/`remove` with tombstones; durable never-reused ids; two gates (set + segmentation); `edit-process` chat edits |
