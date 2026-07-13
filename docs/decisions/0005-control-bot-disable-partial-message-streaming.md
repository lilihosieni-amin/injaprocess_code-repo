# 0005 — control-bot disables partial-message streaming (`include_partial_messages=False`)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `control-bot` — `control-bot/patches/0004-disable-partial-message-streaming.patch` |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0003](0003-extract-serial-no-parallel-fan-out.md), [0006](0006-control-bot-disable-background-task-deferral.md); commit `3f0ebf8` |

## Context

`claude-code-telegram` sets:

```python
# src/claude/sdk_integration.py
include_partial_messages=stream_callback is not None
```

and it **always** passes a `stream_callback` (to drive the Telegram progress bar), so
token-level partial-message streaming is **always on**.

With streaming on, the bundled Claude Code treats long-running **parallel `Task`
subagents** as **deferred/background tools** and tears them down mid-run. The transcript
signature: the parent dispatches N `Task`s → only 1 `tool_result` returns →
`queue-operation` + an injected `user` message **"Continue from where you left off."**
(`isMeta`) → the model replies **"No response requested."** → `stop_reason:
stop_sequence` → the SDK returns a clean `ResultMessage` (`is_error=false`), the bot
breaks its receive loop and `disconnect()`s, killing the still-running subagents. Only
the 1–2 candidates already written survive.

### A/B repro (decisive)

A standalone SDK script in the container, mirroring the bot's `ClaudeAgentOptions`,
dispatched **3 parallel `Task` agents** each running a slow command:

| `include_partial_messages` | Result |
|---|---|
| `True` (bridge default) | **FAIL** — subagents dropped, 0 output files |
| `False` | **PASS** — all agents completed, all files written |

Only that one option differed.

## Decision

Force `include_partial_messages=False` via
`control-bot/patches/0004-disable-partial-message-streaming.patch` (applied in the
Dockerfile with a `grep` guard). The `stream_callback` is still passed, so it receives
**full** message events — the progress bar keeps updating at **message granularity**;
only token-level partial deltas are disabled.

## Consequences

- ✅ Eliminated the parallel-subagent **drop** in the A/B repro.
- ➖ Not sufficient alone on the real pipeline: even serial (ADR [0003](0003-extract-serial-no-parallel-fan-out.md)), long single
  subagents on the 2-CPU host were still deferred with the same
  `stop_sequence`/"No response requested." signature — addressed by disabling
  background tasks entirely in ADR [0006](0006-control-bot-disable-background-task-deferral.md).
- ➖ Progress bar is coarser (per full message, not per token). Combined with the
  existing throttle patch (0002) this is fine.

## Lessons

- The streaming/partial-message path changes Claude Code's tool-scheduling behavior, not
  just its output cadence. A "cosmetic" option (progress streaming) had a correctness
  side-effect (backgrounding subagents).
