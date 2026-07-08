# Phase 3 — Extraction Brain: Design Spec

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Phase** | 3 (PLAN.md §5) |
| **Repo** | `data-repo` (the runtime "brain") — authored from a normal dev session |
| **Basis** | PRD v0.2, ARD v0.1 §5–§7, PLAN.md §5 |
| **Status** | Approved design, ready for implementation plan |

> This spec defines **what** the extraction brain is and **how its pieces fit**. The
> file-by-file, test-by-test build steps come next, from the `writing-plans` skill.
> The architecture is already locked by the ARD; this spec resolves the remaining
> open decisions and pins the content contracts each piece must honor.

---

## 1. Goal & boundary

Phase 3 builds the **intelligence layer** that orchestrates the already-built, already-tested
Phase-1 engine CLIs (`allocate-id`, `merge`, `layout`, `transcribe`) into the five-stage
extraction pipeline (ARD §5). Everything authored here lands in `data-repo/.claude/` and
`data-repo/CLAUDE.md` — **no application code** (that lives in `code-repo`; INV-2 keeps the two
physically separate).

**In scope:** the `idef-extraction` and `process-voice` skills; the `classify`, `extract`,
`summarize` agents; `CLAUDE.md`; the runtime `PreToolUse` hooks; and a one-time cleanup of the
stored test transcript.

**Out of scope:** the deterministic engine (Phase 1, done); the control bot that drives this
brain over Telegram (Phase 4); the UI (Phases 5–6); real Vertex transcription (deferred until
GCP is set up — Phase-1 integration test).

---

## 2. Locked context (what already exists)

- **`data-repo`** is scaffolded (commit `84079d7`): the full directory topology, `registry.json`
  (nine departments), and **STUB** files for every artifact this phase authors.
- **The data contract is frozen and tested** in `code-repo/schemas/`: `segments`, `candidate`,
  `delta`, `process`, `overview`, `run-meta`, `conflicts`, `registry`.
- **The four engine CLIs work** (verified signatures):
  - `allocate-id {process <dept> | box <process_file> | junction <process_file>}`
  - `merge {new --candidate --department --run [--now] | update --process --delta --run [--now] | accept --process --index [--now] | reject --process --index [--now]}` — validates against the schemas and refuses (exit 2) on failed preconditions.
  - `layout <process_file> [--from-node N] [--full]`
  - `transcribe <basename>` — idempotency pre-check skips Vertex if the transcript exists; raw text to stdout (the pipeline cleans + stores).
- **Real test data is present:** `meetings/audio/dining-2026-05-06.m4a` (60 MB) and a real
  80 KB transcript `meetings/transcripts/dining-2026-05-06.txt`. The transcript is an
  **org-wide intro meeting** (the manager walks through all six/seven departments) and still
  carries a two-line Gemini **preamble** that was never cleaned.

---

## 3. Resolved decisions

1. **Validation definition-of-done.** Validate the pipeline **from the real transcript
   onward**. `transcribe`'s idempotency pre-check short-circuits (the transcript already exists),
   so we exercise FR-P2 for real. The full Telegram-driven run is a **Phase-4** concern — the
   PLAN already lists AC-2 as "Phase 3 (driven via Phase 4)."
2. **Orchestration approach: state-file-anchored playbook.** `process-voice` reads/writes
   `runs/{voice}/meta.json` as the source of truth for "which stage am I in," so it resumes
   correctly when the user replies in a later Telegram turn (the checkpoint pause). CLI
   preconditions remain the hard gate (ARD §7). Chosen over a thin narrative playbook, which
   would drift and could not reliably resume across the checkpoint.
3. **Classify scope: upload tag = hint, follow the content.** `classify` assigns every detected
   process to its **true department** from `registry.json`, wherever it belongs; the upload tag
   is a prior, not a filter. Fully realizes FR-P8 / AC-4. (For the `dining`-tagged test voice,
   this legitimately yields processes and overview updates across warehouse, cooking, dining, …)
4. **Sub-process auto-creation: flag only, no auto-create** this phase (ARD §18 "start
   conservative"). `extract` flags boxes that look like genuine sub-processes so they surface at
   the checkpoint; nested-process auto-creation is a later tuning pass.
5. **Transcript preamble: hand-clean the stored test transcript once**; the `transcribe` stage
   owns chrome-cleaning for all future fresh transcriptions (ARD §5.1).
6. **Language:** all user-facing agent output (checkpoint lists, process names, labels) in
   **Persian**, matching the data; stored structured data stays per-schema (Latin IDs, ISO
   timestamps).

---

## 4. Components

Each unit has one purpose, a defined input→output, and is understandable/testable in isolation.

### 4.1 `idef-extraction` skill (knowledge; preloaded into `extract`)
- IDEF0 ICOM in restaurant terms; **actor / mechanism = a role or system, never a person's
  name** (ARD §4.4).
- IDEF3: activities, edges, junctions (AND/OR/XOR, split/join).
- The exact `candidate.schema.json` (new process) and `delta.schema.json` (update) shapes, with
  **temporary node keys only** (`n1`, `j1`, …) — never final IDs (INV-1).
- **No fabrication** (INV-3): fill fields only from actual transcript content; empty arrays /
  strings are acceptable; never invent to complete the template.

### 4.2 `classify` agent → `runs/{voice}/segments.json`
- **Input:** transcript path + tagged departments (hint). Reads the file itself; content never
  enters the main session (NFR-6). Loads `registry.json`.
- **Work:** segment the transcript into processes; assign each to its true department; match
  against existing `departments/{dept}/processes/*.json` and label `new` / `update` /
  `unchanged` with `match.existing_id`.
- **Output:** `segments.json`, valid against `segments.schema.json`. Returns only a short summary
  + the path to the main session (not the content).

### 4.3 `extract` agent (parallel ×N via `Task`) → `runs/{voice}/candidates/*.json` or `deltas/*.json`
- **Input:** one confirmed segment (+ the existing `process.json` for an update). Reads only its
  own segment (NFR-6). Preloads `idef-extraction`.
- **Work:** new → a candidate IDEF0/IDEF3 graph; update → a delta referencing existing IDs.
  Temporary keys only. Flags apparent sub-process boxes (decision 4) without creating them.
- **Output:** candidate valid against `candidate.schema.json`, or delta valid against
  `delta.schema.json`.

### 4.4 `summarize` agent → `departments/{dept}/overview.json`
- **Input:** the run's processes for a department + transcript + existing `overview.json`.
- **Work:** build/update sub-units, personnel **roles**, and duties (roles not names).
- **Output:** valid against `overview.schema.json`.

### 4.5 `process-voice` skill (the playbook / orchestrator)
Drives the coarse flow; every stage transition is gated by CLI preconditions and hooks, not by
the model's discipline (ARD §7). Stages:

1. **Locate + transcribe (FR-P1/P2):** resolve the identifier to a file in `meetings/audio/`;
   on no exact match, ask conversationally with the closest options. Run `transcribe {basename}`
   — idempotency skips Vertex when the transcript exists; on a fresh transcription, Claude
   strips any Gemini chrome before storing to `meetings/transcripts/`.
2. **Init run:** create `runs/{basename}/` (re-run → `attempt-NN/`, FR-P9) and `meta.json`
   (`started_at`, `departments`, `attempt`, `processes: []`).
3. **classify** (Task subagent) → `segments.json`.
4. **Human checkpoint (FR-P4, INV-5):** present the list grouped **A (new) · B (update → id) ·
   D (unchanged / already-covered)**, plus flagged sub-process candidates, plus a note whenever
   the content spans departments beyond the upload tag (decision 3). **End the turn and await**
   confirm/correct. A correction re-runs **only** `classify` (nothing built yet — a cheap loop).
5. **extract** (Task ×N parallel) for confirmed **new + update** only. `unchanged` processes are
   **not** extracted — only a lightweight `source.touched_by` record is added (ARD §5.3).
6. **merge** (CLI) per process: `merge new` / `merge update`. Real IDs from `allocate-id`,
   positions/IDs preserved, filled-value changes → `pending`, removed items flagged not deleted.
7. **summarize** (Task per department) → `overview.json`.
8. **Finish:** update `meta.json` (`finished_at`, `processes`), then **one `git commit`**
   (`pipeline(dept): N processes from {voice}` — ARD §15).
9. **Conflict report (FR-M4):** present this run's `pending` conflicts (the list, not a count)
   in chat; the user may resolve inline (`merge accept/reject --index`) or defer to the UI inbox.
   The original value is never auto-changed.

**Multi-department fan-out (FR-P8):** steps 5–8 run separately per department.

### 4.6 `CLAUDE.md` (the weak-baseline rung, ARD §7)
Restates INV-1…5; the hard rules ("IDs only via `allocate-id`," "`processes/*.json` only via
`merge`," "never fabricate," "roles not names"); pointers to the skills/agents; and the pinned
engine-version note (ARD §8).

### 4.7 Runtime hooks (`PreToolUse`, exit code 2 — the hard guarantee)
`.claude/settings.json` wires a `guard.py` that blocks:
1. Any `Write`/`Edit` — or `Bash` redirect/write — to `departments/**/processes/*.json`,
   **except** the `merge` CLI. (INV-1, AC-7)
2. Any write/edit to `.claude/**` and `CLAUDE.md` at runtime. (INV-2, AC-7)
3. Any write outside `data-repo`. (defense-in-depth on code/data separation)

Legitimate pipeline writes stay allowed: `meetings/transcripts/**`, `runs/**`, and
`departments/{dept}/overview.json` (written directly by `summarize`, not a protected path).

---

## 5. End-to-end data flow

```
identifier ──▶ [process-voice]
   │  locate audio (FR-P1)
   ├─ transcribe {basename} ──▶ meetings/transcripts/{basename}.txt   (idempotent, FR-P2)
   ├─ init runs/{basename}/meta.json
   ├─ classify (subagent) ─────▶ runs/{basename}/segments.json
   │
   ├─ ── HUMAN CHECKPOINT (Telegram) ── confirm/correct ──  (loop re-runs classify only)
   │
   ├─ per department, per confirmed new/update process:
   │     extract (subagent) ──▶ runs/{basename}/candidates|deltas/*.json
   │     merge  new|update  ──▶ departments/{dept}/processes/{id}.json  (+ pending)
   │   unchanged ───────────▶ touched_by record only
   ├─ summarize (subagent) ──▶ departments/{dept}/overview.json
   ├─ update meta.json + git commit  (pipeline(dept): …)
   └─ conflict report (Telegram) ── accept/reject → merge accept|reject
```

State lives on disk (`meta.json`, `segments.json`, run artifacts), so a compact or new session
loses nothing (NFR-6); the playbook resumes from `meta.json`.

## 6. Error handling & preconditions

- **Ordering** is imposed by data dependency, not the model: `merge` refuses without a candidate/
  target + confirmed segments; `extract` has nothing to read without `classify` output. The
  playbook is the coarse driver; the CLIs are the hard gate (ARD §7).
- **Schema conformance** is enforced by `merge` (validates before write) and by the agents
  targeting the frozen schemas.
- **No partial destruction:** `merge` never deletes (flags only, INV-4); conflicts never
  overwrite (pending, FR-M3).
- **Hooks** are the last line: even a mis-behaving runtime cannot write a protected path.

## 7. Validation plan (this session, against the real `dining` transcript)

Mechanical verification we can do now (the LLM Telegram-driven run is Phase 4):
- **Hooks (AC-7):** attempt a direct `processes/*.json` `Write` and a `.claude` edit → both
  blocked with exit 2; a `merge` write to the same path → allowed.
- **classify:** a real run produces schema-valid `segments.json` with sensible true-department
  assignment across the org-wide meeting.
- **extract:** on a couple of segments, produces schema-valid candidate/delta (temp keys only).
- **merge (AC-2 mechanics):** writes a valid `process.json` with allocated IDs and commits.
- **Re-run (AC-3):** transcribe idempotency short-circuits; `classify` marks already-built
  processes `unchanged`; no duplicate/rework.
- **Multi-department (AC-4):** fan-out yields separate per-department `process.json` +
  `overview.json`.

## 8. Traceability

| Requirement | Realized in |
|---|---|
| FR-P1/P2 (locate, transcribe, idempotent) | §4.5 step 1 |
| FR-P3 (classify new/update/unchanged) | §4.2 |
| FR-P4 / INV-5 (human checkpoint) | §4.5 step 4 |
| FR-P5 / FR-D5 (extract, no fabrication) | §4.3, §4.1 |
| FR-P6 (department overview) | §4.4 |
| FR-P7 (history / commit) | §4.5 step 8 |
| FR-P8 / AC-4 (multi-department) | §4.5 fan-out, decision 3 |
| FR-P9 (run retention) | §4.5 step 2 (`attempt-NN`) |
| FR-M3/M4 (conflict pending + report) | §4.5 steps 6, 9 |
| INV-1 (deterministic IDs) | §4.1 temp keys, §4.7 hook 1 |
| INV-2 (code/data separation) | §4.7 hooks 2–3 |
| INV-3 (no fabrication) | §4.1 |
| INV-4 (no auto deletion) | §6 |
| AC-2/3/4/7 | §7 |

## 9. Open items carried forward

- Sub-process auto-creation threshold — tune from the `runs/` corpus later (ARD §18).
- Real Vertex transcription — deferred until GCP is set up (Phase-1 integration test).
- Full Telegram-driven pipeline run — Phase 4 (control bot).
