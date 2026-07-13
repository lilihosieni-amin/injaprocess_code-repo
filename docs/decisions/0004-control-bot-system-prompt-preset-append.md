# 0004 — control-bot appends to the Claude Code system-prompt preset (does not replace it)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `control-bot` — `control-bot/patches/0003-preset-append-system-prompt.patch` |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md); commit `39713ad`; `claude_agent_sdk` 0.1.81 |

## Context

While tracing the mid-run stall, we found that `claude-code-telegram` builds the SDK
`system_prompt` as a **plain string**:

```python
# src/claude/sdk_integration.py
base_prompt = "All file operations must stay within {dir}. Use relative paths." + <CLAUDE.md>
options = ClaudeAgentOptions(system_prompt=base_prompt, …)   # a bare str
```

In `claude_agent_sdk` 0.1.81 the transport emits a bare-string `system_prompt` as
**`--system-prompt`**, which **replaces** Claude Code's built-in agentic system prompt
entirely. The preset form `{"type":"preset","preset":"claude_code","append":"…"}` is
what emits **`--append-system-prompt`** (keep the default + append). The interactive
`claude` CLI (no `--system-prompt`) keeps the full default harness — one reason it ran
to completion where the bridge did not.

**Honest note:** this was my *second* hypothesis for the stall, and deploying this fix
**did not** stop it — the real stall causes were the deferred-tool teardown and the
budget cap (ADRs [0005](0005-control-bot-disable-partial-message-streaming.md)/[0006](0006-control-bot-disable-background-task-deferral.md)/[0007](0007-control-bot-raise-production-budget-caps.md)). It is kept anyway because it is the **correct
baseline**: running the pipeline without Claude Code's default agentic prompt is
strictly worse and risks conversational, non-persistent behavior.

## Decision

Patch `sdk_integration.py` to pass the **preset + append** form instead of a bare
string:

```python
system_prompt={"type": "preset", "preset": "claude_code", "append": base_prompt}
```

Delivered as `control-bot/patches/0003-preset-append-system-prompt.patch`, applied in
`deploy/control-bot.Dockerfile` (with a `grep` build guard), same mechanism as the other
vendored patches.

## Consequences

- ✅ Claude Code's default agentic system prompt is retained; our directory/CLAUDE.md
  guidance is **appended** (via `--append-system-prompt`), not substituted.
- ➖ Did **not** by itself fix the mid-workflow stall (see [0002](0002-control-bot-pipeline-stall-root-cause.md)).
- 📝 This bot version is **SDK-only**; the `USE_SDK` env var is not read by the code, so
  every run goes through this path.

## Lessons

- A "correct-looking" root cause can be real *and* not the bug you're chasing. Verify a
  fix against the actual symptom before declaring victory — this one was refuted by the
  next live run, which sent the investigation back to Phase 1.
