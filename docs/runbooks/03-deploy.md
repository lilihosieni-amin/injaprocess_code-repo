# 03 — Deploy: build, first up, and updates

All builds and Compose commands run on the server from
`/opt/inja/code-repo/deploy`. The build context is the code-repo root, so the
custom images (`inja-upload-bot`, `inja-control-bot`, `inja-ui-backend`,
`inja-git-push`) are built **on the server**.

Prerequisite: [`02-secrets-and-auth.md`](02-secrets-and-auth.md) is done — the
secret files exist under `/opt/inja/secrets/` and the Claude subscription login
has been completed.

## First deploy

**Preflight — the secret env files must already exist and be regular files.** If
any `/opt/inja/secrets/*.env` is missing when `up -d` runs, Docker creates a
**directory** at the mount path and the affected service crash-loops. Check
first:

```bash
for f in upload-bot control-bot ui-backend telegram-bot-api; do
  test -f "/opt/inja/secrets/$f.env" || echo "MISSING /opt/inja/secrets/$f.env — create it first (runbook 02)"
done
```

Only proceed when the loop prints nothing.

There is no `ui-users.json` in this list any more, and there should be none on
the server: UI accounts are rows in `app.db` and are created in step 3 below.

```bash
cd /opt/inja/code-repo/deploy
docker compose build                 # builds all custom images on the server
docker compose up -d
docker compose ps                    # all services "running"
```

**Confirm control-bot did not crash-loop on a read-only path.** `control-bot`
runs with `read_only: true` (AC-7 defense-in-depth), with `/tmp`,
`/root/.cache`, `/root/.config`, `/root/.claude`, and `/state` made writable. If
the claude-code CLI or the bot needs some other writable path, it will crash on
first start:

```bash
docker compose logs control-bot      # look for "Read-only file system" errors
```

If you see a read-only-filesystem error on a path not already covered, add that
path to the service's `tmpfs:` list (or a named volume) in `docker-compose.yml`
and `docker compose up -d` again. Also ensure `control-bot.env` sets
`DATABASE_URL=sqlite:////state/bot.db` so the bot's SQLite state lands on the
writable `control-bot-state` volume (runbook 02).

### Create the first Editor — the stack has no accounts until you do

A fresh deployment starts with an **empty** `app.db`: no users, so nobody can
sign in, and the sign-in page rejects every password including the right one.
This step is not optional and there is no default account.

```bash
cd /opt/inja/code-repo/deploy
docker compose run --rm ui-backend \
  inja-seed --db /state/app.db \
            --username 09123456789 \
            --name "نام و نام خانوادگی" \
            --password 'CHOOSE-A-REAL-PASSWORD-HERE'
```

Use the real mobile number of the person who will run the system — the username
**is** the mobile number, in the form `09` plus nine digits — and a password of at
least six characters. Single-quote it so the shell leaves `$` and `!` alone.

Expected output and exit code:

```
created the Editor 09123456789        # exit 0
```

- Exit **1** with `an active Editor already exists, so nothing was created` means
  the volume already holds an account. That is the healthy answer on a redeploy,
  not a failure — the store survived, which is the point of the `ui-state` volume.
- Exit **2** prints the reason on **stderr** (password too short, or that number
  is already taken by an account that is not an active Editor).

`--db /state/app.db` must match the `APP_DB` the compose file gives the service.
Anything else writes an Editor into a file the app never opens, and the sign-in
page goes on rejecting everyone.

Full detail — every exit code, what the seed refuses, and the recovery path when
every Editor is lost — is in [`06-changing-users.md`](06-changing-users.md).

### Then check the UI

```
# UI: browse https://91.107.147.127 — accept the self-signed cert once
```

The `proxy` serves internal (self-signed) TLS, so the browser will warn on first
visit — accept the certificate once. Port 443 is the only published port. Sign in
with the mobile number and password you just seeded.

## Updating after a code change

Pull the latest code-repo, rebuild, and re-up in one line:

```bash
git -C /opt/inja/code-repo pull && docker compose build && docker compose up -d
```

`docker compose up -d` recreates only the containers whose image or config
changed. The Claude subscription login survives updates because it lives in the
`claude-credentials` volume, not in the image.

Accounts survive for the same reason: `app.db` is on the `ui-state` volume, not
in the container. Re-running `inja-seed` after an update is harmless — it exits
`1` and writes nothing.

> **Never `docker compose down -v` on this host.** The `-v` deletes the named
> volumes, and `ui-state` is one of them: that is every account, every session
> and the entire activity record, and nothing in GitHub holds a copy —
> `git-push` covers only the data-repo (see
> [`05-operations.md`](05-operations.md)). Plain `docker compose down` is safe.

## Next

Once the stack is up, see [`04-transcription.md`](04-transcription.md) for the
transcription workflow and [`05-operations.md`](05-operations.md) for day-to-day
operation.
