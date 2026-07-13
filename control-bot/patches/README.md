# control-bot patches

Vendored source patches for `claude-code-telegram@v1.6.0`, applied during the **Phase-7
Docker image build** (after `uv tool install …@v1.6.0`). These cover gaps where the
upstream bot has no configuration switch for behaviour the locked profile requires.

Each patch is a plain unified diff against the installed package tree
(`site-packages/src/...`). Apply with `patch -p1` / `git apply` at the site-packages root;
see the header of each `.patch` for the exact command and the log line that verifies it.

| Patch | Why |
|---|---|
| `0001-disable-conversation-enhancer.patch` | v1.6.0 has no env flag to disable the "What would you like to do next?" follow-up suggestion buttons in classic mode (`ENABLE_CONVERSATION_MODE` is documented in `.env.example` but is **not** a real Settings field). The patch stops the `ConversationEnhancer` from loading. |
| `0002-throttle-progress-updates.patch` | The stream handler edits the Telegram progress message on every SDK event with no dedupe/rate-limit; long multi-stage runs flood `editMessageText`, Telegram throttles it, and the progress bar freezes mid-run while the backend keeps working. The patch dedupes unchanged text and rate-limits edits to ≤ once/2s. |
| `0003-preset-append-system-prompt.patch` | v1.6.0 passes `system_prompt` as a plain **string**, which the SDK emits as `--system-prompt` and thereby **replaces** Claude Code's built-in agentic system prompt. Keeping the default harness is the correct baseline. The patch switches to `{"type":"preset","preset":"claude_code","append": base_prompt}` → `--append-system-prompt`, keeping the default prompt **and** our directory/CLAUDE.md guidance. (This bot version is SDK-only; `USE_SDK` is not read by the code.) |
| `0004-disable-partial-message-streaming.patch` | v1.6.0 sets `include_partial_messages=(stream_callback is not None)` and always passes a stream callback, so token-level streaming is always on. With it **on**, Claude Code treats long-running **parallel `Task` subagents** as deferred tools and drops them mid-run (`interrupted_turn` → injected "Continue from where you left off." → "[Tool result missing due to internal error]" → `stop_sequence` "No response requested."), so `/process-voice` loses its Stage-5 extract subagents and never reaches merge (`meta.json` `finished_at:null`). **Proven by A/B repro** (3 parallel `sleep 95` Task agents: FAIL with `True`, PASS with `False`). The patch forces `include_partial_messages=False`; full-message stream events still drive the progress bar, only token-level deltas are disabled. This is the actual fix for the "bot stops mid-workflow" hang. |

**Note on the dev-machine run (2026-07-10):** patch 0001 was applied by hand to the local
`uv` install to remove the buttons during testing; a `uv tool` reinstall/upgrade wipes that,
so the durable home for these is the image build. See `../VERIFICATION.md` (Finding 6).
