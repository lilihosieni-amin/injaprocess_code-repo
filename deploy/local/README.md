# Local development & testing guide

How to run the **inja-food-process** stack on your own machine to test the bots
and the UI before anything goes to the server. This stack is deliberately
**isolated** from production:

- Compose project name `inja-food-process-local` with its **own** volumes.
- **Test** Telegram bots — `@uploadtestinjsbot` and `@aiprocessTestinjabo` —
  never the production tokens.
- The sibling `../../data-repo` mounted at `/data` (no `/opt/inja` paths).
- Public Telegram Bot API (≤20 MB files); no `telegram-bot-api`, Caddy, or
  `git-push` services.

Nothing here touches the server host or the production bots.

> Run every `docker compose` command below from the **`deploy/`** directory
> (the compose file is `deploy/docker-compose.local.yml`, one level up from here).
> All secret files live in **`deploy/local/`** and are gitignored — real values
> never enter git.

---

## Services

| Service | Image | What it is | Reachable at |
|---|---|---|---|
| `upload-bot` | `inja-upload-bot-local` | Bot 1 — raw voice/file intake | Telegram `@uploadtestinjsbot` |
| `control-bot` | `inja-control-bot-local` | Bot 2 — runs the `/process-voice` pipeline (Claude Code) | Telegram `@aiprocessTestinjabo` |
| `ui-backend` | `inja-ui-backend-local` | FastAPI + built frontend | http://localhost:8000 |

The UI is served over **plain HTTP** on `:8000` — no Caddy/TLS locally, because
the login cookie has no `Secure` flag, so `http://localhost` keeps you logged in.

---

## Prerequisites (host machine)

1. **Docker + Docker Compose** (`docker --version`, `docker compose version`).
2. **A host SOCKS proxy on `127.0.0.1:2080`** — Telegram is blocked here, so both
   bots reach it through this proxy (`host.docker.internal:2080` from inside the
   containers). Make sure it is running before you start the bots.
3. **A logged-in Claude subscription on the host** (`~/.claude/.credentials.json`
   present and valid) — the `control-bot` reuses it (see
   [Claude credentials](#4-seed-claude-credentials-control-bot)).
4. **Docker Hub reachable _or_ an offline build path** — `ui-backend.Dockerfile`
   pulls two bases (`node:20-slim`, `python:3.11-slim`). See
   [Offline build](#offline-build-docker-hub-unreachable).

---

## The secret files in this directory (`deploy/local/`)

All gitignored. Create them once (below).

| File | Holds | Ignored by |
|---|---|---|
| `upload-bot.env` | `TELEGRAM_BOT_TOKEN` (test), `ALLOWED_USER_IDS`, `DATA_ROOT`, `TELEGRAM_PROXY` | `*.env` |
| `control-bot.env` | `TELEGRAM_BOT_TOKEN` (test), `ALLOWED_USERS`, budgets, feature flags, `DATABASE_URL`, … | `*.env` |
| `ui-backend.env` | `SESSION_SIGNING_KEY`, `SESSION_TTL`, and optionally `EXPORT_USERNAME` + `EXPORT_PASSWORD_HASH` | `*.env` |
| `ui-users.json` | `{username: argon2-hash}` for the UI login | `deploy/local/ui-users.json` rule |

Schemas for the env files live in `../../config/*.env.example` and the server
runbooks (`../../docs/runbooks/02-secrets-and-auth.md`) — the local files use the
**same keys** but with **test** tokens.

---

## One-time setup

### 1. Bot env files (test tokens)

Create `deploy/local/upload-bot.env` and `deploy/local/control-bot.env` from the
examples, filling in the **test** bot tokens from @BotFather and your numeric
Telegram user id:

```bash
# from repo root
cp config/upload-bot.env.example       deploy/local/upload-bot.env
cp control-bot/runtime.env.example     deploy/local/control-bot.env
# then edit both: TELEGRAM_BOT_TOKEN=<test token>, ALLOWED_USER(S)=<your id>
# upload-bot.env also needs: DATA_ROOT=/data and TELEGRAM_PROXY=socks5h://host.docker.internal:2080
```

`control-bot.env` must **not** set `ANTHROPIC_API_KEY` — auth comes from the
subscription credentials in step 4.

### 2. UI backend env (session key)

```bash
python3 -c "import secrets; print('SESSION_SIGNING_KEY=' + secrets.token_urlsafe(48))" \
  > deploy/local/ui-backend.env
echo "SESSION_TTL=86400" >> deploy/local/ui-backend.env
```

Optionally add the export credential — the one shared login that opens a
published export (`/exports/…`), separate from the UI users in step 3:

```bash
cat >> deploy/local/ui-backend.env <<'EOF'
EXPORT_USERNAME=<pick any local username>
EXPORT_PASSWORD_HASH=<argon2 hash — same recipe as step 3 below; ../../docs/runbooks/02-secrets-and-auth.md>
EOF
```

Skip both if you are not testing the export login: unset, `/exports` answers
`401` to everyone except a signed-in UI user, no login form is offered, and
nothing else about the stack changes.

### 3. UI users file (login)

The UI login is defined by `deploy/local/ui-users.json` (username → argon2 hash).
Generate it with the built `ui-backend` image (build it first — see
[Build & run](#build--run)). This example creates the `admin` / `admin` login:

```bash
# from deploy/
docker run --rm inja-ui-backend-local python -c \
 "import json; from argon2 import PasswordHasher; \
  print(json.dumps({'admin': PasswordHasher().hash('admin')}))" \
  > local/ui-users.json
```

Change `'admin'` (the password) to whatever you like; add more `username: hash`
pairs for more users.

### 4. Seed Claude credentials (control-bot)

`control-bot` runs Claude Code with your **subscription** login (no API key). The
credentials live in the `local-claude-credentials` volume, seeded from your host:

```bash
docker run --rm \
  -v inja-food-process-local_local-claude-credentials:/c \
  -v "$HOME/.claude/.credentials.json:/src.json:ro" \
  alpine sh -c 'cp /src.json /c/.credentials.json && chmod 600 /c/.credentials.json'
```

> The volume is created on first `up`; if the seed command errors that the volume
> doesn't exist yet, run `docker compose -f docker-compose.local.yml up -d control-bot`
> once first, then seed and restart. These OAuth tokens **expire** — see
> [Troubleshooting → 401](#401-invalid-authentication-credentials).

---

## Build & run

Build and start each service (from `deploy/`):

```bash
docker compose -f docker-compose.local.yml up -d --build ui-backend
docker compose -f docker-compose.local.yml up -d --build upload-bot
docker compose -f docker-compose.local.yml up -d --build control-bot
```

Check status and logs:

```bash
docker compose -f docker-compose.local.yml ps
docker compose -f docker-compose.local.yml logs -f control-bot   # follow one service
```

### Offline build (Docker Hub unreachable)

`ui-backend.Dockerfile` is a two-stage build and pulls **two** bases:

| Stage | Base | Produces |
|---|---|---|
| 1 | `node:20-slim` | `/ui/dist` and `/ui/dist-export` (the built frontend + the export templates) |
| 2 | `python:3.11-slim` | the FastAPI runtime |

Docker Hub is blocked from this machine, so a build fails at whichever base is not
cached, with `context deadline exceeded`. Which fix you need depends on **what you
already have locally**:

```bash
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^(node|python|inja)'
```

#### Case A — a compatible base is cached: alias it

If a usable base is present under a different tag, alias it **once**. This is a
**local docker tag only — nothing in the repo changes**:

```bash
docker tag node:18-bookworm-slim node:20-slim    # Vite 6 supports Node 18
```

(If you have no Node base at all, pull any Node ≥18 image through your proxy and
tag it `node:20-slim`.)

#### Case B — no compatible base is cached: rebuild from the last local image

There is no cached Python base to alias, so Case A cannot help. But if you have
built `inja-ui-backend-local` before, that image **already carries** the Python
base, git, and every Python dependency — so rebuild from it and refresh only what
changed. Nothing needs to leave your machine.

Two facts make this safe:

- **The frontend is not baked in.** `docker-compose.local.yml` overlays
  `../ui/dist` and `../ui/dist-export` from the host, so stage 1 is irrelevant
  locally — what you run is whatever `npm --prefix ../ui run build` last produced.
- **`--no-deps` keeps pip offline.** It only works while the branch adds no new
  Python dependency; if `pyproject.toml` gained one, drop `--no-deps` and you will
  need the network after all.

Create a local-only shim beside the real Dockerfile (gitignore it, or keep it
untracked — **do not commit it**, and never edit `ui-backend.Dockerfile` itself,
which must stay identical to what ships to the server):

```bash
# from deploy/
cat > ui-backend.offline.Dockerfile <<'EOF'
# LOCAL-ONLY offline rebuild. Starts from the previously built local image, which
# already has the Python base and all dependencies, and refreshes only the code.
# The frontend comes from the host overlays, so no Node stage is needed.
FROM inja-ui-backend-local:latest
COPY ui-backend/ /app/ui-backend/
COPY engine/    /app/engine/
COPY schemas/   /app/schemas/
RUN pip install --no-cache-dir --no-deps --force-reinstall /app/ui-backend /app/engine
EOF
```

Build and start with it, **using the classic builder**:

```bash
# from deploy/, with the repo root as build context
DOCKER_BUILDKIT=0 docker build -f ui-backend.offline.Dockerfile -t inja-ui-backend-local ..
docker compose -f docker-compose.local.yml up -d ui-backend
```

`DOCKER_BUILDKIT=0` matters: BuildKit resolves image metadata against the registry
even for a `FROM` that only exists locally, so it fails the same way. The classic
builder uses the local image directly.

Rebuild the host frontend first whenever UI code changed, since the image no
longer carries it:

```bash
npm --prefix ../ui run build
```

> **This retags `inja-ui-backend-local:latest`.** Whatever you built last is what
> the local stack runs. To get back to a clean `main` build, rebuild from a `main`
> checkout the same way.

#### If a new Python dependency really is needed

Neither case helps — you must reach a registry. Pull the base through your proxy
(`HTTPS_PROXY=socks5h://127.0.0.1:2080 docker pull python:3.11-slim`, if your
docker daemon is configured for it) or copy the image from a machine that can
reach Hub with `docker save` / `docker load`.

---

## Access

- **UI:** http://localhost:8000 — log in with the credentials from
  `ui-users.json` (default `admin` / `admin`).
- **Bots:** message the **test** bots on Telegram —
  `@aiprocessTestinjabo` (control) and `@uploadtestinjsbot` (upload) — from a
  whitelisted account (`ALLOWED_USER(S)` in the env files).

### Run a pipeline test

In the control-bot chat:

```
/process-voice dining-1405-04-11
```

Notes:

- **Audio is gitignored** (`meetings/audio/` is purged from git). If the audio
  file isn't on disk, Stage 1 lists nearby files and asks which to use. If the
  audio *is* present, transcription is skipped when the transcript already exists,
  and the run proceeds to classify → checkpoint → extract → merge.
- UI edits **git-commit into the mounted `data-repo`** on your local `main`. The
  compose injects `safe.directory=/data`, so a root container committing into your
  uid-owned checkout does not trip git's "dubious ownership" guard.

---

## Common operations

```bash
# follow logs (all services or one)
docker compose -f docker-compose.local.yml logs -f
docker compose -f docker-compose.local.yml logs -f control-bot

# restart / stop / start a service
docker compose -f docker-compose.local.yml restart control-bot
docker compose -f docker-compose.local.yml stop
docker compose -f docker-compose.local.yml up -d

# rebuild after code changes (e.g. UI or bot source)
docker compose -f docker-compose.local.yml up -d --build ui-backend

# tear down containers (KEEPS volumes: creds, bot state)
docker compose -f docker-compose.local.yml down

# tear down AND wipe volumes (loses seeded creds + bot db — re-seed afterwards)
docker compose -f docker-compose.local.yml down -v
```

---

## Troubleshooting

### `401 Invalid authentication credentials`

The control-bot's Claude call fails with a 401 (often surfaced in Telegram as
"Failed to authenticate. API Error: 401 …"). **Cause:** the subscription OAuth
token in the credentials volume has expired, or its refresh token was rotated when
you re-logged-in on the host. **Fix:** re-seed from your host's current login and
restart:

```bash
# from deploy/
docker run --rm \
  -v inja-food-process-local_local-claude-credentials:/c \
  -v "$HOME/.claude/.credentials.json:/src.json:ro" \
  alpine sh -c 'cp /src.json /c/.credentials.json && chmod 600 /c/.credentials.json'
docker compose -f docker-compose.local.yml restart control-bot
```

Verify auth without using Telegram:

```bash
docker compose -f docker-compose.local.yml exec -T control-bot \
  claude -p "Reply with exactly one word: pong"
# expect: pong   (a 401 here means the creds are still bad)
```

Inspect the volume's token expiry (metadata only, no secrets printed):

```bash
docker run --rm -v inja-food-process-local_local-claude-credentials:/c alpine \
  cat /c/.credentials.json | python3 -c \
 "import sys,json,datetime as d; o=json.load(sys.stdin).get('claudeAiOauth',{}); \
  e=o.get('expiresAt'); print('expiresAt:', d.datetime.fromtimestamp(e/1000, d.UTC).isoformat() if e else None)"
```

### Bots don't connect to Telegram

Confirm the host SOCKS proxy is listening on `127.0.0.1:2080`:

```bash
timeout 3 bash -c "</dev/tcp/127.0.0.1/2080" && echo "proxy up" || echo "proxy DOWN"
```

The control-bot log should show `Proxy configured … socks5h://host.docker.internal:2080`
followed by Telegram `getMe … 200 OK` and `getUpdates … 200 OK`.

### `… context deadline exceeded` / `failed to resolve source metadata` during build

Docker Hub is unreachable. The message names whichever base is missing —
`node:20-slim` (stage 1) or `python:3.11-slim` (stage 2). See
[Offline build](#offline-build-docker-hub-unreachable): alias a cached base if you
have one, otherwise rebuild from the last `inja-ui-backend-local` image.

A build that reaches `Step N/M` and *then* fails on the second base means stage 1
succeeded — you have a Node base but no Python one, which is Case B.

### UI login fails

- `ui-users.json` must be valid JSON with an **argon2** hash (regenerate via
  step 3). Watch for `UI_USERS_FILE must be a non-empty JSON object`.
- If the container won't start, check `ui-backend` logs for missing env
  (`SESSION_SIGNING_KEY`) or `DATA_ROOT is not a directory`.

---

## Isolation guarantees

- **Test bots only** — the tokens in `deploy/local/*.env` are the test bots; the
  production tokens live on the server under `/opt/inja/secrets` and are never
  used here.
- **Own volumes** — `inja-food-process-local_*` volumes are distinct from the
  server stack's.
- **No repo changes for local quirks** — the offline workarounds are a local
  docker tag and an untracked shim Dockerfile. `ui-backend.Dockerfile` is
  unmodified and identical to what ships to the server, so a local build failure
  can never be "fixed" in a way that changes what the server builds.
