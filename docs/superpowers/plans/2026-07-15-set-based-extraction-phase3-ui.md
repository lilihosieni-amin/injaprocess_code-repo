# Set-Based Extraction — Phase 3: UI (Tombstone Display + Permanent Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface tombstoned (superseded / removed) processes in the UI — labelled «باطل‌شده», view-only, linked to their heir process(es) — and let a user permanently (hard) delete a tombstone from the list. This is the UI half of §4.7 of the set-based-extraction design; the schema fields (`superseded_by[]`, `tombstoned`) and the engine that sets them are Phase 1 (already landed by the time this runs — this plan **consumes** those fields, it does not add them).

**Architecture:** React 18 + TypeScript + Vite + @xyflow/react + React Query talking to a thin FastAPI backend that reads/writes JSON on disk. The tombstone flag rides along on the existing `process.json` and is served unchanged by the existing `GET /api/departments/{code}/processes` and `GET /api/processes/{pid}` routes. The frontend derives a new tag kind from `tombstoned`, renders those rows view-only with heir links, and reuses the existing hard-delete route (`DELETE /api/processes/{pid}`) + `DeleteProcessConfirm` modal for permanent deletion. The only backend change is cosmetic count semantics in `list_departments` (exclude tombstones from `count`/`subs`/`conflicts`).

**Tech Stack:** Frontend — React 18 + TypeScript + Vite + @xyflow/react + React Query, tested with vitest + @testing-library/react. Backend — FastAPI + pytest (TestClient over a git-initialised temp `DATA_ROOT`).

## Global Constraints

- **Persian UI copy.** All user-facing text is Persian (RTL). The tombstone label is «باطل‌شده»; heir links read «جانشین:»; the left-out/permanent-delete copy is already Persian in `DeleteProcessConfirm`. Internal ids/paths/keys stay ASCII.
- **Schema fields come from Phase 1 — do NOT re-add them.** `process.schema.json` has `additionalProperties:false`; Phase 1 added optional `superseded_by: string[]` and `tombstoned: boolean`. Every backend write path (`create_process`, `save_process`) calls `engine.validate_doc(cfg, "process.schema.json", doc)`, so a doc carrying these fields only validates once Phase 1 has landed. **This plan does not touch any schema.** Backend tests that need a tombstoned doc on disk write it **directly to the fixture path** (bypassing the validating write route), so they do not depend on Phase-1 schema changes to run green.
- **Tombstoned = view-only.** A tombstoned process must never expose an affordance that mutates its content: no edit, no save, no flowchart-edit entry, no create-subprocess. It stays visible and its heir links are clickable navigation only.
- **Permanent delete is user-initiated only (INV-4 exception).** The only destructive action allowed on a tombstone is a deliberate human click through the existing confirm modal, which calls the existing hard-delete route. No automatic deletion. Do **not** change the delete route's mechanics and do **not** invent a second delete endpoint.
- **Reuse, don't reinvent.** Reuse `deriveTag`/`TAG_CLS`, `useDeleteProcess()`, and `DeleteProcessConfirm` as-is where possible; extend only their copy/branches.
- **Green baseline.** `cd code-repo/ui && npm test` and `cd code-repo && python -m pytest ui-backend/tests` must stay green after every task. Frontend and backend tasks are separately committable.

---

## File Structure

**Frontend (`code-repo/ui/src`):**
- `api/types.ts` — add `superseded_by?: string[]` + `tombstoned?: boolean` to `interface Process` (Task 1).
- `lib/format.ts` — extend `TagKind` + `deriveTag` with a `tombstone` kind (Task 2).
- `screens/ProcessList.tsx` — render tombstoned rows in a muted, view-only style with heir links; hide mutating affordances; add the `tombstone` colour to `TAG_CLS` (Task 3).
- `screens/Summary.tsx` — tombstone banner + heir links; suppress edit/save/flowchart (Task 4).
- `write/DeleteProcessConfirm.tsx` — sharpen the "permanent" copy (Task 5).
- Colocated `*.test.tsx` next to each touched file (`lib/format.test.ts` if it exists, else new; `screens/ProcessList.test.tsx`; `screens/Summary.test.tsx`; `write/DeleteProcessConfirm.test.tsx`).

**Backend (`code-repo/ui-backend`):**
- `inja_ui_backend/routers/departments.py` — `list_departments`: skip tombstoned files in `count`/`subs`/`conflicts` (Task 6).
- `tests/test_departments.py` — new test asserting a tombstoned file is excluded from the counts (Task 6).
- `tests/test_processes_delete.py` — new test asserting the existing hard-delete works on a tombstoned file (Task 7).

Note the read routes (`list_processes`, `get_process`) need **no change** — they already return the full doc, so `tombstoned`/`superseded_by` ride along for free.

---

## Task 1 — Frontend types: `tombstoned` + `superseded_by` on `Process`

**Files:** `ui/src/api/types.ts`, `ui/src/api/types.test.ts` (new).

**Interfaces:** `interface Process` gains `superseded_by?: string[]` and `tombstoned?: boolean` (both optional so every existing doc/test still type-checks).

- [ ] **Write failing test.** Create `ui/src/api/types.ts` type-level test as a runtime assertion (vitest). Create `ui/src/api/types.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import type { Process } from './types'

  describe('Process type', () => {
    it('accepts optional tombstone fields', () => {
      const p: Partial<Process> = { id: 'cooking-002', tombstoned: true, superseded_by: ['cooking-050'] }
      expect(p.tombstoned).toBe(true)
      expect(p.superseded_by).toEqual(['cooking-050'])
    })
  })
  ```
- [ ] **Run it — fails.** `cd code-repo/ui && npm test -- src/api/types.test.ts`. Expected: TypeScript compile error — `Object literal may only specify known properties, and 'tombstoned' does not exist in type 'Partial<Process>'` (test file fails to typecheck / run).
- [ ] **Minimal implementation.** In `ui/src/api/types.ts`, extend the interface:
  ```ts
  export interface Process {
    id: string; department: string; name: string; summary: string
    source: { type: 'voice' | 'manual' | 'chat' | 'auto'; ref: string | null; run: string | null }
    parent: { process: string; node: string } | null
    created_at: string; updated_at: string
    idef0: Icom; kpis: Kpi[]; nodes: ProcNode[]; edges: Edge[]; pending: Pending[]
    superseded_by?: string[]
    tombstoned?: boolean
  }
  ```
- [ ] **Run it — passes.** `cd code-repo/ui && npm test -- src/api/types.test.ts`. Expected: 1 passing.
- [ ] **Commit.** `feat(ui): tombstone fields on Process type` (branch off `main` first if on `main`).

---

## Task 2 — `deriveTag` gains a `tombstone` kind

**Files:** `ui/src/lib/format.ts`, `ui/src/lib/format.test.ts` (create if absent).

**Interfaces:** `type TagKind = 'sub' | 'conflict' | 'kpi' | 'plain' | 'tombstone'`. `deriveTag(p)` returns `{ label: 'باطل‌شده', kind: 'tombstone' }` **first** (before the `parent`/`pending`/`kpis` branches) when `p.tombstoned` is true — a tombstone's identity as "superseded" outranks its being a sub-process or having conflicts.

- [ ] **Write failing test.** Create/append `ui/src/lib/format.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { deriveTag } from './format'
  import type { Process } from '../api/types'

  const base = { id: 'x', parent: null, pending: [], kpis: [] } as unknown as Process

  describe('deriveTag', () => {
    it('labels a tombstoned process باطل‌شده, outranking sub/conflict/kpi', () => {
      const p = { ...base, tombstoned: true, parent: { process: 'a', node: 'n' }, kpis: [{ name: 'k' }] } as unknown as Process
      expect(deriveTag(p)).toEqual({ label: 'باطل‌شده', kind: 'tombstone' })
    })
    it('leaves a normal process unchanged', () => {
      expect(deriveTag({ ...base, kpis: [{ name: 'k' }] } as unknown as Process)).toEqual({ label: 'دارای KPI', kind: 'kpi' })
    })
  })
  ```
- [ ] **Run it — fails.** `cd code-repo/ui && npm test -- src/lib/format.test.ts`. Expected: first test fails — receives `{ label: 'زیرفرآیند', kind: 'sub' }` (or `دارای KPI`) instead of the tombstone tag.
- [ ] **Minimal implementation.** In `ui/src/lib/format.ts`:
  ```ts
  export type TagKind = 'sub' | 'conflict' | 'kpi' | 'plain' | 'tombstone'

  export function deriveTag(p: Process): { label: string; kind: TagKind } {
    if (p.tombstoned) return { label: 'باطل‌شده', kind: 'tombstone' }
    if (p.parent) return { label: 'زیرفرآیند', kind: 'sub' }
    if (p.pending && p.pending.length) return { label: `${toFa(p.pending.length)} تعارض`, kind: 'conflict' }
    if (p.kpis && p.kpis.length) return { label: 'دارای KPI', kind: 'kpi' }
    return { label: 'مستند', kind: 'plain' }
  }
  ```
- [ ] **Run it — passes.** `cd code-repo/ui && npm test -- src/lib/format.test.ts`. Expected: all passing.
- [ ] **Commit.** `feat(ui): tombstone tag kind in deriveTag`

---

## Task 3 — ProcessList: view-only tombstone rows with heir links

**Files:** `ui/src/screens/ProcessList.tsx`, `ui/src/screens/ProcessList.test.tsx`.

**Interfaces:** A tombstoned row (a) shows the «باطل‌شده» chip (via the new `tombstone` colour in `TAG_CLS`), (b) is muted (`opacity-60`), (c) renders **no** "اطلاعات کلی"/"فلوچارت"/delete-trash cluster **except** a keep-visible route to view it and a permanent-delete affordance, and (d) renders a «جانشین: {id}» link per entry in `superseded_by` navigating to `/processes/{heir}`. Non-tombstoned rows are unchanged. The permanent-delete button stays available on tombstones (that is the point) and opens the same `DeleteProcessConfirm`.

Design decision (keep it simple, honour "view-only"): on a tombstoned row, keep the "اطلاعات کلی" button (navigates to the read-only Summary — Task 4 makes Summary view-only for tombstones), **drop the "فلوچارت" edit-entry button** (flowchart is a mutating editor), and **keep the trash/delete button** (permanent delete is the allowed action). Add the heir links inline under the name.

- [ ] **Write failing test.** Append to `ui/src/screens/ProcessList.test.tsx` a new case and extend the `PROCS` mock. Add a tombstoned process to the mock array:
  ```ts
  const PROCS = [
    { id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: 's1', parent: null, kpis: [{ name: 'k' }], pending: [], nodes: [{ type: 'activity' }, { type: 'start' }] },
    { id: 'cooking-014', department: 'cooking', name: 'پرداخت هزینه', summary: 's2', parent: { process: 'cooking-001', node: 'n' }, kpis: [], pending: [], nodes: [] },
    { id: 'cooking-002', department: 'cooking', name: 'فرآیند قدیمی', summary: 's3', parent: null, kpis: [], pending: [], nodes: [], tombstoned: true, superseded_by: ['cooking-050'] },
  ]
  ```
  Then add:
  ```ts
  it('shows a tombstoned process labelled باطل‌شده with an heir link and no flowchart button', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.getByText('باطل‌شده')).toBeInTheDocument()
    // heir link present, points at the heir process
    const heir = screen.getByRole('link', { name: /cooking-050/ })
    expect(heir).toHaveAttribute('href', '/processes/cooking-050')
    // the tombstoned row has no flowchart button (its own name is on the row)
    const row = screen.getByText('فرآیند قدیمی').closest('div[class*="rounded-2xl"]') as HTMLElement
    expect(row).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'فلوچارت' })).not.toBeInTheDocument()
    // permanent delete stays available
    expect(within(row).getByTitle('حذف دائمی فرآیند')).toBeInTheDocument()
  })
  ```
  Add `within` to the testing-library import and keep `renderAt` from `../test/utils`. Note the heir uses a React-Router `<Link>` (role `link`) so `getByRole('link')` + `href` works under `MemoryRouter`.
- [ ] **Run it — fails.** `cd code-repo/ui && npm test -- src/screens/ProcessList.test.tsx`. Expected: fails — no «باطل‌شده» text, no `cooking-050` link, and the flowchart button is still present.
- [ ] **Minimal implementation.** In `ui/src/screens/ProcessList.tsx`:
  1. Add the tombstone colour to `TAG_CLS`:
     ```tsx
     const TAG_CLS: Record<string, string> = {
       sub: 'text-[#B4690E] bg-[#FBEEDC]', conflict: 'text-conflict bg-[#FFE9E7]',
       kpi: 'text-violet bg-tile-v', plain: 'text-violet bg-tile-v',
       tombstone: 'text-muted bg-[#EDEAF3]',
     }
     ```
  2. Import `Link`: change `import { useNavigate, useParams } from 'react-router-dom'` to `import { Link, useNavigate, useParams } from 'react-router-dom'`.
  3. Branch the row body on `p.tombstoned`. Replace the row `.map` body (the `return (<div key={p.id} …>…</div>)`) with a version that computes `const tombstoned = !!p.tombstoned` and:
     - wraps the row `<div>` with `${tombstoned ? 'opacity-60' : ''}` appended to its className;
     - under the summary line, when tombstoned, renders heir links:
       ```tsx
       {tombstoned && (p.superseded_by ?? []).length > 0 && (
         <div className="text-[12px] text-muted mt-1.5 flex flex-wrap gap-2 items-center">
           <span>جانشین:</span>
           {(p.superseded_by ?? []).map((h) => (
             <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
           ))}
         </div>
       )}
       ```
     - in the action cluster, render the flowchart button only when `!tombstoned`:
       ```tsx
       <div className="flex gap-2 shrink-0">
         <Button variant="ghost" onClick={() => nav(`/processes/${p.id}`)} className="px-3.5 py-[9px] text-[12.5px]">اطلاعات کلی</Button>
         {!tombstoned && (
           <Button variant="violet" onClick={() => nav(`/processes/${p.id}/flow`)} className="px-3.5 py-[9px] text-[12.5px]">فلوچارت</Button>
         )}
         <button onClick={() => setDelTarget({ pid: p.id, name: p.name })} title={tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند'}
           className="flex items-center justify-center w-[38px] shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] rounded-[11px] text-conflict">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></svg>
         </button>
       </div>
       ```
- [ ] **Run it — passes.** `cd code-repo/ui && npm test -- src/screens/ProcessList.test.tsx`. Expected: all cases (existing + new) passing.
- [ ] **Commit.** `feat(ui): view-only tombstone rows with heir links in ProcessList`

---

## Task 4 — Summary: tombstone banner + heir links, edit/save/flowchart suppressed

**Files:** `ui/src/screens/Summary.tsx`, `ui/src/screens/Summary.test.tsx` (create if absent).

**Interfaces:** When `proc.tombstoned`, Summary renders a banner («این فرآیند باطل شده است.» + «جانشین: {id}» links to `/processes/{id}`), and the header action cluster shows **neither** "ویرایش اطلاعات" **nor** "مشاهدهٔ فلوچارت"; the edit `enter()`/`save()` path is unreachable (guard `enter` so it no-ops for a tombstone as defence in depth). The IDEF0/KPI read-only body still renders (it is view-only, which is exactly what we want).

- [ ] **Write failing test.** Create `ui/src/screens/Summary.test.tsx`:
  ```ts
  import { describe, it, expect, vi, afterEach } from 'vitest'
  import { screen } from '@testing-library/react'
  import { Summary } from './Summary'
  import { renderAt } from '../test/utils'

  afterEach(() => vi.restoreAllMocks())

  const TOMB = {
    id: 'cooking-002', department: 'cooking', name: 'فرآیند قدیمی', summary: 's',
    source: { type: 'voice', ref: null, run: null }, parent: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [], edges: [], pending: [],
    tombstoned: true, superseded_by: ['cooking-050'],
  }

  function mock(body: unknown) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }

  describe('Summary — tombstoned', () => {
    it('shows a tombstone banner + heir link and hides edit/flowchart', async () => {
      mock(TOMB)
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
      expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
      expect(screen.getByText(/باطل شده/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /cooking-050/ })).toHaveAttribute('href', '/processes/cooking-050')
      expect(screen.queryByRole('button', { name: 'ویرایش اطلاعات' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'مشاهدهٔ فلوچارت' })).not.toBeInTheDocument()
    })
  })
  ```
  (`Summary` uses `useToast` via `usePutProcess`; the toast is only invoked on save, which this test never triggers, so no `ToastProvider` is needed. If a `useToast` context error surfaces, wrap the render — but the hook is only *called* on the save path, so plain `renderAt` should suffice.)
- [ ] **Run it — fails.** `cd code-repo/ui && npm test -- src/screens/Summary.test.tsx`. Expected: fails — no «باطل شده» banner, no heir link, and "ویرایش اطلاعات"/"مشاهدهٔ فلوچارت" buttons are present.
- [ ] **Minimal implementation.** In `ui/src/screens/Summary.tsx`:
  1. Import `Link`: `import { Link, useNavigate, useParams } from 'react-router-dom'`.
  2. After `const proc: Process = p`, add `const tombstoned = !!proc.tombstoned` and guard entering edit:
     ```tsx
     function enter() {
       if (tombstoned) return
       setDraft({ name: proc.name, summary: proc.summary, idef0: { ...proc.idef0 }, kpis: proc.kpis.map((k) => ({ ...k })) })
     }
     ```
  3. In the header action cluster (`!editing` branch), gate the buttons on `!tombstoned`:
     ```tsx
     {!editing ? (
       tombstoned ? null : (
         <>
           <Button variant="ghost" onClick={enter} className="px-4 py-3 text-[13px]">ویرایش اطلاعات</Button>
           <Button variant="coral" onClick={() => nav(`/processes/${proc.id}/flow`)} className="px-[18px] py-3 text-[13.5px]">مشاهدهٔ فلوچارت</Button>
         </>
       )
     ) : ( … unchanged cancel/save … )}
     ```
  4. Under the id/parent chip row (after the `<div className="flex items-center gap-2.5 mb-2">…</div>`), render the banner when tombstoned:
     ```tsx
     {tombstoned && (
       <div className="mb-3 rounded-xl border border-[#E4DEF0] bg-[#EDEAF3] px-4 py-3 text-[13px] text-muted">
         <div className="font-bold text-ink mb-1">این فرآیند باطل شده است.</div>
         {(proc.superseded_by ?? []).length > 0 && (
           <div className="flex flex-wrap gap-2 items-center">
             <span>جانشین:</span>
             {(proc.superseded_by ?? []).map((h) => (
               <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
             ))}
           </div>
         )}
       </div>
     )}
     ```
- [ ] **Run it — passes.** `cd code-repo/ui && npm test -- src/screens/Summary.test.tsx`. Expected: passing. Also run the file's neighbours if any exist to ensure no regression.
- [ ] **Commit.** `feat(ui): tombstone banner + heir links in Summary, edit suppressed`

---

## Task 5 — Permanent-delete copy: make "permanent" unmistakable

**Files:** `ui/src/write/DeleteProcessConfirm.tsx`, `ui/src/write/DeleteProcessConfirm.test.tsx`.

**Interfaces:** No prop changes — the modal is reused verbatim by both normal and tombstone deletes. Only the body copy is sharpened to stress permanence: keep the existing headline «حذف کامل فرآیند «{name}»؟» and confirm button «حذف کامل فرآیند», and reword the description to add the explicit "برای همیشه و بدون امکان بازیابی" phrasing and that the id is never reused (the design's never-reuse-id guarantee, §4.8). The existing test asserts the DELETE fires on click of the «حذف کامل فرآیند» button — keep that assertion green.

- [ ] **Write failing test.** Append to `ui/src/write/DeleteProcessConfirm.test.tsx`:
  ```ts
  it('spells out that deletion is permanent and the id is never reused', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ deleted: 'cooking-002' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={vi.fn()} />)
    expect(screen.getByText(/برای همیشه و بدون امکان بازیابی/)).toBeInTheDocument()
    expect(screen.getByText(/شناسه.*دوباره.*استفاده نمی‌شود/)).toBeInTheDocument()
  })
  ```
- [ ] **Run it — fails.** `cd code-repo/ui && npm test -- src/write/DeleteProcessConfirm.test.tsx`. Expected: fails — the new phrasing is not in the current copy.
- [ ] **Minimal implementation.** In `ui/src/write/DeleteProcessConfirm.tsx`, replace the description `<div>`:
  ```tsx
  <div className="text-[13px] text-muted leading-loose">
    کل فرآیند همراه با فلوچارت، گره‌ها، KPIها و تعارض‌هایش <b>برای همیشه و بدون امکان بازیابی</b> حذف می‌شود و از فهرست خارج می‌گردد. شناسهٔ این فرآیند نیز دیگر هرگز دوباره استفاده نمی‌شود.
  </div>
  ```
- [ ] **Run it — passes.** `cd code-repo/ui && npm test -- src/write/DeleteProcessConfirm.test.tsx`. Expected: both the existing DELETE test and the new copy test pass.
- [ ] **Commit.** `feat(ui): permanent-delete copy makes irreversibility + id-never-reused explicit`

---

## Task 6 — Backend: exclude tombstones from department counts

**Files:** `ui-backend/inja_ui_backend/routers/departments.py`, `ui-backend/tests/test_departments.py`.

**Interfaces:** `GET /api/departments` returns `{code,name,count,subs,conflicts}`. After this task, a tombstoned process file (`proc.get("tombstoned")` truthy) is **not** counted toward `count`, `subs`, or `conflicts`. `list_processes` still returns tombstoned docs (flag rides along) — unchanged. Rationale (§4.7): tombstones are off the active board; the department's headline "N فرآیند مستندشده" (rendered from `count` in `ProcessList.tsx`) should reflect active processes only.

- [ ] **Write failing test.** Append to `ui-backend/tests/test_departments.py` (it already has `_auth_client` + the golden `data_root` fixture with `cooking-001`, count 1, conflicts 1). This test writes a tombstoned file **directly to disk** (bypassing the schema-validating write route, so it does not depend on Phase-1 schema landing), then asserts the counts ignore it:
  ```python
  import json


  def _write_tombstone(data_root, pid="cooking-002"):
      # Minimal tombstoned doc placed straight on disk (not through the write route,
      # which would schema-validate). Copies the golden process, flips the flag.
      src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
      doc = json.loads(src.read_text(encoding="utf-8"))
      doc["id"] = pid
      doc["tombstoned"] = True
      doc["superseded_by"] = ["cooking-050"]
      dst = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
      dst.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


  def test_tombstoned_process_excluded_from_counts(data_root):
      _write_tombstone(data_root)
      c = _auth_client(data_root)
      rows = c.get("/api/departments").json()
      cooking = next(r for r in rows if r["code"] == "cooking")
      # only the active cooking-001 counts; the tombstone (which also carries the
      # golden's open pending) must not inflate count or conflicts
      assert cooking["count"] == 1
      assert cooking["conflicts"] == 1

  def test_tombstoned_process_still_listed(data_root):
      _write_tombstone(data_root)
      c = _auth_client(data_root)
      procs = c.get("/api/departments/cooking/processes").json()
      tomb = next(p for p in procs if p["id"] == "cooking-002")
      assert tomb["tombstoned"] is True and tomb["superseded_by"] == ["cooking-050"]
  ```
- [ ] **Run it — fails.** `cd code-repo && python -m pytest ui-backend/tests/test_departments.py -q`. Expected: `test_tombstoned_process_excluded_from_counts` fails — `count == 2` and `conflicts == 2` because the current loop counts every file. (`test_tombstoned_process_still_listed` should already pass — `list_processes` is untouched.)
- [ ] **Minimal implementation.** In `ui-backend/inja_ui_backend/routers/departments.py`, skip tombstoned docs in `list_departments`:
  ```python
  @router.get("")
  def list_departments(request: Request, _: str = Depends(require_session)):
      cfg = request.app.state.cfg
      reg = storage.read_json(storage.registry_path(cfg.data_root))
      out = []
      for d in reg["departments"]:
          files = storage.list_process_files(cfg.data_root, d["code"])
          count = 0
          subs = 0
          conflicts = 0
          for path in files:
              proc = storage.read_json(path)
              if proc.get("tombstoned"):
                  continue  # tombstones are off the active board (§4.7)
              count += 1
              if proc.get("parent"):
                  subs += 1
              conflicts += sum(1 for p in proc.get("pending", [])
                               if p.get("status") == "open")
          out.append({"code": d["code"], "name": d["name"],
                      "count": count, "subs": subs, "conflicts": conflicts})
      return out
  ```
  (Note: `count` becomes an active count instead of `len(files)`; the existing golden test `test_departments_list_has_nine_with_counts` still passes because the golden set has no tombstones — cooking stays `count==1`.)
- [ ] **Run it — passes.** `cd code-repo && python -m pytest ui-backend/tests/test_departments.py -q`. Expected: all passing (new + existing).
- [ ] **Commit.** `feat(ui-backend): exclude tombstoned processes from department counts`

---

## Task 7 — Backend: confirm hard-delete works on a tombstone (regression guard)

**Files:** `ui-backend/tests/test_processes_delete.py` (test only — the `DELETE /api/processes/{pid}` route needs **no** change; this task pins the behaviour so a future guard doesn't accidentally block tombstone deletion).

**Interfaces:** `DELETE /api/processes/{pid}` hard-deletes the file, nulls back-references, commits. It already works regardless of `tombstoned` (it keys off the file existing, not its content). This test writes a tombstoned file to disk and asserts the existing route deletes it and returns 200, and that a subsequent GET is 404.

- [ ] **Write failing test.** Append to `ui-backend/tests/test_processes_delete.py`:
  ```python
  import json


  def _write_tombstone(data_root, pid="cooking-002"):
      src = data_root / "departments" / "cooking" / "processes" / "cooking-001.json"
      doc = json.loads(src.read_text(encoding="utf-8"))
      doc["id"] = pid
      doc["tombstoned"] = True
      doc["superseded_by"] = ["cooking-050"]
      dst = data_root / "departments" / "cooking" / "processes" / f"{pid}.json"
      dst.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
      # commit so the delete route's git commit has a clean tree to work from
      import subprocess
      subprocess.run(["git", "-C", str(data_root), "add", "-A"], check=True)
      subprocess.run(["git", "-C", str(data_root), "-c", "user.name=t",
                      "-c", "user.email=t@t", "commit", "-q", "-m", "tombstone"], check=True)


  def test_permanent_delete_of_tombstone(data_root):
      _write_tombstone(data_root)
      c = _c(data_root)
      r = c.delete("/api/processes/cooking-002")
      assert r.status_code == 200
      assert r.json() == {"deleted": "cooking-002"}
      assert c.get("/api/processes/cooking-002").status_code == 404
  ```
  (`_c` and the `data_root` fixture already exist in this file / `conftest.py`.)
- [ ] **Run it — verify it passes as written (behaviour already present).** `cd code-repo && python -m pytest ui-backend/tests/test_processes_delete.py -q`. Expected: **passes** — the route already hard-deletes any process file. This is a pinning/regression test, not a red→green cycle; its value is guarding against a future "block delete on tombstone" mistake. If it unexpectedly fails, that is a real signal — do not weaken the assertion; investigate per superpowers:systematic-debugging.
- [ ] **Commit.** `test(ui-backend): pin permanent-delete of a tombstoned process`

---

## Final verification

- [ ] **Full frontend suite:** `cd code-repo/ui && npm test` — all green (per superpowers:verification-before-completion, paste the summary line).
- [ ] **Full backend suite:** `cd code-repo && python -m pytest ui-backend/tests -q` — all green.
- [ ] **Type/lint (if wired):** `cd code-repo/ui && npm run build` (or `tsc --noEmit` if that is the project's typecheck) to confirm the new optional fields and `Link` imports compile.
- [ ] **Manual smoke (optional, superpowers:verification-before-completion):** with a Phase-1-produced tombstoned `process.json` on disk, load `/departments/{code}` and confirm the «باطل‌شده» row is muted, has an heir link, no flowchart button, and the trash button opens the sharpened permanent-delete modal; open its Summary and confirm the banner + suppressed edit.

## Notes for the executor

- **Phase-1 dependency (schema).** The UI code here is inert until Phase 1 ships `superseded_by`/`tombstoned` in `process.schema.json` and the engine that sets them — but all tests are self-contained (frontend mocks the API; backend writes the tombstoned doc directly to disk), so **this phase is fully implementable and testable before or after Phase 1 lands**, without touching any schema.
- **Do not** add a delete endpoint, change `DELETE`'s mechanics, or add a `tombstoned` write path — Phase 1's engine owns setting the flag; the UI only reads it and reuses the existing hard-delete.
- **`removed?` is unrelated.** The per-node `removed?: boolean` on `ProcNode` is a different concept (a hidden node); do not conflate it with process-level `tombstoned`.
- Branch off `main` before the first commit if the working branch is `main` (per repo git rules); each task above is independently committable, frontend and backend cleanly separable.
