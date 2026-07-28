# Export Password Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the exported documents behind one shared username/password, so a forwarded link is not enough to read a department — and make it structurally impossible for that credential to reach the admin panel.

**Architecture:** A credential of its own (`EXPORT_USERNAME` / `EXPORT_PASSWORD_HASH`), kept out of `cfg.users` so nothing that authenticates the API can ever accept it. Its session is signed with a **different itsdangerous salt** from the admin session, so neither token verifies as the other, and its cookie is scoped to `path=/exports` so it is not transmitted to the API at all. `/exports` stops being a bare `StaticFiles` mount and becomes an authenticated route.

**Tech Stack:** Python 3.11 / FastAPI / argon2 / itsdangerous, plus one small server-rendered HTML page.

**Spec:** `docs/superpowers/specs/2026-07-26-department-export-design.md` §12 (D25–D31). This reverses D6.

## Global Constraints

- **Range requests must keep working.** `StaticFiles` supports them today and **iOS Safari's PDF viewer depends on them** — the exact device the server-side PDF work exists for. Use `FileResponse`, not a plain `Response(body)`, and test a `Range` request explicitly.
- **The PDF is at the same path as the HTML** and must be gated identically, or swapping `.html` for `.pdf` walks past the gate.
- **Unset credentials close the gate** (D30): `/exports` returns 401. It must never fall back to the pre-D25 open behaviour — a misconfiguration must not silently republish every department.
- **Mount ordering stays load-bearing** (spec §2.4). `/exports` resolves before the SPA catch-all; the existing test pinning that must keep passing.
- An **admin session also opens exports** (D29). The reverse is never true.
- The filename token stays as a second layer (D25). Do not remove it.
- Persian copy exact, including ZWNJ. `from __future__ import annotations` in new modules.
- Work on `main` in the main checkout; **another person may have uncommitted work — stage only your own files**, and never commit `deploy/local/`, `control-bot/chathistorylog.txt`, or `deploy/ui-backend.offline.Dockerfile`.
- Baselines at plan start: backend **487 passed / 1 skipped**, frontend **415 across 70 files**, `npm --prefix ui run build` green.

---

## Task 1: The export credential and its session

**Files:** modify `ui-backend/inja_ui_backend/config.py`; create `ui-backend/inja_ui_backend/export_auth.py`; tests in `ui-backend/tests/test_config.py`, `ui-backend/tests/test_export_auth.py`.

**Interfaces produced:**
- `Settings.export_username: Optional[str]`, `Settings.export_password_hash: Optional[str]` — from `EXPORT_USERNAME` / `EXPORT_PASSWORD_HASH`. Both `None` when unset. **Deliberately not merged into `cfg.users`.**
- `export_auth.EXPORT_COOKIE` — cookie name, distinct from the admin one.
- `export_auth.authenticate(cfg, username, password) -> bool`
- `export_auth.issue_cookie(cfg) -> str` / `read_cookie(cfg, token) -> bool`
- `export_auth.require_export_access(request)` — accepts an export session **or** an admin session (D29).

- [ ] **Step 1: Write the failing tests.** The separation is the whole point, so test it directly: an export token must be **rejected** by `auth.read_cookie`, and an admin token must be **rejected** by `export_auth.read_cookie` — because the salts differ. Also: unset credentials never authenticate; a wrong password never authenticates; the export credential is absent from `cfg.users`.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** Reuse `argon2` verification exactly as `auth.verify_hash` does, and `URLSafeTimedSerializer` with `salt="inja-export-session"` against the same `SESSION_SIGNING_KEY`.
- [ ] **Step 4: Run the backend suite.**
- [ ] **Step 5: Commit** — `feat(export): a shared export credential, separate from the admin one`.

---

## Task 2: Guard `/exports`

**Files:** modify `ui-backend/inja_ui_backend/app.py`; create `ui-backend/inja_ui_backend/routers/export_files.py`; tests in `ui-backend/tests/test_exports_api.py`.

- [ ] **Step 1: Write the failing tests.** No cookie → 401 for both `.html` and `.pdf`. Export cookie → 200 for both. Admin cookie → 200 for both. Unset credentials → 401, not 200. `/api/...` still 404s as JSON. A `Range: bytes=0-99` request returns **206 with 100 bytes** — this is the iOS PDF viewer's path. Path traversal (`../`) is refused.
- [ ] **Step 2: Run them, confirm they fail** (today they return 200 with no cookie).
- [ ] **Step 3: Implement.** Replace the `StaticFiles` mount with a route serving `FileResponse` from `cfg.export_dir`, resolving the path safely and refusing anything outside it. Keep it registered **before** the SPA catch-all.
- [ ] **Step 4: Run the backend suite.**
- [ ] **Step 5: Commit** — `feat(export): the export files require a session`.

---

## Task 3: The login page and endpoints

**Files:** modify `ui-backend/inja_ui_backend/routers/export_files.py`; tests alongside.

- [ ] **Step 1: Write the failing tests.** An unauthenticated GET of an export returns the login page (200 HTML, not the SPA, not a JSON 401) so a staff member sees a form rather than an error. `POST /api/exports/login` with the right credential sets the cookie scoped to `path=/exports` and redirects back to the requested file; with the wrong one, re-renders with a Persian error and sets no cookie. Logout clears it.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** A small server-rendered Persian page — **not** the SPA, which is the admin application and should not be the staff entry point. Carry the originally requested path through the form so login lands the reader where they were going.
- [ ] **Step 4: Run the backend suite.**
- [ ] **Step 5: Commit** — `feat(export): a Persian login page for the export system`.

---

## Task 4: Deploy

**Files:** modify `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml`, the `config/` sample env, `docs/runbooks/02-secrets-and-auth.md`, `ui-backend/README.md`.

- [ ] **Step 1: Document how to generate the hash** — the same argon2 recipe `02-secrets-and-auth.md` already gives for `ui-users.json`.
- [ ] **Step 2: Wire the two env vars** into both stacks via the existing secrets env file. Real values never enter `config/`.
- [ ] **Step 3: Run both suites and the build.**
- [ ] **Step 4: Deploy** per `docs/runbooks/03-deploy.md`, then verify on the server: an export URL with no cookie shows the login page; logging in serves the file; a `.pdf` behaves the same; **and an export session cannot call `/api/departments`** — that last one is the property this whole change exists for.
- [ ] **Step 5: Commit** — `build(export): the export credential in both stacks`.

---

## What this deliberately does not do

An export is a standalone file (D3). A copy someone already downloaded opens forever, offline, with no server involved. This closes *"someone forwards the link"*, not *"someone forwards the file"* — worth stating plainly, because a password gate is often assumed to do both.

## Risks

| Risk | Handling |
|---|---|
| A hand-rolled file handler breaks `Range`, breaking iOS PDF viewing. | `FileResponse`; an explicit 206 test (Task 2). |
| Path traversal through the new route, where `StaticFiles` had handled it. | Resolve and confirm the path is inside `export_dir`; test with `../`. |
| A misconfiguration reopens every department. | D30 — unset credentials 401. Tested. |
| The export cookie widens into API access. | Different salt makes it cryptographically impossible; `path=/exports` means it is never sent. Both tested in Task 1, and end-to-end in Task 4 Step 4. |
