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

Five separate things need backing up. `git-push` covers the first, off-site;
`ui-backend` covers the last two, on this host only; the other two need a
snapshot of their own.

- **Off-site baseline:** `git-push` is the off-site baseline — it backs up
  data-repo **minus audio** (raw audio under `meetings/audio/` is gitignored and
  never leaves the server).
- **Raw audio:** because audio is excluded from git, add a **separate**
  rsync/snapshot of `/opt/inja/data-repo/meetings/audio/` if you need to keep the
  raw voices.
- **`attachments/sheets/` — the workbooks themselves.** `attachments/sheets/**/*.xlsx`
  is gitignored on the same precedent as raw audio (QF-28), so `git-push` never
  carries the actual Google Sheets exports — only the manifest, `.structure.md`,
  `.gs` files and `dump-workbook`'s structure dump. Add `/opt/inja/data-repo/attachments/sheets/`
  to the same rsync/snapshot as the audio if the `.xlsx` files themselves need
  to survive a full data-repo loss.
- **`app.db` and `comments.db` — backed up on this host, not off-site.**
  `app.db` lives on the `ui-state` volume and holds every account, every
  password hash, every session, the whole activity record and the whole fact
  review record (every `confirmations` row); `comments.db` lives on
  `ui-comments` and holds every comment and its resolution. `git-push` sees
  neither. `ui-backend` takes a SQLite `.backup` of both at **11:00** and
  **23:00** UTC (container time — **14:30** and **02:30** in Tehran; the
  stamp in the file name is UTC too) into `/opt/inja/backups/` (`app-YYYYmmdd-HH00.db`,
  `comments-YYYYmmdd-HH00.db`), keeps the newest **14** of each, mode `0600`
  (ARD §16, spec addendum D82). They are secrets — a file of password hashes
  and live session ids; read them as root (`sudo` if you are not). They are
  **on the same host**: they cover a corrupted database or a bad deploy, not
  losing the server, so NFR-16's off-site half is still unmet. Copy the newest
  pair off the host by hand with the `scp` recipe in
  [`02-secrets-and-auth.md`](02-secrets-and-auth.md) § 5.
- **Restore — the data-repo:** re-clone data-repo from GitHub, then restore
  `meetings/audio/` and `attachments/sheets/` from their snapshots.
- **Restore — `app.db` and `comments.db`** from a pair in `/opt/inja/backups/`
  (or one you copied back onto the host). Pick one stamp and restore **both**
  files from it, so comments and the accounts they name agree. Stop
  `control-bot` too: its `comments` CLI opens `comments.db`.

  ```bash
  cd /opt/inja/code-repo/deploy
  ls -1 /opt/inja/backups/                          # choose a stamp
  stamp=20260927-1100
  docker compose stop ui-backend control-bot
  docker compose run --rm --no-deps --entrypoint sh ui-backend -c "
    rm -f /state/app.db-wal /state/app.db-shm /comments/comments.db-wal /comments/comments.db-shm &&
    cp /backups/app-$stamp.db /state/app.db &&
    cp /backups/comments-$stamp.db /comments/comments.db"
  docker compose start ui-backend control-bot
  ```

  The `-wal`/`-shm` files beside the target belong to the database being
  replaced; left in place, SQLite could replay them onto the restored copy and
  corrupt it.
  Everyone signed in after the chosen slot is signed out (their sessions are
  not in it), and activity after it is gone from the record. With no backup to
  restore, the accounts are gone and the way back in is `inja-seed`
  ([`06-changing-users.md`](06-changing-users.md)) — a new first Editor, and
  everyone else re-created by hand.

## Next

To add or remove users, see [`06-changing-users.md`](06-changing-users.md).
