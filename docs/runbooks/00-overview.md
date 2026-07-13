# 00 — Overview: topology & inventory

This is the operator's map of the deployed stack. Read it first; the numbered
runbooks that follow (`01`…`06`) walk through provisioning, secrets, deploy, and
day-to-day operation.

The whole stack runs as one Docker Compose project on a single host
(`91.107.147.127`, reachable as `ssh inja`). Compose lives at
`deploy/docker-compose.yml` and is always run from `/opt/inja/code-repo/deploy`.

## Services

Six services (from the Task 9 compose stack). Only the `proxy` publishes a port.

| Service | Role | Image | Mounts | Published ports |
|---|---|---|---|---|
| `telegram-bot-api` | Local Telegram Bot API server (tdlib) — lets bots fetch voice files larger than 20 MB | `tdlib/telegram-bot-api` | `telegram-bot-api-data` volume → `/var/lib/telegram-bot-api` | — |
| `upload-bot` | Bot 1: raw voice/file intake from Telegram, writes into data-repo | `inja-upload-bot` (built) | `/opt/inja/data-repo` → `/data` | — |
| `control-bot` | Bot 2: `claude-code-telegram`, runs the extraction pipeline against data-repo | `inja-control-bot` (built) | `/opt/inja/data-repo` → `/data`; `claude-credentials` volume → `/root/.claude` | — |
| `ui-backend` | Thin FastAPI backend: JSON read/write + auth, serves the built frontend | `inja-ui-backend` (built) | `/opt/inja/data-repo` → `/data`; `/opt/inja/secrets/ui-users.json` → `/run/secrets/ui-users.json` (ro) | — |
| `proxy` | Caddy reverse proxy with internal (self-signed) TLS in front of ui-backend | `caddy:2` | `/opt/inja/code-repo/deploy/Caddyfile` → `/etc/caddy/Caddyfile` (ro); `caddy-data` volume → `/data` | **443** |
| `git-push` | Scheduled off-site backup of data-repo (minus audio) to GitHub | `inja-git-push` (built) | `/opt/inja/data-repo` → `/data`; `/opt/inja/keys` → `/keys` (ro) | — |

The **single published port is 443** (the `proxy`). Everything else is reachable
only on the internal Compose network; the bots talk *out* to Telegram and GitHub
but expose nothing inbound.

## Data flow

All components communicate **only through the filesystem** (the data-repo bind
mount at `/data`), never by direct network calls between each other:

```
upload-bot → data-repo ← control-bot pipeline → data-repo ← ui-backend
                                                            git-push → GitHub
```

- `upload-bot` drops raw voice/files into data-repo.
- `control-bot` runs the pipeline over data-repo (transcribe → extract → merge → layout).
- `ui-backend` reads/writes the same data-repo JSON and serves the UI.
- `git-push` periodically pushes data-repo (minus audio) to GitHub as the off-site baseline.

## `/opt/inja/` layout on the host

```
/opt/inja/
├── code-repo/            # this repo (git clone); compose runs from code-repo/deploy
│   └── deploy/
│       ├── docker-compose.yml
│       └── Caddyfile
├── data-repo/            # the extraction data (git clone); bind-mounted to /data
│   └── meetings/
│       ├── audio/        # raw voices — gitignored, NOT pushed to GitHub
│       └── transcripts/  # {name}.txt transcripts — the source of record
├── secrets/              # env files + ui-users.json (chmod 600, never in git)
│   ├── upload-bot.env
│   ├── control-bot.env
│   ├── ui-backend.env
│   ├── telegram-bot-api.env
│   └── ui-users.json
└── keys/
    └── id_deploy(.pub)   # ed25519 deploy key for git-push write access
```

Compose also manages three named volumes not shown above:
`telegram-bot-api-data`, `claude-credentials` (holds the Claude subscription
login), and `caddy-data` (Caddy's internal CA + TLS state).

## Next steps

1. [`01-server-setup.md`](01-server-setup.md) — provision the host.
2. [`02-secrets-and-auth.md`](02-secrets-and-auth.md) — env files, deploy key, subscription login.
3. [`03-deploy.md`](03-deploy.md) — build, first up, and updates.
4. [`04-transcription.md`](04-transcription.md) — the no-Vertex transcription workflow.
5. [`05-operations.md`](05-operations.md) — logs, health, backup, AC-7 check.
6. [`06-changing-users.md`](06-changing-users.md) — add/remove users.
