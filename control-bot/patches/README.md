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

**Note on the dev-machine run (2026-07-10):** patch 0001 was applied by hand to the local
`uv` install to remove the buttons during testing; a `uv tool` reinstall/upgrade wipes that,
so the durable home for these is the image build. See `../VERIFICATION.md` (Finding 6).
