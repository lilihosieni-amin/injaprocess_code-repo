# Phase 7 — Deployment & Operations — Design

| | |
|---|---|
| **Status** | Approved (design); ready for implementation plan |
| **Date** | 2026-07-12 |
| **Repo** | `code-repo/deploy/`, `code-repo/docs/runbooks/`, `code-repo/.github/` |
| **Spec authority** | PRD (NFR-7, NFR-9, AC-7), ARD §15 (versioning/push), ARD §16 (Docker), PLAN.md §9 |

## 1. Goal

Bring the whole system up on the server (`91.107.147.127`, user `root`, alias
`ssh inja`) as **one durable `docker compose up -d` stack** — running-only, no
Superpowers and no coding inside containers (ARD §16, INV-2). Deliver the
Dockerfiles, a complete `docker-compose.yml`, Caddy proxy config, a `git-push`
scheduler, operator runbooks, and a CI pipeline. On completion the project is
deployed and operable.

## 2. Decisions (locked)

| Decision | Choice | Consequence |
|---|---|---|
| Transcription (no Vertex) | **Manual transcript drop** | Deploy with `transcribe` unconfigured. A transcript at `meetings/transcripts/{name}.txt` makes `transcribe` a no-op (idempotency skip) and the pipeline runs from there. Vertex env seam (`VERTEX_PROJECT/LOCATION`, `GEMINI_MODEL`, `GOOGLE_APPLICATION_CREDENTIALS`) stays ready to switch on later. |
| UI TLS | **IP-only, Caddy internal TLS** | Caddy serves HTTPS with a self-signed/internal cert on the IP. One-time browser trust warning. Swap to a real domain later by editing one line in the `Caddyfile`. |
| Anthropic auth | **Claude subscription login** | The Claude Code CLI (control-bot + pipeline subagents) authenticates with a subscription credential persisted in a named volume. No `ANTHROPIC_API_KEY` set (it would override subscription). **Note:** pipeline Opus subagents consume subscription quota; can switch to API key later without design change. |
| CI/CD | **CI tests + GHCR image build; manual deploy** | GitHub Actions runs tests/lint/UI build on push+PR, and on a `v*` tag builds+pushes the custom images to GHCR. Deployment to the server is a documented manual runbook step. No SSH secrets in CI. |

## 3. Architecture — the stack

ARD §16 mandates multi-service Compose (not a single supervisord container).
`code-repo` is baked into images; `data-repo` is **never** baked — it is the
single shared bind-mount, "the only point of connection."

| Service | Image | Role / key contents | Mounts | Published |
|---|---|---|---|---|
| `telegram-bot-api` | upstream `tdlib/telegram-bot-api` | local Bot API server, 2 GB cap (NFR-2) for upload-bot's large voices | own data volume | no |
| `upload-bot` | **build** `deploy/upload-bot.Dockerfile` | Bot 1 (Python). `python:3.11-slim` + `pip install -e upload-bot` | data-repo @ `DATA_ROOT` | no |
| `control-bot` | **build** `deploy/control-bot.Dockerfile` (heavy) | Bot 2. `python:3.11` + Node + **Claude Code CLI** + `pip install -e engine` (CLIs on PATH) + git + `claude-code-telegram@v1.6.0` with both `patches/` applied | data-repo @ `APPROVED_DIRECTORY`; `claude-credentials` volume @ CLI config dir | no |
| `ui-backend` | **build** `deploy/ui-backend.Dockerfile` (2-stage) | stage 1 node builds `ui/dist`; stage 2 `python` FastAPI + engine CLIs + git, serves `ui/dist` | data-repo @ `DATA_ROOT` | no (behind proxy) |
| `proxy` | upstream `caddy` + `deploy/Caddyfile` | reverse proxy + **internal TLS** to `ui-backend` | `caddy-data` volume | **443** |
| `git-push` | **build** `deploy/git-push.Dockerfile` | scheduled push (git + tiny cron/loop) at 11:00 & 23:00, only if unpushed commits (ARD §15, NFR-7) | data-repo + deploy key (ro) | no |

**AC-7 (deployed):** engine CLIs and code are baked into read-only image layers
outside `APPROVED_DIRECTORY`; the Phase-3 runtime hooks are active in-container.
In the running `control-bot`, runtime cannot edit the CLIs or code, and hooks
block forbidden writes. Verified by a runbook step.

## 4. Server layout & compose

On the server:

```
/opt/inja/
  code-repo/            # git checkout: deploy/ compose + Caddyfile (+ build context)
  data-repo/            # git checkout — BIND-MOUNTED into upload-bot/control-bot/ui-backend
                        #   and host-accessible so dev sessions 1/2 can reach it (ARD §16)
  secrets/              # env files OUTSIDE git:
                        #   upload-bot.env, control-bot.env, ui-backend.env
  keys/                 # data-repo deploy key (git-push, mounted read-only)
  (docker named volumes) claude-credentials, caddy-data, telegram-bot-api-data
```

`docker-compose.yml` completes the existing skeleton:

- Every service `restart: unless-stopped`.
- Secrets via `env_file:` → `/opt/inja/secrets/*.env`. Never in repo, never in image.
- `data-repo` is a **host bind-mount** (not an anonymous volume) so it stays
  reachable on the host (ARD §16).
- Subscription credential persists in the `claude-credentials` named volume.
- Compose references **GHCR image tags** for the custom services (CI builds them);
  a `build:` context stays available as a fallback for build-on-server.

## 5. Networking

- **upload-bot → local `telegram-bot-api`** (`TELEGRAM_API_BASE_URL=http://telegram-bot-api:8081`) for >20 MB voices (NFR-2).
- **control-bot → direct `api.telegram.org`.** claude-code-telegram v1.6.0 cannot be pointed at the local bot-api server without an upstream patch, and it handles only text/commands, so it does not need the 2 GB path.
- **proxy** is the only published port (443). Both bots are outbound-only.
- Runbook documents the proven SOCKS-proxy fallback if `api.telegram.org` is blocked from the host.

## 6. Scheduled push & backup (ARD §15, NFR-7)

- Commits are always local/immediate on the VPS (full history).
- `git-push` pushes **data-repo → GitHub** (`injaprocess_data-repo`) at **11:00
  and 23:00**, only if `git log @{u}..` is non-empty. Deploy key mounted read-only.
- This scheduled push is the **off-site backup baseline**. Runbook notes an
  optional server snapshot as belt-and-suspenders. (Only `data-repo` changes at
  runtime; `code-repo` is the built artifact and is not runtime-pushed.)
- **Audio is excluded from git** (`meetings/audio/` is gitignored; transcripts are
  the source of record). The git-push backup therefore does **not** cover raw
  audio — if off-site audio backup is wanted, it needs a separate mechanism
  (rsync/object-store/snapshot), documented in `05-operations.md`.

## 7. Runbooks (`docs/runbooks/`)

Numbered, task-focused Markdown:

- `00-overview.md` — topology, services, ports, volumes, data flow
- `01-server-setup.md` — provision `91.107.147.127`: Docker install, `/opt/inja`
  layout, clone both repos, firewall (443 + SSH only)
- `02-secrets-and-auth.md` — fill the three env files; **Claude subscription
  login** into the persisted volume
  (`docker compose run --rm -it control-bot claude auth login`, paste code);
  data-repo deploy key; GHCR login
- `03-deploy.md` — first deploy + routine update (pull GHCR tags →
  `docker compose up -d`); accepting Caddy's self-signed cert
- `04-transcription.md` — no-Vertex workflow (drop `meetings/transcripts/{name}.txt`)
  and the one env-block change to enable Vertex later
- `05-operations.md` — logs, restart, health checks, verifying the 11:00/23:00
  push, **AC-7 verification** command, backup/restore
- `06-ci-cd.md` — how the Actions pipeline works and how to cut a release tag

## 8. CI/CD (`.github/workflows/`, in `code-repo`)

- `ci.yml` — push + PR: `make test` (engine + backend pytest vs Phase-0
  fixtures), `ruff` lint, `ui` typecheck/build. Safety net.
- `release.yml` — on tag `v*`: build the custom images (`upload-bot`,
  `control-bot`, `ui-backend`, `git-push`) for `linux/amd64` and push to **GHCR**.
  Server pulls those tags. No SSH secrets in CI; deploy is manual (runbook).

CI lives only in `code-repo` (all buildable code is here). `data-repo` needs only
the deploy key for scheduled push — no CI.

## 9. Exit criteria (PLAN.md §9)

1. `docker compose up -d` brings both bots + UI up as durable services (NFR-9).
2. **AC-7 (deployed):** in the running `control-bot` container, runtime cannot
   edit the engine CLIs or code, and the hooks block forbidden writes.
3. Scheduled push runs only when there are unpushed commits; a backup is produced.
4. Runbooks let an operator provision, deploy, authenticate, and operate the
   stack end-to-end.
5. CI is green on `main`; a `v*` tag publishes pullable GHCR images.

## 10. Out of scope

- Real Vertex/STT integration (env seam only; manual transcript drop for now).
- Full CD / auto-deploy on merge (manual deploy chosen).
- A registered domain / public Let's Encrypt cert (IP + internal TLS for now).
- Multi-arch images (server is `linux/amd64`).

## 11. Invariants touched

- **INV-2** (runtime can't change code/config): baked read-only image layers +
  CLIs outside `APPROVED_DIRECTORY` + in-container hooks → AC-7.
- **NFR-7** (off-site backup): scheduled `git-push` of data-repo.
- **NFR-9** (durable service): Compose stack + `restart: unless-stopped`.
- **NFR-3** (UI auth over TLS): Caddy TLS in front of the authenticated backend.
