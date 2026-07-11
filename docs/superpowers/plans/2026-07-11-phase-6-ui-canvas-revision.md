# Phase 6 UI — Flowchart Editor Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 8 reported flowchart-editor issues — tactile dragging, working add-node, multi-select move, a closable detail drawer, conflict-node access, a junction gate editor, edge arrowheads, and click-to-edit edge labels.

**Architecture:** Replace the fully-controlled `<ReactFlow>` (re-derived every render, no change handlers) with React Flow's controlled-with-change-handlers pattern: the canvas owns node/edge state via `useNodesState`/`useEdgesState`, re-seeded from the editor doc only when a `revision` counter bumps (so transient position/label commits don't snap back), committing moved positions to the editor on drag-stop. The editor doc stays the single source of truth for structure/content and undo/redo.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`), `@xyflow/react` 12.11.2, Tailwind 3, Vitest 3 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-11-phase-6-ui-canvas-revision-design.md`
**Depends on:** the sub-A/B/C code on `main` (flowchart editor, `useFlowEditor`, drawer, nodes/edges).

## Global Constraints

- **Editor doc = single source of truth** for structure/content + undo/redo. React Flow owns transient positions/selection during interaction. The canvas re-seeds from the doc **only** on a `revision` bump.
- **`revision` bumps on structural/external doc replacement** (add/delete/connect/deleteEdge/setJunction/patchActivity/linkSub/setName/undo/redo/adopt/enter/cancel/exitEdit and the server→doc sync) but **NOT** on `moveNodes`/`setEdgeLabel` (transient content commits) — otherwise a drag/type would re-seed and snap back / lose focus.
- **Position commits mark `layout:"manual"`** only for nodes that actually moved (compare to the seeded positions); never mark unmoved nodes manual (that would freeze them against future merges).
- **New nodes are placed at the current viewport center** via `useReactFlow().screenToFlowPosition` of the canvas wrapper's center, and selected.
- **`markerEnd: { type: MarkerType.ArrowClosed, color: '#9B86D9' }`** on every edge (directional arrowheads).
- **Edge editing:** click selects; only the **selected** edge (in edit mode) shows an inline label input (commits via `setEdgeLabel`) + a **× delete offset from the input**; non-selected edges show a read-only label. Use React Flow's `EdgeProps.selected`.
- **Drawer** renders **inside** the relative canvas container so its × close is visible.
- **TypeScript:** `verbatimModuleSyntax` → type-only imports use `import type`; `erasableSyntaxOnly` → no enums; `strict` + `noUnusedLocals`/`noUnusedParameters`; extensionless local imports; SVG attrs camelCase; RTL preserved.
- **Run from `ui/`** (vitest v3.2.7): `npm test`, `npm run build`. RF jsdom mocks are global (`ui/src/test/reactflow-mock.ts`).
- **Branch:** `phase-6-ui-canvas-revision` (already checked out). Commit after every task. All existing flow tests must stay green (updating a test is allowed only where the plan says so).

---

## File structure

```
ui/src/flow/
  useFlowEditor.ts        # MODIFY: + revision, moveNodes, setEdgeLabel; add* take optional position
  useFlowEditor.test.ts   # MODIFY: + revision/moveNodes/setEdgeLabel tests
  adapt.ts                # MODIFY: toFlowEdges sets markerEnd
  adapt.test.ts           # MODIFY: assert markerEnd
  Canvas.tsx              # REWRITE: useNodesState/useEdgesState, change handlers, commit-on-dragstop, selection
  FlowScreen.tsx          # MODIFY: split provider/inner; wire revision, moveNodes, add-at-center, drawer inside canvas, junction/edge wiring
  nodes/ActivityNode.tsx  # MODIFY: ⋯ to left corner; conflict badge opens drawer
  nodes/nodes.test.tsx    # MODIFY: assert badge onClick opens detail
  nodes/JunctionNode.tsx  # MODIFY: expose onOpenDetail affordance (click opens drawer)
  edges/LabeledEdge.tsx   # REWRITE: selected → inline label input + offset ×; else read-only; arrowhead
  edges/edge.test.tsx     # MODIFY: selected-edge input + delete; read-only when not selected
```

---

## Task 1: `useFlowEditor` — `revision`, `moveNodes`, `setEdgeLabel`, positioned adds

**Files:**
- Modify: `ui/src/flow/useFlowEditor.ts`, `ui/src/flow/useFlowEditor.test.ts`

**Interfaces:**
- Produces (added to the returned object): `revision: number`; `moveNodes(updates: { id: string; pos: { x: number; y: number } }[]): void` (batch position commit, each moved node `layout:"manual"`, one history entry, **no** revision bump); `setEdgeLabel(from: string, to: string, label: string): void` (**no** revision bump). `addActivity(pos?: {x,y})` / `addJunction(pos?: {x,y})` accept an optional position (default keeps today's fallback).

- [ ] **Step 1: Write the failing tests**

Append to `ui/src/flow/useFlowEditor.test.ts` (inside the existing `describe('useFlowEditor', ...)`):
```ts
  it('moveNodes batch-sets positions + manual, is undoable, and does NOT bump revision', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    const r0 = result.current.revision
    act(() => result.current.moveNodes([{ id: 'cooking-001-n010', pos: { x: 7, y: 8 } }]))
    const n = result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')!
    expect(n.position).toEqual({ x: 7, y: 8 })
    expect(n.layout).toBe('manual')
    expect(result.current.revision).toBe(r0)                 // transient commit: no re-seed
    act(() => result.current.undo())
    expect(result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')!.position).not.toEqual({ x: 7, y: 8 })
  })
  it('a structural action bumps revision', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    const r0 = result.current.revision
    act(() => result.current.addActivity())
    expect(result.current.revision).toBe(r0 + 1)
  })
  it('setEdgeLabel updates the matching edge label without bumping revision', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    const r0 = result.current.revision
    act(() => result.current.setEdgeLabel('start', 'cooking-001-n010', 'برچسب'))
    expect(result.current.doc.edges.find((e) => e.from === 'start' && e.to === 'cooking-001-n010')!.label).toBe('برچسب')
    expect(result.current.revision).toBe(r0)
  })
  it('addActivity places the node at the given position when provided', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    act(() => result.current.addActivity({ x: 300, y: 400 }))
    const added = result.current.doc.nodes.find((n) => n.id.startsWith('tmp-n-'))!
    expect(added.position).toEqual({ x: 300, y: 400 })
  })
```
(`server` is the fixture already defined at the top of this test file; it has `start`→`cooking-001-n010` and node `cooking-001-n010`.)

- [ ] **Step 2: Run to verify they fail** — `cd ui && npx vitest run src/flow/useFlowEditor.test.ts` → FAIL (`revision`/`moveNodes`/`setEdgeLabel` undefined).

- [ ] **Step 3: Implement the reducer changes in `ui/src/flow/useFlowEditor.ts`**

Replace the state/commit/mutate block and add the new actions. Concretely:

Add a `revision` state (after the `force` line — you may remove `force`):
```ts
  const [revision, setRevision] = useState(0)
```
Rewrite `commit`/`mutate` to carry a `structural` flag:
```ts
  const commit = useCallback((next: Process, structural = true) => {
    if (doc) past.current.push(doc)
    future.current = []
    setDoc(next)
    if (structural) setRevision((r) => r + 1)
  }, [doc])

  const mutate = useCallback((fn: (d: Process) => void, structural = true) => {
    if (!doc) return
    const next = clone(doc)
    fn(next)
    commit(next, structural)
  }, [doc, commit])
```
Bump `revision` on the server→doc sync effect and on enter/cancel/adopt/exitEdit/undo/redo:
```ts
  useEffect(() => {
    if (!editing && server) { setDoc(server); setRevision((r) => r + 1) }
  }, [server, editing])

  const enter = useCallback(() => { past.current = []; future.current = []; setEditing(true); setRevision((r) => r + 1) }, [])
  const cancel = useCallback(() => { past.current = []; future.current = []; setEditing(false); if (server) setDoc(server); setRevision((r) => r + 1) }, [server])
  const adopt = useCallback((next: Process) => { past.current = []; future.current = []; setDoc(next); setRevision((r) => r + 1) }, [])
  const exitEdit = useCallback(() => { past.current = []; future.current = []; setEditing(false); setRevision((r) => r + 1) }, [])

  const undo = useCallback(() => {
    if (!past.current.length || !doc) return
    future.current.push(doc); setDoc(past.current.pop()!); setRevision((r) => r + 1)
  }, [doc])
  const redo = useCallback(() => {
    if (!future.current.length || !doc) return
    past.current.push(doc!); setDoc(future.current.pop()!); setRevision((r) => r + 1)
  }, [doc])
```
Make `moveNode` transient and add `moveNodes`/`setEdgeLabel`:
```ts
  const moveNode = useCallback((id: string, pos: Pos) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id); if (n) { n.position = pos; n.layout = 'manual' }
  }, false), [mutate])

  const moveNodes = useCallback((updates: { id: string; pos: Pos }[]) => mutate((d) => {
    for (const u of updates) {
      const n = d.nodes.find((x) => x.id === u.id); if (n) { n.position = u.pos; n.layout = 'manual' }
    }
  }, false), [mutate])

  const setEdgeLabel = useCallback((from: string, to: string, label: string) => mutate((d) => {
    const e = d.edges.find((x) => x.from === from && x.to === to); if (e) e.label = label
  }, false), [mutate])
```
Give the adds an optional position:
```ts
  const addActivity = useCallback((pos: Pos = { x: 120, y: 120 }) => mutate((d) => {
    const id = nextTempId('n', ++tmp.current)
    const node: ActivityNode = { id, type: 'activity', label: 'فعالیت جدید', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: pos, layout: 'manual', source: { created_by: 'ui-edit', touched_by: [] } }
    d.nodes.push(node)
  }), [mutate])

  const addJunction = useCallback((pos: Pos = { x: 160, y: 160 }) => mutate((d) => {
    const id = nextTempId('j', ++tmp.current)
    const node: JunctionNode = { id, type: 'junction', junctionType: 'XOR', direction: 'split', position: pos, layout: 'manual' }
    d.nodes.push(node)
  }), [mutate])
```
Add `revision`, `moveNodes`, `setEdgeLabel` to the returned object:
```ts
  return {
    doc: doc as Process, editing, selected, select: setSelected, revision,
    enter, cancel, adopt, exitEdit,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0, undo, redo,
    setName, moveNode, moveNodes, addActivity, addJunction, connect, deleteEdge, deleteNode,
    setJunction, patchActivity, linkSub, setEdgeLabel,
  }
```

- [ ] **Step 4: Run to verify they pass** — `cd ui && npx vitest run src/flow/useFlowEditor.test.ts` (existing reducer tests + the 4 new ones) → PASS. Then `cd ui && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/useFlowEditor.ts ui/src/flow/useFlowEditor.test.ts
git commit -m "feat(ui/flow): editor revision counter + moveNodes/setEdgeLabel + positioned adds"
```

---

## Task 2: Edge arrowheads (`toFlowEdges` markerEnd) — fixes #7

**Files:**
- Modify: `ui/src/flow/adapt.ts`, `ui/src/flow/adapt.test.ts`

**Interfaces:**
- Produces: `toFlowEdges` result edges each carry `markerEnd: { type: MarkerType.ArrowClosed, color: '#9B86D9', width: 18, height: 18 }`.

- [ ] **Step 1: Write the failing test**

Add to `ui/src/flow/adapt.test.ts` (inside the existing `describe('adapt', ...)`):
```ts
  it('edges carry an arrowhead markerEnd', () => {
    const es = toFlowEdges(proc)
    expect(es[0].markerEnd).toMatchObject({ type: 'arrowclosed' })
  })
```
(`proc` is the fixture already defined in this file. `MarkerType.ArrowClosed` serializes to the string `'arrowclosed'`.)

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/adapt.test.ts` → FAIL (markerEnd undefined).

- [ ] **Step 3: Implement**

In `ui/src/flow/adapt.ts`, add `MarkerType` to the value imports and set `markerEnd` in `toFlowEdges`:
```ts
import { MarkerType } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
// ...
export function toFlowEdges(proc: Process): Edge[] {
  return proc.edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'labeled',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9B86D9', width: 18, height: 18 },
    data: { label: e.label ?? '' },
  }))
}
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/adapt.test.ts` → PASS. Then `cd ui && npm test && npm run build` (full suite still green).

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/adapt.ts ui/src/flow/adapt.test.ts
git commit -m "feat(ui/flow): directional arrowheads on edges"
```

---

## Task 3: Canvas state rework + FlowScreen wiring — fixes #1, #4, #8

Adopt React Flow's controlled-with-change-handlers pattern; commit moved positions on drag-stop; place new nodes at the viewport center; enable multi-select. Split `FlowScreen` so the toolbar and canvas both sit inside `<ReactFlowProvider>` (needed for `useReactFlow`).

**Files:**
- Rewrite: `ui/src/flow/Canvas.tsx`
- Modify: `ui/src/flow/FlowScreen.tsx`

**Interfaces:**
- Consumes: `useFlowEditor` (Task 1: `revision`, `moveNodes`, `addActivity(pos)`, `addJunction(pos)`), `toFlowNodes`/`toFlowEdges`.
- Produces: `Canvas({ docNodes, docEdges, revision, editing, onConnect, onNodeClick, onOpenDetail, onCommitPositions, onSetEdgeLabel, onDeleteEdge })` — a self-managing canvas. `onCommitPositions(updates: {id,pos}[])`.

- [ ] **Step 1: Rewrite `ui/src/flow/Canvas.tsx`**

```tsx
import { useEffect, useRef, useCallback } from 'react'
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ActivityNode } from './nodes/ActivityNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { JunctionNode } from './nodes/JunctionNode'
import { LabeledEdge } from './edges/LabeledEdge'

const nodeTypes = { activity: ActivityNode, start: StartNode, end: EndNode, junction: JunctionNode }
const edgeTypes = { labeled: LabeledEdge }
type Pos = { x: number; y: number }

export function Canvas({ docNodes, docEdges, revision, editing, onConnect, onNodeClick, onOpenDetail, onCommitPositions, onSetEdgeLabel, onDeleteEdge }: {
  docNodes: Node[]; docEdges: Edge[]; revision: number; editing: boolean
  onConnect?: (c: Connection) => void
  onNodeClick?: (id: string) => void
  onOpenDetail?: (id: string) => void
  onCommitPositions: (updates: { id: string; pos: Pos }[]) => void
  onSetEdgeLabel: (from: string, to: string, label: string) => void
  onDeleteEdge: (from: string, to: string) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const seeded = useRef<Map<string, Pos>>(new Map())

  // Re-seed from the doc ONLY when structure changes (revision) or the edit flag flips.
  // moveNodes/setEdgeLabel don't bump revision, so a drag/type won't snap back.
  useEffect(() => {
    setNodes(docNodes.map((n) => ({ ...n, data: { ...n.data, onOpenDetail }, draggable: editing, selectable: editing })))
    setEdges(docEdges.map((e) => ({
      ...e, selectable: editing,
      data: { ...(e.data as object), editing, onSetLabel: (v: string) => onSetEdgeLabel(e.source, e.target, v), onDelete: () => onDeleteEdge(e.source, e.target) },
    })))
    seeded.current = new Map(docNodes.map((n) => [n.id, n.position]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, editing])

  const commitMoved = useCallback(() => {
    const moved = nodes
      .filter((n) => { const s = seeded.current.get(n.id); return s && (s.x !== n.position.x || s.y !== n.position.y) })
      .map((n) => ({ id: n.id, pos: n.position }))
    if (moved.length) { onCommitPositions(moved); for (const m of moved) seeded.current.set(m.id, m.pos) }
  }, [nodes, onCommitPositions])

  return (
    <div dir="ltr" className="w-full h-full">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={editing ? onConnect : undefined}
        onNodeClick={(_, n) => onNodeClick?.(n.id)}
        onNodeDragStop={commitMoved}
        nodesConnectable={editing}
        selectionOnDrag={editing}
        panOnDrag={editing ? [1, 2] : true}
        fitView proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
```
Notes: node/edge `draggable`/`selectable`/`nodesConnectable` follow `editing`; `selectionOnDrag` + `panOnDrag={[1,2]}` in edit mode gives left-drag box-select while middle/right-drag pans (Shift adds to selection by default). `onNodeDragStop` commits every moved node (multi-select included). Because the seed injects `onOpenDetail`/`onSetLabel`/`onDelete` into node/edge data and only re-runs on `revision`/`editing`, the callbacks stay stable during interaction.

- [ ] **Step 2: Rewrite the canvas wiring in `ui/src/flow/FlowScreen.tsx`**

Split so the toolbar + canvas live inside one `<ReactFlowProvider>`, and place new nodes at the viewport center. Change the imports and structure:
```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { useState, useRef } from 'react'
import { ReactFlowProvider, useReactFlow, type Connection } from '@xyflow/react'
// ...existing imports (useProcess/usePutProcess/useRelayout/useCreateProcess/useResolvePending,
//   useFlowEditor, toFlowNodes/toFlowEdges, Canvas, Button, IdBadge, DeleteNodeConfirm, DetailDrawer, ActivityNode type)
```
Wrap the whole editor in a provider and move the body into an inner component:
```tsx
export function FlowScreen() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}
```
Rename the current `FlowScreen` body to `function FlowEditor()` and make these changes inside it:
1. Add a wrapper ref + viewport-center helper (uses `useReactFlow`, now legal since we're inside the provider):
```tsx
  const rf = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)
  function centerPos() {
    const el = wrapRef.current
    if (!el) return { x: 120, y: 120 }
    const r = el.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
```
2. Toolbar add buttons place at center:
```tsx
   <Button variant="ghost" onClick={() => ed.addActivity(centerPos())} className="px-3 py-2 text-[12.5px]">فعالیت</Button>
   <Button variant="ghost" onClick={() => ed.addJunction(centerPos())} className="px-3 py-2 text-[12.5px]">اتصال</Button>
```
3. Replace the `<ReactFlowProvider><Canvas .../></ReactFlowProvider>` block. The canvas container gets the ref, and the Canvas gets the new props (no inner provider — the outer one wraps everything):
```tsx
      <div ref={wrapRef} className="flex-1 min-h-0 relative">
        <Canvas
          docNodes={toFlowNodes(proc)} docEdges={toFlowEdges(proc)} revision={ed.revision} editing={editing}
          onNodeClick={onNodeClick}
          onConnect={(c: Connection) => c.source && c.target && ed.connect(c.source, c.target)}
          onOpenDetail={setDetailId}
          onCommitPositions={(u) => ed.moveNodes(u)}
          onSetEdgeLabel={(f, t, v) => ed.setEdgeLabel(f, t, v)}
          onDeleteEdge={(f, t) => ed.deleteEdge(f, t)}
        />
        {/* edit banner + legend stay here, inside the relative container */}
        {/* DetailDrawer render moves in here — see Task 4 */}
      </div>
```
Remove the now-unused local `edges` derivation (`const edges = toFlowEdges(proc).map(...)`) and the `nodes` local — pass `toFlowNodes(proc)`/`toFlowEdges(proc)` straight to Canvas. Keep `onNodeClick` (Task 6 extends it for junctions).

- [ ] **Step 3: Run tests + build**

Run: `cd ui && npx vitest run src/flow/FlowScreen.test.tsx src/flow/FlowScreen.edit.test.tsx src/flow/FlowScreen.save.test.tsx src/flow/FlowScreen.relayout.test.tsx`
Expected: PASS. The edit test (clicking «فعالیت» → «فعالیت جدید» appears) still passes: `addActivity` bumps `revision`, the canvas re-seeds and renders the new node. Then `cd ui && npm test && npm run build` → all green. (If the save/relayout tests reference the old Canvas provider nesting, they render `FlowScreen` which now self-wraps — no change needed.)

- [ ] **Step 4: Commit**
```bash
git add ui/src/flow/Canvas.tsx ui/src/flow/FlowScreen.tsx
git commit -m "fix(ui/flow): tactile drag + multi-select via RF change handlers; add nodes at viewport center"
```

---

## Task 4: Detail drawer inside the canvas container — fixes #2

**Files:**
- Modify: `ui/src/flow/FlowScreen.tsx`
- Create: `ui/src/flow/FlowScreen.drawer.test.tsx`

**Interfaces:**
- Consumes: the `FlowEditor` body + `DetailDrawer` (unchanged).

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/FlowScreen.drawer.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: 'd', actor: 'x', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 40, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } }],
  edges: [] }

describe('FlowScreen drawer', () => {
  it('opens the detail drawer with a working close button inside the canvas area', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    const dots = await screen.findByTitle('جزئیات')
    fireEvent.click(dots)
    expect(await screen.findByText('ثبت')).toBeInTheDocument()          // drawer body (label)
    const close = screen.getByTitle('بستن')
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByTitle('بستن')).not.toBeInTheDocument())  // drawer closed
  })
})
```
(The close button gets a `title="بستن"` in Step 3 so the test can target it.)

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/FlowScreen.drawer.test.tsx` → FAIL (either the drawer/close isn't found or doesn't close).

- [ ] **Step 3: Move the drawer inside the relative container + title the close button**

In `ui/src/flow/FlowScreen.tsx` (the `FlowEditor` body), move the whole `{(() => { if (!detailId) return null ... <DetailDrawer .../> })()}` block from the end of the component to **inside** the `<div ref={wrapRef} className="flex-1 min-h-0 relative">` container (after the banner/legend, before that div closes). In `ui/src/flow/DetailDrawer.tsx`, add `title="بستن"` to the close button:
```tsx
        <button onClick={onClose} title="بستن" className="w-7 h-7 bg-tile-v2 rounded-lg text-muted text-lg">×</button>
```

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/FlowScreen.drawer.test.tsx` → PASS. Then `cd ui && npm test && npm run build` → all green (existing DetailDrawer tests unaffected — only a title attr added).

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/FlowScreen.tsx ui/src/flow/DetailDrawer.tsx ui/src/flow/FlowScreen.drawer.test.tsx
git commit -m "fix(ui/flow): render detail drawer inside the canvas (close button reachable)"
```

---

## Task 5: Activity node — ⋯ off the badge corner + conflict badge opens drawer — fixes #6

**Files:**
- Modify: `ui/src/flow/nodes/ActivityNode.tsx`, `ui/src/flow/nodes/nodes.test.tsx`

**Interfaces:**
- Consumes: `FlowNodeData`, `data.onOpenDetail`.

- [ ] **Step 1: Write the failing test**

Add to `ui/src/flow/nodes/nodes.test.tsx` (inside `describe('custom nodes', ...)`):
```ts
  it('clicking the conflict badge opens the detail drawer', () => {
    const onOpenDetail = vi.fn()
    wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 2, hasSub: false, onOpenDetail }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    fireEvent.click(screen.getByTitle('تعارض‌ها'))
    expect(onOpenDetail).toHaveBeenCalledWith('cooking-001-n010')
  })
```
(Add `import { fireEvent }` and `import { vi }` to this test file if not already imported; `act` is the activity fixture already defined there.)

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/nodes/nodes.test.tsx` → FAIL (badge not clickable / no title).

- [ ] **Step 3: Implement in `ui/src/flow/nodes/ActivityNode.tsx`**

Move the ⋯ button to the **end** (left in RTL) corner and make the conflict badge a button that opens the drawer:
```tsx
      <button
        onClick={(e) => { e.stopPropagation(); (data as { onOpenDetail?: (id: string) => void }).onOpenDetail?.(n.id) }}
        className="absolute top-1 end-1 w-[17px] h-[17px] flex items-center justify-center rounded text-muted text-[10px] hover:bg-tile-v2"
        title="جزئیات"
      >⋯</button>
      {data.conflicts > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); (data as { onOpenDetail?: (id: string) => void }).onOpenDetail?.(n.id) }}
          title="تعارض‌ها"
          className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center bg-coral text-white rounded-full text-[9.5px] font-extrabold cursor-pointer"
        >! <span>{toFa(data.conflicts)}</span></button>
      )}
```
(`⋯` now at `top-1 end-1` = left in RTL; the badge stays at `top-1 right-1` and is now a clickable button — no more overlap, and the badge opens the drawer.)

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/nodes/nodes.test.tsx` → PASS (existing node render tests + the new badge-click test). Then `cd ui && npm test && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/nodes/ActivityNode.tsx ui/src/flow/nodes/nodes.test.tsx
git commit -m "fix(ui/flow): move detail button off the conflict badge; badge opens drawer"
```

---

## Task 6: Junction click opens the gate editor — fixes #5

**Files:**
- Modify: `ui/src/flow/FlowScreen.tsx`, `ui/src/flow/FlowScreen.junction.test.tsx` (create)

**Interfaces:**
- Consumes: `onNodeClick` in `FlowEditor`; `setDetailId`; the drawer's existing junction edit branch.

- [ ] **Step 1: Write the failing test**

Create `ui/src/flow/FlowScreen.junction.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 60, y: 90 }, layout: 'auto' }],
  edges: [] }

describe('FlowScreen junction', () => {
  it('clicking a junction in edit mode opens the drawer with the gate selector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    // The junction diamond shows its type label "XOR"; click it.
    fireEvent.click(screen.getByText('XOR'))
    // Drawer edit branch shows the AND button (from Task 14 junction editor).
    expect(await screen.findByRole('button', { name: 'AND' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/FlowScreen.junction.test.tsx` → FAIL (clicking a junction only selects; no drawer).

- [ ] **Step 3: Route a junction click to the drawer in `ui/src/flow/FlowScreen.tsx`**

Extend `onNodeClick` in `FlowEditor` so that clicking a junction opens the drawer (in either mode), while activities keep their behavior:
```tsx
  function onNodeClick(id: string) {
    const n = proc.nodes.find((x) => x.id === id)
    if (n && n.type === 'junction') { setDetailId(id); return }
    if (editing) { ed.select(id); return }
    if (n && n.type === 'activity' && (n as ActivityNode).subprocess) nav(`/processes/${(n as ActivityNode).subprocess}/flow`)
  }
```
(The drawer already renders the junction view + the XOR/AND/OR editor in edit mode via `onSetJunction` — no drawer change needed.)

- [ ] **Step 4: Run to verify it passes** — `cd ui && npx vitest run src/flow/FlowScreen.junction.test.tsx` → PASS. Then `cd ui && npm test && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add ui/src/flow/FlowScreen.tsx ui/src/flow/FlowScreen.junction.test.tsx
git commit -m "feat(ui/flow): clicking a junction opens the gate (XOR/AND/OR) editor"
```

---

## Task 7: Edge label editing — fixes #3

Click-to-select an edge → inline label input (commits via `setEdgeLabel`) + a × delete **offset** from the input; non-selected edges show a read-only label. Update the edit help banner copy.

**Files:**
- Rewrite: `ui/src/flow/edges/LabeledEdge.tsx`
- Modify: `ui/src/flow/edges/edge.test.tsx`, `ui/src/flow/FlowScreen.tsx` (banner copy)

**Interfaces:**
- Consumes: `EdgeProps.selected`; edge `data` = `{ label, editing, onSetLabel(v), onDelete() }` (injected by Canvas, Task 3).

- [ ] **Step 1: Rewrite the test `ui/src/flow/edges/edge.test.tsx`**

Replace the two `it(...)` cases (keep the file's top `vi.mock('@xyflow/react', …)` and imports):
```tsx
  it('shows a read-only label when not selected', () => {
    wrap(<LabeledEdge {...base} selected={false} data={{ label: 'بله', editing: true, onSetLabel: () => {}, onDelete: () => {} }} />)
    expect(screen.getByText('بله')).toBeInTheDocument()
    expect(screen.queryByTitle('حذف خط')).not.toBeInTheDocument()   // no × when not selected
  })
  it('when selected in edit mode, edits the label and deletes via an offset button', () => {
    const onSetLabel = vi.fn(); const onDelete = vi.fn()
    wrap(<LabeledEdge {...base} selected data={{ label: 'بله', editing: true, onSetLabel, onDelete }} />)
    const input = screen.getByDisplayValue('بله')
    fireEvent.change(input, { target: { value: 'خیر' } })
    expect(onSetLabel).toHaveBeenCalledWith('خیر')
    fireEvent.click(screen.getByTitle('حذف خط'))
    expect(onDelete).toHaveBeenCalled()
  })
```
Ensure the `base` object at the top of the file includes `selected: false` by default is NOT needed — pass `selected` explicitly per case as above. Add `import { fireEvent }` if missing.

- [ ] **Step 2: Run to verify it fails** — `cd ui && npx vitest run src/flow/edges/edge.test.tsx` → FAIL (no input / × always present).

- [ ] **Step 3: Rewrite `ui/src/flow/edges/LabeledEdge.tsx`**

```tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

type Data = { label?: string; editing?: boolean; onSetLabel?: (v: string) => void; onDelete?: () => void }

export function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const d = (data ?? {}) as Data
  const active = selected && d.editing
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: '#9B86D9', strokeWidth: selected ? 2.6 : 2 }} />
      <EdgeLabelRenderer>
        {active ? (
          <div className="nodrag nopan" style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}>
            <div className="flex items-center gap-1.5">
              <input
                value={d.label ?? ''} onChange={(e) => d.onSetLabel?.(e.target.value)} placeholder="متن روی خط…"
                className="w-[130px] text-[11px] text-ink bg-white border-[1.5px] border-coral rounded-md px-2 py-0.5 outline-none text-center"
              />
              <button title="حذف خط" onClick={d.onDelete} className="w-5 h-5 shrink-0 rounded-full bg-white border border-conflict text-conflict text-xs leading-none">×</button>
            </div>
          </div>
        ) : d.label ? (
          <div style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="bg-white/90 text-ink text-[11px] px-2 py-0.5 rounded-md pointer-events-none">{d.label}</div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
```
(The `×` sits *beside* the input, not on the label. `nodrag nopan` keeps typing/clicking from panning the canvas.)

- [ ] **Step 4: Update the edit banner copy in `ui/src/flow/FlowScreen.tsx`**

Change the edit help banner text to mention edge editing:
```tsx
          <div className="absolute top-3.5 left-1/2 -translate-x-1/2 bg-ink text-white text-[11.5px] px-4 py-2 rounded-full pointer-events-none z-10">
            از نقطهٔ مرجانیِ کنار هر گره بکشید تا خط بسازید · روی یک خط کلیک کنید تا نام‌گذاری یا حذف شود
          </div>
```

- [ ] **Step 5: Run to verify it passes** — `cd ui && npx vitest run src/flow/edges/edge.test.tsx` → PASS. Then the FULL suite `cd ui && npm test && npm run build` → all green.

- [ ] **Step 6: Commit**
```bash
git add ui/src/flow/edges/LabeledEdge.tsx ui/src/flow/edges/edge.test.tsx ui/src/flow/FlowScreen.tsx
git commit -m "feat(ui/flow): click-to-edit edge labels + offset delete (× off the text)"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- §2 canvas rework (#1/#4/#8) → Task 1 (revision/moveNodes/positioned adds) + Task 3 (Canvas useNodesState/change handlers, commit-on-dragstop, viewport-center add, selectionOnDrag). §3 drawer (#2) → Task 4. §4 activity affordances (#6) → Task 5. §5 junction (#5) → Task 6. §6 arrowheads (#7) → Task 2. §7 edge editing (#3) → Task 1 (setEdgeLabel) + Task 7 (LabeledEdge + banner). §8 tests → per task. §9 out-of-scope respected (no backend/`?node=`). §10 exit criteria map to the per-task deliverables + the manual verification below.

**Placeholder scan:** No TBD/vague steps; every code step has complete code. Two tests intentionally rewrite prior assertions (edge.test.tsx in Task 7; the drawer close gains a title in Task 4) — called out explicitly, not silent.

**Type consistency:** `revision`, `moveNodes(updates:{id,pos}[])`, `setEdgeLabel(from,to,label)`, `addActivity(pos?)`/`addJunction(pos?)` (Task 1) are consumed with the same signatures in Task 3. Canvas props (`docNodes/docEdges/revision/onCommitPositions/onSetEdgeLabel/onDeleteEdge`) match between Canvas (Task 3) and FlowScreen (Task 3). Edge `data` shape `{label,editing,onSetLabel,onDelete}` matches between Canvas seed (Task 3) and LabeledEdge (Task 7). `onOpenDetail` in node data is consumed by ActivityNode (Task 5) and injected by Canvas (Task 3).

**Manual verification (after all tasks, against the running app):** in edit mode — drag is smooth; «فعالیت»/«اتصال» drop a node at center that drags immediately; box/Shift-select several and move together, Save, reopen → positions kept; open a box's ⋯ or its «!» badge → drawer opens and × closes it; click a junction → XOR/AND/OR editor; edges show arrowheads; click an edge → rename via the inline input and delete via the × beside it.

**Risk note (for the reviewer):** the re-seed effect is keyed on `[revision, editing]` only (not `docNodes`/`docEdges`) — this is deliberate so position/label commits don't snap back, but it means any doc change that should re-seed MUST bump `revision` (Task 1 ensures every structural path and the server-sync effect do). The reviewer should confirm no structural mutation path was left without a `revision` bump.
