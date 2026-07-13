# Phase 7 — Deployment & Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the whole system up on the server (`91.107.147.127`) as one durable `docker compose up -d` stack — both bots + UI + local Bot API + scheduled push — running-only, per ARD §16.

**Architecture:** Multi-service Docker Compose. `code-repo` is baked into images (built on the server, no registry); `data-repo` is a host bind-mount shared by the data services (the only point of connection, INV-2). Caddy fronts the UI with internal TLS. A cron service pushes `data-repo` to GitHub twice a day.

**Tech Stack:** Docker Compose, Python 3.11, Node 20, `@anthropic-ai/claude-code` CLI, `claude-code-telegram@v1.6.0` (+ 2 source patches), FastAPI/uvicorn, Vite, Caddy, Alpine cron, git.

## Global Constraints

- **No real secrets in either repo** (CLAUDE.md, ARD §14). All env files live under `/opt/inja/secrets/` on the server, never committed. `config/*.env.example` stay example-only.
- **`data-repo` is never baked into an image** (INV-2) — always a bind-mount.
- **Engine CLIs are generated only by their own CLIs** (INV-1) and must be on PATH inside `control-bot` and `ui-backend`.
- **`control-bot` patches must be applied in the image build** — a reinstall wipes them; both live in `control-bot/patches/`.
- **Every service:** `restart: unless-stopped`.
- **Server:** `linux/amd64`; user `root`; SSH alias `ssh inja` (`91.107.147.127`).
- **Bots are multi-user; the UI is single-user.**
- **Python:** `requires-python >=3.11`. Tests run with `pytest` (see `make test`).
- **Build context** for every custom image is the **code-repo root** (`..` relative to `deploy/`).

---

### Task 1: upload-bot multi-user allowlist

Replace the singular `ALLOWED_USER_ID` with a comma-separated `ALLOWED_USER_IDS` parsed to a `frozenset[int]`, with back-compat for the old singular var.

**Files:**
- Modify: `upload-bot/upload_bot/config.py`
- Modify: `upload-bot/upload_bot/auth.py`
- Modify: `upload-bot/upload_bot/handlers.py:20-24` (`_guard`)
- Modify: `config/upload-bot.env.example`
- Test: `upload-bot/tests/test_auth.py`, `upload-bot/tests/test_config.py`

**Interfaces:**
- Produces: `Config.allowed_user_ids: frozenset[int]`; `is_allowed(user_id, allowed_ids: frozenset[int]) -> bool`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Update the auth test**

Replace `upload-bot/tests/test_auth.py` with:

```python
from upload_bot.auth import is_allowed


def test_allowed_user_passes():
    ids = frozenset({42, 99})
    assert is_allowed(42, ids) is True
    assert is_allowed("42", ids) is True        # telegram ids may arrive as int-like
    assert is_allowed(99, ids) is True


def test_others_rejected():
    ids = frozenset({42})
    assert is_allowed(7, ids) is False
    assert is_allowed(42, frozenset()) is False
    assert is_allowed(None, ids) is False
```

- [ ] **Step 2: Update the config test**

Replace the `ALLOWED_USER_ID` cases in `upload-bot/tests/test_config.py` so the file reads:

```python
import pytest
from upload_bot.config import Config


def test_from_env_reads_all_fields(data_root):
    env = {"TELEGRAM_BOT_TOKEN": "123:abc", "ALLOWED_USER_IDS": "42, 99",
           "DATA_ROOT": str(data_root), "TELEGRAM_API_BASE_URL": "http://x:8081"}
    cfg = Config.from_env(env)
    assert cfg.bot_token == "123:abc"
    assert cfg.allowed_user_ids == frozenset({42, 99})
    assert str(cfg.data_root) == str(data_root)
    assert cfg.api_base_url == "http://x:8081"


def test_singular_back_compat(data_root):
    cfg = Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "ALLOWED_USER_ID": "1",
                           "DATA_ROOT": str(data_root)})
    assert cfg.allowed_user_ids == frozenset({1})


def test_api_base_url_optional(data_root):
    cfg = Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "ALLOWED_USER_IDS": "1",
                           "DATA_ROOT": str(data_root)})
    assert cfg.api_base_url is None
    assert cfg.proxy_url is None


def test_proxy_url_from_env(data_root):
    cfg = Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "ALLOWED_USER_IDS": "1",
                           "DATA_ROOT": str(data_root),
                           "TELEGRAM_PROXY": "socks5://127.0.0.1:2080"})
    assert cfg.proxy_url == "socks5://127.0.0.1:2080"


def test_missing_allowlist_raises(data_root):
    with pytest.raises(SystemExit):
        Config.from_env({"TELEGRAM_BOT_TOKEN": "t", "DATA_ROOT": str(data_root)})
```

Also update the two `Config(...)` constructor calls in `upload-bot/tests/test_app_build.py:7,14` from `allowed_user_id=1` to `allowed_user_ids=frozenset({1})`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd upload-bot && python -m pytest tests/test_auth.py tests/test_config.py -q`
Expected: FAIL (`allowed_user_ids` / new signature not defined).

- [ ] **Step 4: Implement `auth.py`**

Replace `upload-bot/upload_bot/auth.py` with:

```python
def is_allowed(user_id, allowed_ids):
    if not allowed_ids or user_id is None:
        return False
    try:
        return int(user_id) in allowed_ids
    except (TypeError, ValueError):
        return False
```

- [ ] **Step 5: Implement `config.py`**

In `upload-bot/upload_bot/config.py`: change the field and parse a comma-separated list, with singular back-compat.

```python
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    bot_token: str
    allowed_user_ids: frozenset[int]
    data_root: Path
    api_base_url: str | None = None
    proxy_url: str | None = None

    @classmethod
    def from_env(cls, env=None):
        env = env if env is not None else os.environ

        def req(key):
            v = env.get(key)
            if not v:
                raise SystemExit(f"{key} is not set")
            return v

        raw = env.get("ALLOWED_USER_IDS") or env.get("ALLOWED_USER_ID")
        if not raw:
            raise SystemExit("ALLOWED_USER_IDS is not set")
        ids = frozenset(int(p) for p in raw.split(",") if p.strip())
        if not ids:
            raise SystemExit("ALLOWED_USER_IDS has no valid ids")

        return cls(
            bot_token=req("TELEGRAM_BOT_TOKEN"),
            allowed_user_ids=ids,
            data_root=Path(req("DATA_ROOT")),
            api_base_url=(env.get("TELEGRAM_API_BASE_URL") or None),
            proxy_url=(env.get("TELEGRAM_PROXY") or None),
        )
```

- [ ] **Step 6: Update the handler guard**

In `upload-bot/upload_bot/handlers.py`, change the `_guard` body:

```python
def _guard(config):
    def ok(update):
        u = update.effective_user
        return u is not None and is_allowed(u.id, config.allowed_user_ids)
    return ok
```

- [ ] **Step 7: Update the env example**

In `config/upload-bot.env.example`, replace the `ALLOWED_USER_ID` block with:

```bash
# Allowed Telegram user IDs — comma-separated, one or more (NFR-1)
ALLOWED_USER_IDS=
# (back-compat: a single ALLOWED_USER_ID is still accepted if ALLOWED_USER_IDS is unset)
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd upload-bot && python -m pytest -q`
Expected: PASS (all upload-bot tests).

- [ ] **Step 9: Commit**

```bash
git add upload-bot/upload_bot/config.py upload-bot/upload_bot/auth.py \
        upload-bot/upload_bot/handlers.py upload-bot/tests/test_auth.py \
        upload-bot/tests/test_config.py upload-bot/tests/test_app_build.py \
        config/upload-bot.env.example
git commit -m "feat(upload-bot): allow multiple Telegram users (ALLOWED_USER_IDS)"
```

---

### Task 2: Keep `meetings/audio/` present on a fresh data-repo clone

Audio is gitignored (purged from history), so a fresh server clone has no `meetings/audio/` dir for upload-bot to write into. Keep an empty tracked dir. **This task runs in `data-repo`, not code-repo.**

**Files (in `data-repo`):**
- Modify: `.gitignore`
- Create: `meetings/audio/.gitkeep`

- [ ] **Step 1: Narrow the gitignore so the dir (but not audio) is tracked**

In `data-repo/.gitignore`, replace the line `meetings/audio/` with:

```
meetings/audio/*
!meetings/audio/.gitkeep
```

- [ ] **Step 2: Force-add the keepfile**

```bash
cd ../data-repo
: > meetings/audio/.gitkeep
git add -f meetings/audio/.gitkeep .gitignore
```

- [ ] **Step 3: Verify audio files are still ignored**

Run: `cd ../data-repo && git status --porcelain meetings/audio`
Expected: shows only `A  meetings/audio/.gitkeep` — no `.m4a` files.

- [ ] **Step 4: Commit (data-repo)**

```bash
cd ../data-repo
git commit -m "chore: keep empty meetings/audio dir on clone (.gitkeep); audio stays ignored"
```

---

### Task 3: `git-push` conditional-push script + test

A small POSIX script that pushes `data-repo` only when there are unpushed commits.

**Files:**
- Create: `deploy/git-push/git-push-if-needed.sh`
- Create: `deploy/git-push/crontab`
- Test: `tests/test_git_push.py`

**Interfaces:**
- Produces: executable `git-push-if-needed.sh` reading env `DATA_REPO` (default `/data`), `GIT_BRANCH` (default `main`), `DEPLOY_KEY` (default `/keys/id_deploy`). Prints `nothing to push` or `pushing N commit(s)`; exit 0 either way.

- [ ] **Step 1: Write the failing test**

Create `tests/test_git_push.py`:

```python
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "deploy" / "git-push" / "git-push-if-needed.sh"


def _run(repo):
    return subprocess.run(
        ["sh", str(SCRIPT)],
        env={"DATA_REPO": str(repo), "GIT_BRANCH": "main", "PATH": "/usr/bin:/bin"},
        capture_output=True, text=True,
    )


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   capture_output=True, text=True)


def _make_repo_with_remote(tmp_path):
    bare = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(bare)], check=True)
    work = tmp_path / "work"
    subprocess.run(["git", "clone", str(bare), str(work)], check=True,
                   capture_output=True, text=True)
    _git(work, "config", "user.email", "t@t")
    _git(work, "config", "user.name", "t")
    (work / "a.txt").write_text("1")
    _git(work, "add", "a.txt")
    _git(work, "commit", "-m", "init")
    _git(work, "push", "-u", "origin", "main")
    return work


def test_nothing_to_push_when_up_to_date(tmp_path):
    repo = _make_repo_with_remote(tmp_path)
    r = _run(repo)
    assert r.returncode == 0, r.stderr
    assert "nothing to push" in r.stdout


def test_pushes_when_ahead(tmp_path):
    repo = _make_repo_with_remote(tmp_path)
    (repo / "b.txt").write_text("2")
    _git(repo, "add", "b.txt")
    _git(repo, "commit", "-m", "second")
    r = _run(repo)
    assert r.returncode == 0, r.stderr
    assert "pushing 1 commit" in r.stdout
    # and the remote now has it
    r2 = _run(repo)
    assert "nothing to push" in r2.stdout
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_git_push.py -q`
Expected: FAIL (script file does not exist).

- [ ] **Step 3: Write the script**

Create `deploy/git-push/git-push-if-needed.sh`:

```sh
#!/bin/sh
set -eu

REPO="${DATA_REPO:-/data}"
BRANCH="${GIT_BRANCH:-main}"
KEY="${DEPLOY_KEY:-/keys/id_deploy}"

if [ -f "$KEY" ]; then
    export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

cd "$REPO"
git fetch -q origin "$BRANCH" 2>/dev/null || true
UNPUSHED="$(git rev-list --count "origin/${BRANCH}..${BRANCH}" 2>/dev/null || echo 0)"

if [ "$UNPUSHED" -gt 0 ]; then
    echo "pushing ${UNPUSHED} commit(s)"
    git push origin "$BRANCH"
else
    echo "nothing to push"
fi
```

- [ ] **Step 4: Make it executable and add the crontab**

```bash
chmod +x deploy/git-push/git-push-if-needed.sh
```

Create `deploy/git-push/crontab` (ARD §15 — 11:00 & 23:00):

```
0 11,23 * * * /usr/local/bin/git-push-if-needed.sh >> /proc/1/fd/1 2>&1
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest tests/test_git_push.py -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add deploy/git-push/git-push-if-needed.sh deploy/git-push/crontab tests/test_git_push.py
git commit -m "feat(deploy): git-push conditional push script + tests"
```

---

### Task 4: `git-push` Dockerfile

**Files:**
- Create: `deploy/git-push.Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

Create `deploy/git-push.Dockerfile`:

```dockerfile
# Scheduled data-repo push (ARD §15, NFR-7). Alpine + busybox crond.
FROM alpine:3.20
RUN apk add --no-cache git openssh-client
COPY deploy/git-push/git-push-if-needed.sh /usr/local/bin/git-push-if-needed.sh
COPY deploy/git-push/crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/git-push-if-needed.sh
# data-repo bind-mounted at /data; deploy key mounted read-only at /keys/id_deploy
CMD ["crond", "-f", "-l", "8"]
```

- [ ] **Step 2: Build to verify it's valid (build context = code-repo root)**

Run: `docker build -f deploy/git-push.Dockerfile -t inja-git-push:test .`
Expected: build succeeds; final line `naming to ...inja-git-push:test`.

- [ ] **Step 3: Commit**

```bash
git add deploy/git-push.Dockerfile
git commit -m "feat(deploy): git-push Dockerfile"
```

---

### Task 5: `upload-bot` Dockerfile

**Files:**
- Create: `deploy/upload-bot.Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

Create `deploy/upload-bot.Dockerfile`:

```dockerfile
# Bot 1 — raw voice/file intake (ARD §11). Minimal Python image.
FROM python:3.11-slim
WORKDIR /app
COPY upload-bot/ /app/upload-bot/
RUN pip install --no-cache-dir "/app/upload-bot[socks]"
# data-repo bind-mounted at runtime; DATA_ROOT + ALLOWED_USER_IDS via env_file
CMD ["upload-bot"]
```

- [ ] **Step 2: Build to verify**

Run: `docker build -f deploy/upload-bot.Dockerfile -t inja-upload-bot:test .`
Expected: build succeeds; `pip install` resolves `python-telegram-bot`, `jdatetime`, `httpx[socks]`.

- [ ] **Step 3: Smoke-check the console script exists**

Run: `docker run --rm --entrypoint sh inja-upload-bot:test -c "which upload-bot"`
Expected: prints a path like `/usr/local/bin/upload-bot`.

- [ ] **Step 4: Commit**

```bash
git add deploy/upload-bot.Dockerfile
git commit -m "feat(deploy): upload-bot Dockerfile"
```

---

### Task 6: `ui-backend` Dockerfile (2-stage: build UI, serve backend)

**Files:**
- Create: `deploy/ui-backend.Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

Create `deploy/ui-backend.Dockerfile`:

```dockerfile
# UI backend (FastAPI) + built frontend (ARD §13). Two-stage build.
# --- stage 1: build the Vite frontend ---
FROM node:20-slim AS ui-build
WORKDIR /ui
COPY ui/package.json ui/package-lock.json /ui/
RUN npm ci
COPY ui/ /ui/
RUN npm run build          # emits /ui/dist

# --- stage 2: backend runtime ---
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ui-backend/ /app/ui-backend/
COPY engine/ /app/engine/
COPY schemas/ /app/schemas/
RUN pip install --no-cache-dir /app/ui-backend /app/engine
COPY --from=ui-build /ui/dist /app/ui-static
ENV UI_STATIC_DIR=/app/ui-static \
    SCHEMA_DIR=/app/schemas
EXPOSE 8000
# DATA_ROOT + UI_* secrets via env_file; app:app builds only when DATA_ROOT is set
CMD ["uvicorn", "inja_ui_backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Build to verify (both stages)**

Run: `docker build -f deploy/ui-backend.Dockerfile -t inja-ui-backend:test .`
Expected: stage 1 runs `npm ci` + `npm run build`; stage 2 installs backend + engine; build succeeds.

- [ ] **Step 3: Smoke-check engine CLIs + static are present**

Run: `docker run --rm --entrypoint sh inja-ui-backend:test -c "which layout allocate-id && ls /app/ui-static/index.html"`
Expected: prints two CLI paths and the `index.html` path.

- [ ] **Step 4: Commit**

```bash
git add deploy/ui-backend.Dockerfile
git commit -m "feat(deploy): ui-backend 2-stage Dockerfile (build UI + serve backend)"
```

---

### Task 7: `control-bot` Dockerfile (heavy: Node + Claude CLI + engine + patched bot)

**Files:**
- Create: `deploy/control-bot.Dockerfile`

**Interfaces:**
- Consumes: `control-bot/patches/0001-disable-conversation-enhancer.patch`, `control-bot/patches/0002-throttle-progress-updates.patch` (unified diffs against `a/src/...`).

- [ ] **Step 1: Write the Dockerfile**

Create `deploy/control-bot.Dockerfile`:

```dockerfile
# Bot 2 — claude-code-telegram @ v1.6.0 (ARD §3, §12, §16). The heavy image:
# Python + Node + Claude Code CLI + engine CLIs + git + the pinned bot with patches.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates patch nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI (the pipeline runs inside this container)
RUN npm install -g @anthropic-ai/claude-code

# uv, for the pinned tool install
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Engine CLIs on PATH — baked, outside APPROVED_DIRECTORY (INV-1/INV-2)
COPY engine/ /opt/engine/
COPY schemas/ /opt/schemas/
RUN pip install --no-cache-dir /opt/engine
ENV SCHEMA_DIR=/opt/schemas

# Pinned bot + SOCKS backend
RUN uv tool install --with socksio \
      "git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0"

# Apply the two required source patches into the tool's site-packages.
# The diffs target a/src/...; -p1 at the site-packages root resolves them.
COPY control-bot/patches/ /opt/patches/
RUN set -eux; \
    SITE="$(uv tool run --from claude-code-telegram python -c \
      'import os, src.bot.features.registry as r; \
       print(os.path.abspath(os.path.join(os.path.dirname(r.__file__), "..", "..", "..")))')"; \
    patch -p1 --forward -d "$SITE" < /opt/patches/0001-disable-conversation-enhancer.patch; \
    patch -p1 --forward -d "$SITE" < /opt/patches/0002-throttle-progress-updates.patch; \
    grep -q "at most once per 2s\|rate-limit" "$SITE/src/bot/handlers/message.py"

# Runtime: APPROVED_DIRECTORY (data-repo) bind-mounted; env_file supplies the profile;
# claude-credentials volume mounted at /root/.claude for subscription auth.
CMD ["claude-telegram-bot"]
```

- [ ] **Step 2: Build to verify (this is the slow one)**

Run: `docker build -f deploy/control-bot.Dockerfile -t inja-control-bot:test .`
Expected: build succeeds. The `patch --forward` steps exit 0; the final `grep` confirms patch 0002 landed. If a `patch` step fails, the build fails here (that is the guard).

- [ ] **Step 3: Smoke-check the toolchain is present**

Run: `docker run --rm --entrypoint sh inja-control-bot:test -c "which claude claude-telegram-bot merge allocate-id git node && claude --version"`
Expected: prints paths for all five commands and a Claude Code version.

- [ ] **Step 4: Commit**

```bash
git add deploy/control-bot.Dockerfile
git commit -m "feat(deploy): control-bot Dockerfile (Claude CLI + engine + patched v1.6.0 bot)"
```

---

### Task 8: Caddy reverse proxy config (internal TLS)

**Files:**
- Create: `deploy/Caddyfile`

- [ ] **Step 1: Write the Caddyfile**

Create `deploy/Caddyfile`:

```
# UI reverse proxy with internal (self-signed) TLS on the server IP (NFR-3).
# To use a real domain later: replace the site address with the domain and
# delete the `tls internal` line — Caddy then auto-provisions Let's Encrypt.
{
	# global options; local CA only
	auto_https disable_redirects
}

https://91.107.147.127 {
	tls internal
	reverse_proxy ui-backend:8000
}
```

- [ ] **Step 2: Validate with Caddy**

Run: `docker run --rm -v "$PWD/deploy/Caddyfile":/etc/caddy/Caddyfile:ro caddy:2 caddy validate --config /etc/caddy/Caddyfile`
Expected: `Valid configuration`.

- [ ] **Step 3: Commit**

```bash
git add deploy/Caddyfile
git commit -m "feat(deploy): Caddyfile — UI reverse proxy with internal TLS"
```

---

### Task 9: Complete `docker-compose.yml`

Turn the skeleton into the full stack.

**Files:**
- Modify: `deploy/docker-compose.yml` (replace the whole file)

**Interfaces:**
- Consumes: the four Dockerfiles (Tasks 4–7), `deploy/Caddyfile` (Task 8).

- [ ] **Step 1: Write the full compose file**

Replace `deploy/docker-compose.yml` with:

```yaml
# Full stack (ARD §16). `docker compose up -d` from /opt/inja/code-repo/deploy.
# Build context is the code-repo root (..). data-repo + secrets + keys are host paths.
name: inja-food-process

services:
  telegram-bot-api:
    image: tdlib/telegram-bot-api
    restart: unless-stopped
    env_file: [/opt/inja/secrets/telegram-bot-api.env]   # TELEGRAM_API_ID / TELEGRAM_API_HASH
    command: ["--local", "--http-port=8081"]
    volumes:
      - telegram-bot-api-data:/var/lib/telegram-bot-api

  upload-bot:
    build:
      context: ..
      dockerfile: deploy/upload-bot.Dockerfile
    image: inja-upload-bot
    restart: unless-stopped
    depends_on: [telegram-bot-api]
    env_file: [/opt/inja/secrets/upload-bot.env]         # TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS
    environment:
      DATA_ROOT: /data
      TELEGRAM_API_BASE_URL: http://telegram-bot-api:8081
    volumes:
      - /opt/inja/data-repo:/data

  control-bot:
    build:
      context: ..
      dockerfile: deploy/control-bot.Dockerfile
    image: inja-control-bot
    restart: unless-stopped
    env_file: [/opt/inja/secrets/control-bot.env]        # TELEGRAM_BOT_TOKEN, ALLOWED_USERS, budgets…
    environment:
      APPROVED_DIRECTORY: /data
    volumes:
      - /opt/inja/data-repo:/data
      - claude-credentials:/root/.claude

  ui-backend:
    build:
      context: ..
      dockerfile: deploy/ui-backend.Dockerfile
    image: inja-ui-backend
    restart: unless-stopped
    env_file: [/opt/inja/secrets/ui-backend.env]         # SESSION_SIGNING_KEY, UI_USERS_FILE
    environment:
      DATA_ROOT: /data
      UI_USERS_FILE: /run/secrets/ui-users.json
    volumes:
      - /opt/inja/data-repo:/data
      - /opt/inja/secrets/ui-users.json:/run/secrets/ui-users.json:ro

  proxy:
    image: caddy:2
    restart: unless-stopped
    depends_on: [ui-backend]
    ports:
      - "443:443"
    volumes:
      - /opt/inja/code-repo/deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    # note: Caddy's own state lives in the caddy-data volume; distinct from data-repo

  git-push:
    build:
      context: ..
      dockerfile: deploy/git-push.Dockerfile
    image: inja-git-push
    restart: unless-stopped
    environment:
      DATA_REPO: /data
      GIT_BRANCH: main
      DEPLOY_KEY: /keys/id_deploy
    volumes:
      - /opt/inja/data-repo:/data
      - /opt/inja/keys:/keys:ro

volumes:
  telegram-bot-api-data:
  claude-credentials:
  caddy-data:
```

- [ ] **Step 2: Validate the compose file**

Run: `docker compose -f deploy/docker-compose.yml config >/dev/null && echo OK`
Expected: `OK` (no schema errors). Bind-mount host paths need not exist yet for `config`.

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.yml
git commit -m "feat(deploy): complete docker-compose stack (bots + UI + bot-api + proxy + git-push)"
```

---

### Task 10: Operator runbooks

Seven task-focused docs. Create the directory and each file with the exact commands below (wrap in prose as you write; the commands are the substance).

**Files:**
- Create: `docs/runbooks/00-overview.md` … `docs/runbooks/06-changing-users.md`

- [ ] **Step 1: `00-overview.md`** — topology + inventory

Content: a table of the 6 services (from Task 9) with role, image, mounts, published ports; the data-flow line "upload-bot → data-repo ← control-bot pipeline → data-repo ← ui-backend; git-push → GitHub"; and the `/opt/inja/` layout block from the spec §4. State the single published port is **443** (proxy).

- [ ] **Step 2: `01-server-setup.md`** — provision the host

```bash
# on 91.107.147.127 (ssh inja), as root
apt-get update && apt-get install -y docker.io docker-compose-plugin git
systemctl enable --now docker
mkdir -p /opt/inja/{secrets,keys}
git clone git@github.com:lilihosieni-amin/injaprocess_code-repo.git /opt/inja/code-repo
git clone git@github.com:lilihosieni-amin/injaprocess_data-repo.git /opt/inja/data-repo
# firewall: allow SSH + 443 only
ufw allow OpenSSH && ufw allow 443/tcp && ufw --force enable
```
Note: cloning both repos needs an SSH key on the server with read access (GitHub deploy keys or the account key).

- [ ] **Step 3: `02-secrets-and-auth.md`** — env files, deploy key, subscription login

Create the three env files under `/opt/inja/secrets/` (chmod 600), from the `config/*.env.example` and `control-bot/runtime.env.example` templates:
- `upload-bot.env` — `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`
- `control-bot.env` — the full `control-bot/runtime.env.example` profile: `TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS`, `APPROVED_DIRECTORY=/data`, `USE_SDK=true`, budgets; **leave `ANTHROPIC_API_KEY` blank** (subscription auth)
- `ui-backend.env` — `SESSION_SIGNING_KEY`, `UI_USERS_FILE=/run/secrets/ui-users.json`
- `ui-users.json` — the UI users map `{ "alice": "<argon2 hash>", "bob": "<argon2 hash>" }` (chmod 600)
- `telegram-bot-api.env` — `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` (from https://my.telegram.org)

Generate `SESSION_SIGNING_KEY` and one argon2 hash per UI user (paste each hash into `ui-users.json`):
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"    # SESSION_SIGNING_KEY
docker run --rm inja-ui-backend python -c \
 "from argon2 import PasswordHasher; print(PasswordHasher().hash('THIS-USERS-PASSWORD'))"
```

data-repo deploy key (for git-push, write access) — generate, add the **public** key as a deploy key with write access on `injaprocess_data-repo`:
```bash
ssh-keygen -t ed25519 -N '' -f /opt/inja/keys/id_deploy
cat /opt/inja/keys/id_deploy.pub    # add to GitHub repo → Settings → Deploy keys (Allow write)
```

Claude subscription login (persists in the `claude-credentials` volume):
```bash
cd /opt/inja/code-repo/deploy
docker compose build control-bot
docker compose run --rm control-bot claude auth login   # open URL, paste code
```

- [ ] **Step 4: `03-deploy.md`** — build + first up + updates

```bash
cd /opt/inja/code-repo/deploy
docker compose build                 # builds all custom images on the server
docker compose up -d
docker compose ps                    # all services "running"
# UI: browse https://91.107.147.127 — accept the self-signed cert once
# Update after a code change:
git -C /opt/inja/code-repo pull && docker compose build && docker compose up -d
```

- [ ] **Step 5: `04-transcription.md`** — no-Vertex workflow + enabling Vertex

Explain: place `meetings/transcripts/{name}.txt` for each voice so `transcribe` is a no-op (idempotency skip); then drive the pipeline from control-bot. To enable Vertex later: fill `VERTEX_PROJECT/LOCATION`, `GEMINI_MODEL`, mount `GOOGLE_APPLICATION_CREDENTIALS` into control-bot, and `pip install "inja-engine[vertex]"` in the control-bot image.

- [ ] **Step 6: `05-operations.md`** — logs, health, push, AC-7, backup

```bash
docker compose logs -f control-bot            # or any service
docker compose restart ui-backend
# verify scheduled push logic on demand:
docker compose exec git-push /usr/local/bin/git-push-if-needed.sh
# AC-7: hooks + can_use_tool callback confine the agent to /data; CLIs are baked outside it
docker compose exec control-bot sh -c 'command -v merge allocate-id; ls -d /data/.claude'
docker compose logs control-bot | grep -i "can_use_tool denied"  # any out-of-bounds write attempt is denied
```
Backup: git-push is the off-site baseline (data-repo minus audio). For raw audio, add a separate rsync/snapshot of `/opt/inja/data-repo/meetings/audio/`. Restore = re-clone data-repo + restore audio from the snapshot.

- [ ] **Step 7: `06-changing-users.md`** — the hint file

- **Find a numeric Telegram ID:** have the person message `@userinfobot` (or read it from `upload-bot` logs when they try).
- **upload-bot users:** edit `ALLOWED_USER_IDS` (comma-separated) in `/opt/inja/secrets/upload-bot.env`, then `docker compose up -d upload-bot`.
- **control-bot users:** edit `ALLOWED_USERS` (comma-separated) in `/opt/inja/secrets/control-bot.env`, then `docker compose up -d control-bot`.
- **UI users:** edit `/opt/inja/secrets/ui-users.json` — add or remove a `"username": "<argon2 hash>"` entry (generate the hash with the argon2 command in `02`), then `docker compose up -d ui-backend`. All UI users share the same access (NFR-3 requires only authentication).

- [ ] **Step 8: Commit**

```bash
git add docs/runbooks/
git commit -m "docs(runbooks): server setup, secrets/auth, deploy, transcription, ops, changing users"
```

---

### Task 11: UI backend multi-user login (JSON file)

Support multiple UI users via a JSON map file (`{username: argon2_hash}`), pointed to by `UI_USERS_FILE`, with the single-user env vars kept as a fallback.

**Files:**
- Modify: `ui-backend/inja_ui_backend/config.py`
- Modify: `ui-backend/inja_ui_backend/auth.py`
- Modify: `ui-backend/inja_ui_backend/routers/auth.py`
- Modify: `ui-backend/inja_ui_backend/tests_helpers.py`
- Modify: `config/ui-backend.env.example`
- Create: `config/ui-users.example.json`
- Test: `ui-backend/tests/test_config.py`, `ui-backend/tests/test_auth.py`

**Interfaces:**
- Produces: `Settings.users: dict[str, str]` (username → argon2 hash); `authenticate(cfg, username, password) -> bool`; `verify_hash(password_hash, password) -> bool`.
- Consumes: existing `Settings`, `issue_cookie`, `require_session` (unchanged).

- [ ] **Step 1: Write failing config tests**

Append to `ui-backend/tests/test_config.py`:

```python
import json


def test_users_file_loads_multiple(tmp_path):
    env = _valid_env(tmp_path)
    del env["UI_USERNAME"]; del env["UI_PASSWORD_HASH"]
    users = {"alice": "$argon2id$h1", "bob": "$argon2id$h2"}
    p = tmp_path / "ui-users.json"
    p.write_text(json.dumps(users))
    env["UI_USERS_FILE"] = str(p)
    s = load_settings(env)
    assert s.users == users


def test_single_user_env_populates_users_map(tmp_path):
    s = load_settings(_valid_env(tmp_path))
    assert s.users == {"analyst": "$argon2id$dummy"}


def test_no_auth_source_raises(tmp_path):
    env = _valid_env(tmp_path)
    del env["UI_USERNAME"]; del env["UI_PASSWORD_HASH"]
    with pytest.raises(RuntimeError, match="UI_USERS_FILE|UI_USERNAME"):
        load_settings(env)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd ui-backend && python -m pytest tests/test_config.py -q`
Expected: FAIL (`Settings` has no `users`; no `UI_USERS_FILE` handling).

- [ ] **Step 3: Implement the config change**

In `ui-backend/inja_ui_backend/config.py`: add `import json`; add a `users` field; drop `UI_USERNAME`/`UI_PASSWORD_HASH` from the always-required tuple; build the users map.

```python
_REQUIRED = ("DATA_ROOT", "SCHEMA_DIR", "SESSION_SIGNING_KEY")
```

Add the field to the dataclass (after `session_ttl` is fine):

```python
    users: dict[str, str]
```

In `load_settings`, after the `schema_dir` checks and before building `static`, resolve the users map:

```python
    users_file = env.get("UI_USERS_FILE")
    if users_file:
        with open(users_file, encoding="utf-8") as fh:
            users = json.load(fh)
        if not isinstance(users, dict) or not users:
            raise RuntimeError("UI_USERS_FILE must be a non-empty JSON object of username->hash")
        ui_username = ""
        ui_password_hash = ""
    else:
        ui_username = env.get("UI_USERNAME")
        ui_password_hash = env.get("UI_PASSWORD_HASH")
        if not ui_username or not ui_password_hash:
            raise RuntimeError("set UI_USERS_FILE, or both UI_USERNAME and UI_PASSWORD_HASH")
        users = {ui_username: ui_password_hash}
```

Then pass `users=users`, and change the `ui_username`/`ui_password_hash` args in the `Settings(...)` construction to use the locals above instead of `env[...]`:

```python
        ui_username=ui_username,
        ui_password_hash=ui_password_hash,
        ...
        users=users,
```

- [ ] **Step 4: Update `tests_helpers.cfg_for` (still single-user path — no change needed to its env), then run config tests**

`cfg_for` uses `UI_USERNAME`/`UI_PASSWORD_HASH`, so `load_settings` now also fills `users={"analyst": "$argon2id$dummy"}` automatically — no edit required. Verify:

Run: `cd ui-backend && python -m pytest tests/test_config.py -q`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Write failing multi-user auth tests**

In `ui-backend/tests/test_auth.py`, update `_client` to also set the `users` map, and add multi-user cases:

```python
def _client(data_root, password="pw"):
    cfg = cfg_for(data_root)
    real = argon2.PasswordHasher().hash(password)
    cfg = cfg.__class__(**{**cfg.__dict__, "ui_password_hash": real,
                           "ui_username": "analyst", "users": {"analyst": real}})
    return TestClient(create_app(cfg))


def _multi_client(data_root):
    cfg = cfg_for(data_root)
    ph = argon2.PasswordHasher()
    users = {"alice": ph.hash("apw"), "bob": ph.hash("bpw")}
    cfg = cfg.__class__(**{**cfg.__dict__, "users": users,
                           "ui_username": "", "ui_password_hash": ""})
    return TestClient(create_app(cfg))


def test_multiple_users_can_log_in(data_root):
    assert _multi_client(data_root).post(
        "/api/auth/login", json={"username": "bob", "password": "bpw"}).status_code == 200
    assert _multi_client(data_root).post(
        "/api/auth/login", json={"username": "alice", "password": "apw"}).status_code == 200


def test_multi_unknown_user_or_wrong_password_401(data_root):
    c = _multi_client(data_root)
    assert c.post("/api/auth/login", json={"username": "bob", "password": "apw"}).status_code == 401
    assert c.post("/api/auth/login", json={"username": "carol", "password": "x"}).status_code == 401
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd ui-backend && python -m pytest tests/test_auth.py -q`
Expected: FAIL (login still checks `cfg.ui_username`, not the map).

- [ ] **Step 7: Implement the auth change**

Replace the `verify_password` function in `ui-backend/inja_ui_backend/auth.py` with a hash-taking verifier + an authenticate helper:

```python
def verify_hash(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def authenticate(cfg: Settings, username: str, password: str) -> bool:
    h = cfg.users.get(username)
    return bool(h) and verify_hash(h, password)
```

In `ui-backend/inja_ui_backend/routers/auth.py`, import `authenticate` instead of `verify_password` and change the login check:

```python
from ..auth import COOKIE_NAME, issue_cookie, require_session, authenticate
...
    if not authenticate(cfg, body.username, body.password):
        raise HTTPException(status_code=401, detail="invalid credentials")
    response.set_cookie(COOKIE_NAME, issue_cookie(cfg, body.username),
                        httponly=True, samesite="lax", max_age=cfg.session_ttl)
    return {"username": body.username}
```

- [ ] **Step 8: Run the whole ui-backend suite**

Run: `cd ui-backend && python -m pytest -q`
Expected: PASS (all tests, including the untouched process/department/pending suites).

- [ ] **Step 9: Update the env example + add an example users file**

In `config/ui-backend.env.example`, add below the single-user lines:

```bash
# Multiple UI users: path to a JSON file {username: argon2_hash} (real file OUTSIDE git).
# If set, it takes precedence over UI_USERNAME/UI_PASSWORD_HASH above.
UI_USERS_FILE=
```

Create `config/ui-users.example.json`:

```json
{
  "analyst": "$argon2id$v=19$m=65536,t=3,p=4$REPLACE_WITH_REAL_ARGON2_HASH",
  "manager": "$argon2id$v=19$m=65536,t=3,p=4$REPLACE_WITH_REAL_ARGON2_HASH"
}
```

- [ ] **Step 10: Commit**

```bash
git add ui-backend/inja_ui_backend/config.py ui-backend/inja_ui_backend/auth.py \
        ui-backend/inja_ui_backend/routers/auth.py ui-backend/tests/test_config.py \
        ui-backend/tests/test_auth.py config/ui-backend.env.example config/ui-users.example.json
git commit -m "feat(ui-backend): multi-user login via UI_USERS_FILE JSON map (single-user env fallback)"
```

---

### Task 12: Deploy to the server & verify exit criteria

Execute the runbooks on `91.107.147.127` and confirm the PLAN.md §9 exit criteria. **These commands run on the server (`ssh inja`).**

- [ ] **Step 1: Provision + secrets + auth** — follow `01-server-setup.md`, `02-secrets-and-auth.md`. Confirm the three env files exist (chmod 600), the deploy key is registered with write access, and `claude auth login` succeeded.

- [ ] **Step 2: Build + bring up the stack**

Run (on server): `cd /opt/inja/code-repo/deploy && docker compose build && docker compose up -d && docker compose ps`
Expected: all 6 services `running`. **Exit criterion 1 (NFR-9).**

- [ ] **Step 3: Verify the UI**

Browse `https://91.107.147.127`, accept the cert, log in as a UI user from `ui-users.json`. Expected: the app loads and authenticates.

- [ ] **Step 4: Verify AC-7 (runtime can't change code/CLIs)**

Mechanism: the Phase-3 in-container hooks (`setting_sources=["project"]` → `/data/.claude`) **and** the bot's `can_use_tool` callback (`approved_directory=/data`) confine the agent's file operations to `/data`, so it cannot reach the engine CLIs/code baked outside `/data` (`/usr/local/bin` + `/opt/engine`). (`read_only: true` was attempted for filesystem defence-in-depth but dropped — the Claude CLI's persistent SDK client needs a writable `~/.claude.json` in the root home, unisolable without shadowing the baked bot at `/root/.local`.)
Run: `docker compose exec control-bot sh -c 'command -v merge allocate-id; ls -d /data/.claude'`
Expected: the CLIs resolve under `/usr/local/bin` (outside `/data`) and `/data/.claude` (the hooks) is present. Full proof is functional: in a pipeline run, an agent write outside `/data` is denied (`docker compose logs control-bot | grep "can_use_tool denied"`). **Exit criterion 2 (AC-7).**

- [ ] **Step 5: Verify scheduled push logic**

Run: `docker compose exec git-push /usr/local/bin/git-push-if-needed.sh`
Expected: `nothing to push` on a clean tree; after making a commit in `/opt/inja/data-repo`, re-run and expect `pushing 1 commit(s)` and the commit appears on GitHub. **Exit criterion 3 (NFR-7).**

- [ ] **Step 6: Live smoke test (bots)**

From Telegram: send a voice to **upload-bot** (stored under `/opt/inja/data-repo/meetings/`), then drop its transcript at `meetings/transcripts/{name}.txt`, then drive **control-bot** ("process the voice {name}"). Expected: the pipeline runs to a checkpoint and, on confirm, commits `processes/*.json`. (This exercises AC-2 via the manual-transcript path.)

- [ ] **Step 7: Record the outcome**

Append a short "deployed YYYY-MM-DD, exit criteria 1–3 met" note to `docs/runbooks/05-operations.md`, commit, and push.

---

## Self-Review

**Spec coverage:**
- §2 Transcription (manual drop) → Task 10 step 5, Task 11 step 6. ✅
- §2 UI TLS (Caddy internal) → Task 8, Task 11 step 3. ✅
- §2 Anthropic subscription auth → Task 7 (`/root/.claude` volume), Task 9, Task 10 step 3. ✅
- §2 No CI (build on server) → Tasks 4–9 build steps, Task 10 step 4. ✅
- §2/§6 Multi-user bots → Task 1 (upload-bot code), Task 10 step 7 (control-bot doc). ✅
- §2/§6 Multi-user UI → Task 11 (UI_USERS_FILE JSON map), Task 9 (compose mount), Task 10 steps 3 & 7 (runbook). ✅
- §3 Six services + patch step → Tasks 4–9; patches in Task 7. ✅
- §4 Server layout + audio dir on clone → Task 2, Task 10 steps 1–2. ✅
- §5 Networking (local bot-api for upload; direct for control) → Task 9 env. ✅
- §7 Scheduled push + audio-not-in-git backup → Tasks 3–4, Task 10 step 6. ✅
- §8 Runbooks 00–06 → Task 10. ✅
- §9 Exit criteria → Task 12. ✅

**Placeholder scan:** No TBD/TODO; every code/config step shows full content; runbook steps give exact commands. ✅

**Type consistency:** `allowed_user_ids: frozenset[int]` and `is_allowed(user_id, allowed_ids)` used identically in Task 1 config, auth, handlers, and tests. Script env vars (`DATA_REPO`, `GIT_BRANCH`, `DEPLOY_KEY`) match between Task 3 script, Task 9 compose, and Task 11. Image names (`inja-upload-bot`, `inja-control-bot`, `inja-ui-backend`, `inja-git-push`) match between Dockerfile build tags and compose `image:`. ✅
