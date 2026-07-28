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
EXPORT_USERNAME=                         # the one shared login for published exports
EXPORT_PASSWORD_HASH=                    # its argon2 hash — see step 2 (never the plaintext)
```

`EXPORT_USERNAME` / `EXPORT_PASSWORD_HASH` are the single credential that opens a
published department export (`/exports/…html` and the `.pdf` beside it). It is
deliberately separate from the UI users above: an export login opens exports and
nothing else, and it is shared by everyone you hand an export link to.

Leaving both blank is safe and is the default: with no credential configured the
export URLs answer `401` to everyone except a signed-in UI user (who already sees
everything), and no login form is offered. There is no fallback to open access —
an unset credential closes the gate, it never opens it. The rest of the UI starts
and serves normally either way, so these two are optional in exactly the way
`EXPORT_DIR` is.

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

The export credential uses the **same** recipe — one more run of the same
command, for the password you will hand out with the export links:

```bash
docker run --rm inja-ui-backend python -c \
 "from argon2 import PasswordHasher; print(PasswordHasher().hash('THE-EXPORT-PASSWORD'))"
```

> **Make the export password long — this is the only thing that stops guessing.**
> Nothing else does. There is no lockout, no attempt counter and no rate limit in
> front of `POST /api/exports/login`; the endpoint is unauthenticated by
> definition, and the URL it belongs to is handed to every member of staff who
> gets an export link, so it is the most widely advertised address in the system.
> What the server does have is a cost ceiling — argon2 (~60 ms per attempt) with
> at most two checks running at once — which makes guessing slow, not impossible.
> One shared password protects a whole department's documentation for everyone,
> so use a long passphrase (four or more unrelated words, or 20+ random
> characters), never a word plus a number.

Paste the hash from step 2 as `EXPORT_PASSWORD_HASH` in `ui-backend.env`, and the
chosen username as `EXPORT_USERNAME`. `EXPORT_PASSWORD_HASH` holds an argon2 hash, never
a plaintext password — same rule as `ui-users.json`. Both values live only in
`/opt/inja/secrets/ui-backend.env` on the server, outside the code-repo and the
data-repo; nothing about this credential is ever committed to either repo.

Paste the hash **exactly as printed**, `$` signs and all, and do not quote or escape
it. Compose normally interpolates `env_file` values, which would read every `$` in
`$argon2id$v=19$m=...` as a variable reference and hand the container a truncated
hash — a password that can never verify, failing closed in a way indistinguishable
from "the credential isn't set". `docker-compose.yml` therefore reads this file with
`format: raw`, which switches interpolation off. If you ever move the credential to
another service's env file, carry that `format: raw` with it.

To confirm the container really got it, after `up -d`:

```bash
docker compose exec ui-backend python -c \
  "import os; h=os.environ.get('EXPORT_PASSWORD_HASH',''); print('ok' if h.startswith('\$argon2id\$') else 'MANGLED')"
```

### Seeing someone guess

Failed attempts are logged at `WARNING`, one line each:

```
2026-07-28 16:42:24,808 WARNING inja_ui_backend.routers.export_files: export login failed: username='staff' from 127.0.0.1
```

`docker compose logs ui-backend | grep "export login failed"` is how you see
someone trying. The date, level and logger name come from the service itself;
`docker compose logs` adds the service-name prefix, and `-t` would add Docker's
own timestamp on top of the one already in the line.

Three things that grep does **not** show you:

- **A successful login.** Only failures are logged, so there is no line marking
  the moment guessing stops being guessing.
- **Anything at all on an unconfigured deployment.** With `EXPORT_USERNAME` /
  `EXPORT_PASSWORD_HASH` unset, `POST /api/exports/login` answers `401` before it
  reaches the logging, so no amount of hammering produces a line. Silence here
  means "no credential configured" at least as often as it means "nobody is
  trying" — check the startup line below to tell the two apart.
- **History.** Container logs are capped at 30 MB per service (`x-logging` in
  `deploy/docker-compose.yml`, see [`01-server-setup.md`](01-server-setup.md)),
  which is deliberate — uncapped, a sustained flood against this public endpoint
  would fill the host's disk. It does mean the grep is a live signal, not an
  archive: under a fast attempt rate the older lines rotate away.

At startup the service says which state the gate is in, so you can confirm the
credential was actually picked up rather than inferring it from a 401:

```bash
docker compose logs ui-backend | grep "export gate"
# export gate: a shared export credential is configured, so /exports opens for it and for a signed-in UI user
# — or —
# export gate: no export credential configured, so /exports answers 401 to everyone but a signed-in UI user
```

Setting only one of the two variables logs a `WARNING` naming the missing half.
Neither the username's value nor the hash ever appears in any of these lines.

### Signing out of an export, and what that means on a shared phone

There is **no sign-out button** on the export documents or on their login page,
and this is deliberate — the readers are kitchen staff, and a button whose only
effect is to make them type the password again is a support call, not a feature.
`POST /api/exports/logout` exists and clears the session, but it is
operator/API-only: nothing in the UI links to it, so it is reached with a tool
(`curl -X POST https://<host>/api/exports/logout`) from the browser that holds
the session, not by the reader.

The practical consequence: on a **shared device** — the kitchen's own phone or
tablet — whoever signs in leaves the export session in that browser for the full
`SESSION_TTL` (24 hours by default), and anyone who picks the device up opens
those documents without typing anything. That is usually fine, since the
documents are for that kitchen anyway. Where it is not:

- shorten `SESSION_TTL` in `ui-backend.env` (it applies to the UI session too), or
- rotate the export password, which invalidates nothing on its own — sessions are
  signed with `SESSION_SIGNING_KEY`, not with the password. **Rotating
  `SESSION_SIGNING_KEY` is what ends every live session**, export and UI alike,
  and it forces every admin to sign in again.

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
