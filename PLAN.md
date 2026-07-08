# Development Plan — Restaurant Process Documentation System (inja food)

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 2026-07-07 |
| **Status** | Approved phase structure; ready to expand per-phase plans |
| **Basis documents** | PRD v0.2 (`PRD.md`), ARD v0.1 (`ARD.md`) |
| **Companion role** | Third in the chain: PRD (what/why) → ARD (how) → **this (in what order, and how we know each part is done)** |

> The architecture is already locked by the ARD. This document does not re-decide
> design; it defines **build sequence, dependencies, deliverables, and exit criteria**.
> Each phase's exit criteria are tied to the PRD's Acceptance Criteria (AC-*) so
> "done" is measurable, not asserted.

---

## 1. Strategy

**Foundation-first.** Components are built in dependency order so that each layer is
testable before anything depends on it. The deterministic engine (the trust anchor for
INV-1) comes first; the intelligence layer and the human-facing surfaces build on top of it.

**Two repos, two build activities** (ARD §2, §8). This plan spans both:

- `code-repo` (this repo) — the application: engine CLIs, upload bot, control-bot config,
  UI, UI backend, deploy. Built with Superpowers (session type 1).
- `data-repo` — the extraction "brain": agents, skills, `CLAUDE.md`, runtime hooks, and
  the data itself. Built in a normal developer session (session type 2), Superpowers off.

The two never merge; they communicate only through the filesystem (`DATA_ROOT`). The plan
notes, per phase, which repo the work lands in.

**The contract comes before the code.** Every component reads/writes the same JSON on disk
and makes no direct network calls to any other component (ARD §1). So Phase 0 freezes that
JSON contract first; after that, phases can proceed with confidence that the shapes they
produce and consume agree.

**Test-first for anything deterministic.** The engine CLIs, the merge/conflict logic, the
layout algorithm, and the backend write path are all deterministic and are built
test-first (Superpowers TDD). The LLM stages are validated against fixtures and the ACs,
not unit-asserted line by line.

### Phase dependency graph

```
        ┌─────────────────────────────────────────────┐
        │  Phase 0 — Foundations & data contract        │  (both repos)
        └───────────────┬───────────────┬───────────────┘
                        │               │
                        ▼               ▼
        ┌───────────────────────┐   ┌───────────────────┐
        │ Phase 1 — Engine CLIs  │   │ Phase 2 — Upload   │  (code-repo)
        │ allocate-id·layout·    │   │ bot                │
        │ merge·transcribe       │   └─────────┬─────────┘
        └───────────┬───────────┘             │
                    │  (CLIs on PATH)          │ (real audio + filenames)
                    ▼                          ▼
        ┌───────────────────────────────────────────────┐
        │ Phase 3 — Extraction brain (data-repo)          │
        │ classify·extract·summarize · skills · hooks     │
        └───────────────┬───────────────────────────────┘
                        ▼
        ┌───────────────────────┐
        │ Phase 4 — Control bot  │  (code-repo config)
        └───────────┬───────────┘
                    │
   ┌────────────────┴───────────────┐
   ▼                                ▼
┌───────────────────┐        (Phases 5–6 depend on the
│ Phase 5 — UI backend│         contract from Phase 0 and
└─────────┬─────────┘          engine CLIs from Phase 1,
          ▼                    not on the pipeline)
┌───────────────────┐
│ Phase 6 — UI front │
└─────────┬─────────┘
          ▼
┌───────────────────────────────────────┐
│ Phase 7 — Deployment & operations       │  (code-repo deploy/)
└───────────────────────────────────────┘
```

Phases 5–6 (UI) depend only on the frozen contract (Phase 0) and `allocate-id` (Phase 1),
**not** on the pipeline. They can begin as soon as Phase 1 lands and run in parallel with
Phases 3–4 if capacity allows. The default ordering below is the single-developer serial path.

---

## 2. Phase 0 — Foundations & data contract

**Repo:** both. **Goal:** freeze the shared JSON contract and stand up the skeletons so
every later phase agrees on shapes and has fixtures to test against.

**Workstreams**

1. **JSON contract as machine-checkable schemas.** Turn the ARD §4/§6 shapes into
   validatable schemas (JSON Schema) committed to `code-repo/schemas/` (enforced by code; INV-2 keeps them out of runtime's reach):
   - `process.json` (ARD §4.3) — nodes/edges/idef0/kpis/pending/source/layout.
   - `overview.json` (ARD §4.4).
   - `registry.json` (ARD §4.5) — the nine departments with `code`/`name`.
   - `segments.json` (ARD §5.2) — classify output.
   - extract **candidate graph** and **update delta** (ARD §5.4, §6.2).
   - `runs/{name}/meta.json`, `conflicts.json` (ARD §2.2).
2. **data-repo skeleton.** Directory layout exactly per ARD §2.2 (`departments/`,
   `meetings/`, `runs/`, `.staging/`, `.claude/` dirs), `.gitignore` (`.staging/`, secrets),
   an initial `registry.json`, and a placeholder `CLAUDE.md` (filled in Phase 3).
3. **Fixtures.** A tiny hand-authored corpus: one sample transcript, one `segments.json`,
   one candidate graph, one update delta, and 2–3 golden `process.json` files. These are the
   test oracle for Phases 1, 5, 6. The design prototype's `buildData()`
   (`ui/design/…dc.html`) is a useful cross-check: its sample `process.json` shapes
   (nodes/edges/idef0/kpis/pending/parent/source) already track ARD §4.3 and can seed the
   golden files. Note UI-only presentation concerns it introduces — Persian numerals and
   **Jalali** date display — are formatting done in the UI (Phase 6); the stored data stays
   as the ARD defines it (ISO timestamps, Latin digits).
4. **Tooling.** Python env strategy (`uv`/venv, pinned), test runners (pytest for
   Python engine + backend; vitest for UI), lint/format config, and a `Makefile`/task
   runner so every component builds and tests the same way.
5. **Config surface.** Confirm the `config/*.env.example` files enumerate every variable
   each component needs (no real secrets — CLAUDE.md rule).

**Deliverables:** schemas in `code-repo/schemas/` + fixtures in `code-repo/tests/fixtures/`; (data-repo skeleton + `registry.json` already done, commit `84079d7`);
tooling and CI-lite scripts in `code-repo`.

**Exit criteria**
- Every schema validates its corresponding fixture and rejects a deliberately broken copy.
- `registry.json` lists all nine departments (ARD §4.5); adding a tenth is a one-record edit (NFR-8).
- A developer can run "build + test" for at least one component with a single command.

**Risks/open items pulled forward:** decide inline-vs-GCS audio passing and the exact
Gemini model only affects Phase 1's `transcribe`; the sub-process threshold (ARD §18)
affects Phase 3 — both are noted in the risk register (§10), not blockers here.

---

## 3. Phase 1 — Deterministic engine CLIs

**Repo:** `code-repo/engine/`. **Goal:** the deterministic trust anchor (INV-1). Built
test-first, in dependency order. Installed as pinned CLIs on PATH, **outside** the runtime
`APPROVED_DIRECTORY` (ARD §8) so runtime can never edit them.

**Build order (dependencies flow downward)**

1. **`allocate-id`** (ARD §4.1) — the ONLY source of IDs, for all three write paths.
   "Scan disk, highest existing number + 1," no counter file, deleted IDs never reused.
   Process `{dept}-{NNN}`, box `{id}-n{NNN}`, junction `{id}-j{N}`.
   *Test:* max+1 across existing files; gap after deletion is not reused; empty department starts at 001.
2. **`layout`** (ARD §9) — serpentine (boustrophedon) LTR; rows fill to page width then
   wrap; `layout: manual` nodes never moved; branches placed near their junction.
   *Test:* deterministic positions for a known graph; manual nodes untouched; wrap at width boundary.
3. **`merge`** (ARD §5.5, §6) — the heart of determinism. Applies an extract delta:
   assigns real IDs via `allocate-id`, preserves existing IDs/positions (FR-M2), enrich fills
   only EMPTY fields, a change to a filled value becomes a `pending` row (FR-M3), removed
   items are flagged not deleted (FR-D8/INV-4), runs `layout` for position-less nodes with
   **local** re-layout on middle insertion (ARD §6.4). Precondition gate: refuses to run
   without confirmed segments (ARD §7).
   *Test:* new-process create; update delta round-trip preserving IDs/positions; filled-value
   change lands in `pending` and leaves original untouched (AC-6 at the CLI level); flag-removed
   never deletes; middle insertion re-lays out only downstream.
4. **`transcribe`** (ARD §5.1) — Gemini-on-Vertex + idempotency pre-check.
   Skips Vertex entirely if `transcripts/{basename}.txt` exists (FR-P2); large files via
   GCS/Vertex upload (NFR-2); the Persian speaker-separated system prompt lives here; the
   Vertex call is isolated behind a seam so tests mock it and only integration tests hit real Vertex.
   *Test (unit):* idempotency pre-check short-circuits; prompt assembled correctly; chrome-
   stripping logic on a sample with a known preamble. *Integration (manual/gated):* real Vertex call.

**Deliverables:** four tested CLIs with `--help`, precondition checks, and non-zero exit on
precondition failure (ARD §7). A short install/version note recorded in `data-repo` (ARD §8).

**Exit criteria**
- All four CLIs pass their unit suites against Phase-0 fixtures.
- `merge` demonstrably realizes FR-M2/FR-M3/FR-D8 on fixtures (the AC-6 mechanism).
- Runtime cannot mutate the CLIs (they live outside `APPROVED_DIRECTORY`) — verified in Phase 7 deploy.

Implemented in `docs/superpowers/plans/2026-07-07-phase-1-engine-clis.md`; `transcribe`'s real Vertex call is a deferred integration test (GCP not yet set up).

---

## 4. Phase 2 — Upload bot

**Repo:** `code-repo/upload-bot/` (custom Python). **Goal:** the sole raw-intake path
(FR-U8); no processing.

**Workstreams**
- **Conversation flows** (FR-U1…U3): choose voice/file; file path = one department for the
  whole batch → many files → done → confirm → store in `attachments/`; voice path = date →
  multiple departments → send → store in `meetings/audio/`.
- **Deterministic naming** (FR-U4, ARD §4.2): `{depts}-{date}`, dept codes joined by `_`,
  same-day repeat gets `-02`. Generated by the bot, never by an LLM.
- **Staging & finalize** (FR-U7): hold in `.staging/` until confirmation, then atomic move.
- **Registry validation** (FR-U6): department must exist in `registry.json`.
- **Copyable identifier** (FR-U5) on success.
- **Access control** (NFR-1): the bot's own allowlist; unauthorized IDs silently rejected.
- **Large files** (NFR-2): configured against the **local Bot API server** (`tdlib/
  telegram-bot-api`, 2 GB) so >20 MB meeting audio downloads succeed.

**Deliverables:** a durable Python bot with unit-tested naming/validation/staging logic and
a documented env surface (`config/upload-bot.env.example`).

**Exit criteria**
- **AC-1:** a large voice uploaded from Telegram is stored on the server with the correct
  deterministic name and a copyable identifier returned.
- Unauthorized Telegram ID gets no reply (AC-8, bot half).
- Naming/validation/staging covered by unit tests without touching Telegram.

Implemented in `docs/superpowers/plans/2026-07-08-phase-2-upload-bot.md`; deterministic logic unit-tested via `make test`; live Telegram flow is READY for manual verification — AC-1 is pending the user's live run and has not yet been performed.

---

## 5. Phase 3 — Extraction brain

**Repo:** `data-repo/.claude/` + `data-repo/CLAUDE.md`. **Goal:** the intelligence layer
that orchestrates the Phase-1 CLIs into the five-stage pipeline (ARD §5). Built in a normal
developer session (Superpowers off) so its skills don't leak into runtime.

**Workstreams**
- **Agents** (`data-repo/.claude/agents/`, all Opus 4.8):
  - `classify` (FR-P3) — segment transcript into processes; label new/update/unchanged;
    match against existing `processes/`. Reads the file itself; content never enters the
    main session (NFR-6). Output `segments.json`.
  - `extract` (FR-P5, FR-D5) — per-process subagent (parallel via `Task`), reads only its
    own segment; produces a candidate graph with **temporary** node keys (never final IDs)
    or, for updates, a delta. `idef-extraction` preloaded.
  - `summarize` (FR-P6) — build/update `overview.json`.
- **Skills** (`data-repo/.claude/skills/`):
  - `process-voice` — the playbook: drives the five stages, owns the **human checkpoint**
    (FR-P4/INV-5) and the end-of-run **conflict report** (FR-M4), handles multi-department
    fan-out (FR-P8) and re-run artifact placement (FR-P9).
  - `idef-extraction` — IDEF0/IDEF3 knowledge + `process.json` schema + the no-fabrication
    rule (INV-3), preloaded into `extract`.
- **`CLAUDE.md`** — invariants and facts (the weak-but-baseline ladder rung, ARD §7).
- **Runtime hooks** (ARD §7, the hard guarantee — PreToolUse exit code 2):
  - block direct writes to `departments/**/processes/*.json` except via `merge` (INV-1, AC-7);
  - block writes/edits to `.claude/**` and `CLAUDE.md` at runtime (INV-2, AC-7);
  - block any write outside `data-repo`.

**Deliverables:** the agents, skills, `CLAUDE.md`, and hooks, exercised end-to-end against
the Phase-0 fixtures and at least one real transcript.

**Exit criteria**
- **AC-2:** starting from an identifier, the pipeline reaches the checkpoint and, after
  confirmation, produces valid IDEF0/IDEF3 processes recorded to disk + committed.
- **AC-3:** re-processing the same voice creates no rework/cost/duplicate (transcribe
  idempotency + classify "unchanged" both exercised).
- **AC-4:** a multi-department voice produces separate correct output per department.
- **AC-7:** the hooks actually block a direct `processes/*.json` write and a `.claude/` edit
  (tested by attempting them).

Implemented in `docs/superpowers/plans/2026-07-08-phase-3-extraction-brain.md` (lands in
`data-repo`, branch `phase-3-extraction-brain`). Authored: `idef-extraction` + `process-voice`
skills, `classify`/`extract`/`summarize` agents, `CLAUDE.md`, and the `PreToolUse` guard hook
(13/13 pytest passing). Mechanics verified in-session against the real `dining-2026-05-06`
transcript: transcribe idempotency (AC-3 half); `classify`→schema-valid `segments.json` with
true-department assignment spanning cashier/management beyond the `dining` tag (AC-4 basis);
`extract`→schema-valid candidate (XOR junction, temp keys, sub-process flagged); `merge`→valid
`cashier-001.json` with allocated IDs + serpentine layout (AC-2 mechanics); re-run marks the
built process `unchanged`/`cashier-001` with no duplicate (AC-3); guard blocks a
`processes/*.json` write and a `.claude/` edit while allowing the `merge` CLI (AC-7). The
**full Telegram-driven run (AC-2 end-to-end) is deferred to Phase 4** (control bot), per this
table's "driven via Phase 4" note.

---

## 6. Phase 4 — Control bot

**Repo:** `code-repo/control-bot/` (config only, no custom code). **Goal:** bridge the brain
to Telegram via `RichardAtCT/claude-code-telegram` on the locked runtime profile (ARD §3, §12).

**Workstreams**
- Install from the **tagged** version (`@v1.6.0`), not `main`.
- The locked runtime profile: `APPROVED_DIRECTORY=data-repo`, `AGENTIC_MODE=false`,
  `CLAUDE_ALLOWED_TOOLS` minimum set, SDK-first/CLI-fallback, no plugins (Superpowers must
  not leak), `ENABLE_FILE_UPLOADS=false`, budgets/timeouts sized for Opus, hooks active.
- `ALLOWED_USERS` = the single user (NFR-1). Do **not** use the bot's built-in Whisper
  transcription or file upload (ARD §12).
- Confirm clarifying questions surface as conversational turns (FR-C3).

**Deliverables:** a filled `runtime.env.example` template + launch profile documentation;
the bot verified driving a full run against the Phase-3 brain.

**Exit criteria**
- A run is fully drivable from Telegram: paste identifier → processing → checkpoint shown
  in chat → confirm → end-of-run conflict list reported (FR-C1/C3, FR-M4).
- **AC-8 (bot half):** an unauthorized ID cannot use the control bot.
- Superpowers/dev skills confirmed absent from the runtime session.

---

## 7. Phase 5 — UI backend

**Repo:** `code-repo/ui-backend/` (FastAPI on Uvicorn). **Goal:** a thin JSON service +
auth that also serves the built frontend. Depends only on the Phase-0 contract and
`allocate-id`, not on the pipeline.

**Workstreams**
- **Read/write JSON** on `DATA_ROOT` with **atomic writes** (temp file + `os.replace`) and a
  **per-file lock** so concurrent writes to one process don't clash (ARD §13.1).
- **Edit operations:** apply edit/add/delete-as-flag/reposition (recording `layout: manual`),
  the `pending` **review inbox** (accept/reject → `merge`), and **manual process creation**
  via `allocate-id` (FR-I5/FR-D2).
- **Save semantics:** manual save only — one JSON write + **one** `git commit` per Save
  (ARD §15), with the `ui-edit(...)` author/message convention.
- **Auth** (NFR-3): argon2 password hash (`argon2-cffi`) + signed session cookie
  (JWT/`itsdangerous`); hash and signing key in env, **outside** `data-repo`.
- **Serve frontend:** FastAPI serves the Vite build (`ui/dist`); the proxy only adds TLS.

**Deliverables:** tested FastAPI endpoints for navigation-data, edit, review-inbox, and
manual creation; documented env surface (`config/ui-backend.env.example`).

**Exit criteria**
- **AC-6:** a conflict is presented as current-vs-proposal and resolvable with accept/reject,
  original value never auto-changed.
- **AC-8 (UI half):** no access without correct username/password; password never stored plaintext.
- Atomic-write + lock behavior tested under concurrent writes to one process file.

---

## 8. Phase 6 — UI frontend

**Repo:** `code-repo/ui/` (React + TypeScript + Vite + `@xyflow/react`; replaces the current
default template). **Goal:** the interactive view/edit surface, built to **exactly reproduce
the approved design prototype**. Uses TanStack Query for server data, React state for local
edits (ARD §13.1).

**Authoritative design reference.** `ui/design/Inja Process System.dc.html` (+ `support.js`
runtime) is a pixel- and interaction-complete RTL Persian prototype and is the **visual and
behavioral source of truth** for this phase. The UI must match it. Note it is a *reference to
reproduce, not to ship*: the prototype hand-rolls its own SVG canvas, whereas the ARD mandates
`@xyflow/react` — so we rebuild the prototype's look and interactions on top of `@xyflow/react`
custom node/edge components (see the reconciliation note in the risk register, §10).

**Workstreams**
- **Design-system foundation (do first).** Extract the prototype's design tokens into the app:
  Vazirmatn web font, global `dir="rtl"`, the color palette (bg `#FBF7F1`, ink `#2A1D5E`,
  violet `#4A25A9`, coral `#FA5A52`, save-green `#1F8A5B`, conflict-red `#E23D35`, muted
  `#8a7db0`, borders `#EFE7DC`/`#E3D8F5`, tile fills `#F0E9FB`/`#F4EFFB`), radii/shadow scale,
  the shared button variants (coral/violet/green/ghost) and ICOM **chip** styles, a
  **Persian-numeral** formatter (`toFa`) and a **Jalali** date display, and the Inja logo asset.
- **Screen inventory (reproduce each per the prototype):**
  - **Login** (FR-I3/NFR-3): username/password, single-user, brand panel.
  - **App shell:** top bar with logo/home, **breadcrumb**, contextual back button,
    **review-inbox button with a pending-count badge**, user avatar.
  - **Departments grid** (FR-I2): nine department tiles with icons and process counts.
  - **Process list** (FR-I2): search by name/ID, "department info" + "new process" actions,
    per-process cards (ID chip, name, new/update tag, summary, activity count, actions).
  - **Department overview** (FR-P6): sub-units + personnel/duties, **view and edit** modes,
    manual Save.
  - **Summary card** (FR-I2, FR-D3): the **IDEF0 A-0 box** visualization (inputs/controls/
    outputs/mechanisms around the center box) + **KPI** cards; view and edit modes; empty-KPI
    state states the no-fabrication rule (INV-3).
  - **Flowchart canvas** (FR-I2/I3, FR-D9/10): see the canvas workstream below.
  - **Node detail drawer** (FR-D4): view (label, actor, description, ICOM chips, `source`
    line) and edit (fields + **subprocess link-by-ID with live validation** and a
    "create sub-process & enter" action — FR-D6/D7); **inline conflict accept/reject** on the
    box (mirrors the inbox — FR-M4).
  - **Junction gate editor:** XOR/AND/OR selector with explanations.
  - **Conflict inbox modal** (FR-I4/FR-M4): current-vs-proposed diff, accept/reject, "view in
    flowchart" jump; empty state.
  - **Create-process modal** (FR-I5): shows the system-allocated next ID (from `allocate-id`
    via Phase 5); never an LLM ID (INV-1).
  - **Toasts** for action feedback.
- **Flowchart canvas on `@xyflow/react`** (reproducing the prototype's behavior):
  - Custom nodes — **activity** card (ID chip, title, actor, conflict badge, sub-process
    affordance), **start/end** terminals, **junction diamonds** color-coded XOR/AND/OR with a
    legend; custom edges with optional labels and a click-to-delete affordance.
  - **View-only default + Edit mode** (FR-I3): pan/zoom/fit always; drag, drag-a-coral-handle
    to create edges, delete, add activity/junction, **undo/redo** only in Edit mode.
  - **Manual Save** (FR-I3): all edits held in memory; one write + one commit on Save (via
    Phase 5); Cancel discards.
  - **Layout** (FR-D9/D10): initial positions from the `layout` CLI (serpentine); manual moves
    set `layout: manual` and persist; a full **"re-layout"** button; append vs. middle-insert
    local re-layout surfaced.
  - Sub-process navigation is bidirectional (FR-D6): click a linked box to enter its flowchart,
    "parent process" to return.

**Deliverables:** the working SPA built to `ui/dist`, matching the prototype; the extracted
design-token module; component tests for edit-state, navigation, and the custom nodes/edges.

**Exit criteria**
- **Visual & interaction fidelity:** each screen matches `ui/design/` (layout, palette,
  typography, RTL, Persian numerals/Jalali dates, states) against live `data-repo` data.
- **AC-5:** repositioning parts is preserved after reopening, and a subsequent voice/run does
  not break the manual layout (verified with Phase-3 output).
- All FR-I* behaviors demonstrable; view-only default prevents accidental edits.

---

## 9. Phase 7 — Deployment & operations

**Repo:** `code-repo/deploy/`. **Goal:** the whole system as one durable Docker Compose
stack (NFR-9), running-only (no Superpowers, no coding inside containers — ARD §16).

**Workstreams**
- **Stack services** (ARD §16): `telegram-bot-api`, `upload-bot`, `control-bot` (the heavy
  image: Python + Node + Claude Code CLI + engine CLIs on PATH + git), `ui-backend`,
  `proxy` (TLS), `git-push`.
- **Shared volume:** `data-repo` mounted on `upload-bot`/`control-bot`/`ui-backend` — the
  only point of connection — and reachable on the host for dev sessions 1/2. `code-repo` is
  baked into images; `data-repo` **never** is (INV-2).
- **Secrets:** bot tokens, Vertex service account, `ANTHROPIC_API_KEY`, UI hash/key via
  Docker secrets or an env file outside the repo — never baked in.
- **Hooks active in-container:** confirm the Phase-3 runtime hooks fire inside `control-bot`.
- **Scheduled push** (NFR-7, ARD §15): `git-push` cron at 11:00/23:00, conditional on
  unpushed commits; optional "Push now" from the UI.
- **Off-site backup** (NFR-7): finalize the VPS backup strategy (ARD §18 open item).
- **Restart policy:** `restart: unless-stopped` on every service.

**Deliverables:** `docker-compose.yml` + Dockerfiles + proxy config, a deploy runbook, and a
tagged image build.

**Exit criteria**
- `docker compose up -d` brings both bots + UI up as durable services (NFR-9).
- **AC-7 (deployed):** in the running `control-bot` container, runtime cannot edit the engine
  CLIs or the code, and the hooks block forbidden writes.
- Scheduled push runs only when there are unpushed commits; a backup is produced.

---

## 10. Cross-cutting concerns

**Testing strategy.** Deterministic units (engine CLIs, merge/conflict, layout, backend
write path) — TDD with pytest against Phase-0 golden fixtures. LLM stages — validated
against fixtures and the ACs, plus the permanent `runs/` corpus (FR-P9) as a growing
regression/eval set. UI — component tests for edit-state and navigation; the flowchart
verified against real Phase-3 output.

**Secrets & config.** No real secret ever enters either repo (CLAUDE.md rule, ARD §14). All
`config/*.env.example` files stay example-only; real values live in server env / Docker
secrets. Vertex key, UI hash + signing key, bot tokens, `ANTHROPIC_API_KEY` all external.

**Invariants verification checklist** (must hold at every phase that touches them):
- INV-1 — no LLM-generated IDs; `allocate-id` is the single source (Phases 1, 3, 5).
- INV-2 — runtime can't change code/config; enforced by profile + hooks + CLI placement (Phases 3, 4, 7).
- INV-3 — no fabrication; enforced in `idef-extraction`/`extract` (Phase 3).
- INV-4 — no automatic deletion; `merge` flags only (Phase 1); UI delete flags (Phase 6).
- INV-5 — human approval before creation and before value changes (Phases 3, 5, 6).

**Requirements traceability (phase ↔ AC).**

| Acceptance criterion | Realized/verified in |
|---|---|
| AC-1 (large upload stored) | Phase 2 |
| AC-2 (checkpoint → valid IDEF output) | Phase 3 (driven via Phase 4) |
| AC-3 (re-run no rework/duplicate) | Phase 3 |
| AC-4 (multi-department separate output) | Phase 3 |
| AC-5 (layout preserved across re-open & runs) | Phase 6 (with Phase 1 layout + Phase 3 output) |
| AC-6 (conflict pending, accept/reject) | Phase 1 (mechanism) + Phase 5/6 (inbox) |
| AC-7 (runtime can't change code/config) | Phase 3 (hooks) + Phase 7 (deployed) |
| AC-8 (auth: bots + UI) | Phase 2 + Phase 4 (bots) + Phase 5 (UI) |

**Risk register (seeded from ARD §18).**

| Risk / open item | Affects | Mitigation |
|---|---|---|
| Exact Gemini-on-Vertex model + inline-vs-GCS for large audio | Phase 1 `transcribe` | Model behind `GEMINI_MODEL` env; decide GCS threshold during Phase 1 integration test |
| Telegram audio format → conversion before Vertex | Phase 1 / Phase 2 | Determine Telegram output format early in Phase 2; add a conversion seam in `transcribe` if needed |
| Auto sub-process creation threshold (number of sub-steps) | Phase 3 | Start conservative; tune from the `runs/` corpus (FR-D7, ARD §18) |
| VPS backup strategy for `data-repo` | Phase 7 | Finalize in Phase 7; git push to GitHub is the off-site baseline (NFR-7) |
| KPIs rarely stated in interviews | Post-v1 | Out of v1 scope; leave fields empty (INV-3), fill later via question/manual entry |
| Design prototype uses a bespoke SVG canvas, but ARD §13.1 mandates `@xyflow/react` | Phase 6 | ARD is authoritative for the stack: reproduce the prototype's look/interactions with `@xyflow/react` custom nodes/edges. Confirm `@xyflow/react` supports the drag-to-link, junction diamonds, and edge-delete affordances before committing (spike early in Phase 6) |
| Jalali date display + Inja logo/brand assets needed by the UI | Phase 6 | Pick a small Jalali formatting approach (the prototype includes an inline converter); source the logo asset (`assets/inja-logo.jpg`) into `ui/` |

---

## 11. Sequencing summary & how to use this plan

**Default single-developer serial path:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.

**Parallelizable if capacity allows:** Phases 5–6 (UI) need only the Phase-0 contract and
Phase-1 `allocate-id`, so they can run alongside Phases 3–4. Phase 2 (upload bot) is
independent of Phase 1 except for `registry.json` and can move earlier if convenient.

**Next step.** Each phase above is a milestone with exit criteria, not yet a task-level plan.
Expand a phase into a concrete implementation plan (file-by-file, test-by-test) with the
`writing-plans` skill when you're ready to build it — start with Phase 0, since it unblocks
everything else.
