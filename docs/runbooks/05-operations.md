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

**The guarantee (hooks + can_use_tool callback).** The engine CLIs are baked into
the `control-bot` image at `/opt/engine` (installed onto `/usr/local/bin`) —
**outside** the session's `APPROVED_DIRECTORY` (`/data`). The Phase-3 in-container
Claude hooks (active because `USE_SDK=true` and `setting_sources=["project"]` load
`/data/.claude`) **and** the bot's `can_use_tool` callback (built with
`approved_directory=/data`) confine the agent's Write/Edit/Bash to `/data`, so the
runtime agent cannot reach the CLIs or code in the first place. That confinement —
at the agent/tool layer — is the AC-7 enforcement.

> A Docker container has a writable upper layer, so "baked into an image layer" is
> *not* by itself a filesystem write barrier (a raw root shell in the container
> *can* write `/usr/local/bin` — but that is an operator with `docker exec`, not
> the confined agent, and is outside the AC-7 threat model). `read_only: true` was
> attempted for extra filesystem defence but had to be dropped: the Claude CLI's
> persistent SDK client needs a writable `~/.claude.json` in the root home, which
> can't be isolated as writable without shadowing the baked bot at `/root/.local`.

**Verify the agent confinement is active:**

```bash
# 1) engine CLIs live OUTSIDE the agent's approved dir (/data):
docker compose exec control-bot sh -c 'command -v merge allocate-id; echo "approved=/data"; ls -d /data/.claude'
# 2) during/after a pipeline run, any out-of-bounds write attempt is denied — grep the log:
docker compose logs control-bot | grep -i "can_use_tool denied"
```

Expected: the CLIs resolve under `/usr/local/bin` (not under `/data`), `/data/.claude`
exists (the hooks are present), and any denied file operation appears in the log if
the agent ever tries to write outside `/data`.

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
