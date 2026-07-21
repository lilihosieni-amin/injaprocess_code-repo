# 0015 — control-bot uses the 1M-context model (`claude-opus-4-8[1m]`)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-21 |
| **Area** | `control-bot` — server env `/opt/inja/secrets/control-bot.env` (`CLAUDE_MODEL`); **no code/patch change** |
| **Related** | [0002](0002-control-bot-pipeline-stall-root-cause.md), [0007](0007-control-bot-raise-production-budget-caps.md), [0012](0012-consolidation-review-stage.md) |

## Context

Long `/process-voice` runs kept resetting mid-pipeline with **"This session is being
continued from a previous conversation that ran out of context"** — Claude Code's
**auto-compact**. The operator's intuition was that the whole chat was well under 1M tokens,
so why compact at all?

### The bot imposes no context limit of its own

A careful read of the installed bot (`claude-code-telegram@v1.6.0` + the 5 patches) settles
it: **there is no context/token/compaction setting anywhere in the source.** Every option is
built in one place, `src/claude/sdk_integration.py` `ClaudeAgentOptions(...)`:

```python
options = ClaudeAgentOptions(
    max_turns=self.config.claude_max_turns,          # turn COUNT, not tokens
    model=self.config.claude_model or None,          # "claude-opus-4-8"
    max_budget_usd=self.config.claude_max_cost_per_request,  # $ cap (ADR 0007)
    cwd=..., allowed_tools=..., disallowed_tools=...,
    cli_path=..., include_partial_messages=False, sandbox={...},
    system_prompt={"type": "preset", "preset": "claude_code", "append": base_prompt},
    setting_sources=["project"], stderr=...,
)
```

No `max_tokens`, no `context_window`, no `compact`. A tree-wide sweep of `src/` for
hard-coded windows / output caps / `context-1m` found nothing (the only `1000000` hit is an
unrelated hash bucket in a *disabled* feature). Context management is **100% delegated to the
Claude Code CLI default**, which is the **model's native window**. With `CLAUDE_MODEL=claude-opus-4-8`
(the plain variant) that is **200K**, and auto-compact fires at ~82%.

### Measured proof it was 200K, not 1M

Session `5d1f5d45` (via `control-bot/testing/session_view.py` + a usage parse):

- **Peak live context ever reached: 163,398 tokens** — it flat-lined there and never went higher.
- Pushed past 150K **41 times**; **auto-compacted 3×**.

If the window were 1M, a 163K peak would *never* trigger compaction — yet it compacted three
times. The peak sits exactly where a 200K window's early auto-compact would clamp it.

The "whole chat is under 1M" reasoning conflates two things: **context window = how much can
be live at once**, not the cumulative size of everything ever said. The cumulative session
(~2.6 MB, roughly 0.7–0.9M tokens over its lifetime) is irrelevant to when it compacts.

## Decision

Set **`CLAUDE_MODEL=claude-opus-4-8[1m]`** in `/opt/inja/secrets/control-bot.env`.

**Model selection is the entire mechanism** — there is no separate context flag. The bot
forwards `model=` straight through to the SDK, which parses the `[1m]` suffix into the
`context-1m-2025-08-07` beta.

**Eligibility verified before committing to it.** The bot authenticates with a *subscription
OAuth* credential (the `claude-credentials` volume), not an API key, so 1M was not a given. A
direct CLI probe inside the container against that credential:

```
$ claude -p "say OK" --model "claude-opus-4-8[1m]" --output-format json
… "modelUsage": { "claude-opus-4-8[1m]": { "contextWindow": 1000000,
                                            "maxOutputTokens": 64000, … } }
```

`contextWindow: 1000000` reported by the API — a **real 1M window, not a silent fallback** to
200K. Applied to the env, force-recreated `control-bot`; live env shows `claude-opus-4-8[1m]`,
container `Up`, startup clean, polling normally.

## Consequences

- ✅ New sessions run with a **1,000,000-token** window; long `/process-voice` runs (esp. with
  the Stage-10 consolidation pass, ADR 0012) no longer auto-compact at ~163K — the
  "continued from a previous conversation" resets should largely disappear.
- ⚠️ **Cost.** The `[1m]` variant is premium-priced: tokens above 200K bill at ~2×, and even
  the trivial "say OK" probe cost **$0.04**. The per-request `max_budget_usd` cap (ADR 0007,
  raised to $100) remains the runaway backstop — governance is cost-based, not context-based.
- 📝 **Server-side env only.** `deploy/docker-compose.yml` reads `CLAUDE_MODEL` from the env
  file, so there is **nothing to commit** in the repo. Backup at
  `/opt/inja/secrets/control-bot.env.bak-1m`; revert = flip the one line + force-recreate.
- 📝 `maxOutputTokens` for the variant is **64000** (unchanged concern — the pipeline emits
  many small turns, not one huge output).

## Lessons

- **"Why did it compact under 1M?" is a model-window question, not a bot-code question.** The
  wrapper sets no context limit; the window is whatever model the CLI is handed. Always
  separate *live-at-once* from *cumulative*.
- The `[1m]` suffix is the whole lever, and `--output-format json` → `modelUsage.contextWindow`
  is how you **prove** the window is actually granted (vs a silent downgrade) — decisive when
  running on a subscription credential whose entitlements aren't documented.
