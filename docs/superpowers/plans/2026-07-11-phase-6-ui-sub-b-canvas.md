# Phase 6 UI — Sub-project B (Flowchart Canvas on @xyflow/react) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the prototype's flowchart screen (view + edit) on `@xyflow/react` custom nodes/edges — activity/terminal/junction nodes, labeled edges, drag-to-link, add/delete, undo/redo, full-reset relayout, manual Save, a node detail drawer (view + edit + subprocess linking + inline conflict accept/reject), and a junction gate editor.

**Architecture:** The editor holds the editable `process.json` in a `useFlowEditor` reducer as the single source of truth; `@xyflow/react` nodes/edges are *derived* from it each render via `adapt.ts`. We lean on React Flow's built-in pan/zoom/fit/selection/connection (`Handle` + `onConnect`) styled to the prototype; structural edits go through the reducer so undo/redo and Save see one state. Save/relayout/pending/create all go through the Phase-5 backend, which owns id allocation (INV-1) and layout.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`), `@xyflow/react` 12.11.2, `@tanstack/react-query` 5, `react-router-dom` 6, Tailwind 3, Vitest 3 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-11-phase-6-ui-sub-b-canvas-design.md`
**Depends on:** sub-project A (tokens, primitives, shell, routing, `useProcess`, `IdBadge`, `Chip`, `Button`). Sub-A is merged to `main`.

## Global Constraints

- **Node 18**; `@xyflow/react@12.11.2`, `vitest@3.2.7` already installed. No new runtime deps.
- **TypeScript:** `verbatimModuleSyntax` on → type-only imports use `import type`. `erasableSyntaxOnly` on → NO `enum`/`namespace`/param-properties (union types + `const` maps). `strict` + `noUnusedLocals`/`noUnusedParameters`. Local imports extensionless.
- **Data shape = the frozen schema** (`schemas/process.schema.json`). Node field `description` (not `desc`); node `source` = `{created_by,touched_by}`; `layout:'auto'|'manual'`; junction `junctionType:'AND'|'OR'|'XOR'` + `direction:'split'|'join'`; `subprocess:string|null`; `edge` = `{from,to,label?}`.
- **Backend contract (Phase 5, done):** `GET /api/processes/{pid}` → process; `PUT /api/processes/{pid}` (whole doc) → saved doc (allocates real ids for temp-keyed new nodes, rewrites edges, trusts incoming `layout`, forces `manual` on new nodes, stamps provenance); `POST /api/processes/{pid}/relayout` (whole doc) → **fully re-laid-out** doc (every node repositioned + `layout:"auto"`, temp ids realized); `POST /api/processes/{pid}/pending/{index}` `{decision:'accept'|'reject'}` → updated doc; `POST /api/processes` `{department,name?,parent?}` → new child doc with allocated id.
- **§3.5 full-reset is ALREADY DONE** in the engine + backend: `full_relayout` overrides `manual`→`auto`, `local_relayout` (merge) preserves `manual`, backend `run_layout` shells `layout … --full`, and tests `test_full_relayout_positions_all_and_sets_auto` + `test_local_relayout_preserves_upstream_and_manual` pass. **B does NOT touch the engine or backend** — it only calls the relayout endpoint and applies the response wholesale.
- **New nodes use temp ids** `tmp-n-<counter>` / `tmp-j-<counter>` (must NOT match real patterns `^[a-z]+-[0-9]{3}-n[0-9]{3}$` / `-j[0-9]+`), so the backend treats them as new. Terminals keep ids `start`/`end`.
- **Manual layout:** when the user drags an existing node, the editor sets that node's `layout:"manual"` (the backend trusts incoming layout). Relayout response resets all to `"auto"` — adopt it wholesale.
- **Delete (per spec §3.2):** UI delete removes the node from the working doc and re-links previous→next so the path doesn't break; undoable. (The "flag not delete" invariant is merge's concern, not the UI.)
- **View-only default** (FR-I3): pan/zoom/fit always; drag/link/delete/add/undo/redo/relayout only in edit mode. No mutation fires outside edit actions the user triggers.
- **RTL:** the ReactFlow container is `dir="ltr"` (positions are engine LTR-serpentine; keep RF's math LTR) while node **content** is `dir="rtl"`. Page chrome stays RTL.
- **Visual source of truth:** the `isFlow` block of `ui/design/Inja Process System.dc.html` (working-tree/committed version) — cross-check each visual task against the cited lines.
- **Branch:** create `phase-6-ui-canvas` off `main`; commit after every task.

---

## File structure

```
ui/src/
  flow/
    adapt.ts              # process.json <-> ReactFlow nodes/edges; fieldFa; temp-id helpers
    useFlowEditor.ts      # editable-doc state + undo/redo history + edit actions
    Canvas.tsx            # <ReactFlow> wiring: nodeTypes/edgeTypes, viewport, RTL, view/edit
    FlowScreen.tsx        # route screen: load process, toolbar, canvas, drawer; view/edit
    nodes/
      ActivityNode.tsx  StartNode.tsx  EndNode.tsx  JunctionNode.tsx
    edges/
      LabeledEdge.tsx
    DetailDrawer.tsx      # activity view/edit + subprocess link + create-sub; junction gate editor
    DeleteNodeConfirm.tsx # node delete confirm modal
  api/hooks.ts            # +usePutProcess, useRelayout, useResolvePending, useCreateProcess
  test/
    reactflow-mock.ts     # jsdom mocks so <ReactFlow> mounts in tests
    setup.ts              # (modify) install the reactflow mocks globally
  routes.tsx              # (modify) /processes/:pid/flow -> FlowScreen (replaces FlowPlaceholder)
```
`ui/src/screens/FlowPlaceholder.tsx` is deleted when the route is repointed (Task 6).

---

# MILESTONE 1 — Spike + read-only canvas

## Task 1: Spike — prove the interactions on @xyflow/react (GATE)

A throwaway spike (NOT shipped) that confirms the spec's six interaction assumptions before the real build. Because drag-to-link / pan / zoom are interactive, this task has a **human-in-the-loop** verification step: the implementer scaffolds the spike + the automated smoke test it CAN run headless, then the controller/user runs the dev server to eyeball the interactive parts and sign off.

**Files:**
- Create: `ui/src/flow/_spike/Spike.tsx` (throwaway), `ui/src/flow/_spike/spike.test.tsx`, `ui/src/test/reactflow-mock.ts`
- Modify: `ui/src/test/setup.ts` (install RF mocks), `ui/src/routes.tsx` (temporary `/spike` route)
- Create: `ui/src/flow/_spike/SPIKE-FINDINGS.md`

**Interfaces:**
- Produces: `installReactFlowMocks()` in `reactflow-mock.ts` (reused by all later canvas tests); a recorded findings doc that gates Milestone 2+.

- [ ] **Step 1: Add the ReactFlow jsdom mocks**

Create `ui/src/test/reactflow-mock.ts` (React Flow measures nodes via APIs jsdom lacks):
```ts
import { vi } from 'vitest'

// Minimal shims so <ReactFlow> mounts and measures nodes under jsdom.
export function installReactFlowMocks() {
  class RO { observe() {} unobserve() {} disconnect() {} }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
  ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
    m22 = 1
    constructor(_t?: string) {}
  }
  if (!HTMLElement.prototype.getBoundingClientRect.toString().includes('mock')) {
    HTMLElement.prototype.getBoundingClientRect = function mock() {
      return { x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, toJSON() {} } as DOMRect
    }
  }
  ;(window as unknown as { matchMedia: unknown }).matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}
```

- [ ] **Step 2: Install the mocks globally in the test setup**

Append to `ui/src/test/setup.ts`:
```ts
import { installReactFlowMocks } from './reactflow-mock'
installReactFlowMocks()
```

- [ ] **Step 3: Build the spike component**

Create `ui/src/flow/_spike/Spike.tsx` — a minimal canvas exercising every spec interaction (custom activity + junction node, labeled edge, coral connect handle, pan/zoom/fit, LTR container / RTL content):
```tsx
import { useCallback, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position,
  addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function ActivitySpike({ data }: NodeProps) {
  return (
    <div dir="rtl" className="bg-white border border-warm rounded-xl shadow-card px-3 py-2 text-[12.5px] text-ink relative">
      <Handle type="target" position={Position.Left} />
      {(data as { label: string }).label}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-coral !border-2 !border-white" />
    </div>
  )
}
const nodeTypes = { activity: ActivitySpike }

function Inner() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 'a', type: 'activity', position: { x: 40, y: 90 }, data: { label: 'فعالیت ۱' } },
    { id: 'b', type: 'activity', position: { x: 320, y: 90 }, data: { label: 'فعالیت ۲' } },
  ])
  const [edges, setEdges] = useState<Edge[]>([{ id: 'a->b', source: 'a', target: 'b', label: 'نمونه' }])
  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((n) => applyNodeChanges(c, n)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((e) => applyEdgeChanges(c, e)), [])
  const onConnect = useCallback((c: Connection) => setEdges((e) => addEdge({ ...c, label: '' }, e)), [])
  return (
    <div dir="ltr" style={{ width: '100%', height: '100%' }} data-testid="spike-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

export function Spike() {
  return <div style={{ height: '100vh' }}><ReactFlowProvider><Inner /></ReactFlowProvider></div>
}
```

- [ ] **Step 4: Add a temporary `/spike` route**

In `ui/src/routes.tsx`, add (inside the `AppShell` children, temporarily): `{ path: '/spike', element: <Spike /> }` with `import { Spike } from './flow/_spike/Spike'`. (Removed in Step 8.)

- [ ] **Step 5: Headless smoke test**

Create `ui/src/flow/_spike/spike.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spike } from './Spike'

describe('spike', () => {
  it('mounts a ReactFlow canvas with custom nodes and an edge label', async () => {
    render(<Spike />)
    expect(screen.getByTestId('spike-canvas')).toBeInTheDocument()
    expect(await screen.findByText('فعالیت ۱')).toBeInTheDocument()
    expect(screen.getByText('نمونه')).toBeInTheDocument()
  })
})
```
Run: `cd ui && npx vitest run src/flow/_spike/spike.test.tsx` → PASS (proves RF mounts under the jsdom mocks with a custom node type + edge label).

- [ ] **Step 6: Interactive verification (human-in-the-loop)**

Run `cd ui && npm run dev`, open `/spike` (log in first). Manually confirm each and record PASS/FAIL + notes in `SPIKE-FINDINGS.md`:
1. Custom activity nodes render with RTL content on an LTR canvas.
2. **Pan** (drag background), **zoom** (wheel), **fit** (Controls fit button) work.
3. **Drag** a node to reposition.
4. **Drag from the coral source handle** to the other node's target handle creates a new edge (onConnect fires).
5. Edge shows its label ("نمونه").
6. No console errors; RTL page chrome unaffected.

- [ ] **Step 7: Record findings + decision**

Write `ui/src/flow/_spike/SPIKE-FINDINGS.md`: the 6 results, any workaround needed, and the decision line: **"Built-ins sufficient → proceed with Milestones 2–3 as planned"** OR **"Gap found in X → revise tasks N before proceeding"**. This file is the gate: Milestone 2 does not start until it says proceed.

- [ ] **Step 8: Remove the `/spike` route, keep the mocks + findings, commit**

Revert the `/spike` route addition in `routes.tsx` (keep `reactflow-mock.ts` + the `setup.ts` change — later tasks need them). Leave `_spike/` in the tree as the recorded spike (or delete `Spike.tsx`/`spike.test.tsx` and keep only `SPIKE-FINDINGS.md` — your call; the findings doc must remain).
```bash
git add ui/src/test/reactflow-mock.ts ui/src/test/setup.ts ui/src/flow/_spike/SPIKE-FINDINGS.md ui/src/routes.tsx
git commit -m "spike(ui): prove @xyflow/react interactions; add RF test mocks"
```

---

## Task 2: `adapt.ts` — domain ↔ ReactFlow mapping

Pure functions converting the frozen `process.json` to/from ReactFlow's node/edge arrays, plus the field-label map and temp-id helpers. TDD.

**Files:**
- Create: `ui/src/flow/adapt.ts`, `ui/src/flow/adapt.test.ts`

**Interfaces:**
- Produces:
  - `type FlowNodeData = { node: ProcNode; conflicts: number; hasSub: boolean }`
  - `toFlowNodes(proc: Process): Node<FlowNodeData>[]` — RF node per domain node: `id`=domain id, `type`=domain `type` (`'activity'|'start'|'end'|'junction'`), `position`, `data`. `conflicts` = count of `proc.pending` with `status==='open'` and `node===id`. `hasSub` = activity with `subprocess!=null`. Skips nodes with `removed===true`.
  - `toFlowEdges(proc: Process): Edge[]` — `id`=`${from}->${to}`, `source`=from, `target`=to, `type`='labeled', `data:{label}`.
  - `fieldFa(field: string): string` — `label`→'عنوان', `actor`→'مجری فعالیت', `description`/`desc`→'توضیحات', default → the field itself.
  - `nextTempId(kind: 'n'|'j', counter: number): string` — `` `tmp-${kind}-${counter}` ``.
  - `isTempId(id: string): boolean` — true unless it matches a real activity/junction id or is `start`/`end`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/adapt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges, fieldFa, nextTempId, isTempId } from './adapt'
import type { Process } from '../api/types'

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'p', summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' },
    { id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: '', actor: 'x',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: 'cooking-014',
      position: { x: 10, y: 20 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
    { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split',
      position: { x: 5, y: 5 }, layout: 'auto' },
    { id: 'cooking-001-n020', type: 'activity', label: 'gone', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] }, removed: true },
  ],
  edges: [{ from: 'start', to: 'cooking-001-n010', label: '' }, { from: 'cooking-001-n010', to: 'cooking-001-j1', label: 'بله' }],
  pending: [{ node: 'cooking-001-n010', field: 'actor', current: 'x', proposed: 'y', source: 's', status: 'open' }],
} as unknown as Process

describe('adapt', () => {
  it('maps nodes, skipping removed, with conflict count and hasSub', () => {
    const ns = toFlowNodes(proc)
    expect(ns.map((n) => n.id)).toEqual(['start', 'cooking-001-n010', 'cooking-001-j1']) // removed dropped
    const act = ns.find((n) => n.id === 'cooking-001-n010')!
    expect(act.type).toBe('activity')
    expect(act.position).toEqual({ x: 10, y: 20 })
    expect(act.data.conflicts).toBe(1)
    expect(act.data.hasSub).toBe(true)
  })
  it('maps edges with a stable id and label in data', () => {
    const es = toFlowEdges(proc)
    expect(es[1]).toMatchObject({ id: 'cooking-001-n010->cooking-001-j1', source: 'cooking-001-n010', target: 'cooking-001-j1', type: 'labeled' })
    expect(es[1].data).toEqual({ label: 'بله' })
  })
  it('fieldFa maps known fields', () => {
    expect(fieldFa('actor')).toBe('مجری فعالیت')
    expect(fieldFa('description')).toBe('توضیحات')
    expect(fieldFa('zzz')).toBe('zzz')
  })
  it('temp ids are recognizably new', () => {
    expect(nextTempId('n', 3)).toBe('tmp-n-3')
    expect(isTempId('tmp-n-3')).toBe(true)
    expect(isTempId('cooking-001-n010')).toBe(false)
    expect(isTempId('cooking-001-j1')).toBe(false)
    expect(isTempId('start')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/adapt.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `ui/src/flow/adapt.ts`**

```ts
import type { Node, Edge } from '@xyflow/react'
import type { Process, ProcNode } from '../api/types'

export type FlowNodeData = { node: ProcNode; conflicts: number; hasSub: boolean }

const REAL_ACTIVITY = /^[a-z]+-[0-9]{3}-n[0-9]{3}$/
const REAL_JUNCTION = /^[a-z]+-[0-9]{3}-j[0-9]+$/

export function isTempId(id: string): boolean {
  if (id === 'start' || id === 'end') return false
  return !REAL_ACTIVITY.test(id) && !REAL_JUNCTION.test(id)
}

export function nextTempId(kind: 'n' | 'j', counter: number): string {
  return `tmp-${kind}-${counter}`
}

const FIELD_FA: Record<string, string> = {
  label: 'عنوان', actor: 'مجری فعالیت', description: 'توضیحات', desc: 'توضیحات',
}
export function fieldFa(field: string): string {
  return FIELD_FA[field] ?? field
}

export function toFlowNodes(proc: Process): Node<FlowNodeData>[] {
  const openByNode = new Map<string, number>()
  for (const p of proc.pending) {
    if (p.status === 'open') openByNode.set(p.node, (openByNode.get(p.node) ?? 0) + 1)
  }
  return proc.nodes
    .filter((n) => !('removed' in n && n.removed))
    .map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        node: n,
        conflicts: openByNode.get(n.id) ?? 0,
        hasSub: n.type === 'activity' && n.subprocess != null,
      },
    }))
}

export function toFlowEdges(proc: Process): Edge[] {
  return proc.edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'labeled',
    data: { label: e.label ?? '' },
  }))
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/adapt.test.ts` → PASS. Then `cd ui && npm run build` (types resolve).

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/adapt.ts ui/src/flow/adapt.test.ts
git commit -m "feat(ui/flow): domain<->ReactFlow adapter + fieldFa + temp-id helpers"
```

---

## Task 3: Canvas mutation/read hooks

Add the flow-related hooks to `api/hooks.ts` (`usePutProcess`, `useRelayout`, `useResolvePending`, `useCreateProcess`). `useCreateProcess`/`useResolvePending` are shared with sub-project C.

**Files:**
- Modify: `ui/src/api/hooks.ts`
- Create: `ui/src/api/hooks.flow.test.tsx`

**Interfaces:**
- Produces (all in `api/hooks.ts`):
  - `usePutProcess(pid)` → mutation `(doc: Process) => PUT /api/processes/{pid}` returns saved `Process`; invalidates `['process',pid]`, `['processes']`.
  - `useRelayout(pid)` → mutation `(doc: Process) => POST /api/processes/{pid}/relayout` returns laid-out `Process` (does NOT invalidate — result is applied to editor state, not persisted).
  - `useResolvePending(pid)` → mutation `({index,decision}) => POST /api/processes/{pid}/pending/{index}` returns updated `Process`; invalidates `['process',pid]`, `['pending']`.
  - `useCreateProcess()` → mutation `(body:{department:string;name?:string;parent?:{process:string;node:string}}) => POST /api/processes` returns new `Process`; invalidates `['processes']`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/api/hooks.flow.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '../test/utils'
import { usePutProcess, useRelayout, useResolvePending, useCreateProcess } from './hooks'

afterEach(() => vi.restoreAllMocks())

function mock(status = 200, body: unknown = { id: 'cooking-001' }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

describe('flow hooks', () => {
  it('usePutProcess PUTs the doc to the process endpoint', async () => {
    const spy = mock()
    const { result } = renderHook(() => usePutProcess('cooking-001'), { wrapper: createWrapper() })
    result.current.mutate({ id: 'cooking-001' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001', expect.objectContaining({ method: 'PUT' }))
  })
  it('useRelayout POSTs to the relayout endpoint', async () => {
    const spy = mock()
    const { result } = renderHook(() => useRelayout('cooking-001'), { wrapper: createWrapper() })
    result.current.mutate({ id: 'cooking-001' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/relayout', expect.objectContaining({ method: 'POST' }))
  })
  it('useResolvePending POSTs decision to the pending index endpoint', async () => {
    const spy = mock()
    const { result } = renderHook(() => useResolvePending('cooking-001'), { wrapper: createWrapper() })
    result.current.mutate({ index: 2, decision: 'accept' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/2', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'accept' }) }))
  })
  it('useCreateProcess POSTs to the processes collection', async () => {
    const spy = mock(201)
    const { result } = renderHook(() => useCreateProcess(), { wrapper: createWrapper() })
    result.current.mutate({ department: 'cooking', name: 'x' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/api/hooks.flow.test.tsx` → FAIL (exports missing).

- [ ] **Step 3: Add the hooks to `ui/src/api/hooks.ts`**

Append (merge `Process` into the existing `import type` line if not already imported):
```ts
export function usePutProcess(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: Process) => fetchJson<Process>(`/api/processes/${pid}`, { method: 'PUT', body: JSON.stringify(doc) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['process', pid] })
      qc.invalidateQueries({ queryKey: ['processes'] })
    },
  })
}

export function useRelayout(pid: string) {
  return useMutation({
    mutationFn: (doc: Process) => fetchJson<Process>(`/api/processes/${pid}/relayout`, { method: 'POST', body: JSON.stringify(doc) }),
  })
}

export function useResolvePending(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ index, decision }: { index: number; decision: 'accept' | 'reject' }) =>
      fetchJson<Process>(`/api/processes/${pid}/pending/${index}`, { method: 'POST', body: JSON.stringify({ decision }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['process', pid] })
      qc.invalidateQueries({ queryKey: ['pending'] })
    },
  })
}

export function useCreateProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { department: string; name?: string; parent?: { process: string; node: string } }) =>
      fetchJson<Process>('/api/processes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/api/hooks.flow.test.tsx` then `cd ui && npm test && npm run build` → all green.

- [ ] **Step 5: Commit**
```bash
git add ui/src/api/hooks.ts ui/src/api/hooks.flow.test.tsx
git commit -m "feat(ui/api): put/relayout/resolve-pending/create-process mutation hooks"
```

---

## Task 4: Custom node components (Activity / Start / End / Junction)

Presentational ReactFlow nodes rendering from `FlowNodeData`, styled to the prototype. TDD render tests (wrapped in `ReactFlowProvider`).

**Files:**
- Create: `ui/src/flow/nodes/ActivityNode.tsx`, `StartNode.tsx`, `EndNode.tsx`, `JunctionNode.tsx`, `ui/src/flow/nodes/nodes.test.tsx`

**Interfaces:**
- Consumes: `FlowNodeData` (Task 2), `IdBadge` (sub-A). Each is a `NodeProps<Node<FlowNodeData>>` component.
- Produces: node components registered under `nodeTypes = { activity, start, end, junction }` in Canvas (Task 5). Activity shows: id chip, label, actor row, conflict badge (when `data.conflicts>0`), sub-process affordance (when `data.hasSub`), a three-dot detail button (calls a `onOpenDetail(id)` passed via node data — see Step 3), and a coral **source** `Handle` on the inline-end + a **target** `Handle` on the inline-start (only interactive in edit mode — see Task 8; here render both handles, `isConnectable` controlled by `data`).

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/nodes/nodes.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { ActivityNode } from './ActivityNode'
import { JunctionNode } from './JunctionNode'
import type { ProcNode } from '../../api/types'

function wrap(ui: React.ReactNode) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>)
}
const act: ProcNode = { id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: 'cooking-014',
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ProcNode

describe('custom nodes', () => {
  it('ActivityNode shows id, label, actor, conflict badge and sub affordance', () => {
    wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 2, hasSub: true }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    expect(screen.getByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByText('کارپرداز')).toBeInTheDocument()
    expect(screen.getByText('cooking-001-n010')).toBeInTheDocument()
    expect(screen.getByText('۲')).toBeInTheDocument()            // conflict count, Persian
    expect(screen.getByText(/زیرفرآیند/)).toBeInTheDocument()
  })
  it('JunctionNode shows its type label', () => {
    const j: ProcNode = { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 0, y: 0 }, layout: 'auto' } as ProcNode
    wrap(<JunctionNode id="cooking-001-j1" data={{ node: j, conflicts: 0, hasSub: false }} selected={false} type="junction" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    expect(screen.getByText('XOR')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/nodes/nodes.test.tsx` → FAIL.

- [ ] **Step 3: Implement the nodes** (cross-check prototype lines 522–547)

`ui/src/flow/nodes/ActivityNode.tsx` — the detail/open callbacks are read from `data` (Canvas injects them in Task 6/8; here they're optional so the node renders standalone in tests):
```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'
import type { ActivityNode as ActivityNodeT } from '../../api/types'
import { toFa } from '../../lib/format'

export function ActivityNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const n = data.node as ActivityNodeT
  return (
    <div dir="rtl" className="relative bg-white border border-warm rounded-xl shadow-card px-3 py-2 w-[170px] text-center">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-[#9B86D9] !border-0" />
      {data.conflicts > 0 && (
        <div className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center bg-coral text-white rounded-full text-[9.5px] font-extrabold">! {toFa(data.conflicts)}</div>
      )}
      <span className="id-badge bg-tile-v2 text-muted" dir="ltr">{n.id}</span>
      <div className="font-bold text-[12.5px] text-ink leading-tight mt-1 break-words">{n.label}</div>
      {n.actor && (
        <div className="flex items-center justify-center gap-1.5 mt-1.5">
          <span className="w-[15px] h-[15px] rounded-full bg-tile-v text-violet text-[8px] flex items-center justify-center font-bold">۰</span>
          <span className="text-[10.5px] text-muted break-words">{n.actor}</span>
        </div>
      )}
      {data.hasSub && (
        <div className="flex items-center justify-center gap-1 mt-1.5 text-[9px] text-conflict bg-[#FFE9E7] px-2 py-0.5 rounded-full font-semibold">زیرفرآیند — برای ورود کلیک کنید</div>
      )}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-coral !border-2 !border-white" />
    </div>
  )
}
```

`ui/src/flow/nodes/StartNode.tsx` and `EndNode.tsx` (terminals — prototype: pill terminals):
```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'

export function StartNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div dir="rtl" className="bg-violet text-white rounded-full px-5 py-2 text-[12px] font-bold shadow-violet">
      {data.node.label}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-coral !border-2 !border-white" />
    </div>
  )
}
```
```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'

export function EndNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div dir="rtl" className="bg-ink text-white rounded-full px-5 py-2 text-[12px] font-bold">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-[#9B86D9] !border-0" />
      {data.node.label}
    </div>
  )
}
```

`ui/src/flow/nodes/JunctionNode.tsx` (diamond, color by type — legend XOR coral / AND violet / OR amber; prototype lines 536–539, 566–568):
```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'
import type { JunctionNode as JunctionNodeT } from '../../api/types'

const COLOR: Record<string, string> = { XOR: '#FA5A52', AND: '#4A25A9', OR: '#E8A33D' }

export function JunctionNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const j = data.node as JunctionNodeT
  return (
    <div className="relative w-11 h-11">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-[#9B86D9] !border-0" />
      <div className="absolute inset-0 rotate-45 rounded-[4px]" style={{ background: COLOR[j.junctionType] }} />
      <div className="absolute inset-0 flex items-center justify-center text-white font-extrabold text-[10.5px] pointer-events-none">{j.junctionType}</div>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-coral !border-2 !border-white" />
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/nodes/nodes.test.tsx` → PASS.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/nodes
git commit -m "feat(ui/flow): custom activity/start/end/junction nodes"
```

---

## Task 5: `LabeledEdge` custom edge

A bezier edge with an optional centered label; in edit mode it also shows a click-to-delete "×" (the delete callback + edit flag arrive via edge `data`). TDD.

**Files:**
- Create: `ui/src/flow/edges/LabeledEdge.tsx`, `ui/src/flow/edges/edge.test.tsx`

**Interfaces:**
- Consumes: `@xyflow/react` `BaseEdge`, `EdgeLabelRenderer`, `getBezierPath`.
- Produces: `LabeledEdge` for `edgeTypes = { labeled }`. Reads `data.label:string`, `data.editing:boolean`, `data.onDelete?:()=>void` (injected by Canvas in Task 8).

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/edges/edge.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { LabeledEdge } from './LabeledEdge'

function wrap(ui: React.ReactNode) {
  return render(<ReactFlowProvider><svg>{ui}</svg></ReactFlowProvider>)
}
const base = { id: 'a->b', sourceX: 0, sourceY: 0, targetX: 100, targetY: 0,
  sourcePosition: 'right', targetPosition: 'left', source: 'a', target: 'b' } as never

describe('LabeledEdge', () => {
  it('renders its label', () => {
    wrap(<LabeledEdge {...base} data={{ label: 'بله', editing: false }} />)
    expect(screen.getByText('بله')).toBeInTheDocument()
  })
  it('shows a delete affordance in edit mode and calls onDelete', () => {
    const onDelete = vi.fn()
    wrap(<LabeledEdge {...base} data={{ label: '', editing: true, onDelete }} />)
    fireEvent.click(screen.getByTitle('حذف خط'))
    expect(onDelete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/edges/edge.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/flow/edges/LabeledEdge.tsx`** (prototype lines 505–520)

```tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

type Data = { label?: string; editing?: boolean; onDelete?: () => void }

export function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const d = (data ?? {}) as Data
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: '#9B86D9', strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        {d.label ? (
          <div style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="bg-white/90 text-ink text-[11px] px-2 py-0.5 rounded-md pointer-events-none">{d.label}</div>
        ) : null}
        {d.editing && (
          <button title="حذف خط" onClick={d.onDelete}
            style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
            className="w-5 h-5 rounded-full bg-white border border-conflict text-conflict text-xs leading-none">×</button>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/edges/edge.test.tsx` → PASS.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/edges
git commit -m "feat(ui/flow): labeled edge with edit-mode delete affordance"
```

---

## Task 6: `Canvas` + `FlowScreen` (read-only) + sub-process navigation

Mount `<ReactFlow>` with the custom node/edge types, view-only (pan/zoom/fit, nodes not draggable), rendering a loaded process; the `FlowScreen` route replaces `FlowPlaceholder` and shows the view-mode toolbar (id/name, Edit button [inert until Task 8], parent-process button for sub-processes). Clicking a sub-process activity navigates into its child flow; the parent button returns.

**Files:**
- Create: `ui/src/flow/Canvas.tsx`, `ui/src/flow/FlowScreen.tsx`, `ui/src/flow/FlowScreen.test.tsx`
- Modify: `ui/src/routes.tsx` (point `/processes/:pid/flow` → `FlowScreen`), delete `ui/src/screens/FlowPlaceholder.tsx`

**Interfaces:**
- Consumes: `useProcess` (sub-A), `toFlowNodes`/`toFlowEdges` (Task 2), the node/edge components (Tasks 4–5), `Button`/`IdBadge` (sub-A).
- Produces: `Canvas({ nodes, edges, editing, onNodesChange?, onEdgesChange?, onConnect?, onNodeClick? })` — a controlled ReactFlow wrapper. In this task only the read-only props are used; Task 8 wires the edit callbacks. `FlowScreen` at `/processes/:pid/flow`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/FlowScreen.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 40, y: 90 }, layout: 'auto' },
    { id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 250, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
  ],
  edges: [{ from: 'start', to: 'cooking-001-n010', label: '' }],
}

describe('FlowScreen (view)', () => {
  it('renders the process nodes and the toolbar with the Edit button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ویرایش/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/FlowScreen.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/flow/Canvas.tsx`**

```tsx
import { ReactFlow, Background, Controls, type Node, type Edge, type NodeChange, type EdgeChange, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ActivityNode } from './nodes/ActivityNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { JunctionNode } from './nodes/JunctionNode'
import { LabeledEdge } from './edges/LabeledEdge'

const nodeTypes = { activity: ActivityNode, start: StartNode, end: EndNode, junction: JunctionNode }
const edgeTypes = { labeled: LabeledEdge }

export function Canvas({ nodes, edges, editing, onNodesChange, onEdgesChange, onConnect, onNodeClick }: {
  nodes: Node[]; edges: Edge[]; editing: boolean
  onNodesChange?: (c: NodeChange[]) => void
  onEdgesChange?: (c: EdgeChange[]) => void
  onConnect?: (c: Connection) => void
  onNodeClick?: (id: string) => void
}) {
  return (
    <div dir="ltr" className="w-full h-full">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={editing} nodesConnectable={editing} elementsSelectable={editing}
        onNodesChange={editing ? onNodesChange : undefined}
        onEdgesChange={editing ? onEdgesChange : undefined}
        onConnect={editing ? onConnect : undefined}
        onNodeClick={(_, n) => onNodeClick?.(n.id)}
        fitView proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 4: Implement `ui/src/flow/FlowScreen.tsx`** (view-mode; edit wiring lands in Task 8). Cross-check prototype toolbar lines 418–453.

```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { useProcess } from '../api/hooks'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import type { ActivityNode } from '../api/types'

export function FlowScreen() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: proc } = useProcess(pid)
  if (!proc) return <div className="flex-1 bg-bg" />

  const nodes = toFlowNodes(proc)
  const edges = toFlowEdges(proc)

  function onNodeClick(id: string) {
    const n = proc!.nodes.find((x) => x.id === id)
    if (n && n.type === 'activity' && (n as ActivityNode).subprocess) {
      nav(`/processes/${(n as ActivityNode).subprocess}/flow`)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        {proc.parent && (
          <Button variant="ghost" onClick={() => nav(`/processes/${proc.parent!.process}/flow`)} className="px-3 py-[7px] text-[12px]">فرآیند والد</Button>
        )}
        <div className="flex items-center gap-2.5">
          <IdBadge tone="violet">{proc.id}</IdBadge>
          <span className="font-bold text-[15px] text-ink">{proc.name}</span>
        </div>
        <div className="ms-auto flex items-center gap-2.5">
          <Button variant="violet" className="px-4 py-2 text-[13px]" data-testid="enter-edit">ویرایش</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <Canvas nodes={nodes} edges={edges} editing={false} onNodeClick={onNodeClick} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Repoint the route + delete the placeholder**

In `ui/src/routes.tsx`: replace the `FlowPlaceholder` import and its route element with `FlowScreen`:
```tsx
import { FlowScreen } from './flow/FlowScreen'
// ...
{ path: '/processes/:pid/flow', element: <FlowScreen /> },
```
Then `rm ui/src/screens/FlowPlaceholder.tsx`.

- [ ] **Step 6: Run tests + build** — `cd ui && npx vitest run src/flow/FlowScreen.test.tsx` → PASS; then `cd ui && npm test && npm run build` → all green (confirm nothing still imports `FlowPlaceholder`).

- [ ] **Step 7: Commit**
```bash
git add ui/src/flow/Canvas.tsx ui/src/flow/FlowScreen.tsx ui/src/flow/FlowScreen.test.tsx ui/src/routes.tsx
git rm ui/src/screens/FlowPlaceholder.tsx
git commit -m "feat(ui/flow): read-only canvas + FlowScreen route + sub-process nav"
```

**End of Milestone 1** — the flowchart renders any process read-only with pan/zoom/fit and sub-process navigation. Verify manually against a real `data-repo` process before starting Milestone 2.

---

# MILESTONE 2 — Edit mode

## Task 7: `useFlowEditor` — editable-doc state, actions, undo/redo

The reducer that owns the editable `process.json`, an undo/redo history, and every structural edit action. Pure logic — TDD hard.

**Files:**
- Create: `ui/src/flow/useFlowEditor.ts`, `ui/src/flow/useFlowEditor.test.ts`

**Interfaces:**
- Consumes: `Process`, `ProcNode`, `Edge` types; `nextTempId`/`isTempId` (Task 2).
- Produces a hook `useFlowEditor(server: Process | undefined)` returning:
  - `doc: Process` (editable working copy; mirrors `server` until an edit)
  - `editing: boolean`, `enter()`, `cancel()` (reset to `server`), `adopt(next: Process)` (replace working doc + clear history — used after Save/relayout)
  - `canUndo/canRedo: boolean`, `undo()`, `redo()`
  - actions (each pushes history): `setName(name)`, `moveNode(id, pos)` (sets position + `layout:'manual'`), `addActivity()`, `addJunction()`, `connect(from, to)`, `deleteNode(id)` (removes + relinks preds→succs), `deleteEdge(from, to)`, `setJunction(id, type)`, `patchActivity(id, patch)`, `linkSub(id, subId | null)`
  - selection: `selected: string | null`, `select(id | null)`

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/useFlowEditor.test.ts` (test the reducer via `renderHook` + `act`):
```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlowEditor } from './useFlowEditor'
import type { Process } from '../api/types'

const server = {
  id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' },
    { id: 'cooking-001-n010', type: 'activity', label: 'A', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 100, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
    { id: 'end', type: 'end', label: 'پایان', position: { x: 200, y: 0 }, layout: 'auto' },
  ],
  edges: [{ from: 'start', to: 'cooking-001-n010', label: '' }, { from: 'cooking-001-n010', to: 'end', label: '' }],
} as unknown as Process

describe('useFlowEditor', () => {
  it('moveNode sets position and layout:manual', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.moveNode('cooking-001-n010', { x: 5, y: 6 }) })
    const n = result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')!
    expect(n.position).toEqual({ x: 5, y: 6 })
    expect(n.layout).toBe('manual')
  })
  it('deleteNode removes the node and relinks predecessors to successors', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.deleteNode('cooking-001-n010') })
    expect(result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')).toBeUndefined()
    // start now links directly to end
    expect(result.current.doc.edges).toContainEqual(expect.objectContaining({ from: 'start', to: 'end' }))
    expect(result.current.doc.edges.some((e) => e.to === 'cooking-001-n010' || e.from === 'cooking-001-n010')).toBe(false)
  })
  it('addActivity adds a temp-keyed activity node', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.addActivity() })
    const added = result.current.doc.nodes.find((n) => n.id.startsWith('tmp-n-'))
    expect(added?.type).toBe('activity')
  })
  it('undo/redo round-trips a name change', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.setName('X') })
    expect(result.current.doc.name).toBe('X')
    act(() => result.current.undo())
    expect(result.current.doc.name).toBe('p')
    act(() => result.current.redo())
    expect(result.current.doc.name).toBe('X')
  })
  it('connect adds an edge between two nodes', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.connect('cooking-001-n010', 'start') })
    expect(result.current.doc.edges).toContainEqual(expect.objectContaining({ from: 'cooking-001-n010', to: 'start' }))
  })
  it('cancel resets to the server doc', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.setName('X'); result.current.cancel() })
    expect(result.current.editing).toBe(false)
    expect(result.current.doc.name).toBe('p')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/useFlowEditor.test.ts` → FAIL.

- [ ] **Step 3: Implement `ui/src/flow/useFlowEditor.ts`**

```ts
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Process, ProcNode, ActivityNode, JunctionNode } from '../api/types'
import { nextTempId } from './adapt'

type Pos = { x: number; y: number }
const clone = (p: Process): Process => JSON.parse(JSON.stringify(p))

export function useFlowEditor(server: Process | undefined) {
  const [doc, setDoc] = useState<Process | undefined>(server)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const past = useRef<Process[]>([])
  const future = useRef<Process[]>([])
  const tmp = useRef(0)
  const [, force] = useState(0)

  // Keep the working copy in sync with the server doc while NOT editing.
  useEffect(() => {
    if (!editing && server) setDoc(server)
  }, [server, editing])

  const commit = useCallback((next: Process) => {
    if (doc) past.current.push(doc)
    future.current = []
    setDoc(next)
  }, [doc])

  const mutate = useCallback((fn: (d: Process) => void) => {
    if (!doc) return
    const next = clone(doc)
    fn(next)
    commit(next)
  }, [doc, commit])

  const enter = useCallback(() => { past.current = []; future.current = []; setEditing(true) }, [])
  const cancel = useCallback(() => { past.current = []; future.current = []; setEditing(false); if (server) setDoc(server) }, [server])
  const adopt = useCallback((next: Process) => { past.current = []; future.current = []; setDoc(next) }, [])

  const undo = useCallback(() => {
    if (!past.current.length || !doc) return
    future.current.push(doc)
    setDoc(past.current.pop()!)
    force((n) => n + 1)
  }, [doc])
  const redo = useCallback(() => {
    if (!future.current.length || !doc) return
    past.current.push(doc!)
    setDoc(future.current.pop()!)
    force((n) => n + 1)
  }, [doc])

  const setName = useCallback((name: string) => mutate((d) => { d.name = name }), [mutate])
  const moveNode = useCallback((id: string, pos: Pos) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id); if (n) { n.position = pos; n.layout = 'manual' }
  }), [mutate])

  const addActivity = useCallback(() => mutate((d) => {
    const id = nextTempId('n', ++tmp.current)
    const node: ActivityNode = { id, type: 'activity', label: 'فعالیت جدید', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 120, y: 120 }, layout: 'manual', source: { created_by: 'ui-edit', touched_by: [] } }
    d.nodes.push(node)
  }), [mutate])

  const addJunction = useCallback(() => mutate((d) => {
    const id = nextTempId('j', ++tmp.current)
    const node: JunctionNode = { id, type: 'junction', junctionType: 'XOR', direction: 'split',
      position: { x: 160, y: 160 }, layout: 'manual' }
    d.nodes.push(node)
  }), [mutate])

  const connect = useCallback((from: string, to: string) => mutate((d) => {
    if (from === to) return
    if (!d.edges.some((e) => e.from === from && e.to === to)) d.edges.push({ from, to, label: '' })
  }), [mutate])

  const deleteEdge = useCallback((from: string, to: string) => mutate((d) => {
    d.edges = d.edges.filter((e) => !(e.from === from && e.to === to))
  }), [mutate])

  const deleteNode = useCallback((id: string) => mutate((d) => {
    const preds = d.edges.filter((e) => e.to === id).map((e) => e.from)
    const succs = d.edges.filter((e) => e.from === id).map((e) => e.to)
    d.edges = d.edges.filter((e) => e.from !== id && e.to !== id)
    for (const p of preds) for (const s of succs) {
      if (p !== s && !d.edges.some((e) => e.from === p && e.to === s)) d.edges.push({ from: p, to: s, label: '' })
    }
    d.nodes = d.nodes.filter((n) => n.id !== id)
  }), [mutate])

  const setJunction = useCallback((id: string, type: 'AND' | 'OR' | 'XOR') => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id) as JunctionNode | undefined
    if (n && n.type === 'junction') n.junctionType = type
  }), [mutate])

  const patchActivity = useCallback((id: string, patch: Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id) as ActivityNode | undefined
    if (n && n.type === 'activity') Object.assign(n, patch)
  }), [mutate])

  const linkSub = useCallback((id: string, subId: string | null) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id) as ActivityNode | undefined
    if (n && n.type === 'activity') n.subprocess = subId
  }), [mutate])

  return {
    doc: doc as Process, editing, selected, select: setSelected,
    enter, cancel, adopt,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0, undo, redo,
    setName, moveNode, addActivity, addJunction, connect, deleteEdge, deleteNode, setJunction, patchActivity, linkSub,
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/useFlowEditor.test.ts` → PASS; then `cd ui && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/useFlowEditor.ts ui/src/flow/useFlowEditor.test.ts
git commit -m "feat(ui/flow): useFlowEditor reducer with actions + undo/redo"
```

---

## Task 8: Edit-mode toolbar + Canvas wiring

Wire `useFlowEditor` into `FlowScreen`: an Edit toggle that swaps the toolbar to the edit controls (undo/redo, relayout, delete, add activity/junction, cancel, save), makes the canvas interactive (drag → `moveNode`, `onConnect` → `connect`, selection), injects `editing`+`onDelete` into edges, and shows the edit help banner.

**Files:**
- Modify: `ui/src/flow/FlowScreen.tsx`, `ui/src/flow/Canvas.tsx`
- Create: `ui/src/flow/FlowScreen.edit.test.tsx`

**Interfaces:**
- Consumes: `useFlowEditor` (Task 7). Canvas gains `onNodeDragStop`, and edge `data` carries `{editing, onDelete}` derived per edge.
- Produces: full edit-mode toolbar (prototype lines 431–451) + edit banner (551–556) + zoom/legend already via Controls (legend added here, prototype 564–569).

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/FlowScreen.edit.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' }],
  edges: [] }

describe('FlowScreen edit mode', () => {
  it('entering edit shows the edit toolbar (add activity/save/cancel)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    expect(screen.getByRole('button', { name: /فعالیت/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ذخیره/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /انصراف/ })).toBeInTheDocument()
    // adding an activity puts a new node on the canvas
    fireEvent.click(screen.getByRole('button', { name: /فعالیت/ }))
    expect(await screen.findByText('فعالیت جدید')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/FlowScreen.edit.test.tsx` → FAIL (no edit toolbar yet).

- [ ] **Step 3: Extend `Canvas.tsx`** to accept `onNodeDragStop` and pass through:
```tsx
// add to the Canvas props type: onNodeDragStop?: (id: string, pos: { x: number; y: number }) => void
// and on <ReactFlow>:
//   onNodeDragStop={(_, n) => onNodeDragStop?.(n.id, n.position)}
```

- [ ] **Step 4: Rewrite `FlowScreen.tsx`** to drive `useFlowEditor` and render both toolbars. Cross-check prototype lines 418–556. Full component:
```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { ReactFlowProvider, type Connection } from '@xyflow/react'
import { useProcess } from '../api/hooks'
import { useFlowEditor } from './useFlowEditor'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import type { ActivityNode } from '../api/types'

export function FlowScreen() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: server } = useProcess(pid)
  const ed = useFlowEditor(server)
  if (!ed.doc) return <div className="flex-1 bg-bg" />
  const proc = ed.doc
  const editing = ed.editing

  const nodes = toFlowNodes(proc)
  const edges = toFlowEdges(proc).map((e) => ({
    ...e, data: { ...(e.data as object), editing, onDelete: () => ed.deleteEdge(e.source, e.target) },
  }))

  function onNodeClick(id: string) {
    if (editing) { ed.select(id); return }
    const n = proc.nodes.find((x) => x.id === id) as ActivityNode | undefined
    if (n && n.type === 'activity' && n.subprocess) nav(`/processes/${n.subprocess}/flow`)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        {proc.parent && !editing && (
          <Button variant="ghost" onClick={() => nav(`/processes/${proc.parent!.process}/flow`)} className="px-3 py-[7px] text-[12px]">فرآیند والد</Button>
        )}
        <div className="flex items-center gap-2.5">
          <IdBadge tone="violet">{proc.id}</IdBadge>
          {!editing
            ? <span className="font-bold text-[15px] text-ink">{proc.name}</span>
            : <input value={proc.name} onChange={(e) => ed.setName(e.target.value)} className="font-bold text-[15px] text-ink border-[1.5px] border-line rounded-lg px-2.5 py-1 outline-none focus:border-coral w-[280px]" />}
        </div>
        <div className="ms-auto flex items-center gap-2">
          {!editing ? (
            <Button variant="violet" onClick={ed.enter} className="px-4 py-2 text-[13px]" data-testid="enter-edit">ویرایش</Button>
          ) : (
            <>
              <div className="flex items-center gap-0.5 bg-tile-v2 rounded-xl p-1">
                <button disabled={!ed.canUndo} onClick={ed.undo} title="واگرد" className="px-2 py-1 rounded-lg disabled:opacity-40 text-violet">↶</button>
                <button disabled={!ed.canRedo} onClick={ed.redo} title="ازنو" className="px-2 py-1 rounded-lg disabled:opacity-40 text-violet">↷</button>
              </div>
              <Button variant="ghost" onClick={() => ed.addActivity()} className="px-3 py-2 text-[12.5px]">فعالیت</Button>
              <Button variant="ghost" onClick={() => ed.addJunction()} className="px-3 py-2 text-[12.5px]">اتصال</Button>
              <Button variant="ghost" onClick={() => ed.selected && ed.deleteNode(ed.selected)} className="px-3 py-2 text-[12.5px]">حذف</Button>
              <Button variant="ghost" onClick={ed.cancel} className="px-3 py-2 text-[12.5px]">انصراف</Button>
              <Button variant="green" className="px-4 py-2 text-[13px]" data-testid="save">ذخیره</Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ReactFlowProvider>
          <Canvas
            nodes={nodes} edges={edges} editing={editing}
            onNodeClick={onNodeClick}
            onNodeDragStop={(id, pos) => ed.moveNode(id, pos)}
            onConnect={(c: Connection) => c.source && c.target && ed.connect(c.source, c.target)}
          />
        </ReactFlowProvider>
        {editing && (
          <div className="absolute top-3.5 left-1/2 -translate-x-1/2 bg-ink text-white text-[11.5px] px-4 py-2 rounded-full pointer-events-none z-10">
            از نقطهٔ مرجانیِ کنار هر گره بکشید تا خط بسازید · روی یک خط کلیک کنید تا حذف شود
          </div>
        )}
        <div className="absolute bottom-4 right-4 flex gap-3.5 bg-white border border-warm rounded-xl px-3.5 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-coral rotate-45 inline-block" />XOR</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-violet rotate-45 inline-block" />AND</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-[#E8A33D] rotate-45 inline-block" />OR</span>
        </div>
      </div>
    </div>
  )
}
```
(Undo/redo arrows use text glyphs here for brevity; swap to the prototype's SVGs at lines 438–439 if desired — the classes/handlers are what matter.)

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/flow/FlowScreen.edit.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/flow/FlowScreen.tsx ui/src/flow/Canvas.tsx ui/src/flow/FlowScreen.edit.test.tsx
git commit -m "feat(ui/flow): edit-mode toolbar, drag/connect/add/delete wiring + legend"
```

---

## Task 9: Save & Cancel

Wire the Save button to `usePutProcess`; on success `adopt` the returned doc (real ids, provenance) and leave edit mode. Cancel already resets (Task 7). Add a success toast.

**Files:**
- Modify: `ui/src/flow/FlowScreen.tsx`
- Create: `ui/src/flow/FlowScreen.save.test.tsx`

**Interfaces:**
- Consumes: `usePutProcess(pid)` (Task 3), `ed.adopt` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/FlowScreen.save.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' }], edges: [] }

describe('FlowScreen save', () => {
  it('PUTs the edited doc and returns to view mode on success', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ ...proc, name: 'renamed' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    fireEvent.click(screen.getByTestId('save'))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001', expect.objectContaining({ method: 'PUT' })))
    await waitFor(() => expect(screen.getByTestId('enter-edit')).toBeInTheDocument()) // back to view mode
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/FlowScreen.save.test.tsx` → FAIL (Save is inert).

- [ ] **Step 3: Wire Save in `FlowScreen.tsx`**

Add near the top of the component:
```tsx
import { usePutProcess } from '../api/hooks'
// ...
const put = usePutProcess(pid)
function onSave() {
  put.mutate(proc, { onSuccess: (saved) => { ed.adopt(saved); ed.cancel() } })
}
```
Change the Save button to: `<Button variant="green" onClick={onSave} disabled={put.isPending} ...>ذخیره</Button>`.
(Adopt-then-cancel: `adopt` installs the saved doc as the working copy; `cancel` flips `editing` false and the `useEffect` re-syncs to the freshly-invalidated server query.)

- [ ] **Step 4: Run tests + build** — `cd ui && npx vitest run src/flow/FlowScreen.save.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/FlowScreen.tsx ui/src/flow/FlowScreen.save.test.tsx
git commit -m "feat(ui/flow): manual Save (PUT + adopt returned doc)"
```

---

## Task 10: Relayout button (full reset)

Add the relayout button to the edit toolbar; on click, POST the working doc to the relayout endpoint and `adopt` the returned fully-laid-out doc (all positions reset, `layout:"auto"`, temp ids realized) into the editor — no persistence until Save.

**Files:**
- Modify: `ui/src/flow/FlowScreen.tsx`
- Create: `ui/src/flow/FlowScreen.relayout.test.tsx`

**Interfaces:**
- Consumes: `useRelayout(pid)` (Task 3), `ed.adopt`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/FlowScreen.relayout.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-n010', type: 'activity', label: 'A', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 500, y: 500 }, layout: 'manual', source: { created_by: 'x', touched_by: [] } }],
  edges: [] }

describe('FlowScreen relayout', () => {
  it('POSTs to relayout and adopts the returned positions', async () => {
    const relaid = { ...proc, nodes: [{ ...proc.nodes[0], position: { x: 40, y: 90 }, layout: 'auto' }] }
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/relayout')) return Promise.resolve(new Response(JSON.stringify(relaid), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    fireEvent.click(screen.getByRole('button', { name: /چیدمان/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/relayout', expect.objectContaining({ method: 'POST' })))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/FlowScreen.relayout.test.tsx` → FAIL.

- [ ] **Step 3: Wire relayout in `FlowScreen.tsx`**

Add:
```tsx
import { useRelayout } from '../api/hooks'
// ...
const relayout = useRelayout(pid)
function onRelayout() { relayout.mutate(proc, { onSuccess: (laid) => ed.adopt(laid) }) }
```
Add a button in the edit toolbar group (before حذف): `<Button variant="ghost" onClick={onRelayout} disabled={relayout.isPending} className="px-3 py-2 text-[12.5px]">چیدمان</Button>`.

- [ ] **Step 4: Run tests + build** — `cd ui && npx vitest run src/flow/FlowScreen.relayout.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/FlowScreen.tsx ui/src/flow/FlowScreen.relayout.test.tsx
git commit -m "feat(ui/flow): full-reset relayout button (adopt server layout)"
```

---

## Task 11: Node delete confirm modal

The toolbar حذف and (later) drawer delete open a confirm modal before removing a node (prototype lines 736–752). Edge delete (click "×") is immediate (already wired in Task 8).

**Files:**
- Create: `ui/src/flow/DeleteNodeConfirm.tsx`, `ui/src/flow/DeleteNodeConfirm.test.tsx`
- Modify: `ui/src/flow/FlowScreen.tsx`

**Interfaces:**
- Produces: `DeleteNodeConfirm({ label, onCancel, onConfirm })` modal.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/DeleteNodeConfirm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'

describe('DeleteNodeConfirm', () => {
  it('shows the label and fires confirm', () => {
    const onConfirm = vi.fn()
    render(<DeleteNodeConfirm label="تأیید مدیر" onCancel={() => {}} onConfirm={onConfirm} />)
    expect(screen.getByText(/تأیید مدیر/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /حذف/ }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/DeleteNodeConfirm.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/flow/DeleteNodeConfirm.tsx`** (prototype 736–752)
```tsx
import { Button } from '../ui/Button'

export function DeleteNodeConfirm({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-[70] p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[420px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal">
        <div className="p-6 pb-5 text-center">
          <div className="font-extrabold text-[17px] text-ink mb-2">حذف «{label}»؟</div>
          <div className="text-[13px] text-muted leading-loose">این گره حذف می‌شود و گرهِ قبلی به گرهِ بعدی متصل می‌ماند تا مسیر نشکند. با «واگرد» قابل بازگردانی است.</div>
        </div>
        <div className="flex gap-2.5 px-[22px] pb-[22px]">
          <button onClick={onCancel} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl text-sm font-bold text-[#6B5CA5]">انصراف</button>
          <button onClick={onConfirm} className="flex-1 py-3 border-0 bg-conflict rounded-xl text-sm font-bold text-white">حذف کامل</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire into `FlowScreen.tsx`** — replace the direct حذف handler with modal flow:
```tsx
import { useState } from 'react'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'
// ...
const [pendingDel, setPendingDel] = useState<string | null>(null)
// toolbar حذف button onClick -> () => ed.selected && setPendingDel(ed.selected)
// render at the end of the component:
{pendingDel && (() => {
  const n = proc.nodes.find((x) => x.id === pendingDel)
  const label = n && 'label' in n ? (n as { label: string }).label : pendingDel
  return <DeleteNodeConfirm label={label} onCancel={() => setPendingDel(null)} onConfirm={() => { ed.deleteNode(pendingDel); setPendingDel(null) }} />
})()}
```

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/flow/DeleteNodeConfirm.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/flow/DeleteNodeConfirm.tsx ui/src/flow/DeleteNodeConfirm.test.tsx ui/src/flow/FlowScreen.tsx
git commit -m "feat(ui/flow): node delete confirm modal"
```

**End of Milestone 2** — full graph editing: drag (→manual), link, add, delete-with-relink, undo/redo, full-reset relayout, manual Save. Verify against real data before Milestone 3.

---

# MILESTONE 3 — Detail drawer, junction editor, inline conflicts

## Task 12: Detail drawer — activity view

A left drawer opened from a node's three-dot button showing the activity's label, actor, description, ICOM chips, source line, and a copy-id button. Junction nodes show the gate view. (Edit + conflicts + subprocess land in Tasks 13–15.)

**Files:**
- Create: `ui/src/flow/DetailDrawer.tsx`, `ui/src/flow/DetailDrawer.test.tsx`
- Modify: `ui/src/flow/nodes/ActivityNode.tsx` (three-dot detail button → `data.onOpenDetail?.(id)`), `ui/src/flow/Canvas.tsx` (inject `onOpenDetail` into node data), `ui/src/flow/FlowScreen.tsx` (drawer state + render)

**Interfaces:**
- Consumes: `Chip`, `IdBadge` (sub-A), `Process`, `ActivityNode`/`JunctionNode`, `fieldFa`.
- Produces: `DetailDrawer({ node, editing, onClose, ... })` — this task renders the view branch; later tasks add edit props.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/DetailDrawer.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

const n: ActivityNode = { id: 'cooking-001-n010', type: 'activity', label: 'دریافت درخواست', description: 'شرح', actor: 'کارپرداز',
  icom: { inputs: ['درخواست'], controls: ['بودجه'], outputs: ['ثبت'], mechanisms: ['کارپرداز'] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'voice', touched_by: [] } } as ActivityNode

describe('DetailDrawer view', () => {
  it('shows label, actor, description, ICOM chips and the id', () => {
    render(<DetailDrawer node={n} editing={false} conflicts={[]} onClose={() => {}} onEdit={vi.fn()} onAccept={vi.fn()} onReject={vi.fn()} onOpenSub={vi.fn()} onPatch={vi.fn()} onLinkSub={vi.fn()} onSetJunction={vi.fn()} process={{ nodes: [] } as never} onCreateSub={vi.fn()} />)
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(screen.getByText('کارپرداز')).toBeInTheDocument()
    expect(screen.getByText('شرح')).toBeInTheDocument()
    expect(screen.getByText('درخواست')).toBeInTheDocument()
    expect(screen.getByText('بودجه')).toBeInTheDocument()
  })
})
```
(The prop list is the drawer's full surface across Tasks 12–15; unused handlers are passed as `vi.fn()` here.)

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/DetailDrawer.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ui/src/flow/DetailDrawer.tsx`** (view branch; prototype 571–626). Define the full props interface now (later tasks fill the branches):
```tsx
import { Chip } from '../ui/Chip'
import type { ProcNode, ActivityNode, JunctionNode, Pending, Process } from '../api/types'

export type DrawerProps = {
  node: ProcNode
  editing: boolean
  conflicts: { pending: Pending; index: number }[]
  process: Process
  onClose: () => void
  onEdit: () => void
  onAccept: (index: number) => void
  onReject: (index: number) => void
  onOpenSub: (subId: string) => void
  onPatch: (patch: Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>) => void
  onLinkSub: (subId: string | null) => void
  onSetJunction: (type: 'AND' | 'OR' | 'XOR') => void
  onCreateSub: () => void
}

export function DetailDrawer(props: DrawerProps) {
  const { node, onClose } = props
  const isActivity = node.type === 'activity'
  const a = node as ActivityNode
  const j = node as JunctionNode
  return (
    <div className="absolute top-0 bottom-0 left-0 w-[340px] bg-white border-e border-warm shadow-[20px_0_50px_-30px_rgba(74,37,169,.5)] flex flex-col z-[15]">
      <div className="flex items-center justify-between px-[18px] py-4 border-b border-[#F0E9FB]">
        <span className="id-badge bg-violet text-white" dir="ltr">{node.id}</span>
        <button onClick={onClose} className="w-7 h-7 bg-tile-v2 rounded-lg text-muted">×</button>
      </div>
      <div className="flex-1 overflow-auto p-[18px]">
        {node.type === 'junction' ? (
          <>
            <div className="font-extrabold text-[16px] text-ink">دروازهٔ منطقی {j.junctionType}</div>
            <div className="text-[12.5px] text-muted mt-2.5 leading-loose">XOR: فقط یکی از مسیرها فعال می‌شود. AND: همهٔ مسیرها هم‌زمان. OR: یک یا چند مسیر.</div>
          </>
        ) : isActivity ? (
          <>
            <div className="font-extrabold text-[16px] text-ink leading-tight">{a.label}</div>
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-[#F8F4FE] rounded-[10px]">
              <span className="text-[12.5px] text-violet font-semibold">{a.actor}</span>
            </div>
            <div className="text-[11px] font-bold text-muted mt-[18px] mb-1.5">توضیحات</div>
            <div className="text-[12.5px] text-[#5a5175] leading-relaxed">{a.description}</div>
            <div className="text-[11px] font-bold text-muted mt-[18px] mb-2">اطلاعات ICOM</div>
            <div className="flex flex-col gap-2.5">
              <IcomRow label="ورودی‌ها" items={a.icom.inputs} kind="input" />
              <IcomRow label="کنترل‌ها" items={a.icom.controls} kind="control" />
              <IcomRow label="خروجی‌ها" items={a.icom.outputs} kind="output" />
              <IcomRow label="مکانیزم‌ها" items={a.icom.mechanisms} kind="mech" />
            </div>
            <div className="text-[10.5px] text-[#c3bad6] mt-5 border-t border-dashed border-[#EDE5F5] pt-3" dir="ltr">source: {a.source.created_by}</div>
          </>
        ) : (
          <div className="font-extrabold text-[16px] text-ink">{'label' in node ? (node as { label: string }).label : node.id}</div>
        )}
      </div>
    </div>
  )
}

function IcomRow({ label, items, kind }: { label: string; items: string[]; kind: 'input' | 'control' | 'output' | 'mech' }) {
  return (
    <div>
      <div className="text-[10.5px] text-faint mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <Chip key={i} kind={kind}>{t}</Chip>)}</div>
    </div>
  )
}
```
(Import `IdBadge` is unused here — use the inline id span shown. Keep the `props` object destructured minimally so `noUnusedLocals` is satisfied: in this task only `node`/`onClose` are read; Tasks 13–15 read the rest. If `noUnusedParameters`/lint complains about unread props, read them via `void props.onEdit` is NOT allowed — instead this task's implementer should implement Tasks 13–15's branches together if the linter blocks partial usage. See Step 4.)

- [ ] **Step 4: Wire the three-dot detail button + drawer open**

In `ActivityNode.tsx`, add a three-dot button (top-inline-start) calling `(data as { onOpenDetail?: (id: string) => void }).onOpenDetail?.(n.id)` (prototype 526–528). In `Canvas.tsx`, extend node `data` with `onOpenDetail` from a new Canvas prop `onOpenDetail?: (id:string)=>void`, mapped in when building nodes — simplest: add `onOpenDetail` to the Canvas props and inject into each node's data before passing to `<ReactFlow>` (map over `nodes` adding `data:{...n.data, onOpenDetail}`). In `FlowScreen.tsx`, add `const [detailId, setDetailId] = useState<string|null>(null)`, pass `onOpenDetail={setDetailId}` to Canvas, and render `<DetailDrawer ... />` when `detailId` resolves to a node, wiring the handlers to `ed` (patch/linkSub/setJunction/deleteNode) and pending resolve (Task 15).

> **Implementer note:** `noUnusedParameters`/`noUnusedLocals` mean the drawer must actually USE every prop it declares. Therefore implement Tasks 12–15's drawer branches in this file as you go, but COMMIT per task: Task 12 lands the view branch and may declare the fuller `DrawerProps` while leaving edit/conflict handlers wired to no-op closures at the FlowScreen call site (so they are "used"). Concretely: FlowScreen passes real handlers; the drawer reads `node`, `onClose`, and (guarded by `props.editing`) the rest. Ensure the drawer references each prop on some code path so the compiler sees usage — if a branch isn't built yet, reference the handler inside the not-yet-active `editing` branch you scaffold in this task.

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/flow/DetailDrawer.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/flow/DetailDrawer.tsx ui/src/flow/DetailDrawer.test.tsx ui/src/flow/nodes/ActivityNode.tsx ui/src/flow/Canvas.tsx ui/src/flow/FlowScreen.tsx
git commit -m "feat(ui/flow): node detail drawer (activity view + open wiring)"
```

---

## Task 13: Detail drawer — activity edit + subprocess link + create-sub

The drawer's edit branch: editable label/actor/description (→ `ed.patchActivity`), a subprocess link-by-id search with live validation against the department's processes (→ `ed.linkSub`), and a "create sub-process & enter" action (→ `useCreateProcess` with `parent`, then navigate into the child).

**Files:**
- Modify: `ui/src/flow/DetailDrawer.tsx`, `ui/src/flow/FlowScreen.tsx`
- Create: `ui/src/flow/DetailDrawer.edit.test.tsx`

**Interfaces:**
- Consumes: `useProcesses(dept)` for the link search list; `useCreateProcess()` (Task 3); `ed.patchActivity`/`ed.linkSub`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/DetailDrawer.edit.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

const n: ActivityNode = { id: 'cooking-001-n010', type: 'activity', label: 'A', description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ActivityNode

describe('DetailDrawer edit', () => {
  it('edits the label via onPatch', () => {
    const onPatch = vi.fn()
    render(<DetailDrawer node={n} editing conflicts={[]} process={{ department: 'cooking', nodes: [] } as never}
      onClose={() => {}} onEdit={() => {}} onAccept={() => {}} onReject={() => {}} onOpenSub={() => {}}
      onPatch={onPatch} onLinkSub={() => {}} onSetJunction={() => {}} onCreateSub={() => {}} />)
    fireEvent.change(screen.getByLabelText('عنوان'), { target: { value: 'B' } })
    expect(onPatch).toHaveBeenCalledWith({ label: 'B' })
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/DetailDrawer.edit.test.tsx` → FAIL.

- [ ] **Step 3: Add the edit branch to `DetailDrawer.tsx`** (prototype 628–661). For an activity when `editing`, render labeled inputs (`aria-label` matching the label text so tests can target them), a subprocess search input filtering `process`'s sibling processes by name/id with a picked-state, a "حذف پیوند" clear, and a "ساخت زیرفرآیند جدید و ورود" button calling `onCreateSub`. Wire `onPatch({label})`/`onPatch({actor})`/`onPatch({description})` on input, `onLinkSub(id|null)` on pick/clear.

Minimum for the test (label field):
```tsx
// inside the isActivity && editing branch:
<label className="text-[11px] font-bold text-muted block mt-4 mb-1.5">عنوان</label>
<input aria-label="عنوان" value={a.label} onChange={(e) => props.onPatch({ label: e.target.value })}
  className="w-full px-3 py-2 border-[1.5px] border-line rounded-lg text-[12.5px] outline-none focus:border-coral" />
// ...actor + description inputs analogously (aria-label "مجری فعالیت" / "توضیحات")
// ...subprocess search + create-sub button
```

- [ ] **Step 4: Wire `onCreateSub` in `FlowScreen.tsx`** — call `useCreateProcess().mutate({ department: proc.department, name: 'زیرفرآیند جدید', parent: { process: proc.id, node: detailId } }, { onSuccess: (child) => { nav(\`/processes/${child.id}/flow\`) } })`. Pass real `onPatch`/`onLinkSub` from `ed`.

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/flow/DetailDrawer.edit.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/flow/DetailDrawer.tsx ui/src/flow/DetailDrawer.edit.test.tsx ui/src/flow/FlowScreen.tsx
git commit -m "feat(ui/flow): drawer edit — fields, subprocess link, create-sub-&-enter"
```

---

## Task 14: Junction gate editor

When a junction node's drawer is open in edit mode, show an XOR/AND/OR selector (→ `ed.setJunction`) with the explanations.

**Files:**
- Modify: `ui/src/flow/DetailDrawer.tsx`
- Create: `ui/src/flow/DetailDrawer.junction.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/DetailDrawer.junction.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { JunctionNode } from '../api/types'

const j: JunctionNode = { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 0, y: 0 }, layout: 'auto' } as JunctionNode

describe('DetailDrawer junction edit', () => {
  it('selecting AND calls onSetJunction', () => {
    const onSetJunction = vi.fn()
    render(<DetailDrawer node={j} editing conflicts={[]} process={{ nodes: [] } as never}
      onClose={() => {}} onEdit={() => {}} onAccept={() => {}} onReject={() => {}} onOpenSub={() => {}}
      onPatch={() => {}} onLinkSub={() => {}} onSetJunction={onSetJunction} onCreateSub={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'AND' }))
    expect(onSetJunction).toHaveBeenCalledWith('AND')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/DetailDrawer.junction.test.tsx` → FAIL.

- [ ] **Step 3: Add the junction edit branch** (prototype 583–591): when `node.type==='junction' && editing`, render three buttons `XOR`/`AND`/`OR` (the active one highlighted) each calling `props.onSetJunction(type)`, plus the explanation text.

- [ ] **Step 4: Run tests + build** — `cd ui && npx vitest run src/flow/DetailDrawer.junction.test.tsx` → PASS; `cd ui && npm test && npm run build` → green.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/DetailDrawer.tsx ui/src/flow/DetailDrawer.junction.test.tsx
git commit -m "feat(ui/flow): junction gate editor (XOR/AND/OR)"
```

---

## Task 15: Inline conflict accept/reject + node conflict badge

The drawer's view branch lists this node's open `pending` conflicts as current-vs-proposed with accept/reject (→ `useResolvePending`); on resolution the process re-fetches and the drawer/canvas reflect the update. The activity node's conflict badge (already rendered in Task 4 from `data.conflicts`) opens the drawer.

**Files:**
- Modify: `ui/src/flow/DetailDrawer.tsx`, `ui/src/flow/FlowScreen.tsx`
- Create: `ui/src/flow/DetailDrawer.conflict.test.tsx`

**Interfaces:**
- Consumes: `useResolvePending(pid)` (Task 3); the `conflicts` prop = `proc.pending` entries (with original index) whose `node===node.id` and `status==='open'`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/DetailDrawer.conflict.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode, Pending } from '../api/types'

const n = { id: 'cooking-001-n020', type: 'activity', label: 'تأیید', description: '', actor: 'مدیر',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ActivityNode
const pending: Pending = { node: 'cooking-001-n020', field: 'actor', current: 'مدیر رستوران', proposed: 'معاون مدیر', source: 'جلسه', status: 'open' }

describe('DetailDrawer conflicts', () => {
  it('renders current-vs-proposed and accepts by index', () => {
    const onAccept = vi.fn()
    render(<DetailDrawer node={n} editing={false} conflicts={[{ pending, index: 3 }]} process={{ nodes: [] } as never}
      onClose={() => {}} onEdit={() => {}} onAccept={onAccept} onReject={() => {}} onOpenSub={() => {}}
      onPatch={() => {}} onLinkSub={() => {}} onSetJunction={() => {}} onCreateSub={() => {}} />)
    expect(screen.getByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'پذیرش' }))
    expect(onAccept).toHaveBeenCalledWith(3)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/DetailDrawer.conflict.test.tsx` → FAIL.

- [ ] **Step 3: Add the conflict block to the drawer view branch** (prototype 608–621): for each `conflicts` entry render `fieldFa(pending.field)`, the current and proposed values, and پذیرش/رد buttons calling `props.onAccept(index)`/`props.onReject(index)`.

- [ ] **Step 4: Wire in `FlowScreen.tsx`** — compute `conflicts` for the open node from `proc.pending` (with original indices), and wire `onAccept`/`onReject` to `useResolvePending(pid).mutate({index, decision})`. On success the `['process',pid]` invalidation refetches; because the editor syncs to server while not editing, the drawer/canvas update. (Resolving is a review action available in view mode.)

- [ ] **Step 5: Run tests + build** — `cd ui && npx vitest run src/flow/DetailDrawer.conflict.test.tsx` → PASS; then the FULL suite `cd ui && npm test && npm run build` → all green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/flow/DetailDrawer.tsx ui/src/flow/DetailDrawer.conflict.test.tsx ui/src/flow/FlowScreen.tsx
git commit -m "feat(ui/flow): inline conflict accept/reject in the detail drawer"
```

**End of Milestone 3 — sub-project B complete.** Manually verify against real `data-repo` output: view a process, edit (drag→manual persists after Save+reopen — AC-5), relayout resets, open the drawer, edit a box, accept a conflict, link/create a sub-process and navigate.

---

## Self-Review (completed during authoring)

**Spec coverage (B spec §):**
- §1 Spike (gate) → Task 1 (findings doc gates M2+).
- §2 view-only default + edit mode; drag/link/delete/add/undo-redo/relayout; manual Save; layout(§2 full-reset via endpoint); detail drawer (view+edit, subprocess link, create-sub, inline conflict); junction editor; sub-process nav → Tasks 6–15.
- §3.1 React Flow model (4 node types, 1 edge type, coral handle/onConnect, controlled state) → Tasks 4–8.
- §3.2 edit lifecycle (snapshot, undo/redo, Save PUT + adopt, Cancel, temp ids, delete-relink) → Tasks 7, 9, 11.
- §3.3 data adapter (description/source/layout/icom/junctionType/direction/subprocess; fieldFa) → Tasks 2, 12.
- §3.5 relayout full-reset — engine/backend ALREADY done (verified); UI calls endpoint + adopts → Task 10 (no engine/backend task needed; noted in Global Constraints).
- §4 testing (nodes/edges render, useFlowEditor actions+undo/redo+save payload, relayout adopt, sub-process nav, inline conflict, view-only) → per-task tests.
- §5 exit criteria: AC-5 (drag→manual persists via Save; relayout resets) exercised in Tasks 9–10 + M2 manual step; FR-D4/D6/D7/D9/D10/M4 across M3.

**Placeholder scan:** No "TBD"/"handle later" without code. The one soft spot — Task 12's `noUnusedParameters` interaction with a partially-built drawer — is addressed with an explicit implementer note and a strategy (FlowScreen passes real handlers; the drawer references each prop on a code path), not a hand-wave. Prototype SVG glyphs are cited by line number where a text glyph substitutes.

**Type consistency:** `FlowNodeData`, `DrawerProps`, hook names (`usePutProcess`/`useRelayout`/`useResolvePending`/`useCreateProcess`), and `useFlowEditor`'s returned action names are used identically across tasks. Temp-id scheme (`tmp-n-`/`tmp-j-`) matches the backend's `_is_new_node` (verified against `save.py`). Canvas prop names (`onNodeDragStop`, `onOpenDetail`, `onConnect`, `onNodeClick`, `editing`) are consistent between Canvas and FlowScreen.

**Note on the spike gate:** Task 1's interactive verification cannot be done headlessly. Under subagent-driven execution it pauses for the human to run `npm run dev` and sign off the `SPIKE-FINDINGS.md` before Milestone 2 begins.
