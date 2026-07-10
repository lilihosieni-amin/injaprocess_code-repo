# Phase 5 — UI Backend — Design Spec

| | |
|---|---|
| **Phase** | 5 (of the PLAN.md sequence) |
| **Repo** | `code-repo/ui-backend/` |
| **Date** | 2026-07-10 |
| **Status** | Approved design; ready for implementation plan |
| **Basis** | PRD (FR-I*, FR-D*, NFR-3, AC-6/AC-8), ARD §13 (UI stack/backend/behavior), §15 (commit), §4 (data model), §8 (engine CLIs); PLAN.md §7 |
| **Depends on** | Phase-0 frozen schemas; Phase-1 engine CLIs (`allocate-id`, `merge`, `layout`, `validate`). **Not** on the pipeline. |

---

## 1. Purpose & scope

A thin **FastAPI on Uvicorn** service (Python 3.11+) that is the sole read/write surface
for the human editing loop. It:

- reads/writes the JSON under `DATA_ROOT` (the `data-repo`) with **atomic writes** and a
  **per-file lock**;
- shells out to the **engine CLIs** for everything that must stay deterministic
  (`allocate-id`, `merge accept/reject`, `layout`, `validate`) so INV-1 holds;
- makes **one `git commit` per Save** (ARD §15, `ui-edit(<id>): <action>` convention);
- authenticates a **single user** (argon2 hash + signed cookie);
- serves the **built frontend** (`ui/dist`), so no separate web service is needed.

The backend communicates with nothing over the network except the browser. It is **not**
under the Phase-3 runtime hooks (those gate only the Claude Code control-bot), so it writes
`departments/**/processes/*.json` directly — the intended design per ARD §13.1.

**In scope (v1):** read navigation data; edit/add/reposition/delete-node-as-flag; whole-doc
Save with server-side ID allocation; manual process creation; sub-process creation; **hard
delete + unlink of a whole process**; the `pending` review inbox (accept/reject via `merge`);
department-overview edit; auth; static serving.

**Out of scope (v1):** the "Push now" endpoint (deferred to Phase 7's push story); any
frontend code (Phase 6); the pipeline.

---

## 2. Contract principle — serve the frozen schema verbatim

Every response body and every accepted request body is the **raw frozen-schema JSON**
(`schemas/process.schema.json`, `overview.schema.json`, `registry.schema.json`) — **no field
renames, no reshaping**. The prototype's presentational divergences (`desc` vs `description`,
string `source` vs object `source`, `fieldFa`, `proposedRaw`, Persian numerals, Jalali dates)
are **entirely the Phase-6 frontend's responsibility**. This keeps the backend a pure data
store and the schema the single source of truth.

Concretely, the backend deals only in these shapes:
- **process**: `id, department, name, summary, source{type,ref,run}, parent, created_at,
  updated_at, idef0{inputs,controls,outputs,mechanisms}, kpis[], nodes[], edges[], pending[]`.
- **node** (activity): `id, type:"activity", label, description, actor, icom, subprocess,
  position{x,y}, layout, source{created_by,touched_by}, removed?`.
- **node** (terminal): `id:"start"|"end", type, label, position, layout, removed?`.
- **node** (junction): `id, type:"junction", junctionType(AND|OR|XOR), direction(split|join),
  position, layout, removed?`.
- **edge**: `from, to, label?`.
- **pending**: `node, field, current, proposed, source, status(open|accepted|rejected)`.
- **overview**: `department, name, sub_units[{name,description}], personnel[{role,duties[]}],
  updated_at`.

---

## 3. Module layout (one job per file)

```
ui-backend/
  pyproject.toml / requirements.txt   # FastAPI, uvicorn, argon2-cffi, itsdangerous, jsonschema(optional), pytest, httpx
  app.py            # FastAPI factory: mount routers, static files, startup config validation
  config.py         # load+validate env once at startup
  auth.py           # argon2 verify, signed-cookie issue/verify, require_session dependency
  storage.py        # path resolution, atomic write (temp + os.replace), per-file async locks, JSON I/O
  engine.py         # subprocess wrappers for allocate-id / merge / layout / validate (run in threadpool)
  gitcommit.py      # stage paths + one commit with ui-edit author/message
  models.py         # Pydantic request/response bodies
  routers/
    auth.py         # /api/auth/{login,logout,me}
    departments.py  # departments list, overview get/put, process list
    processes.py    # process get/create/save/delete/relayout/pending
  tests/
    conftest.py     # temp DATA_ROOT seeded from golden fixtures; git-init helper
    test_*.py
config/ui-backend.env.example   # updated env surface
```

Rationale: `storage`, `engine`, `gitcommit`, and `auth` are each independently testable and
have no knowledge of HTTP; the routers wire them to FastAPI. A router change can't break the
write path and vice-versa.

---

## 4. API surface

All routes are under `/api`. Every route except `POST /api/auth/login` requires a valid
session (the `require_session` dependency); missing/invalid/expired → `401`.

### 4.1 Auth
| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, password}` | Verify argon2 hash; on success set signed httponly cookie, return `{username}`. On failure → `401`. |
| POST | `/api/auth/logout` | — | Clear cookie. |
| GET  | `/api/auth/me` | — | `{username}` if session valid, else `401`. |

### 4.2 Read
| Method | Path | Returns |
|---|---|---|
| GET | `/api/departments` | `[{code, name, count}]` — `registry.json` joined with a count of `processes/*.json` files per department. |
| GET | `/api/departments/{code}/overview` | The department `overview.json`, or `404` if absent. |
| GET | `/api/departments/{code}/processes` | Array of **full** process docs in that department (dataset is small; the frontend searches/filters client-side). |
| GET | `/api/processes/{id}` | The full process doc, or `404`. |

### 4.3 Write (each ends in exactly one commit)
| Method | Path | Body | Effect |
|---|---|---|---|
| PUT | `/api/processes/{id}` | full process doc | **Save** — see §5. |
| POST | `/api/processes` | `{department, name?}` **or** `{department, name?, parent:{process,node}}` | Create process, or create sub-process — see §6. |
| DELETE | `/api/processes/{id}` | — | **Hard delete + unlink** — see §7. |
| POST | `/api/processes/{id}/relayout` | full working process doc | Compute-only re-layout — see §8. Returns repositioned doc; **does not write**. |
| POST | `/api/processes/{id}/pending/{index}` | `{decision:"accept"\|"reject"}` | Resolve a conflict via `merge` — see §9. |
| PUT | `/api/departments/{code}/overview` | full overview doc | Validate against `overview.schema.json`, stamp `updated_at`, atomic write, commit `ui-edit(<code>): update overview`. |

### 4.4 Static
FastAPI serves `UI_STATIC_DIR` (→ `ui/dist`) for the SPA. Assets serve unauthenticated (the
shell itself carries no data); the shell calls `/api/auth/me` on load and shows the login
screen until authenticated. If `UI_STATIC_DIR` is absent (before Phase 6), static mounting is
skipped without error.

---

## 5. The Save path (`PUT /api/processes/{id}`) — the critical flow

Receives the whole document the editor holds in memory. Steps, under the process file's lock:

1. **Path is authoritative.** Force `doc["id"] = {id}` and `doc["department"] = {dept-of-id}`
   from the URL, **ignoring any `id`/`department` in the body**. A Save can never rename or
   re-home a process.
2. **Load the on-disk version** (if any) as the allocation baseline and the position/existence
   reference for step 4.
3. **Allocate real IDs for new (temp-keyed) nodes — INV-1, feed-forward via temp file.**
   A "new" node is any node whose id does not match the real pattern (`…-nNNN` for activities,
   `…-jN` for junctions; `start`/`end` are fixed). Maintain a **working copy** of the doc.
   For each new node, in document order:
   a. Write the current working copy to a **private temp file** (backend-owned, outside
      `data-repo`).
   b. Shell `allocate-id box <tempfile>` (activity) or `allocate-id junction <tempfile>`
      (junction). The CLI scans the doc for the max existing `-nNNN`/`-jN` and returns the next.
   c. Assign the returned id to the node, rewrite every `edges[].from/to` that referenced the
      old temp key, and **leave the node (now with its real id) in the working copy** so the
      next allocation's scan sees it.
   > Mechanism decision: we use the **temp-file feed-forward** approach rather than an on-disk
   > `reserved`-set approach, because `allocate-id box|junction` take a file path and have **no**
   > `reserved` parameter (only `next_process_id` does). Feed-forward needs **no engine change**
   > and keeps the INV-1 boundary hard (the backend never invents a number; every id comes from
   > the CLI). The temp file is deleted after the Save.
4. **Enforce `layout:"manual"` for user-touched nodes.** So a later `merge` never moves them
   (FR-D9/D10, AC-5): for every node that is **new** (not on disk before) **or** whose
   `position` differs from the on-disk version, set `layout = "manual"`. The backend enforces
   this regardless of what the client sent.
5. **Stamp provenance.** Set `updated_at` to now (ISO-8601 `…Z`). For every activity node that
   is **new** or whose content/position **differs from the on-disk version**, append
   `"ui-edit"` to its `source.touched_by` (deduplicated); a newly added activity node gets
   `source = {created_by:"ui-edit", touched_by:["ui-edit"]}`. `created_at` is preserved from
   disk (or set to now for a brand-new file, though normal creation is §6).
6. **Validate** the finished doc against `process.schema.json` (via the `validate` CLI). On
   failure → **`422`** surfacing the validator message, and **nothing is written**.
7. **Atomic write** (temp file + `os.replace`) to `departments/{dept}/processes/{id}.json`.
8. **Commit** `ui-edit(<id>): save` (see §10), then release the lock and return the saved doc.

Cancel in the UI simply discards local state; the backend never sees it. Node deletion is a
flag: the client sends the node with `removed:true` (INV-4) and Save persists it like any edit.

**On direct edits vs. pending:** a UI user editing a *filled* field is the human authority
(INV-5 is satisfied by their action), so the Save overwrites directly — it does **not** create
a `pending` row. `pending` rows are created only by the pipeline's `merge`; the UI *consumes*
them via §9.

---

## 6. Create process / sub-process (`POST /api/processes`)

**Create process** — body `{department, name?}`:
1. Validate `department` exists in `registry.json` (else `400`).
2. Shell `allocate-id process <department>` → new `{dept}-NNN` (INV-1).
3. Build a skeleton doc: the allocated id; `department`; `name` (or a default);
   `summary:""`; `source:{type:"manual", ref:null, run:null}`; `parent:null`;
   `created_at=updated_at=now`; empty `idef0`/`kpis`/`pending`; `nodes` = a `start` and an
   `end` terminal with default positions and `layout:"manual"`; `edges` = `[{from:"start",
   to:"end", label:""}]`.
4. Validate → atomic write → commit `ui-edit(<id>): create process` → return the doc.

**Create sub-process** — body `{department, name?, parent:{process, node}}`:
- As above (skeleton child with `parent` set), **and** open the parent process file under its
  lock and set `nodes[<parent.node>].subprocess = <child id>`. Validate **both** docs, write
  **both** atomically, and make **one** commit `ui-edit(<childId>): create sub-process of
  <parent.process>`. Return the child doc.
- `department` for the child defaults to the parent's department.

---

## 7. Delete process (`DELETE /api/processes/{id}`) — hard delete + unlink

Human-initiated hard delete (distinct from the pipeline's INV-4 "never auto-delete"):
1. Under a global write lock (this touches many files): confirm the file exists (else `404`).
2. Delete `departments/{dept}/processes/{id}.json`.
3. **Unlink references** across all processes: for every process, set any
   `nodes[].subprocess == id` to `null`, and set `parent` to `null` where
   `parent.process == id`. Atomic-write each changed file; validate each.
4. **One commit** `ui-edit(<id>): delete process` covering the deletion and all unlink edits.

---

## 8. Re-layout (`POST /api/processes/{id}/relayout`) — compute-only

Takes the current (possibly **unsaved**) working doc in the body, so it operates on the
editor's in-memory state, not just what's on disk:
1. Write the working doc to a private temp file.
2. Shell the `layout` CLI against it; it returns/repositions nodes per the deterministic
   serpentine algorithm and marks them `layout:"auto"`.
3. Return the repositioned doc to the client. **No file is written and no commit is made** —
   the user persists (or cancels) via the normal Save path.

---

## 9. Conflict inbox (`POST /api/processes/{id}/pending/{index}`) — AC-6

The inbox itself is a **read** concern: the frontend reads `process.pending` and shows the
rows with `status == "open"` as current-vs-proposed. Resolution goes through the engine:
1. Body `{decision}` ∈ `{"accept","reject"}`.
2. Shell `merge accept --process <id> --index <index>` (or `merge reject …`). Verified
   behavior of `merge.resolve_pending`: **accept** writes `pending[index].proposed` into
   `nodes[<row.node>][<row.field>]` and sets `status="accepted"`; **reject** sets
   `status="rejected"` and leaves the node untouched; both stamp `updated_at`; it **refuses**
   (non-zero) if the row is not `open`. The row is **not removed** — status flips in place, so
   history is retained.
3. On the CLI's non-zero exit (e.g., already-resolved) → `409` with the message.
4. **Commit** `ui-edit(<id>): accept pending #<index>` (or `reject`) → return the updated doc.

The original value is never auto-changed: only an explicit `accept` applies the proposal
(AC-6, INV-5).

---

## 10. Storage, concurrency, git, errors

**Atomic write.** Always write to a temp file in the same directory then `os.replace` onto the
target — no reader ever sees a partial file.

**Per-file lock.** An `asyncio.Lock` keyed by absolute file path (a process-wide registry)
serializes writes to a single file; multi-file operations (sub-process, delete-unlink) take
the locks they need (ordered to avoid deadlock) or a coarse global write lock. Even though the
system is single-user, AC requires this tested under concurrent writes to one process file.

**Git.** `gitcommit.py` stages exactly the changed paths and makes one commit per write
operation, author from `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` (defaulting to a `ui-edit` identity),
message `ui-edit(<id>): <action>` (ARD §15). A commit is made **only after** a successful
atomic write. Push is **not** done here (Phase 7).

**Error taxonomy.**
| Code | When |
|---|---|
| 400 | malformed body; unknown `department` on create |
| 401 | no/invalid/expired session |
| 404 | process/overview/department not found |
| 409 | lock-acquire timeout; `merge` refusing an already-resolved row |
| 422 | schema validation failed (body echoes the `validate` message); nothing written |
| 500 | unexpected engine CLI failure |

---

## 11. Auth (NFR-3, AC-8)

- Single user from env: `UI_USERNAME` + `UI_PASSWORD_HASH` (argon2 via `argon2-cffi`). The
  plaintext password is **never** stored, logged, or returned.
- `POST /api/auth/login` verifies the hash; on success issues a **signed, httponly** session
  cookie (`itsdangerous` serializer keyed by `SESSION_SIGNING_KEY`, expiry `SESSION_TTL`).
- `require_session` verifies the cookie signature and expiry on every data route; failure → `401`.
- `POST /api/auth/logout` clears the cookie.
- The hash and signing key live **outside `data-repo`** (server env / Docker secret).

---

## 12. Config / env surface (`config/ui-backend.env.example`)

| Var | Meaning |
|---|---|
| `DATA_ROOT` | path to `data-repo` |
| `UI_USERNAME` | the single UI user's name |
| `UI_PASSWORD_HASH` | argon2 hash of the password (never plaintext) |
| `SESSION_SIGNING_KEY` | secret for the signed session cookie |
| `SESSION_TTL` | session lifetime (e.g. seconds/`24h`); optional, sane default |
| `UI_STATIC_DIR` | path to the built frontend (`ui/dist`); optional, may be absent until Phase 6 |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | identity for `ui-edit` commits; optional defaults |

Startup validation (`config.py`) fails fast if `DATA_ROOT` is missing or the auth vars are
unset, so the service never runs half-configured.

---

## 13. Testing (TDD, pytest)

Fixtures: a temp `DATA_ROOT` copied from the Phase-0 golden fixtures and `git init`-ed per test.

- **storage** — atomic write leaves no partial file; per-file lock serializes concurrent writes
  to one process file (AC requirement).
- **engine wrappers** — real CLIs against fixtures: `allocate-id` feed-forward yields
  sequential ids for multiple new nodes in one Save; `merge accept/reject` effects; `validate`
  pass/fail; `layout` repositions.
- **Save path** — path-authoritative id/department (body values ignored); `layout:"manual"`
  stamped on added/moved nodes; schema-invalid doc → `422` and file unchanged; edge refs
  rewritten when temp keys are replaced.
- **create / sub-process / delete-unlink** — ids come from `allocate-id`; sub-process links
  parent node + one commit; delete removes file and nulls all references in one commit.
- **AC-6** — seed an `open` pending row → accept → node field updated + `status:"accepted"` +
  committed; reject → `status:"rejected"`, node untouched; re-resolving → `409`.
- **AC-8** — no cookie → `401`; wrong password → `401`; correct → cookie issued; stored hash
  never equals plaintext.

**Exit criteria (from PLAN.md §7):**
- **AC-6** — a conflict is presented as current-vs-proposal and resolvable via accept/reject;
  the original value is never auto-changed.
- **AC-8 (UI half)** — no access without correct username/password; password never stored
  plaintext.
- Atomic-write + lock behavior tested under concurrent writes to one process file.

---

## 14. Traceability

| Requirement | Realized by |
|---|---|
| INV-1 (deterministic IDs) | §5 step 3, §6 — all ids via `allocate-id` CLI |
| INV-4 (no auto-deletion) | §5 node delete = `removed` flag (pipeline never deletes; §7 delete is an explicit human action) |
| INV-5 (human approval) | §9 accept required to apply a proposal; §5 direct edits are the human's own action |
| FR-I2/I3 (view/edit, navigation) | §4 read routes + §5 Save |
| FR-I4/FR-M3 (review inbox) | §9 |
| FR-I5/FR-D2 (manual creation) | §6 |
| FR-D6/D7 (sub-process) | §6 sub-process |
| FR-D9/D10, AC-5 (layout preserved) | §5 step 4 (`layout:"manual"`), §8 relayout via `layout` CLI |
| ARD §15 (one commit per Save) | §10 git |
| NFR-3, AC-8 (auth) | §11 |
