# 02 — Secrets & auth

All real secrets live under `/opt/inja/secrets/` on the server — never in either
git repo. This runbook creates the env files, the `git-push` deploy key, and the
Claude subscription login.

Templates to copy from: `config/*.env.example` and
`control-bot/runtime.env.example` in the code-repo.

Every file created here is secret: `chmod 600` each one.

## 1. The secret env files under `/opt/inja/secrets/`

Create these four files. Fill the blanks with real values; keep them at
`chmod 600`.

> **There is no users file.** UI accounts are rows in `app.db` on the `ui-state`
> volume, not a secret on disk — see step 5. The retired `ui-users.json` and its
> `UI_USERS_FILE` variable are read by nothing; if the file is still on this
> server from an earlier deploy, delete it
> ([`06-changing-users.md`](06-changing-users.md)).

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
SESSION_SIGNING_KEY=     # generate — see below
```

`DATA_ROOT`, `EXPORT_DIR`, `APP_DB` and `TRUSTED_PROXY_HOPS` are set by compose,
so they do not belong in this file. Compose resolves the conflict the other way
round from what people expect: **`environment:` in the compose file wins over
`env_file`**, so a line you add here for one of those four is not an override, it
is a line that silently does nothing. That is the worse failure of the two —
you would change `APP_DB` here, restart, see no change, and go looking for the
reason in the wrong place. Change them in `deploy/docker-compose.yml`, where
`APP_DB=/state/app.db` puts the account store on the `ui-state` volume that
survives a redeploy.

No user credential goes in this file. `UI_USERNAME`, `UI_PASSWORD_HASH` and
`UI_USERS_FILE` are gone from the code — a password in the environment would be a
second way in that no session, no disabled flag and no activity record can see.

There used to be a second, shared username/password pair here that opened a
published department export on its own — deliberately separate from the UI
users above, and shared by everyone you handed an export link to. Spec D24
(sub-project P2) retired it outright: reports are now three routes under `/api`
behind the ordinary session (`GET /api/reports`, `POST
/api/departments/{code}/reports/{kind}`, `GET|HEAD …/file.{pdf,html}`), each
re-deriving the caller's scope and `export_pdf` per request the same way every
other route does (D12). One credential does everything the two used to,
and there is nothing left to configure here for it.

### `telegram-bot-api.env`

Credentials for the local Telegram Bot API server, from
<https://my.telegram.org>:

```
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
```

## 2. Generate the session key

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"    # SESSION_SIGNING_KEY
```

> **There is no argon2 hash to generate by hand, and no file to paste one into.**
> UI accounts are created by `inja-seed`, which takes the password as an argument
> and does the hashing itself — see step 5 and
> [`06-changing-users.md`](06-changing-users.md).

Reports are read the same way as everything else in the UI: a plain UI session,
gated per request by the reader's scope and `view`/`export_pdf` (D12). There is
no separate report login, no separate password to generate, and no separate
sign-out — signing out of the UI is signing out of reports.

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

One-time means per deploy, not forever: the credential is an OAuth pair whose
refresh token eventually expires or is revoked, and the bot then answers *"401 OAuth
access token has expired"*. Recovery is this same command plus a restart —
[`05-operations.md`](05-operations.md).

## 5. The first Editor (and why `app.db` is not a secret file)

Every UI account — username, argon2 hash, role, scope, sessions, and the activity
record — is a row in **`app.db`**, the SQLite file on the `ui-state` volume,
mounted into `ui-backend` at `/state/app.db`. It is not under
`/opt/inja/secrets/`, it is not in git, and it is deliberately not inside
`data-repo`: `git-push` pushes the data-repo to GitHub, and password hashes and
sessions must never travel with it.

Creating the first account is a step of the **first deploy**, not of this
runbook, because it needs the image built and the volume to exist. It is one
command, and [`03-deploy.md`](03-deploy.md) runs it in place:

```bash
docker compose run --rm ui-backend \
  inja-seed --db /state/app.db --username 09123456789 \
            --name "نام و نام خانوادگی" --password 'CHOOSE-A-REAL-PASSWORD-HERE'
```

`inja-seed` hashes the password itself, so there is no hash to generate and
nowhere to paste one. Its exit codes, what it refuses and why, and the recovery
path when every Editor is lost are all in
[`06-changing-users.md`](06-changing-users.md) — read that one before running it
a second time.

### `app.db` needs its own backup job — `git-push` does not cover it

`git-push` backs up the **data-repo** and nothing else. `app.db` lives on a
Docker volume outside it, so as things stand **nothing off-site holds the
accounts, the sessions or the activity record**: lose the host and NFR-7's
promise is simply false for all three, however healthy the GitHub mirror looks.

The `state-backup` service that closes this (ARD §16, NFR-16 — `sqlite3 .backup`
off-site on the same 11:00/23:00 schedule as `git-push`) is **not built yet**.
Until it is, take the backup by hand and keep it off the host. `.backup` rather
than `cp`, because the file is in WAL mode and a copy taken while the service is
writing can be torn:

```bash
cd /opt/inja/code-repo/deploy
docker compose exec ui-backend python -c \
  "import sqlite3; s=sqlite3.connect('/state/app.db'); d=sqlite3.connect('/state/app-backup.db'); s.backup(d); d.close(); s.close()"
docker compose cp ui-backend:/state/app-backup.db "./app-$(date +%F).db"
docker compose exec ui-backend rm -f /state/app-backup.db
```

`comments.db` lives on its own volume (`ui-comments`) outside the data-repo too,
and the same gap applies: `git-push` doesn't cover it, and `state-backup` isn't
built yet. Back it up the same way:

```bash
cd /opt/inja/code-repo/deploy
docker compose exec ui-backend python -c \
  "import sqlite3; s=sqlite3.connect('/comments/comments.db'); d=sqlite3.connect('/comments/comments-backup.db'); s.backup(d); d.close(); s.close()"
docker compose cp ui-backend:/comments/comments-backup.db "./comments-$(date +%F).db"
docker compose exec ui-backend rm -f /comments/comments-backup.db
```

Then move `app-<date>.db` off the server — it holds every password hash, so treat
it as a secret: `chmod 600`, never into either git repo.

## Next

With secrets and auth in place, continue with
[`03-deploy.md`](03-deploy.md).
