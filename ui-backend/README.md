# inja-ui-backend

Thin FastAPI service that provides JSON read/write, session auth, and git-commit
provenance for the inja food process documentation system. All state lives in the
`data-repo` filesystem (`DATA_ROOT`); the backend is stateless between requests
and communicates with the engine CLIs through subprocess calls (ARD §1).

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
| `UI_USERNAME` | yes | Login username for the single UI user |
| `UI_PASSWORD_HASH` | yes | argon2 hash of the UI password (never plaintext) |
| `SESSION_SIGNING_KEY` | yes | Secret used to sign the session cookie |
| `SESSION_TTL` | no | Session lifetime in seconds (default `86400`) |
| `UI_STATIC_DIR` | no | Built frontend directory (`ui/dist`); may be absent until Phase 6 |
| `GIT_AUTHOR_NAME` | no | Git author name for ui-edit commits (default `ui-edit`) |
| `GIT_AUTHOR_EMAIL` | no | Git author email for ui-edit commits (default `ui-edit@inja.local`) |

### Generating an argon2 password hash

```bash
python -c "import argon2,sys;print(argon2.PasswordHasher().hash(sys.argv[1]))" mypassword
```

Paste the output as `UI_PASSWORD_HASH` — never commit the plaintext password.

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
| `GET` | `/api/auth/me` | session | Return current username |
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
