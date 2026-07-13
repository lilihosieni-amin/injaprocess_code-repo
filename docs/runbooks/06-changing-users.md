# 06 — Changing users

There are three independent user lists: `upload-bot` (Telegram), `control-bot`
(Telegram), and the UI. All edits are to files under `/opt/inja/secrets/`,
followed by a targeted `docker compose up -d <service>` from
`/opt/inja/code-repo/deploy`.

## Find a numeric Telegram ID

The two bots gate on **numeric** Telegram IDs, not usernames. To find someone's
ID: have them message `@userinfobot` (it replies with their numeric ID), or read
it from the `upload-bot` logs when they try to use the bot
(`docker compose logs upload-bot`).

## upload-bot users

Edit `ALLOWED_USER_IDS` (comma-separated) in
`/opt/inja/secrets/upload-bot.env`, then recreate the service:

```bash
cd /opt/inja/code-repo/deploy
docker compose up -d upload-bot
```

## control-bot users

Edit `ALLOWED_USERS` (comma-separated) in
`/opt/inja/secrets/control-bot.env`, then recreate the service:

```bash
cd /opt/inja/code-repo/deploy
docker compose up -d control-bot
```

## UI users

Edit `/opt/inja/secrets/ui-users.json` — add or remove a
`"username": "<argon2 hash>"` entry. Generate the hash with the argon2 command
from [`02-secrets-and-auth.md`](02-secrets-and-auth.md):

```bash
docker run --rm inja-ui-backend python -c \
 "from argon2 import PasswordHasher; print(PasswordHasher().hash('THIS-USERS-PASSWORD'))"
```

Then recreate the service:

```bash
cd /opt/inja/code-repo/deploy
docker compose up -d ui-backend
```

All UI users share the same access — NFR-3 requires only authentication, so there
are no per-user roles or permissions to configure.
