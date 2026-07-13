# 0001 — control-bot runs without `read_only`; AC-7 is enforced by hooks, not the filesystem

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Area** | `deploy/` (Phase 7), `control-bot` service |
| **Related** | Spec `docs/superpowers/specs/2026-07-12-phase-7-deployment-design.md` §3; runbook `docs/runbooks/05-operations.md`; commit `d77b0ad` |

## Context

Phase 7 deploys the pipeline inside the `control-bot` container (the pinned
`claude-code-telegram@v1.6.0` driving the Claude Code CLI). To harden **AC-7 /
INV-2** ("the runtime cannot change the code/CLIs"), a final-review fix had added
`read_only: true` to the `control-bot` service, plus `tmpfs` mounts for `/tmp`,
`/root/.cache`, `/root/.config` and named volumes for `/root/.claude`
(credential) and `/state` (bot DB).

On first real use, every pipeline attempt failed. The bot logged:

```
{"error": "Control request timeout: initialize", "event": "Unexpected error in Claude SDK", ...}
```

### Investigation (what was actually happening)

- A bare `claude --print "…"` **worked** inside the read-only container — so the
  CLI and subscription auth were fine.
- The failure was specific to the **persistent streaming SDK client**
  (`claude_agent_sdk` 0.1.81), which `claude-code-telegram` uses. Its
  `initialize` control-request to the `claude` subprocess timed out.
- The Claude CLI's persistent client writes **`~/.claude.json`** (a file in the
  *home directory root*, distinct from the `~/.claude/` directory). With
  `read_only: true`, `HOME=/root` is read-only, so that write fails
  (`echo t > /root/.claude.json` → `Read-only file system`), and the SDK init
  hangs → times out. `--print` doesn't hit this because it doesn't run the same
  persistent init.
- **Why we can't just make `~/.claude.json` writable in isolation:** it lives in
  `/root`, right next to **`/root/.local`**, where the bot itself (and its
  applied patches) is installed via `uv tool`. Mounting `/root` (or a broad
  subtree) writable would shadow the baked bot install — breaking the
  "patches applied in the image build" guarantee and putting the bot's own code
  on a writable volume. There is no clean way to make only the single home file
  writable without that collision.
- **Red herring:** an early reproduction used `permission_mode="bypassPermissions"`
  and hit a *different* error — `--dangerously-skip-permissions cannot be used
  with root/sudo privileges`. That is **not** the bot's path: the bot uses a
  `can_use_tool` callback for permissions, not bypass mode. Noted here so it
  isn't chased again.

## Decision

**Do not run `control-bot` with `read_only: true`.** Enforce AC-7 at the
**agent/tool layer** instead — which is the mechanism the ARD actually specifies:

- `USE_SDK=true` + `setting_sources=["project"]` load the **Phase-3 in-container
  hooks** from `/data/.claude`.
- The bot's **`can_use_tool` callback** is built with `approved_directory=/data`
  and denies file operations outside it (logs `can_use_tool denied file
  operation`).
- The engine CLIs and code are **baked outside `/data`** (`/usr/local/bin`,
  `/opt/engine`), so the confined agent cannot reach them.

The bot's SQLite state still uses the `control-bot-state` volume
(`DATABASE_URL=sqlite:////state/bot.db`), and the subscription credential still
persists in the `claude-credentials` volume at `/root/.claude`.

### Why this is still sound for AC-7

AC-7's threat model is the **LLM runtime agent** editing code, not an operator
with `docker exec`. The agent is confined by the hooks + `can_use_tool` callback
regardless of the container's filesystem mode. A Docker container always has a
writable upper layer, so `read_only` was only ever *extra* filesystem
defence-in-depth — never the primary guarantee. Dropping it does not weaken the
real enforcement.

## Consequences

- ✅ The pipeline initializes and runs (verified: the exact bot SDK path returns
  `RESULT: PONG` / `INIT_OK` in the deployed container).
- ✅ AC-7 remains enforced by the hooks + `can_use_tool` callback; CLIs stay
  baked outside `/data`.
- ⚠️ A raw root shell via `docker exec` *can* now write `/usr/local/bin` — this is
  an operator action, outside the AC-7 threat model, and acceptable.
- 📝 The AC-7 **verification** changed: instead of expecting a "read-only file
  system" error on `echo >> /usr/local/bin/merge`, the runbook now checks that
  the CLIs resolve under `/usr/local/bin` (outside `/data`), that `/data/.claude`
  (hooks) is present, and that any out-of-bounds write attempt during a run is
  denied in the logs (`grep "can_use_tool denied"`).

## Lessons

- A **read-only root filesystem is incompatible with tools that write to the
  home directory root** (`~/.claude.json` here). If filesystem hardening is ever
  revisited, run the container as a **non-root user with a dedicated writable
  `$HOME`**, install the bot under that home, and keep the code paths
  (`/usr/local/bin`, `/opt`) on the read-only image layer — that would let
  `read_only: true` coexist with the CLI. It was out of scope to re-architect the
  image mid-deploy.
- Reproduce the *exact* failing code path before concluding a cause: the
  `bypassPermissions` shortcut produced a convincing but irrelevant error.
