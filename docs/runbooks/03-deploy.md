# 03 — Deploy: build, first up, and updates

All builds and Compose commands run on the server from
`/opt/inja/code-repo/deploy`. The build context is the code-repo root, so the
custom images (`inja-upload-bot`, `inja-control-bot`, `inja-ui-backend`,
`inja-git-push`) are built **on the server**.

Prerequisite: [`02-secrets-and-auth.md`](02-secrets-and-auth.md) is done — the
secret files exist under `/opt/inja/secrets/` and the Claude subscription login
has been completed.

## First deploy

```bash
cd /opt/inja/code-repo/deploy
docker compose build                 # builds all custom images on the server
docker compose up -d
docker compose ps                    # all services "running"
```

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
