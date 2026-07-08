# code-repo — Restaurant Process Documentation System (inja food)

Development instructions for the application code. This is **not** the extraction
brain — extraction rules live in the separate `data-repo` (INV-2: code/data separation).

## Layout (ARD §2.1)

| Path | Role |
|---|---|
| `upload-bot/` | Bot 1: raw voice/file intake from Telegram (Python); `pip install -e upload-bot`; env vars: `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_ID`, `DATA_ROOT`, `TELEGRAM_API_BASE_URL` (optional); run: `upload-bot` or `python -m upload_bot` |
| `control-bot/` | Config & launch profile for `claude-code-telegram` (no custom code) |
| `engine/` | Deterministic CLIs: `allocate-id`, `merge`, `layout`, `transcribe`, `validate`; installed via `pip install -e engine`; `SCHEMA_DIR` locates schemas at runtime |
| `ui/` | React + TypeScript + Vite + @xyflow/react frontend |
| `ui-backend/` | Thin FastAPI backend: JSON read/write + auth, serves built frontend |
| `deploy/` | docker-compose stack, Dockerfiles, proxy config |
| `config/` | Sample env files — **no real secrets ever** |
| `schemas/` | Frozen JSON data contract (draft 2020-12); validated by `make test` |

## Rules

- All components communicate **only through the filesystem** (`data-repo` via `DATA_ROOT`);
  no direct network calls between components (ARD §1).
- IDs are generated only by the `allocate-id` CLI, never by an LLM (INV-1).
- Real secrets live outside both repos (server env / Docker secrets), never committed.
- Engine CLIs must be deterministic and check their preconditions (ARD §7).

## Reference documents

PRD and ARD live one directory up from this repo (`../PRD.md`, `../ARD.md`).
