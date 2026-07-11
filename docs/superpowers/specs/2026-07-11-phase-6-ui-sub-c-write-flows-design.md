# Phase 6 — UI Frontend · Sub-project C: Non-canvas Write Flows

| | |
|---|---|
| **Date** | 2026-07-11 |
| **Status** | Approved design; ready for implementation plan |
| **Repo** | `code-repo/ui/` (+ two additive `ui-backend/` endpoints) |
| **Depends on** | Sub-project A (shell, routing, data layer, read screens) |
| **Basis** | PRD FR-I4/I5, FR-D2/D3, FR-M4, INV-1/INV-3/INV-5, AC-6; ARD §13, §15; `process`/`overview` schemas |

## 0. Context

C adds every **write flow that is not the flowchart canvas** (canvas + node drawer edits are
**B**). It reuses A's shell, routing, data layer, and read screens, turning their inert edit
affordances live.

## 1. Prerequisite backend additions (Phase 5 — additive)

Two small, additive endpoints (Phase 5 is otherwise done). Both are read-only helpers that keep
INV-1 intact:

1. **`GET /api/departments/{code}/next-id`** → `{ "next_id": "cooking-007" }`
   Runs `allocate-id` in **dry-run** (scan disk, max+1) and returns the id it *would* assign.
   Used by the create modal for an authoritative preview; the real allocation still happens in
   `POST /api/processes` (INV-1 — the id is never invented in the UI).
2. **`GET /api/pending`** → `[{ process, department, name, node, index, field, current,
   proposed, source, status }]`
   Aggregates **open** `pending` rows across all processes for the **global** conflict inbox +
   badge count. Resolution still goes through the existing
   `POST /api/processes/{pid}/pending/{index}`.

These require a one-line amendment to the Phase-5 spec/plan (new endpoints), implemented as part
of C.

## 2. Scope

**In C (UI):**
- **Department overview — edit mode**: add/edit/delete sub-units and personnel; Save.
- **Summary card — edit mode**: name, summary, IDEF0 ICOM lists, KPIs; Save.
- **Create-process modal** (FR-I5, FR-D2): department fixed, name, system-suggested next id;
  create → enter the new process.
- **Process delete confirm** (from the process list): full delete + backend unlink.
- **Global conflict inbox modal** (FR-I4/FR-M4, AC-6): list current-vs-proposed across all
  processes, accept/reject, "view in flowchart" jump, empty state; top-bar **pending-count
  badge**.
- **Toasts** for action feedback.

**Elsewhere:** node/junction edit, node delete, and the **inline** (per-box) conflict
accept/reject live in **B**'s detail drawer. C and B share `useResolvePending` and
`useCreateProcess`.

## 3. Architecture

### 3.1 Mutation hooks (TanStack Query)
All hooks live in A's `ui/src/api/hooks.ts`. C adds `usePutOverview(code)`,
`useDeleteProcess()`, and the reads `useNextId(code)` / `usePending()`, and reuses
`usePutProcess(pid)` (from B), `useCreateProcess()` and `useResolvePending()` (shared with B).
Each mutation invalidates the affected queries (process, process list, department counts, the
global `pending` aggregate).

### 3.2 Overview edit (PUT /api/departments/{code}/overview)
View↔edit toggle on the A overview screen. Edit holds a draft: sub-units (name/description) and
personnel (role + duties, duties edited as newline text ↔ string array). Save PUTs the whole
overview doc (backend stamps `updated_at`, validates, commits once); Cancel drops the draft.

### 3.3 Summary edit (PUT /api/processes/{pid})
Edit name, summary, `idef0` ICOM lists (add/remove per group), and `kpis`
(name/definition/target). Save merges these fields into the loaded process doc and PUTs the
whole doc (same endpoint canvas Save uses). Empty-KPI state keeps the INV-3 no-fabrication note.

### 3.4 Create-process modal (POST /api/processes)
Department is fixed from context; `useNextId` shows the authoritative suggested id; on confirm,
`POST /api/processes {department, name}` returns the created skeleton with the **allocated** id
(INV-1). Navigate into the new process (summary, or straight into flow edit). Sub-process
creation from a node is B's drawer, using the same hook with a `parent`.

### 3.5 Process delete (DELETE /api/processes/{pid})
The list's delete button opens the confirm modal; confirm calls DELETE (backend removes the
file and unlinks `subprocess`/`parent` references), then invalidates the list.

### 3.6 Global conflict inbox
Top-bar button (in A's shell) opens the modal; badge = total open pending from `usePending`.
The modal lists each pending row (process id + node + field, current-vs-proposed), accept/reject
via `useResolvePending` (original value untouched until the decision — AC-6), and a "view in
flowchart" action routing to `/processes/{pid}/flow` with the node focused. Empty state per the
prototype. Resolving invalidates `pending` + the process.

### 3.7 Toasts
A small toast host (context/provider) surfaced after each successful mutation, styled to the
prototype.

### 3.8 File structure (adds to A/B)
```
ui/src/api/hooks.ts          # gains C's mutation/read hooks (see §3.1)
ui/src/write/
  CreateProcessModal.tsx
  DeleteProcessConfirm.tsx
  InboxModal.tsx
  Toast.tsx  ToastProvider.tsx
ui/src/screens/Overview.tsx  # gains edit mode
ui/src/screens/Summary.tsx   # gains edit mode
ui-backend/inja_ui_backend/routers/{departments,pending}.py  # next-id + aggregate pending
```

## 4. Testing
- Backend: `next-id` returns max+1 dry-run and never writes; `pending` aggregates only `open`
  rows across departments. (pytest, existing harness.)
- UI: overview/summary edit drafts round-trip and produce the right Save payloads; create modal
  shows next-id and POSTs; delete confirms and invalidates; inbox lists/accepts/rejects and the
  original is unchanged until decision; badge count reflects the aggregate; toast appears on
  success. API layer mocked.

## 5. Exit criteria (C)
- **AC-6:** a conflict is shown as current-vs-proposal and resolvable via accept/reject in the
  global inbox; the original value is never auto-changed (also satisfied inline in B).
- FR-I4 (inbox), FR-I5 (create with system-allocated id), FR-D2 (manual process), FR-D3
  (summary/KPIs) demonstrable; overview + summary edit round-trip to disk with one commit each
  (ARD §15).
- INV-1 (id only from `allocate-id`), INV-3 (no fabricated KPIs), INV-5 (human approval before
  value changes) upheld.
- Vitest + the two new pytest checks pass.

## 6. Dependencies
The two additive Phase-5 endpoints (§1). No new frontend packages. Shares B's
`useResolvePending`/`useCreateProcess`.
