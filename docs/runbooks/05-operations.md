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

## Bot 2 says "Failed to authenticate. API Error: 401 OAuth access token has expired."

Nothing is misconfigured — the credential in the `claude-credentials` volume is an
OAuth **pair**, not a permanent key. The access token is short-lived and Claude Code
refreshes it silently in the background; what you are seeing is the day the
**refresh** failed, so `02-secrets-and-auth.md` § 4 calling the login "one-time" is
true only for as long as that refresh keeps working. It stops working when the
refresh token expires (long stretch with no successful refresh), is revoked (a
subscription or password change), or is rotated out from under this host because the
same account was logged in somewhere else.

The fix is the same login, plus a restart — the running container holds the token in
memory, so re-logging in alone does **not** unstick it:

```bash
cd /opt/inja/code-repo/deploy
docker compose run --rm -it control-bot claude auth login   # open URL, paste code
docker compose restart control-bot
docker compose logs -f --tail=50 control-bot
```

Two things to check while you are there, in this order:

```bash
docker volume inspect deploy_claude-credentials   # gone => `down -v` wiped it; that is the whole story
docker compose exec control-bot env | grep ANTHROPIC   # must print nothing
```

`ANTHROPIC_API_KEY` must stay unset (`02-secrets-and-auth.md` § 3): a stray key
would not cause *this* error, but it silently bills the API instead of the
subscription, so rule it out now rather than on the invoice.

## Backup & restore

Three separate things need backing up, and `git-push` covers only the first.

- **Off-site baseline:** `git-push` is the off-site baseline — it backs up
  data-repo **minus audio** (raw audio under `meetings/audio/` is gitignored and
  never leaves the server).
- **Raw audio:** because audio is excluded from git, add a **separate**
  rsync/snapshot of `/opt/inja/data-repo/meetings/audio/` if you need to keep the
  raw voices.
- **`app.db` — not covered by anything yet.** It lives on the `ui-state` Docker
  volume, outside the data-repo, and holds every account, every password hash,
  every session and the whole activity record. `git-push` never sees it, so
  today **nothing off-site holds any of it** and NFR-7 is simply false for
  users, sessions and the activity record until this is set up. The
  `state-backup` service that closes the gap (ARD §16, NFR-16 — `sqlite3 .backup`
  off-site on the same 11:00/23:00 schedule) is not built yet; take the backup by
  hand meanwhile, with the `.backup` recipe in
  [`02-secrets-and-auth.md`](02-secrets-and-auth.md) § 5. Use `.backup`, not
  `cp`: the file is in WAL mode and a plain copy taken mid-write can be torn.
  Treat the result as a secret — it is a file of password hashes.
- **Restore:** re-clone data-repo from GitHub, then restore `meetings/audio/`
  from the audio snapshot, and copy the newest `app.db` backup onto the
  `ui-state` volume with the service stopped. With no `app.db` backup to restore,
  the accounts are gone and the way back in is `inja-seed`
  ([`06-changing-users.md`](06-changing-users.md)) — a new first Editor, and
  everyone else re-created by hand.

## Next

To add or remove users, see [`06-changing-users.md`](06-changing-users.md).
