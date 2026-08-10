# inja-ui-backend

Thin FastAPI service that provides JSON read/write, session auth, and git-commit
provenance for the inja food process documentation system. Process content lives
in the `data-repo` filesystem (`DATA_ROOT`); accounts, sessions and the activity
record live in a SQLite store at `APP_DB`, deliberately outside it. The backend
communicates with the engine CLIs through subprocess calls (ARD §1).

---

## Install

```bash
# backend
pip install -e ui-backend

# engine CLIs must be on PATH (allocate-id, merge, layout, validate …)
pip install -e engine
```

---

## Required environment variables

Copy `config/ui-backend.env.example` and fill in the blanks:

| Variable | Required | Description |
|---|---|---|
| `DATA_ROOT` | yes | Absolute path to the data-repo root directory |
| `SCHEMA_DIR` | yes | Absolute path to `code-repo/schemas` (frozen JSON schemas) |
| `SESSION_SIGNING_KEY` | yes | Secret signing the **export** session cookie and the export URL tokens. The UI session cookie carries an opaque session id and is not signed with it. |
| `APP_DB` | no | The operational store — accounts, roles, scopes, sessions, activity record. Opened and migrated at startup. Default: `DATA_ROOT/../app.db`. Point it **outside `DATA_ROOT`**: inside, the store would be committed and pushed by `git-push`, password hashes and all. Under Docker the compose files set `/state/app.db` on the `ui-state` volume — unset there, the default resolves to `/app.db` in the container's throwaway layer and every account vanishes on the next recreate. |
| `SESSION_TTL` | no | Session lifetime in seconds (default `86400`). Absolute from issue, never sliding. |
| `TRUSTED_PROXY_HOPS` | no | How many reverse proxies stand in front of this process (default `0`). Decides which `X-Forwarded-For` entry is recorded as the client address on the session row and every activity row. `0` ignores the header and records the TCP peer — right for a direct host run, and wrong behind a proxy, where it records the bridge address for everyone. The deployed stack has one (Caddy) and sets `1`. Too high a value on a directly reachable process lets a caller dictate the address recorded against them. |
| `UI_STATIC_DIR` | no | Built frontend directory (`ui/dist`); may be absent until Phase 6 |
| `EXPORT_DIR` | no | Directory the generated export documents are written to, and served from at `/exports`. **Unset = the department export feature is off**: the export endpoint answers `503` and the UI says exporting is unavailable. In Docker the compose file supplies `/exports` (a named volume, deliberately outside the data-repo). |
| `UI_EXPORT_TEMPLATE_DIR` | no | Directory holding the pre-built export templates (`flowchart.html`, `steps.html`). The image bakes these in and sets this variable itself; set it only for a host run, to `ui/dist-export` after `npm --prefix ui run build`. Unset (or missing templates) = the export endpoint answers `503`. |
| `CHROMIUM_PATH` | no | Absolute path to a Chromium binary that supports the CDP `Page.printToPDF` command. Set, the export endpoint prints each generated document to a `.pdf` beside its `.html`, and the document's «چاپ / PDF» button hands that over — the only way the flowchart prints correctly on iOS Safari. **Unset = no PDFs**: exports publish exactly as before and the button falls back to `window.print()` (D21/D20 — a missing renderer never fails an export). The Docker image installs Debian `chromium` and sets this to `/usr/lib/chromium/chromium` itself; set it only for a host run. Debian's smaller `chromium-shell` does **not** work — it is a content_shell build with no printing compiled in and answers `Page.printToPDF` with `-32601 … wasn't found`. |
| `EXPORT_USERNAME` | no | Username of the one shared credential that opens a published export (`/exports/…`). Deliberately not one of the UI users: an export session opens exports only, never `/api/*`. |
| `EXPORT_PASSWORD_HASH` | no | argon2 hash of that export password (never plaintext) — see the recipe below. **Both unset = the gate is closed**: `/exports` answers `401` to everyone except a signed-in UI user (D29 — an admin already sees everything), and no login form is offered. An unset credential never falls back to open access, and never blocks startup — the rest of the UI serves normally. |
| `GIT_AUTHOR_NAME` | no | Git author name for ui-edit commits (default `ui-edit`) |
| `GIT_AUTHOR_EMAIL` | no | Git author email for ui-edit commits (default `ui-edit@inja.local`) |

### Creating a user

Users are rows in `APP_DB`, not environment variables. The first Editor — and the
only origin of the `edit`, `confirm` and `set_visibility` capabilities — comes
from the `inja-seed` console script installed with this package:

```bash
inja-seed --db "$APP_DB" --username 09123456789 --name "Full Name" --password 'a-real-password'
```

Exit `0` created the Editor, `1` means one was already active and nothing was
written, `2` is a refusal on stderr (password under six characters, or the number
belongs to an account that is not an active Editor). See
`docs/runbooks/06-changing-users.md`.

### Generating an argon2 password hash

Only the **export** credential needs one by hand; `inja-seed` hashes a user's
password itself.

```bash
python -c "import argon2,sys;print(argon2.PasswordHasher().hash(sys.argv[1]))" mypassword
```

Paste the output as `EXPORT_PASSWORD_HASH` — never commit the plaintext password.
In a deployment it lives in the server's secrets env file, outside this repo
(`docs/runbooks/02-secrets-and-auth.md`).

---

## Run

```bash
uvicorn inja_ui_backend.app:app --host 0.0.0.0 --port 8000
```

The module-level `app` is built lazily: it is `None` when `DATA_ROOT` is not set
(safe for test imports without a real data directory).

---

## API route table

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Issue session cookie |
| `POST` | `/api/auth/logout` | session | Clear session cookie |
| `GET` | `/api/auth/me` | session | Return the signed-in user's descriptor |
| `POST` | `/api/auth/password` | session | Change your own password; revokes your other sessions |
| `GET` | `/api/departments` | session | List all departments |
| `GET` | `/api/departments/{code}/overview` | session | Read department overview graph |
| `PUT` | `/api/departments/{code}/overview` | session | Save department overview graph |
| `GET` | `/api/departments/{code}/processes` | session | List process stubs for a department |
| `GET` | `/api/processes/{pid}` | session | Read a single process document |
| `POST` | `/api/processes` | session | Create a new process (or sub-process) |
| `PUT` | `/api/processes/{pid}` | session | Save (full replace) a process document |
| `DELETE` | `/api/processes/{pid}` | session | Hard-delete a process and unlink it |
| `POST` | `/api/processes/{pid}/relayout` | session | Compute-only relayout (no write) |
| `POST` | `/api/processes/{pid}/pending/{index}` | session | Accept or reject a pending conflict |

Static files (built frontend) are served at `/` when `UI_STATIC_DIR` is set and
the directory exists. The `/api/*` routes always take precedence.
