# 03 — Deploy: build, first up, and updates

All builds and Compose commands run on the server from
`/opt/inja/code-repo/deploy`. The build context is the code-repo root, so the
custom images (`inja-upload-bot`, `inja-control-bot`, `inja-ui-backend`,
`inja-git-push`) are built **on the server**.

Prerequisite: [`02-secrets-and-auth.md`](02-secrets-and-auth.md) is done — the
secret files exist under `/opt/inja/secrets/` and the Claude subscription login
has been completed.

## First deploy

**Preflight — the secret files must already exist and be regular files.** If any
`/opt/inja/secrets/*.env` or `ui-users.json` is missing when `up -d` runs, Docker
creates a **directory** at the mount path and the affected service crash-loops
(e.g. ui-backend tries to open `ui-users.json` and finds a dir). Check first:

```bash
for f in upload-bot control-bot ui-backend telegram-bot-api; do
  test -f "/opt/inja/secrets/$f.env" || echo "MISSING /opt/inja/secrets/$f.env — create it first (runbook 02)"
done
test -f /opt/inja/secrets/ui-users.json || echo "MISSING ui-users.json — create it first (runbook 02)"
```

Only proceed when the loop prints nothing.

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

Then check the UI:

```
# UI: browse https://91.107.147.127 — accept the self-signed cert once
```

The `proxy` serves internal (self-signed) TLS, so the browser will warn on first
visit — accept the certificate once. Port 443 is the only published port.

## Updating after a code change

Pull the latest code-repo, rebuild, and re-up in one line:

```bash
git -C /opt/inja/code-repo pull && docker compose build && docker compose up -d
```

`docker compose up -d` recreates only the containers whose image or config
changed. The Claude subscription login survives updates because it lives in the
`claude-credentials` volume, not in the image.

## Next

Once the stack is up, see [`04-transcription.md`](04-transcription.md) for the
transcription workflow and [`05-operations.md`](05-operations.md) for day-to-day
operation.
