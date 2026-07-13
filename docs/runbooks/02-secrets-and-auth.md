# 02 — Secrets & auth

All real secrets live under `/opt/inja/secrets/` on the server — never in either
git repo. This runbook creates the env files, the `git-push` deploy key, and the
Claude subscription login.

Templates to copy from: `config/*.env.example` and
`control-bot/runtime.env.example` in the code-repo.

Every file created here is secret: `chmod 600` each one.

## 1. The secret env files under `/opt/inja/secrets/`

Create these five files. Fill the blanks with real values; keep them at
`chmod 600`.

### `upload-bot.env` (from `config/upload-bot.env.example`)

```
TELEGRAM_BOT_TOKEN=      # Bot 1 token from @BotFather
ALLOWED_USER_IDS=        # comma-separated numeric Telegram IDs, one or more
```

`DATA_ROOT` and `TELEGRAM_API_BASE_URL` are already set by compose, so they do
not belong in this file.

### `control-bot.env` (from `control-bot/runtime.env.example`)

Use the **full** `control-bot/runtime.env.example` profile — every key in it is a
real `claude-code-telegram` v1.6.0 setting. The essentials:

```
TELEGRAM_BOT_TOKEN=      # Bot 2 token from @BotFather
ALLOWED_USERS=           # comma-separated numeric Telegram IDs
APPROVED_DIRECTORY=/data # the data-repo bind mount — the ONLY dir the session can reach
USE_SDK=true             # SDK path so data-repo hooks fire
DATABASE_URL=sqlite:////state/bot.db  # bot SQLite state on the writable control-bot-state volume
                                      # (control-bot runs read_only: true — /state is the writable path)
# ...plus the budgets (CLAUDE_MAX_TURNS / _TIMEOUT_SECONDS / _MAX_COST_PER_*) and
#    the disable-everything-else flags from the template.
ANTHROPIC_API_KEY=       # LEAVE BLANK — we use subscription auth (see step 3)
```

> **Do not set `ANTHROPIC_API_KEY`.** Auth comes from the Claude subscription
> login in step 3, which persists in the `claude-credentials` volume.

### `ui-backend.env` (from `config/ui-backend.env.example`)

```
SESSION_SIGNING_KEY=                     # generate — see below
UI_USERS_FILE=/run/secrets/ui-users.json # where compose mounts the users map
```

### `ui-users.json` (the UI users map — `chmod 600`)

A JSON object mapping each username to its argon2 password hash:

```json
{
  "alice": "<argon2 hash>",
  "bob": "<argon2 hash>"
}
```

Generate one hash per user (step 2) and paste it in. All UI users share the same
access — NFR-3 requires only authentication, not per-user roles.

### `telegram-bot-api.env`

Credentials for the local Telegram Bot API server, from
<https://my.telegram.org>:

```
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
```

## 2. Generate the session key and the argon2 hashes

Generate `SESSION_SIGNING_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"    # SESSION_SIGNING_KEY
```

Generate one argon2 hash per UI user, and paste each hash into `ui-users.json`.
This uses the built `inja-ui-backend` image, which already has the `argon2`
library (build it first if needed — see [`03-deploy.md`](03-deploy.md)):

```bash
docker run --rm inja-ui-backend python -c \
 "from argon2 import PasswordHasher; print(PasswordHasher().hash('THIS-USERS-PASSWORD'))"
```

Replace `THIS-USERS-PASSWORD` with the user's real password (never store the
plaintext — only the hash goes into `ui-users.json`).

## 3. data-repo deploy key (for `git-push` write access)

`git-push` needs **write** access to push data-repo backups. Generate a
dedicated ed25519 key and register its **public** half as a deploy key with write
access on the `injaprocess_data-repo` GitHub repo:

```bash
ssh-keygen -t ed25519 -N '' -f /opt/inja/keys/id_deploy
cat /opt/inja/keys/id_deploy.pub    # add to GitHub repo → Settings → Deploy keys (Allow write)
```

Compose mounts `/opt/inja/keys` read-only into `git-push` at `/keys`, and the
push script uses `/keys/id_deploy`.

## 4. Claude subscription login

Auth persists in the `claude-credentials` volume (mounted into `control-bot` at
`/root/.claude`), so this is a one-time step. Build the control-bot image, then
run the interactive login:

```bash
cd /opt/inja/code-repo/deploy
docker compose build control-bot
docker compose run --rm -it control-bot claude auth login   # open URL, paste code
```

The `-it` flags give you the interactive terminal the login flow needs: it prints
a URL — open it, authorize, and paste the code back. Because credentials live in
the volume, you do **not** need to repeat this on every deploy, and you do **not**
set `ANTHROPIC_API_KEY`.

## Next

With secrets and auth in place, continue with
[`03-deploy.md`](03-deploy.md).
