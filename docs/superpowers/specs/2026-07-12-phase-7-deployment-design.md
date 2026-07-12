# Phase 7 — Deployment & Operations — Design

| | |
|---|---|
| **Status** | Approved (design); ready for implementation plan |
| **Date** | 2026-07-12 |
| **Repo** | `code-repo/deploy/`, `code-repo/docs/runbooks/` |
| **Spec authority** | PRD (NFR-7, NFR-9, AC-7), ARD §15 (versioning/push), ARD §16 (Docker), PLAN.md §9 |

## 1. Goal

Bring the whole system up on the server (`91.107.147.127`, user `root`, alias
`ssh inja`) as **one durable `docker compose up -d` stack** — running-only, no
Superpowers and no coding inside containers (ARD §16, INV-2). Deliver the
Dockerfiles, a complete `docker-compose.yml`, Caddy proxy config, a `git-push`
scheduler, and operator runbooks. On completion the project is deployed and
operable.

## 2. Decisions (locked)

| Decision | Choice | Consequence |
|---|---|---|
| Transcription (no Vertex) | **Manual transcript drop** | Deploy with `transcribe` unconfigured. A transcript at `meetings/transcripts/{name}.txt` makes `transcribe` a no-op (idempotency skip) and the pipeline runs from there. Vertex env seam (`VERTEX_PROJECT/LOCATION`, `GEMINI_MODEL`, `GOOGLE_APPLICATION_CREDENTIALS`) stays ready to switch on later. |
| UI TLS | **IP-only, Caddy internal TLS** | Caddy serves HTTPS with a self-signed/internal cert on the IP. One-time browser trust warning. Swap to a real domain later by editing one line in the `Caddyfile`. |
| Anthropic auth | **Claude subscription login** | The Claude Code CLI (control-bot + pipeline subagents) authenticates with a subscription credential persisted in a named volume. No `ANTHROPIC_API_KEY` set (it would override subscription). **Note:** pipeline Opus subagents consume subscription quota; can switch to API key later without design change. |
| CI/CD | **None** | No GitHub Actions. Images are built on the server (or locally) from the checked-out `code-repo` via `docker compose build`, then run. Build + deploy are documented manual runbook steps. |
| Bot / UI users | **Multiple users everywhere** | Both bots accept more than one Telegram user (control-bot's `ALLOWED_USERS` already plural; **upload-bot** gains `ALLOWED_USER_IDS`). The **UI is also multi-user** via a JSON map file (`UI_USERS_FILE` → `{username: argon2_hash}`); single-user `UI_USERNAME`/`UI_PASSWORD_HASH` remains a fallback. A runbook covers changing bot and UI users. |

## 3. Architecture — the stack

ARD §16 mandates multi-service Compose (not a single supervisord container).
`code-repo` is baked into images; `data-repo` is **never** baked — it is the
single shared bind-mount, "the only point of connection." **All custom images are
built on the server** from the checked-out `code-repo` (no registry).

| Service | Image | Role / key contents | Mounts | Published |
|---|---|---|---|---|
| `telegram-bot-api` | upstream `tdlib/telegram-bot-api` | local Bot API server, 2 GB cap (NFR-2) for upload-bot's large voices | own data volume | no |
| `upload-bot` | **build** `deploy/upload-bot.Dockerfile` | Bot 1 (Python). `python:3.11-slim` + `pip install -e upload-bot` | data-repo @ `DATA_ROOT` | no |
| `control-bot` | **build** `deploy/control-bot.Dockerfile` (heavy) | Bot 2. `python:3.11` + Node + **Claude Code CLI** + `pip install -e engine` (CLIs on PATH) + git + `claude-code-telegram@v1.6.0` **with both `patches/` applied in the build** | data-repo @ `APPROVED_DIRECTORY`; `claude-credentials` volume @ CLI config dir | no |
| `ui-backend` | **build** `deploy/ui-backend.Dockerfile` (2-stage) | stage 1 node builds `ui/dist`; stage 2 `python` FastAPI + engine CLIs + git, serves `ui/dist` | data-repo @ `DATA_ROOT` | no (behind proxy) |
| `proxy` | upstream `caddy` + `deploy/Caddyfile` | reverse proxy + **internal TLS** to `ui-backend` | `caddy-data` volume | **443** |
| `git-push` | **build** `deploy/git-push.Dockerfile` | scheduled push (git + tiny cron/loop) at 11:00 & 23:00, only if unpushed commits (ARD §15, NFR-7) | data-repo + deploy key (ro) | no |

**control-bot patch step (critical).** claude-code-telegram v1.6.0 is used
unforked; two required source patches live in `control-bot/patches/` and fix
behavior v1.6.0 exposes no config flag for. The Dockerfile installs the bot at
the pinned tag, then applies both patches into the installed package's
site-packages (`patch -p1 -d "$SITE" < control-bot/patches/0001-…` and `…0002-…`;
`$SITE` resolution + verification in `control-bot/patches/README.md`):

- `0001-disable-conversation-enhancer` — stops the "What would you like to do
  next?" buttons appended after every reply.
- `0002-throttle-progress-updates` — dedupes/rate-limits progress edits so long
  pipeline runs don't freeze the Telegram progress bar.

Because patches live on an installed dependency, any reinstall/upgrade wipes them
— applying them **in the image build** is what makes them durable. Build-time
verification: startup log shows `enabled_features` without "conversation", and a
long run no longer floods "Failed to update progress message" warnings.

**AC-7 (deployed):** engine CLIs and code are baked into read-only image layers
outside `APPROVED_DIRECTORY`; the Phase-3 runtime hooks are active in-container.
In the running `control-bot`, runtime cannot edit the CLIs or code, and hooks
block forbidden writes. Verified by a runbook step.

## 4. Server layout & compose

On the server:

```
/opt/inja/
  code-repo/            # git checkout: build context + deploy/ compose + Caddyfile
  data-repo/            # git checkout — BIND-MOUNTED into upload-bot/control-bot/ui-backend
                        #   and host-accessible so dev sessions 1/2 can reach it (ARD §16)
  secrets/              # env files OUTSIDE git:
                        #   upload-bot.env, control-bot.env, ui-backend.env
  keys/                 # data-repo deploy key (git-push, mounted read-only)
  (docker named volumes) claude-credentials, caddy-data, telegram-bot-api-data
```

`docker-compose.yml` completes the existing skeleton:

- Every service `restart: unless-stopped`.
- Custom services use a **`build:` context** (built on the server); no registry.
- Secrets via `env_file:` → `/opt/inja/secrets/*.env`. Never in repo, never in image.
- `data-repo` is a **host bind-mount** (not an anonymous volume) so it stays
  reachable on the host (ARD §16).
- Subscription credential persists in the `claude-credentials` named volume.
- `meetings/audio/` won't exist on a fresh data-repo clone (gitignored); the
  upload-bot / deploy ensures the directory exists before writing voices.

## 5. Networking

- **upload-bot → local `telegram-bot-api`** (`TELEGRAM_API_BASE_URL=http://telegram-bot-api:8081`) for >20 MB voices (NFR-2).
- **control-bot → direct `api.telegram.org`.** claude-code-telegram v1.6.0 cannot be pointed at the local bot-api server without an upstream patch, and it handles only text/commands, so it does not need the 2 GB path.
- **proxy** is the only published port (443). Both bots are outbound-only.
- Runbook documents the proven SOCKS-proxy fallback if `api.telegram.org` is blocked from the host.

## 6. Users & access (multi-user)

- **control-bot (Telegram):** `ALLOWED_USERS` is already a comma-separated list of
  numeric Telegram IDs — fill it with one or more IDs. No code change.
- **upload-bot (Telegram):** small code change — replace singular
  `ALLOWED_USER_ID: int` with `ALLOWED_USER_IDS` parsed to a `frozenset[int]`
  from a comma-separated env value; `is_allowed(user_id, allowed_ids)` becomes a
  membership check. Update `config.py`, `auth.py`, `config/upload-bot.env.example`,
  and the auth/config tests. (Back-compat: accept the old singular
  `ALLOWED_USER_ID` if `ALLOWED_USER_IDS` is unset.)
- **UI:** multi-user via `UI_USERS_FILE` — a JSON file `{username: argon2_hash}`
  mounted as a secret (argon2 hashes contain `$`/`,`/`=`, so a file beats an env
  list). Login looks the username up in the map and verifies its hash; the session
  cookie already carries the username (`{"u": username}`). Single-user
  `UI_USERNAME`+`UI_PASSWORD_HASH` stays as a fallback. `SESSION_SIGNING_KEY` signs
  the cookie (NFR-3).
- A runbook (`docs/runbooks/`) is the "hint file": how to add/remove allowed
  Telegram users for each bot and how to add/remove UI users (edit the JSON map +
  new argon2 hash + restart), including how to get a user's numeric Telegram ID.

## 7. Scheduled push & backup (ARD §15, NFR-7)

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

## 8. Runbooks (`docs/runbooks/`)

Numbered, task-focused Markdown:

- `00-overview.md` — topology, services, ports, volumes, data flow
- `01-server-setup.md` — provision `91.107.147.127`: Docker install, `/opt/inja`
  layout, clone both repos, firewall (443 + SSH only)
- `02-secrets-and-auth.md` — fill the three env files; **Claude subscription
  login** into the persisted volume
  (`docker compose run --rm -it control-bot claude auth login`, paste code);
  data-repo deploy key
- `03-deploy.md` — build images on the server + first `docker compose up -d`;
  routine rebuild/update; accepting Caddy's self-signed cert
- `04-transcription.md` — no-Vertex workflow (drop `meetings/transcripts/{name}.txt`)
  and the one env-block change to enable Vertex later
- `05-operations.md` — logs, restart, health checks, verifying the 11:00/23:00
  push, **AC-7 verification** command, backup/restore (incl. audio-not-in-git note)
- `06-changing-users.md` — **the hint file**: add/remove allowed Telegram users
  for each bot; change the UI user; how to find a numeric Telegram ID

## 9. Exit criteria (PLAN.md §9)

1. `docker compose up -d` brings both bots + UI up as durable services (NFR-9).
2. **AC-7 (deployed):** in the running `control-bot` container, runtime cannot
   edit the engine CLIs or code, and the hooks block forbidden writes.
3. Scheduled push runs only when there are unpushed commits; a backup is produced.
4. Runbooks let an operator provision, build, deploy, authenticate, operate, and
   change users end-to-end.

## 10. Out of scope

- Real Vertex/STT integration (env seam only; manual transcript drop for now).
- CI / GitHub Actions / image registry (build on the server; manual deploy).
- A registered domain / public Let's Encrypt cert (IP + internal TLS for now).
- Multi-arch images (server is `linux/amd64`).
- UI user self-service / roles (users are managed by editing the JSON map file;
  all UI users have the same access — NFR-3 only requires authentication).

## 11. Invariants touched

- **INV-2** (runtime can't change code/config): baked read-only image layers +
  CLIs outside `APPROVED_DIRECTORY` + in-container hooks → AC-7.
- **NFR-7** (off-site backup): scheduled `git-push` of data-repo.
- **NFR-9** (durable service): Compose stack + `restart: unless-stopped`.
- **NFR-3** (UI auth over TLS): Caddy TLS in front of the authenticated backend.
