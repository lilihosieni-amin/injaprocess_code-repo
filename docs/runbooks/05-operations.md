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

The engine CLIs are baked into the `control-bot` image at `/opt/engine`
(installed onto `/usr/local/bin`) as a read-only image layer, outside the
session's `APPROVED_DIRECTORY` (`/data`). The runtime must not be able to modify
them. Verify:

```bash
# AC-7: runtime cannot edit code/CLIs inside control-bot
docker compose exec control-bot sh -c 'echo x >> /opt/engine/merge/cli.py' # must FAIL (read-only layer)
```

This command **must fail** (non-zero exit / permission or read-only error). A
success would mean the runtime can mutate the baked pipeline code — investigate
immediately.

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
