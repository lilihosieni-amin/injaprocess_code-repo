# 06 — Changing users

There are three independent user lists — `upload-bot` (Telegram), `control-bot`
(Telegram), and the UI — plus the one shared credential that opens a published
export.

The bot lists and the export credential are files under `/opt/inja/secrets/`,
edited and followed by a targeted `docker compose up -d <service>` from
`/opt/inja/code-repo/deploy`.

**UI users are not a file.** They are rows in `app.db` and are changed with a
command. If you are here because nobody can sign in, go straight to
[Nobody can sign in](#nobody-can-sign-in).

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

### Where a UI user lives

A UI user is a **row in `app.db`** — the SQLite file on the `ui-state` volume,
mounted into `ui-backend` at `/state/app.db`. The username, the argon2 password
hash, the role, the scope, every live session and the whole activity record are
in that one file. Nothing about a person is in an env file or a secrets file, and
recreating the service does not change any of it.

> **`ui-users.json` is dead — do not edit it.**
>
> `/opt/inja/secrets/ui-users.json` is read by **nothing**. `UI_USERS_FILE`,
> `UI_USERNAME` and `UI_PASSWORD_HASH` are gone from the code, from the compose
> files and from `ui-backend.env`. Adding a user to that file changes nothing,
> produces no error and writes no log line — which is exactly why it is worth
> deleting rather than leaving:
>
> ```bash
> rm -f /opt/inja/secrets/ui-users.json
> ```
>
> It was **not migrated**, and could not have been. Its two entries were bare
> names (`analyst`, `manager`), and a bare name cannot become a mobile number,
> which is what a username is now. Two accounts made by hand take five minutes;
> guessing whose phone `analyst` was does not.

### Usernames are mobile numbers

A username is an Iranian mobile number in canonical form — `09` followed by nine
digits, e.g. `09123456789`. Nothing else is accepted.

Persian and Arabic-Indic digits and a `+98` / `0098` / `98` country code are
folded to that form both when an account is created and on every sign-in, so
`۰۹۱۲۳۴۵۶۷۸۹`, `+98 912 345 6789` and `09123456789` are one account, not three.
You may type any of them; what is stored is the canonical form.

**A number is unique across disabled accounts too.** Disabling someone does not
release their number. If you need to give a number to a different person, edit
the account that already holds it first — a second account on the same number
cannot be created while the first exists, disabled or not.

### Seeding the first Editor

`inja-seed` creates the four roles and one Editor scoped to everything. Run it
from `/opt/inja/code-repo/deploy`:

```bash
docker compose run --rm ui-backend \
  inja-seed --db /state/app.db \
            --username 09123456789 \
            --name "نام و نام خانوادگی" \
            --password 'CHOOSE-A-REAL-PASSWORD-HERE'
```

`--db /state/app.db` is not optional and not a detail: it is the same path
`APP_DB` gives the running service, on the same `ui-state` volume. Seed any other
path and you write an Editor into a file the app never opens.

Single-quote the password so the shell does not eat a `$` or a `!`, and note that
it lands in your shell history — clear it, or use a password you intend to change
at first sign-in. **Never put a real password in this repo or in any file under
`/opt/inja/code-repo`.**

Rules the command enforces:

- The password floor is **six characters**. No complexity rule, no expiry.
- The account is created **only if there is no active Editor already**. Not "no
  users" — an *active Editor* (see below).
- It never promotes or re-enables an account that already exists.

### What the exit code means

`inja-seed` has three, and they are worth reading before you run it a second
time:

| Exit | Printed | Meaning |
|---|---|---|
| `0` | `created the Editor 09123456789` (stdout) | The Editor was created. |
| `1` | `an active Editor already exists, so nothing was created` (stdout) | **Not an error.** The healthy system telling you the recovery was not needed. Nothing was written. |
| `2` | the reason, on **stderr** | Refused before writing anything: the password is shorter than six characters, or that number already belongs to an account that is not an active Editor. |

Both refusals go to **stderr**, so they survive `inja-seed … > /dev/null`. An
unhandled crash also exits `1`, but with a Python traceback and no message on
stdout — that is how a crash is told apart from a healthy no-op.

### See what accounts exist

Read-only, and the first thing to run when a sign-in is failing — it tells you
whether the account exists at all, whether it is disabled, and which number the
Editor is:

```bash
cd /opt/inja/code-repo/deploy
docker compose exec -T ui-backend python - <<'PY'
import sqlite3
conn = sqlite3.connect("file:/state/app.db?mode=ro", uri=True)
rows = conn.execute(
    "SELECT u.username, u.display_name, r.name, u.disabled_at"
    " FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id").fetchall()
print(f"{len(rows)} account(s)")
for username, name, role, disabled in rows:
    print(f"  {username}  {role:<20} {'DISABLED' if disabled else 'active':<8} {name}")
PY
```

`0 account(s)` means an empty store — go to the next section. It prints no
password hashes, so it is safe to paste into a chat while asking for help.

`-T` is not decoration: `docker compose exec` allocates a TTY by default, and
older Compose builds answer *"the input device is not a TTY"* the moment stdin is
a heredoc rather than your keyboard. Every `exec … python - <<'PY'` in this
runbook carries it.

If `docker compose exec` fails with "service not running", the container is
down — `docker compose ps`, then `docker compose up -d ui-backend` — and that,
not the accounts, is why nobody can sign in.

### Nobody can sign in

This is the recovery path, and `inja-seed` is the whole of it.

The three capabilities that let anyone change content — `edit`, `confirm`,
`set_visibility` — come from the seeded `editor` role and from **nowhere else**.
No screen, no API call and no administrator can mint them. That is deliberate: it
is why "no UI can ever create a role that edits content" is a property of the
data rather than a check someone could remove. The price is exactly this — if
every Editor is gone, only the seed brings one back.

The guard is **"is there an active Editor"**, not "is there anybody at all". So
the realistic disaster — the Editor account disabled or lost while readers and
admins carry on — is one a re-run actually fixes; a "does any user exist" guard
would have read that as a healthy system and skipped.

```bash
cd /opt/inja/code-repo/deploy
docker compose run --rm ui-backend \
  inja-seed --db /state/app.db \
            --username 09121112233 \
            --name "نام و نام خانوادگی" \
            --password 'CHOOSE-A-REAL-PASSWORD-HERE'
```

- Exit **0** — you have an Editor again. Sign in and put the rest right from
  there.
- Exit **1** — an active Editor exists, so this is not your problem. Nobody
  signing in is then a wrong password, a disabled account or the service being
  down; check `docker compose ps` and
  `docker compose logs ui-backend | grep login`.
- Exit **2** — read the message. If it says the number already exists but is not
  an active Editor, **seed a different number** (the fastest way back), or
  re-enable / re-role the existing account by hand and try again. The seed
  refuses to promote it for you on purpose: the number is a value you typed or a
  variable that might be stale, and silently promoting whoever holds it would
  make a stale value a way to grant `edit`.

**No restart is needed.** `inja-seed` writes to the same `app.db` the running
service has open, and the service reads accounts per request — the new Editor can
sign in immediately. `docker compose run --rm` also leaves nothing behind: it is
a throwaway container that shares the volume and removes itself.

> **Unset any seeding variables once you are in.** If you ever put the seed
> username or password into an env file or the shell environment to script a
> first boot, take them out afterwards. They are a live way to mint an Editor on
> a running server, and the whole reason the seed refuses to promote an existing
> account is that a stale value must not be able to grant `edit`.

### Adding and removing other people

There is **no supported way to add an ordinary user yet.** The account screens —
creating people, setting their role and scope, and an administrator setting
someone's password — are the next sub-project. Until then the deployment has the
accounts the seed made, and the only way to change a password is the API call
below — **there is no password screen in this release**, so do not tell anyone to
"change it in the UI".

Do not hand-insert rows into `app.db` to get ahead of it: an account needs a role
and at least one scope row to be usable, and one written wrongly is an account
that either cannot sign in or can see more than it should.

What does work today, per person:

- **Signing in and signing out**, from the UI. Signing out ends that one session
  immediately and leaves the person's other sessions alone.
- **Changing your own password**, via `POST /api/auth/password`. There is **no
  screen for it yet** — it arrives with the account screens — so today it is an
  API call the person makes with their own session cookie. The body has exactly
  two fields, `current` and `next`:

  ```js
  // from the person's own browser, on the site they are signed in to:
  // DevTools → Console. The session cookie rides along with `credentials`.
  fetch("/api/auth/password", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    credentials: "same-origin",
    body: JSON.stringify({current: "their-current-password",
                          next:    "their-new-password"})
  }).then(r => console.log(r.status))
  ```

  `204` means it is done. `400` means the body was refused and the reply says
  which field in Persian — the current password was wrong, or the new one is
  under the six-character floor. `401` means the session is not valid; sign in
  again. Nobody else can make this call for them: the row it changes is the one
  the cookie is signed in as.

  When it succeeds it re-verifies the current password and **ends every other
  session that person holds**, keeping the one that made the call. That is the
  answer to "someone used my laptop", and it is per-person: an administrator
  cannot set someone else's password yet.

### Cutting someone off right now

There is no screen for this yet either, and rotating `SESSION_SIGNING_KEY` is
**not** the lever — it signs the *export* session and the export URLs, not the UI
session. A UI session cookie carries an opaque id and nothing else, so the only
thing that ends one early is the database.

Setting `disabled_at` on the account does it, and does it completely: every
request re-reads the account, so the person's live sessions stop working on their
next click, they cannot sign in again, and no restart is needed.

```bash
cd /opt/inja/code-repo/deploy
docker compose exec -T ui-backend python - <<'PY'
import sqlite3, time
conn = sqlite3.connect("/state/app.db", isolation_level=None)
conn.execute("PRAGMA busy_timeout=5000")
n = conn.execute("UPDATE users SET disabled_at = ? WHERE username = ? AND disabled_at IS NULL",
                 (int(time.time()), "09123456789")).rowcount
print(f"{n} account(s) disabled")
PY
```

Replace the number with theirs; `0 account(s) disabled` means no such username or
it was already disabled. To let them back in, set `disabled_at = NULL` the same
way. Disabling does **not** release the number for someone else (see above), and
a disabled account is one of the three things a failed sign-in can mean — the
person is told only "wrong username or password", while the reason is recorded.

## The export credential (rotating it)

One shared username/password opens every published export, so changing it is the
only revocation there is: everyone holding a link shares the credential, and
there is no way to revoke one person. That is by design — the alternative was a
user list for people outside the company.

Generate a new hash with the argon2 command in
[`02-secrets-and-auth.md`](02-secrets-and-auth.md), then replace **both** lines in
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
  *does* cut them off at once — but it **changes every export URL** as well (each
  link is derived from that key), so every link handed out stops resolving and
  each department has to be exported again. Reach for it only when that is what
  you want. It does **not** touch UI sign-ins: a UI session is a row in `app.db`
  keyed by an opaque cookie, not something signed with that key.
- **A file someone already downloaded keeps opening, forever and offline.** An
  export is a standalone document; the password closes "someone forwards the
  link", never "someone forwards the file".
