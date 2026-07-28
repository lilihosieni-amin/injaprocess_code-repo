# 06 — Changing users

There are three independent user lists — `upload-bot` (Telegram), `control-bot`
(Telegram), and the UI — plus the one shared credential that opens a published
export. All edits are to files under `/opt/inja/secrets/`,
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

## The export credential (rotating it)

One shared username/password opens every published export, so changing it is the
only revocation there is: everyone holding a link shares the credential, and
there is no way to revoke one person. That is by design — the alternative was a
user list for people outside the company.

Generate a new hash with the same argon2 command as above (see
[`02-secrets-and-auth.md`](02-secrets-and-auth.md)), replace **both** lines in
`/opt/inja/secrets/ui-backend.env`:

```
EXPORT_USERNAME=<the shared export username>
EXPORT_PASSWORD_HASH=<the new argon2 hash>
```

then recreate the service:

```bash
cd /opt/inja/code-repo/deploy
docker compose up -d ui-backend
```

What it costs you:

- **Everyone you gave the old password must be told the new one.** There is no
  per-person revocation.
- **A browser that already signed in keeps its access until its session expires**
  (`SESSION_TTL`, default 24 h). The export cookie is signed with
  `SESSION_SIGNING_KEY` and carries no reference to the password, so a new hash
  does not invalidate cookies already issued. Rotating `SESSION_SIGNING_KEY`
  *does* cut them off at once — but it also logs out every UI user **and changes
  every export URL** (each link is derived from that key), so every link handed
  out stops resolving and each department has to be exported again. Reach for it
  only when that is what you want.
- **A file someone already downloaded keeps opening, forever and offline.** An
  export is a standalone document; the password closes "someone forwards the
  link", never "someone forwards the file".
