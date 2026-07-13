# 05 — Operations: logs, health, push, AC-7, backup

Day-to-day operation. All commands run on the server from
`/opt/inja/code-repo/deploy`.

## Logs & restarts

Tail a service's logs (swap `control-bot` for any service name):

```bash
docker compose logs -f control-bot            # or any service
```

Restart a single service (e.g. after editing its env file):

```bash
docker compose restart ui-backend
```

`docker compose ps` shows the running state of every service.

## Off-site backup (git-push)

`git-push` runs on a schedule (busybox crond) and pushes data-repo to GitHub
whenever there are unpushed commits. To verify the push logic on demand:

```bash
# verify scheduled push logic on demand:
docker compose exec git-push /usr/local/bin/git-push-if-needed.sh
```

It fetches `origin/main`, and if there are unpushed commits it pushes them and
prints `push ok`; otherwise it prints `nothing to push`.

## AC-7: runtime cannot edit the baked code/CLIs

**Primary guarantee (hooks).** The engine CLIs are baked into the `control-bot`
image at `/opt/engine` (installed onto `/usr/local/bin`) — **outside** the
session's `APPROVED_DIRECTORY` (`/data`). The Phase-3 in-container Claude hooks
(active because `USE_SDK=true` and the project settings are loaded) confine the
agent's Write/Edit/Bash to `/data`, so the runtime agent cannot reach the CLIs or
code in the first place. That confinement is the real AC-7 enforcement.

**Filesystem defense-in-depth.** The `control-bot` service also runs with
`read_only: true`, so its root FS is not writable even by root — only `/data`,
`/root/.claude`, `/state`, and the declared `tmpfs` mounts are writable. Verify
that the baked CLIs cannot be written:

```bash
# AC-7: the baked CLIs live on the read-only root FS — writing must fail
docker compose exec control-bot sh -c 'echo x >> /usr/local/bin/merge 2>&1; echo RC=$?'
```

Expected: a `Read-only file system` error and a **non-zero** `RC`. A success
(RC=0) would mean the root FS is writable — check that `read_only: true` is still
set on `control-bot` and investigate immediately.

> Note: a Docker container has a writable upper layer, so "baked into an image
> layer" is *not* by itself a write barrier — `read_only: true` is what supplies
> this filesystem check, and the hooks supply the primary agent confinement.

## Backup & restore

- **Off-site baseline:** `git-push` is the off-site baseline — it backs up
  data-repo **minus audio** (raw audio under `meetings/audio/` is gitignored and
  never leaves the server).
- **Raw audio:** because audio is excluded from git, add a **separate**
  rsync/snapshot of `/opt/inja/data-repo/meetings/audio/` if you need to keep the
  raw voices.
- **Restore:** re-clone data-repo from GitHub, then restore
  `meetings/audio/` from the audio snapshot.

## Next

To add or remove users, see [`06-changing-users.md`](06-changing-users.md).
