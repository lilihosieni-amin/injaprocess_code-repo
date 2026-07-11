# Phase 6 UI — Sub-project C (Non-canvas Write Flows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add every write flow that isn't the flowchart canvas — department-overview edit, summary (process) edit, create-process modal, process delete, a global conflict inbox + top-bar badge, and toasts — plus two additive read-only Phase-5 backend endpoints they depend on.

**Architecture:** Two small additive FastAPI endpoints (`GET next-id`, `GET /api/pending`) extend the existing thin backend. On the frontend, sub-A's read screens gain edit modes and sub-A's inert affordances (New-process, inbox button) go live; all mutations go through TanStack Query hooks in the existing `api/hooks.ts`, reusing sub-B's `usePutProcess`/`useCreateProcess`. A tiny toast context surfaces success feedback.

**Tech Stack:** Backend: FastAPI + pytest (existing harness). Frontend: React 19, TypeScript (strict, `verbatimModuleSyntax`), TanStack Query 5, react-router-dom 6, Tailwind 3, Vitest 3 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-11-phase-6-ui-sub-c-write-flows-design.md`
**Depends on:** sub-A (screens, shell, tokens, primitives, data layer) and sub-B (`usePutProcess`, `useCreateProcess`, `useResolvePending`) — both merged to `main`.

## Global Constraints

- **Backend endpoints are READ-ONLY helpers (INV-1 intact):** `GET /api/departments/{code}/next-id` → `{"next_id": "<dept>-NNN"}` returns what `allocate-id` WOULD assign (it is stateless — scan disk, max+1, no write); the authoritative id is still allocated by `POST /api/processes`. `GET /api/pending` → an array aggregating **open** pending rows across all processes; resolution still goes through the existing `POST /api/processes/{pid}/pending/{index}`.
- **Frozen schema shapes:** overview `{department,name,sub_units:[{name,description}],personnel:[{role,duties:string[]}],updated_at}`; process `{...,idef0:{inputs,controls,outputs,mechanisms},kpis:[{name,definition?,target?,unit?}],...}`; pending row `{node,field,current,proposed,source,status}`.
- **Existing backend endpoints reused:** `PUT /api/departments/{code}/overview` (stamps `updated_at`, validates, commits), `PUT /api/processes/{pid}` (whole-doc save), `POST /api/processes`, `DELETE /api/processes/{pid}`, `POST /api/processes/{pid}/pending/{index}`.
- **INV-3 (no fabrication):** summary edit keeps the empty-KPI no-fabrication note; nothing auto-generates KPI/ICOM content.
- **INV-5 (human approval before value change):** conflicts stay `pending` until the user accepts/rejects; the original value is never auto-changed (AC-6).
- **TypeScript:** `verbatimModuleSyntax` → type-only imports use `import type`. `erasableSyntaxOnly` → NO `enum`/`namespace` (union types + `const` maps). `strict` + `noUnusedLocals`/`noUnusedParameters`. Local imports extensionless.
- **RTL + Persian:** every displayed number → `toFa`; dates → `jalali`. `dir="rtl"` inherited from the shell.
- **Visual source of truth:** `ui/design/Inja Process System.dc.html` — cross-check each screen against the cited lines.
- **Backend tests:** pytest via the repo `.venv` (`make test` or `pytest ui-backend/tests`). The `data_root` fixture (conftest) seeds a git-inited temp repo from `tests/fixtures/` (cooking has 1 process `cooking-001` with pending rows + a cooking overview). Auth pattern: `_auth_client(data_root)` (see `ui-backend/tests/test_departments.py`).
- **Frontend:** run from `ui/` (`npm test`, `npm run build`); vitest v3.2.7; API mocked via `fetch` spy or `vi.mock('../api/hooks', ...)`.
- **Branch:** create `phase-6-ui-write` off `main`; commit after every task.

---

## File structure

```
ui-backend/inja_ui_backend/
  routers/departments.py    # MODIFY: + GET /{code}/next-id
  routers/pending.py        # CREATE: GET /api/pending (aggregate open pending)
  app.py                    # MODIFY: register pending router
ui-backend/tests/
  test_departments.py       # MODIFY: + next-id tests
  test_pending.py           # CREATE
ui/src/
  api/types.ts              # MODIFY: + PendingItem
  api/hooks.ts              # MODIFY: + usePutOverview, useDeleteProcess, useNextId, usePending, useResolveInboxPending
  write/
    ToastProvider.tsx       # CREATE: toast context + useToast + host
    CreateProcessModal.tsx  # CREATE
    DeleteProcessConfirm.tsx# CREATE
    InboxModal.tsx          # CREATE
  screens/Overview.tsx      # MODIFY: + edit mode
  screens/Summary.tsx       # MODIFY: + edit mode
  screens/ProcessList.tsx   # MODIFY: wire New-process + add/wire delete button
  shell/TopBar.tsx          # MODIFY: inbox badge + open InboxModal
  main.tsx                  # MODIFY: wrap app in <ToastProvider>
```

---

## Task 1: Backend — `GET /api/departments/{code}/next-id`

Returns the id `allocate-id` would assign for a new process in the department (a preview; no write). Unknown department → 404.

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/departments.py`
- Modify: `ui-backend/tests/test_departments.py`

**Interfaces:**
- Consumes: `engine.allocate_process_id(cfg, code)` (stateless), `storage.read_json`, `storage.registry_path`.
- Produces: `GET /api/departments/{code}/next-id` → `{"next_id": str}`.

- [ ] **Step 1: Write the failing tests**

Append to `ui-backend/tests/test_departments.py`:
```python
def test_next_id_previews_allocation(data_root):
    c = _auth_client(data_root)
    r = c.get("/api/departments/cooking/next-id")
    assert r.status_code == 200
    nid = r.json()["next_id"]
    assert nid.startswith("cooking-")
    # stateless: a second call returns the same id (nothing was written)
    assert c.get("/api/departments/cooking/next-id").json()["next_id"] == nid

def test_next_id_unknown_department_404(data_root):
    c = _auth_client(data_root)
    assert c.get("/api/departments/nope/next-id").status_code == 404
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd '/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo' && .venv/bin/pytest ui-backend/tests/test_departments.py -q -k next_id`
Expected: FAIL (404 route not found / assertion).

- [ ] **Step 3: Implement the endpoint**

In `ui-backend/inja_ui_backend/routers/departments.py`, add (the file already imports `engine, gitcommit, storage`, `APIRouter, Depends, HTTPException, Request`, `require_session`):
```python
@router.get("/{code}/next-id")
def next_id(code: str, request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    if code not in {d["code"] for d in reg["departments"]}:
        raise HTTPException(status_code=404, detail="unknown department")
    return {"next_id": engine.allocate_process_id(cfg, code)}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd '/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo' && .venv/bin/pytest ui-backend/tests/test_departments.py -q -k next_id`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add ui-backend/inja_ui_backend/routers/departments.py ui-backend/tests/test_departments.py
git commit -m "feat(ui-backend): GET next-id preview endpoint (stateless allocate-id)"
```

---

## Task 2: Backend — `GET /api/pending` (aggregate open pending)

A new router aggregating every **open** pending row across all processes for the global inbox + badge.

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/pending.py`
- Modify: `ui-backend/inja_ui_backend/app.py`
- Create: `ui-backend/tests/test_pending.py`

**Interfaces:**
- Produces: `GET /api/pending` → `[{process, department, name, node, index, field, current, proposed, source, status}]` (only `status=='open'`; `index` = position in that process's `pending` array).

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_pending.py`:
```python
import argon2
from fastapi.testclient import TestClient
from inja_ui_backend.app import create_app
from inja_ui_backend.tests_helpers import cfg_for


def _auth_client(data_root):
    cfg = cfg_for(data_root)
    cfg = cfg.__class__(**{**cfg.__dict__,
                           "ui_password_hash": argon2.PasswordHasher().hash("pw")})
    c = TestClient(create_app(cfg))
    c.post("/api/auth/login", json={"username": "analyst", "password": "pw"})
    return c


def test_pending_aggregates_open_rows_with_index(data_root):
    c = _auth_client(data_root)
    rows = c.get("/api/pending").json()
    assert isinstance(rows, list) and len(rows) >= 1
    r = rows[0]
    assert {"process", "department", "name", "node", "index",
            "field", "current", "proposed", "source", "status"} <= set(r)
    assert r["status"] == "open"
    # index points at the same row inside that process's pending array
    proc = c.get(f"/api/processes/{r['process']}").json()
    assert proc["pending"][r["index"]]["node"] == r["node"]


def test_pending_excludes_resolved(data_root):
    c = _auth_client(data_root)
    before = c.get("/api/pending").json()
    first = before[0]
    c.post(f"/api/processes/{first['process']}/pending/{first['index']}",
           json={"decision": "reject"})
    after = c.get("/api/pending").json()
    assert len(after) == len(before) - 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest ui-backend/tests/test_pending.py -q` (from repo root)
Expected: FAIL (404 — route not registered).

- [ ] **Step 3: Create the router**

`ui-backend/inja_ui_backend/routers/pending.py`:
```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from .. import storage
from ..auth import require_session

router = APIRouter(prefix="/api/pending")


@router.get("")
def list_pending(request: Request, _: str = Depends(require_session)):
    cfg = request.app.state.cfg
    reg = storage.read_json(storage.registry_path(cfg.data_root))
    out = []
    for d in reg["departments"]:
        for fp in storage.list_process_files(cfg.data_root, d["code"]):
            doc = storage.read_json(fp)
            for i, p in enumerate(doc.get("pending", [])):
                if p.get("status") == "open":
                    out.append({
                        "process": doc["id"], "department": doc["department"],
                        "name": doc["name"], "node": p["node"], "index": i,
                        "field": p["field"], "current": p["current"],
                        "proposed": p["proposed"], "source": p["source"],
                        "status": p["status"],
                    })
    return out
```

- [ ] **Step 4: Register the router**

In `ui-backend/inja_ui_backend/app.py`, next to the other `include_router` lines, add:
```python
from .routers import pending as pending_router
# ... inside create_app, with the other includes:
    app.include_router(pending_router.router)
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/pytest ui-backend/tests/test_pending.py -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Full backend suite + commit**

Run: `.venv/bin/pytest -q` (expect all green).
```bash
git add ui-backend/inja_ui_backend/routers/pending.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_pending.py
git commit -m "feat(ui-backend): GET /api/pending aggregate open conflicts"
```

---

## Task 3: Frontend — hooks + `PendingItem` type

The write/read hooks C needs, added to the existing `api/hooks.ts`.

**Files:**
- Modify: `ui/src/api/types.ts`, `ui/src/api/hooks.ts`
- Create: `ui/src/api/hooks.write.test.tsx`

**Interfaces:**
- Produces:
  - `types.ts`: `PendingItem` (matches Task 2's row).
  - `hooks.ts`: `usePutOverview(code)` → mutation `(doc:Overview)=>PUT overview`, invalidates `['overview',code]`; `useDeleteProcess()` → mutation `(pid:string)=>DELETE`, invalidates `['processes']`+`['departments']`; `useNextId(code)` → query `GET next-id` → `{next_id}`; `usePending()` → query `GET /api/pending` → `PendingItem[]`; `useResolveInboxPending()` → mutation `({pid,index,decision})=>POST pending`, invalidates `['pending']`+`['process',pid]`.

- [ ] **Step 1: Add `PendingItem` to `ui/src/api/types.ts`**
```ts
export interface PendingItem {
  process: string; department: string; name: string
  node: string; index: number; field: string
  current: unknown; proposed: unknown; source: string; status: 'open'
}
```

- [ ] **Step 2: Write the failing test**

Create `ui/src/api/hooks.write.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '../test/utils'
import { usePutOverview, useDeleteProcess, useNextId, usePending, useResolveInboxPending } from './hooks'

afterEach(() => vi.restoreAllMocks())
function mock(body: unknown = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('write hooks', () => {
  it('usePutOverview PUTs the overview', async () => {
    const spy = mock()
    const { result } = renderHook(() => usePutOverview('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ department: 'cooking' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' }))
  })
  it('useDeleteProcess DELETEs', async () => {
    const spy = mock({ deleted: 'cooking-002' })
    const { result } = renderHook(() => useDeleteProcess(), { wrapper: createWrapper() })
    result.current.mutate('cooking-002')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'DELETE' }))
  })
  it('useNextId GETs the preview id', async () => {
    mock({ next_id: 'cooking-007' })
    const { result } = renderHook(() => useNextId('cooking'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data?.next_id).toBe('cooking-007'))
  })
  it('usePending GETs the aggregate', async () => {
    mock([{ process: 'cooking-001', index: 0 }])
    const { result } = renderHook(() => usePending(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data?.length).toBe(1))
  })
  it('useResolveInboxPending POSTs the decision', async () => {
    const spy = mock({ id: 'cooking-001' })
    const { result } = renderHook(() => useResolveInboxPending(), { wrapper: createWrapper() })
    result.current.mutate({ pid: 'cooking-001', index: 2, decision: 'accept' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/2', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'accept' }) }))
  })
})
```

- [ ] **Step 3: Run to verify it fails** — `cd ui && npx vitest run src/api/hooks.write.test.tsx` → FAIL (exports missing).

- [ ] **Step 4: Add the hooks to `ui/src/api/hooks.ts`**

Append (merge `Overview`, `PendingItem`, `Process` into the existing `import type` line):
```ts
export function usePutOverview(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: Overview) => fetchJson<Overview>(`/api/departments/${code}/overview`, { method: 'PUT', body: JSON.stringify(doc) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overview', code] }),
  })
}

export function useDeleteProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pid: string) => fetchJson<{ deleted: string }>(`/api/processes/${pid}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processes'] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export const useNextId = (code: string) =>
  useQuery({ queryKey: ['next-id', code], queryFn: () => fetchJson<{ next_id: string }>(`/api/departments/${code}/next-id`) })

export const usePending = () =>
  useQuery({ queryKey: ['pending'], queryFn: () => fetchJson<PendingItem[]>('/api/pending') })

export function useResolveInboxPending() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, index, decision }: { pid: string; index: number; decision: 'accept' | 'reject' }) =>
      fetchJson<Process>(`/api/processes/${pid}/pending/${index}`, { method: 'POST', body: JSON.stringify({ decision }) }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['pending'] })
      qc.invalidateQueries({ queryKey: ['process', v.pid] })
    },
  })
}
```

- [ ] **Step 5: Run to verify it passes** — `cd ui && npx vitest run src/api/hooks.write.test.tsx` then `cd ui && npm test && npm run build` → all green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/api/types.ts ui/src/api/hooks.ts ui/src/api/hooks.write.test.tsx
git commit -m "feat(ui/api): overview/delete/next-id/pending/resolve write hooks"
```

---

## Task 4: Frontend — toast system

A context provider + `useToast()` hook that shows a transient success toast (prototype lines 774–780). `useToast` falls back to a no-op when no provider is present (so component tests don't need to wrap).

**Files:**
- Create: `ui/src/write/ToastProvider.tsx`, `ui/src/write/ToastProvider.test.tsx`
- Modify: `ui/src/main.tsx`

**Interfaces:**
- Produces: `<ToastProvider>` (wraps the app, renders the toast host); `useToast()` → `{ show: (message: string) => void }`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/write/ToastProvider.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './ToastProvider'

function Trigger() {
  const { show } = useToast()
  return <button onClick={() => show('ذخیره شد')}>go</button>
}

describe('ToastProvider', () => {
  it('shows a toast message when show() is called', () => {
    render(<ToastProvider><Trigger /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    expect(screen.getByText('ذخیره شد')).toBeInTheDocument()
  })
  it('useToast is a no-op without a provider (no throw)', () => {
    render(<Trigger />)
    act(() => { screen.getByText('go').click() })
    expect(screen.queryByText('ذخیره شد')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/write/ToastProvider.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/write/ToastProvider.tsx`**
```tsx
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastCtx = { show: (message: string) => void }
const Ctx = createContext<ToastCtx>({ show: () => {} })

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMessage(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2600)
  }, [])
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3 rounded-xl text-[13px] font-semibold shadow-modal z-[60] flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7BE0A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          {message}
        </div>
      )}
    </Ctx.Provider>
  )
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/write/ToastProvider.test.tsx` → PASS.

- [ ] **Step 5: Mount in `ui/src/main.tsx`**

Wrap the `<RouterProvider>` with `<ToastProvider>` inside `<QueryClientProvider>`:
```tsx
import { ToastProvider } from './write/ToastProvider'
// ...
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
```

- [ ] **Step 6: Full suite + build + commit**

Run: `cd ui && npm test && npm run build` → green.
```bash
git add ui/src/write/ToastProvider.tsx ui/src/write/ToastProvider.test.tsx ui/src/main.tsx
git commit -m "feat(ui/write): toast provider + useToast (mounted at root)"
```

---

## Task 5: Frontend — Department overview edit mode

`Overview.tsx` gains a view↔edit toggle. Edit holds a draft; sub-units and personnel are add/edit/delete lists (duties edited as newline text ↔ string array); Save PUTs the whole overview.

**Files:**
- Modify: `ui/src/screens/Overview.tsx`
- Create: `ui/src/screens/Overview.edit.test.tsx`

**Interfaces:**
- Consumes: `useOverview(code)`, `usePutOverview(code)`, `useToast`, `Button`, `Card`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Overview.edit.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const OV = { department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت'] }] }

describe('Overview edit', () => {
  it('enters edit, changes a sub-unit name, and PUTs on save', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview')
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    const nameInput = screen.getByDisplayValue('آشپزخانهٔ گرم')
    fireEvent.change(nameInput, { target: { value: 'آشپزخانهٔ سرد' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' })))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/screens/Overview.edit.test.tsx` → FAIL (no edit mode).

- [ ] **Step 3: Rewrite `ui/src/screens/Overview.tsx`** with view + edit. Cross-check prototype lines 179–283.
```tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOverview, usePutOverview } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { jalali } from '../lib/format'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { useToast } from '../write/ToastProvider'
import type { Overview as OverviewT } from '../api/types'

type Draft = { sub_units: { name: string; description: string }[]; personnel: { role: string; duties: string }[] }

export function Overview() {
  const { code = '' } = useParams()
  const { data } = useOverview(code)
  const put = usePutOverview(code)
  const toast = useToast()
  const m = deptMeta(code)
  const [draft, setDraft] = useState<Draft | null>(null)
  if (!data) return <div className="flex-1 bg-bg" />

  function enter() {
    setDraft({
      sub_units: data!.sub_units.map((s) => ({ ...s })),
      personnel: data!.personnel.map((p) => ({ role: p.role, duties: p.duties.join('\n') })),
    })
  }
  function save() {
    const d = draft!
    const doc: OverviewT = {
      ...data!,
      sub_units: d.sub_units,
      personnel: d.personnel.map((p) => ({ role: p.role, duties: p.duties.split('\n').map((x) => x.trim()).filter(Boolean) })),
    }
    put.mutate(doc, { onSuccess: () => { setDraft(null); toast.show('اطلاعات دپارتمان ذخیره شد') } })
  }
  const editing = draft !== null

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[920px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
            </div>
            <div>
              <div className="font-extrabold text-[22px] text-ink">{data.name}</div>
              <div className="text-xs text-faint mt-1">آخرین به‌روزرسانی: {jalali(data.updated_at)}</div>
            </div>
          </div>
          {!editing ? (
            <Button variant="violet" onClick={enter} className="px-4 py-2.5 text-[13px]">ویرایش</Button>
          ) : (
            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => setDraft(null)} className="px-4 py-2.5 text-[13px]">انصراف</Button>
              <Button variant="green" onClick={save} disabled={put.isPending} className="px-4 py-2.5 text-[13px]">ذخیره</Button>
            </div>
          )}
        </div>

        <Section title="واحدهای زیرمجموعه"
          onAdd={editing ? () => setDraft({ ...draft!, sub_units: [...draft!.sub_units, { name: '', description: '' }] }) : undefined}>
          {!editing ? (
            <div className="grid grid-cols-2 gap-3">
              {data.sub_units.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">واحدی ثبت نشده است.</div>}
              {data.sub_units.map((s, i) => (
                <Card key={i} className="px-[17px] py-[15px]">
                  <div className="font-bold text-sm text-ink">{s.name}</div>
                  <div className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{s.description}</div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {draft!.sub_units.map((s, i) => (
                <Card key={i} className="p-3.5 flex gap-3 items-start">
                  <div className="flex-1 flex flex-col gap-2">
                    <input value={s.name} onChange={(e) => patch('sub_units', i, { name: e.target.value })} placeholder="نام واحد"
                      className="w-full px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[13px] font-bold text-ink outline-none focus:border-coral" />
                    <textarea value={s.description} onChange={(e) => patch('sub_units', i, { description: e.target.value })} rows={2} placeholder="شرح واحد"
                      className="w-full px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[12.5px] text-ink outline-none focus:border-coral resize-y" />
                  </div>
                  <button onClick={() => del('sub_units', i)} title="حذف واحد" className="w-8 h-8 shrink-0 border-[1.5px] border-[#FADAD8] rounded-[9px] text-conflict">🗑</button>
                </Card>
              ))}
            </div>
          )}
        </Section>

        <Section title="پرسنل و شرح وظایف"
          onAdd={editing ? () => setDraft({ ...draft!, personnel: [...draft!.personnel, { role: '', duties: '' }] }) : undefined}>
          {!editing ? (
            <div className="flex flex-col gap-3">
              {data.personnel.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">پرسنلی ثبت نشده است.</div>}
              {data.personnel.map((pr, i) => (
                <Card key={i} className="px-[18px] py-4">
                  <div className="font-bold text-sm text-ink mb-2.5">{pr.role}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pr.duties.map((d, j) => <span key={j} className="text-[11.5px] text-violet bg-tile-v2 px-2.5 py-1 rounded-full">{d}</span>)}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {draft!.personnel.map((pr, i) => (
                <Card key={i} className="p-3.5 flex gap-3 items-start">
                  <div className="flex-1 flex flex-col gap-2">
                    <input value={pr.role} onChange={(e) => patch('personnel', i, { role: e.target.value })} placeholder="عنوان شغلی"
                      className="w-full px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[13px] font-bold text-ink outline-none focus:border-coral" />
                    <textarea value={pr.duties} onChange={(e) => patch('personnel', i, { duties: e.target.value })} rows={3} placeholder="هر وظیفه در یک خط…"
                      className="w-full px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[12.5px] text-ink outline-none focus:border-coral resize-y" />
                  </div>
                  <button onClick={() => del('personnel', i)} title="حذف نفر" className="w-8 h-8 shrink-0 border-[1.5px] border-[#FADAD8] rounded-[9px] text-conflict">🗑</button>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )

  function patch<K extends keyof Draft>(key: K, i: number, p: Partial<Draft[K][number]>) {
    setDraft((d) => d && ({ ...d, [key]: d[key].map((row, k) => (k === i ? { ...row, ...p } : row)) }))
  }
  function del<K extends keyof Draft>(key: K, i: number) {
    setDraft((d) => d && ({ ...d, [key]: d[key].filter((_, k) => k !== i) }))
  }
}

function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="font-extrabold text-[15px] text-ink">{title}</div>
        {onAdd && <button onClick={onAdd} className="text-[12px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] rounded-[10px] px-3 py-1.5">افزودن</button>}
      </div>
      {children}
    </section>
  )
}
```
(The 🗑 glyph stands in for the prototype's trash SVG at line 233/278; swap in that SVG for exact fidelity — the handler is what the test checks.)

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/screens/Overview.edit.test.tsx` (existing `Overview.test.tsx` view test must still pass) → PASS. Then `cd ui && npm test && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add ui/src/screens/Overview.tsx ui/src/screens/Overview.edit.test.tsx
git commit -m "feat(ui): department overview edit mode (sub-units + personnel)"
```

---

## Task 6: Frontend — Summary (process) edit mode

`Summary.tsx` gains edit: name, summary, IDEF0 ICOM lists, and KPIs. Save merges into the loaded process doc and PUTs the whole doc (nodes untouched → no id allocation).

**Files:**
- Modify: `ui/src/screens/Summary.tsx`
- Create: `ui/src/screens/Summary.edit.test.tsx`

**Interfaces:**
- Consumes: `useProcess(pid)`, `usePutProcess(pid)` (sub-B), `useToast`, `Chip`, `IdBadge`, `Button`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Summary.edit.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const P = { id: 'cooking-002', department: 'cooking', name: 'پخت', summary: 's', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: ['x'], controls: [], outputs: [], mechanisms: [] }, kpis: [], nodes: [], edges: [], pending: [] }

describe('Summary edit', () => {
  it('enters edit, changes the name, and PUTs the whole doc on save', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_i: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(init?.method === 'PUT' ? { ...P, name: 'X' } : P), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    fireEvent.click(await screen.findByRole('button', { name: /ویرایش اطلاعات/ }))
    fireEvent.change(screen.getByDisplayValue('پخت'), { target: { value: 'پخت جدید' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'PUT' })))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/screens/Summary.edit.test.tsx` → FAIL.

- [ ] **Step 3: Extend `ui/src/screens/Summary.tsx`** with an edit branch. Cross-check prototype lines 302–410. Add at the top of the component (after `const { data: p } = useProcess(pid)` and the null guard):
```tsx
// imports to add:
//   import { useState } from 'react'
//   import { usePutProcess } from '../api/hooks'
//   import { useToast } from '../write/ToastProvider'
//   import type { Process, Icom, Kpi } from '../api/types'
```
Introduce edit state + save:
```tsx
const put = usePutProcess(pid)
const toast = useToast()
type Draft = { name: string; summary: string; idef0: Icom; kpis: Kpi[] }
const [draft, setDraft] = useState<Draft | null>(null)
const editing = draft !== null
function enter() { setDraft({ name: p.name, summary: p.summary, idef0: { ...p.idef0 }, kpis: p.kpis.map((k) => ({ ...k })) }) }
function save() {
  const doc: Process = { ...p, name: draft!.name, summary: draft!.summary, idef0: draft!.idef0, kpis: draft!.kpis }
  put.mutate(doc, { onSuccess: () => { setDraft(null); toast.show('اطلاعات فرآیند ذخیره شد') } })
}
const setIcom = (key: keyof Icom, items: string[]) => setDraft((d) => d && ({ ...d, idef0: { ...d.idef0, [key]: items } }))
```
In the header, swap the name/summary for inputs when editing, and swap the «ویرایش اطلاعات» button for انصراف/ذخیره:
```tsx
{!editing ? (
  <>
    <div className="font-extrabold text-[23px] text-ink">{p.name}</div>
    <div className="text-[13.5px] text-muted mt-2 max-w-[640px] leading-relaxed">{p.summary}</div>
  </>
) : (
  <>
    <input value={draft!.name} onChange={(e) => setDraft({ ...draft!, name: e.target.value })} placeholder="نام فرآیند"
      className="w-[520px] max-w-full font-extrabold text-[19px] text-ink border-[1.5px] border-line rounded-xl px-3 py-2 outline-none focus:border-coral" />
    <textarea value={draft!.summary} onChange={(e) => setDraft({ ...draft!, summary: e.target.value })} rows={2} placeholder="خلاصهٔ فرآیند"
      className="w-[520px] max-w-full mt-2 text-[13px] text-ink border-[1.5px] border-line rounded-xl px-3 py-2 outline-none focus:border-coral resize-y" />
  </>
)}
// buttons:
{!editing ? (
  <>
    <Button variant="ghost" onClick={enter} className="px-4 py-3 text-[13px]">ویرایش اطلاعات</Button>
    <Button variant="coral" onClick={() => nav(`/processes/${p.id}/flow`)} className="px-[18px] py-3 text-[13.5px]">مشاهدهٔ فلوچارت</Button>
  </>
) : (
  <>
    <Button variant="ghost" onClick={() => setDraft(null)} className="px-4 py-3 text-[13px]">انصراف</Button>
    <Button variant="green" onClick={save} disabled={put.isPending} className="px-[18px] py-3 text-[13.5px]">ذخیره</Button>
  </>
)}
```
For the IDEF0 box + KPIs: when `!editing`, keep the existing view (the A-0 grid + KPI cards / empty note). When `editing`, render the ICOM edit form (4 `ListEditor`s for inputs/controls/outputs/mechanisms) and a KPI editor. Add these two small helpers to the file:
```tsx
function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-ink mb-2">{label}</div>
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
              className="flex-1 px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-coral" />
            <button onClick={() => onChange(items.filter((_, k) => k !== i))} className="w-[30px] h-[30px] shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] text-conflict rounded-[9px]">×</button>
          </div>
        ))}
        <button onClick={() => onChange([...items, ''])} className="self-start text-[11.5px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] bg-[#F8F4FE] rounded-[9px] px-3 py-1.5">افزودن</button>
      </div>
    </div>
  )
}
```
and render, in the edit branch:
```tsx
<div className="bg-white border border-warm rounded-[18px] p-6 mb-5 shadow-card grid grid-cols-2 gap-5">
  <ListEditor label="ورودی‌ها" items={draft!.idef0.inputs} onChange={(v) => setIcom('inputs', v)} />
  <ListEditor label="کنترل‌ها" items={draft!.idef0.controls} onChange={(v) => setIcom('controls', v)} />
  <ListEditor label="خروجی‌ها" items={draft!.idef0.outputs} onChange={(v) => setIcom('outputs', v)} />
  <ListEditor label="مکانیزم‌ها" items={draft!.idef0.mechanisms} onChange={(v) => setIcom('mechanisms', v)} />
</div>
{/* KPI editor: list of {name, definition, target} with add/del */}
<div className="flex flex-col gap-3">
  {draft!.kpis.map((k, i) => (
    <div key={i} className="bg-white border border-warm rounded-[14px] p-4 flex gap-2.5 items-start">
      <div className="flex-1 flex flex-col gap-2">
        <input value={k.name} onChange={(e) => setKpi(i, { name: e.target.value })} placeholder="نام شاخص" className="px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[13px] font-bold text-ink outline-none focus:border-coral" />
        <input value={k.definition ?? ''} onChange={(e) => setKpi(i, { definition: e.target.value })} placeholder="تعریف شاخص" className="px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-coral" />
        <input value={k.target ?? ''} onChange={(e) => setKpi(i, { target: e.target.value })} placeholder="مقدار هدف" className="px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[12.5px] text-conflict font-semibold outline-none focus:border-coral" />
      </div>
      <button onClick={() => setDraft({ ...draft!, kpis: draft!.kpis.filter((_, k2) => k2 !== i) })} className="w-8 h-8 shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] text-conflict rounded-[9px]">×</button>
    </div>
  ))}
  <button onClick={() => setDraft({ ...draft!, kpis: [...draft!.kpis, { name: '' }] })} className="self-start text-[12px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] bg-[#F8F4FE] rounded-[9px] px-3 py-1.5">افزودن شاخص</button>
</div>
```
with `const setKpi = (i: number, p2: Partial<Kpi>) => setDraft((d) => d && ({ ...d, kpis: d.kpis.map((k, k2) => (k2 === i ? { ...k, ...p2 } : k)) }))`.

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/screens/Summary.edit.test.tsx` (existing `Summary.test.tsx` must still pass) → PASS. Then `cd ui && npm test && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add ui/src/screens/Summary.tsx ui/src/screens/Summary.edit.test.tsx
git commit -m "feat(ui): summary edit mode (name/summary/IDEF0/KPIs)"
```

---

## Task 7: Frontend — Create-process modal

A modal opened from the process list's «فرآیند جدید» button: department fixed, name input, system-suggested next id (from `useNextId`), create → navigate into the new process's flow.

**Files:**
- Create: `ui/src/write/CreateProcessModal.tsx`, `ui/src/write/CreateProcessModal.test.tsx`
- Modify: `ui/src/screens/ProcessList.tsx`

**Interfaces:**
- Consumes: `useNextId(code)`, `useCreateProcess()` (sub-B), `useToast`, `useNavigate`, `Button`, `toFa`.
- Produces: `CreateProcessModal({ department, departmentName, onClose })`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/write/CreateProcessModal.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { CreateProcessModal } from './CreateProcessModal'

afterEach(() => vi.restoreAllMocks())
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('CreateProcessModal', () => {
  it('shows the suggested id and POSTs on create', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/next-id')) return Promise.resolve(new Response(JSON.stringify({ next_id: 'cooking-007' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-007' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={() => {}} />)
    expect(await screen.findByText('cooking-007')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/نام فرآیند/), { target: { value: 'فرآیند تست' } })
    fireEvent.click(screen.getByRole('button', { name: /ایجاد/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes', expect.objectContaining({ method: 'POST' })))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/write/CreateProcessModal.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/write/CreateProcessModal.tsx`** (prototype lines 715–733)
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProcess, useNextId } from '../api/hooks'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'

export function CreateProcessModal({ department, departmentName, onClose }: { department: string; departmentName: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const { data: next } = useNextId(department)
  const create = useCreateProcess()
  const toast = useToast()
  const nav = useNavigate()

  function doCreate() {
    create.mutate({ department, name: name || undefined }, {
      onSuccess: (child) => { toast.show('فرآیند ایجاد شد'); onClose(); nav(`/processes/${child.id}/flow`) },
    })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-50 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal">
        <div className="px-[22px] py-5 bg-white border-b border-warm">
          <div className="font-extrabold text-[17px] text-ink">ایجاد فرآیند جدید</div>
          <div className="text-[12px] text-muted mt-0.5">شناسه به‌صورت خودکار توسط سامانه تخصیص می‌یابد.</div>
        </div>
        <div className="p-[22px]">
          <label className="text-[11px] font-bold text-muted block mb-1.5">دپارتمان</label>
          <div className="w-full px-3 py-2.5 rounded-[10px] bg-tile-v2 text-muted text-[13px] mb-3">{departmentName}</div>
          <label className="text-[11px] font-bold text-muted block mb-1.5">نام فرآیند</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: فرآیند کنترل کیفیت"
            className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-[10px] text-[13px] text-ink outline-none focus:border-coral mb-3" />
          <label className="text-[11px] font-bold text-muted block mb-1.5">شناسهٔ پیشنهادی سامانه</label>
          <div dir="ltr" className="w-full px-3 py-2.5 rounded-[10px] bg-tile-v2 text-violet font-mono text-[13px]">{next?.next_id ?? '…'}</div>
          <div className="flex gap-2.5 mt-[22px]">
            <Button variant="ghost" onClick={onClose} className="flex-1 py-2.5 text-[13px]">انصراف</Button>
            <Button variant="coral" onClick={doCreate} disabled={create.isPending} className="flex-1 py-2.5 text-[13px]">ایجاد و ویرایش</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire into `ui/src/screens/ProcessList.tsx`**

Add `import { useState } from 'react'` and `import { CreateProcessModal } from '../write/CreateProcessModal'`; add `const [creating, setCreating] = useState(false)`; give the «فرآیند جدید» button `onClick={() => setCreating(true)}`; render at the end: `{creating && <CreateProcessModal department={code} departmentName={dept?.name ?? ''} onClose={() => setCreating(false)} />}`.

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/write/CreateProcessModal.test.tsx` then `cd ui && npm test && npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/write/CreateProcessModal.tsx ui/src/write/CreateProcessModal.test.tsx ui/src/screens/ProcessList.tsx
git commit -m "feat(ui/write): create-process modal (system-allocated id) wired into list"
```

---

## Task 8: Frontend — Delete-process confirm

Add a delete (trash) button to each process card and a confirm modal that hard-deletes via `useDeleteProcess`.

**Files:**
- Create: `ui/src/write/DeleteProcessConfirm.tsx`, `ui/src/write/DeleteProcessConfirm.test.tsx`
- Modify: `ui/src/screens/ProcessList.tsx`

**Interfaces:**
- Consumes: `useDeleteProcess()`, `useToast`, `IdBadge`.
- Produces: `DeleteProcessConfirm({ pid, name, onClose })`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/write/DeleteProcessConfirm.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { DeleteProcessConfirm } from './DeleteProcessConfirm'

afterEach(() => vi.restoreAllMocks())
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('DeleteProcessConfirm', () => {
  it('DELETEs and closes on confirm', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ deleted: 'cooking-002' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    expect(screen.getByText(/پخت/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /حذف کامل فرآیند/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'DELETE' })))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/write/DeleteProcessConfirm.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/write/DeleteProcessConfirm.tsx`** (prototype lines 755–772)
```tsx
import { useDeleteProcess } from '../api/hooks'
import { useToast } from './ToastProvider'
import { IdBadge } from '../ui/IdBadge'

export function DeleteProcessConfirm({ pid, name, onClose }: { pid: string; name: string; onClose: () => void }) {
  const del = useDeleteProcess()
  const toast = useToast()
  function confirm() {
    del.mutate(pid, { onSuccess: () => { toast.show('فرآیند حذف شد'); onClose() } })
  }
  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-[72] p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal">
        <div className="p-6 pb-5 text-center">
          <div className="font-extrabold text-[17px] text-ink mb-2">حذف کامل فرآیند «{name}»؟</div>
          <div className="mb-2.5"><IdBadge>{pid}</IdBadge></div>
          <div className="text-[13px] text-muted leading-loose">کل فرآیند همراه با فلوچارت، گره‌ها، KPIها و تعارض‌هایش برای همیشه حذف می‌شود و از فهرست خارج می‌گردد. این کار قابل بازگردانی نیست.</div>
        </div>
        <div className="flex gap-2.5 px-[22px] pb-[22px]">
          <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl text-sm font-bold text-[#6B5CA5]">انصراف</button>
          <button onClick={confirm} disabled={del.isPending} className="flex-1 py-3 border-0 bg-conflict rounded-xl text-sm font-bold text-white">حذف کامل فرآیند</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire into `ui/src/screens/ProcessList.tsx`**

Add `import { DeleteProcessConfirm } from '../write/DeleteProcessConfirm'`; add `const [delTarget, setDelTarget] = useState<{ pid: string; name: string } | null>(null)`; add a trash button in each card's button group (prototype lines 167–169):
```tsx
<button onClick={() => setDelTarget({ pid: p.id, name: p.name })} title="حذف فرآیند"
  className="flex items-center justify-center w-[38px] shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] rounded-[11px] text-conflict">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></svg>
</button>
```
and render at the end: `{delTarget && <DeleteProcessConfirm pid={delTarget.pid} name={delTarget.name} onClose={() => setDelTarget(null)} />}`.

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/write/DeleteProcessConfirm.test.tsx` then `cd ui && npm test && npm run build` → green (the existing `ProcessList.test.tsx` still passes — the new trash button doesn't change its assertions).

- [ ] **Step 6: Commit**
```bash
git add ui/src/write/DeleteProcessConfirm.tsx ui/src/write/DeleteProcessConfirm.test.tsx ui/src/screens/ProcessList.tsx
git commit -m "feat(ui/write): process delete button + confirm modal"
```

---

## Task 9: Frontend — Global conflict inbox + top-bar badge

The top-bar inbox button opens a modal listing all open pending across processes (current-vs-proposed, accept/reject, "view in flowchart" jump); the button shows a pending-count badge.

**Files:**
- Create: `ui/src/write/InboxModal.tsx`, `ui/src/write/InboxModal.test.tsx`
- Modify: `ui/src/shell/TopBar.tsx`

**Interfaces:**
- Consumes: `usePending()`, `useResolveInboxPending()`, `useToast`, `useNavigate`, `IdBadge`, `toFa`, `fieldFa` (from `../flow/adapt`).
- Produces: `InboxModal({ onClose })`; TopBar badge from `usePending().data?.length`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/write/InboxModal.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { InboxModal } from './InboxModal'

afterEach(() => vi.restoreAllMocks())
const ROW = { process: 'cooking-001', department: 'cooking', name: 'خرید', node: 'cooking-001-n020',
  index: 0, field: 'actor', current: 'مدیر رستوران', proposed: 'معاون مدیر', source: 'جلسه', status: 'open' }
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('InboxModal', () => {
  it('lists pending and accepts by (pid, index)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/pending')) return Promise.resolve(new Response(JSON.stringify([ROW]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-001' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    wrap(<InboxModal onClose={() => {}} />)
    expect(await screen.findByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /پذیرش/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/0', expect.objectContaining({ method: 'POST' })))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/write/InboxModal.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/write/InboxModal.tsx`** (prototype lines 672–712)
```tsx
import { useNavigate } from 'react-router-dom'
import { usePending, useResolveInboxPending } from '../api/hooks'
import { useToast } from './ToastProvider'
import { fieldFa } from '../flow/adapt'
import { IdBadge } from '../ui/IdBadge'
import { toFa } from '../lib/format'

export function InboxModal({ onClose }: { onClose: () => void }) {
  const { data: rows = [] } = usePending()
  const resolve = useResolveInboxPending()
  const toast = useToast()
  const nav = useNavigate()

  function decide(pid: string, index: number, decision: 'accept' | 'reject') {
    resolve.mutate({ pid, index, decision }, { onSuccess: () => toast.show(decision === 'accept' ? 'پیشنهاد پذیرفته شد' : 'پیشنهاد رد شد') })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-50 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-full max-h-[86vh] bg-bg rounded-[20px] flex flex-col overflow-hidden shadow-modal">
        <div className="flex items-center justify-between px-[22px] py-5 bg-white border-b border-warm">
          <div>
            <div className="font-extrabold text-[17px] text-ink">صندوق بازبینی تعارض‌ها</div>
            <div className="text-[12px] text-muted mt-0.5">مقدار فعلی در برابر پیشنهاد — تا تصمیم شما مقدار اصلی دست‌نخورده می‌ماند.</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-tile-v2 rounded-[9px] text-muted text-lg">×</button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {rows.length === 0 ? (
            <div className="text-center py-10 text-faint">
              <div className="text-[13.5px] font-semibold text-muted">تعارض بازی وجود ندارد</div>
              <div className="text-[12px] mt-1">همهٔ پیشنهادها رسیدگی شده‌اند.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {rows.map((c) => (
                <div key={`${c.process}#${c.index}`} className="bg-white border border-warm rounded-[14px] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <IdBadge>{c.node}</IdBadge>
                    <span className="text-[12.5px] font-bold text-ink">{fieldFa(c.field)}</span>
                    <span className="text-[10.5px] text-faint">{c.source}</span>
                    <button onClick={() => { onClose(); nav(`/processes/${c.process}/flow`) }} className="ms-auto text-[11px] font-semibold text-violet border-[1.5px] border-line bg-white rounded-lg px-2.5 py-1.5">مشاهده در فلوچارت</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                    <div className="bg-[#F6F3FB] border border-[#EDE5F5] rounded-[10px] px-3 py-2.5"><div className="text-[10px] text-faint mb-1">مقدار فعلی</div><div className="text-[12.5px] text-[#5a5175] leading-normal">{String(c.current)}</div></div>
                    <div className="bg-[#FFF3F2] border border-[#FDD9D6] rounded-[10px] px-3 py-2.5"><div className="text-[10px] text-conflict mb-1">پیشنهاد جدید</div><div className="text-[12.5px] text-[#8a2b26] font-semibold leading-normal">{String(c.proposed)}</div></div>
                  </div>
                  <div className="flex gap-2.5">
                    <button onClick={() => decide(c.process, c.index, 'accept')} className="flex-1 py-2.5 rounded-[10px] bg-green text-white font-bold text-[12.5px]">پذیرش پیشنهاد</button>
                    <button onClick={() => decide(c.process, c.index, 'reject')} className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-line bg-white text-muted font-semibold text-[12.5px]">رد کردن</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```
Note the accept button text «پذیرش پیشنهاد» contains «پذیرش» so the test's `/پذیرش/` matches.

- [ ] **Step 4: Wire into `ui/src/shell/TopBar.tsx`**

Add `import { useState } from 'react'`, `import { usePending } from '../api/hooks'`, `import { InboxModal } from '../write/InboxModal'`, `import { toFa } from '../lib/format'`. In the component: `const [inbox, setInbox] = useState(false)` and `const { data: pending = [] } = usePending()`. Give the inbox button `onClick={() => setInbox(true)}` and `className="btn btn-ghost px-[13px] py-2 text-[12.5px] relative"`, and inside it a badge when `pending.length > 0`:
```tsx
{pending.length > 0 && (
  <span className="absolute -top-1.5 -left-1.5 min-w-[19px] h-[19px] px-1 bg-coral text-white rounded-full text-[10.5px] font-bold flex items-center justify-center border-2 border-white">{toFa(pending.length)}</span>
)}
```
Render at the end of the TopBar's returned tree: `{inbox && <InboxModal onClose={() => setInbox(false)} />}`.

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/write/InboxModal.test.tsx` then the FULL suite `cd ui && npm test && npm run build` → all green (the existing `Breadcrumb.test.tsx`/TopBar-adjacent tests still pass; note TopBar now calls `usePending` — if a shell test renders TopBar without a QueryClient it must be wrapped, but `renderAt` already provides one).

- [ ] **Step 6: Commit**
```bash
git add ui/src/write/InboxModal.tsx ui/src/write/InboxModal.test.tsx ui/src/shell/TopBar.tsx
git commit -m "feat(ui/write): global conflict inbox modal + top-bar pending badge"
```

---

## Self-Review (completed during authoring)

**Spec coverage (sub-C spec §):**
- §1 prerequisite endpoints: `GET next-id` → Task 1; `GET /api/pending` → Task 2. (next-id needs no engine change — `allocate-id` is stateless; verified against the CLI.)
- §2 scope: overview edit → Task 5; summary edit → Task 6; create-process modal → Task 7; process delete → Task 8; global inbox + badge → Task 9; toasts → Task 4.
- §3.1 mutation hooks (usePutOverview/useDeleteProcess/useNextId/usePending + reuse usePutProcess/useCreateProcess/useResolvePending) → Task 3 (+ `useResolveInboxPending` for the pid-per-call inbox case, since sub-B's `useResolvePending(pid)` is pid-bound).
- §3.2 overview edit (draft, duties text↔array, PUT) → Task 5. §3.3 summary edit (name/summary/ICOM/KPIs, whole-doc PUT, INV-3 note) → Task 6. §3.4 create (fixed dept, next-id, POST, navigate) → Task 7. §3.5 delete (DELETE + invalidate) → Task 8. §3.6 global inbox (current-vs-proposed, accept/reject, view-in-flowchart, badge, AC-6) → Task 9. §3.7 toasts → Task 4.
- §4 testing: backend next-id/pending pytest (Tasks 1–2); UI edit drafts + create + delete + inbox + toast component tests (Tasks 3–9).
- §5 exit criteria: AC-6 (inbox accept/reject, original untouched until decision) → Tasks 2+9; FR-I4/I5/D2/D3 → Tasks 7/9/6; INV-1 (id from allocate-id) → Tasks 1+7; INV-3 (empty-KPI note preserved) → Task 6; INV-5 → Task 9.

**Placeholder scan:** No "TBD"/"handle later". Two trash-icon glyphs (🗑) in Task 5 stand in for the prototype's trash SVG with a note; the process-delete trash button (Task 8) and all logic use the real SVG/handlers. Every code step has runnable content.

**Type consistency:** `PendingItem` (Task 3) is consumed unchanged in Task 9. Hook names/signatures (`usePutOverview(code)`, `useDeleteProcess()`, `useNextId(code)`, `usePending()`, `useResolveInboxPending()`) match between Task 3 and their consumers. `useToast()` → `{show}` is used identically in Tasks 5–9. `fieldFa` (from sub-B `flow/adapt`) is reused by the inbox. Backend `{next_id}` / pending row shape match between the endpoints (Tasks 1–2) and the hooks/types (Task 3).

**Note:** Task 9 makes `TopBar` (rendered on every authed screen) call `usePending()` — a cheap cached aggregate GET; acceptable. If future perf demands, add a `staleTime`. The `useResolvePending(pid)` from sub-B stays for the in-canvas drawer; the inbox uses the pid-per-call `useResolveInboxPending()` — intentional, not a duplicate to collapse (different call sites, different pid binding).
