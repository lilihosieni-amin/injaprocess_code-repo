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
| `ui-backend` | Thin FastAPI backend: JSON read/write + auth, serves the built frontend, and prints each export to PDF with the Chromium baked into its image | `inja-ui-backend` (built) | `/opt/inja/data-repo` → `/data`; `/opt/inja/secrets/ui-users.json` → `/run/secrets/ui-users.json` (ro); `ui-exports` volume → `/exports` | — |
| `proxy` | Caddy reverse proxy with internal (self-signed) TLS in front of ui-backend | `caddy:2` | `/opt/inja/code-repo/deploy/Caddyfile` → `/etc/caddy/Caddyfile` (ro); `caddy-data` volume → `/data` | **443** |
| `git-push` | Scheduled off-site backup of data-repo (minus audio) to GitHub | `inja-git-push` (built) | `/opt/inja/data-repo` → `/data`; `/opt/inja/keys` → `/keys` (ro) | — |

The **single published port is 443** (the `proxy`). Everything else is reachable
only on the internal Compose network; the bots talk *out* to Telegram and GitHub
but expose nothing inbound.

### The browser inside `ui-backend`

`deploy/ui-backend.Dockerfile` installs Debian's **`chromium`** package and bakes
`CHROMIUM_PATH=/usr/lib/chromium/chromium` into the image. Nothing in
`docker-compose.yml` needs to set it. This is why the ui-backend image is around
1.2 GB rather than 430 MB.

It exists for one thing: after an export's HTML is written, the backend drives
that browser over CDP and prints a `<kind>-<token>.pdf` beside it in the
`ui-exports` volume. Printing the flowchart from the browser is broken on iOS
Safari, so on a phone the PDF the server made is the only correct one — the
document's «چاپ / PDF» button checks for it and hands it over, falling back to
`window.print()` when there is none.

Operationally:

- **It never blocks an export.** If the browser is missing, crashes or times out,
  the HTML is still published and the endpoint still answers 200; the failure is
  a `WARNING` in `docker compose logs ui-backend` naming the department and kind.
  So "no PDF" is a log-line problem, not an outage.
- **Renders are serialised**, one at a time process-wide. Peak measured on this
  host is ~350 MB of browser on top of the service's own ~100 MB, for about 10 s
  per document — comfortable against 3.7 GB, but do not remove the lock.
- **It is a security-update surface.** Chromium here is patched by the same
  `apt-get` as the rest of the image, so a `docker compose build --pull` picks up
  `trixie-security` fixes. Rebuild the ui-backend image when Chromium CVEs land,
  even if no code changed.
- Debian's much smaller `chromium-shell` is **not** a substitute: it is a
  content_shell build with no printing compiled in and answers `Page.printToPDF`
  with `-32601 … wasn't found`.

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

Compose also manages five named volumes not shown above:
`telegram-bot-api-data` (files the local Bot API server downloads),
`claude-credentials` (holds the Claude subscription login), `control-bot-state`
(the control bot's SQLite state at `/state/bot.db`), `caddy-data` (Caddy's
internal CA + TLS state), and `ui-exports` (generated export documents — kept
out of the data-repo so 2 MB artifacts never land in its working tree).

## Next steps

1. [`01-server-setup.md`](01-server-setup.md) — provision the host.
2. [`02-secrets-and-auth.md`](02-secrets-and-auth.md) — env files, deploy key, subscription login.
3. [`03-deploy.md`](03-deploy.md) — build, first up, and updates.
4. [`04-transcription.md`](04-transcription.md) — the no-Vertex transcription workflow.
5. [`05-operations.md`](05-operations.md) — logs, health, backup, AC-7 check.
6. [`06-changing-users.md`](06-changing-users.md) — add/remove users.
