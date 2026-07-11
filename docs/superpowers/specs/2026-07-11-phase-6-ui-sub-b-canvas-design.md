# Phase 6 — UI Frontend · Sub-project B: Flowchart Canvas on @xyflow/react

| | |
|---|---|
| **Date** | 2026-07-11 |
| **Status** | Approved design; ready for implementation plan (spike-gated) |
| **Repo** | `code-repo/ui/` |
| **Depends on** | Sub-project A (design tokens, shell, routing, data layer, `useProcess`) |
| **Basis** | PRD FR-I3, FR-D4/D6/D7/D9/D10, FR-M4, AC-5; ARD §9 (layout), §13; the prototype flow screen; `process.schema.json` |

## 0. Context

B rebuilds the prototype's flowchart screen — the interactive view/edit surface — on
`@xyflow/react`, the ARD-mandated diagram library. The prototype hand-rolls a bespoke absolute
SVG canvas; **B is the reconciliation of that look/behavior onto `@xyflow/react` custom nodes
and edges.** This is the flagged top risk in `PLAN.md §10`, so **B is spike-gated**.

Source of truth: the `isFlow` block of `ui/design/Inja Process System.dc.html` (working-tree
version, incl. the sub-process parent picker) + its pointer logic in the `<script>` and
`support.js`.

## 1. Spike (gate — do first)

A throwaway spike (not shipped) must prove the prototype's interactions map onto
`@xyflow/react` before the full build starts:

1. Custom **activity** node (ID chip, title, actor, conflict badge, sub-process affordance,
   three-dot detail button) rendered from `process.json`.
2. Custom **start/end** terminals and **junction diamonds** (color-coded XOR coral / AND
   violet / OR amber, `split`/`join`).
3. **Edges** with optional center label and a **click-to-delete** affordance in edit mode.
4. **Drag-to-link** from a coral connection handle → `onConnect` creates an edge.
5. **Pan / zoom / fit** always on; node **drag** only in edit mode.
6. RTL page with **LTR serpentine** node positions from the engine layout, Persian text inside
   nodes.

**Exit of spike:** all six confirmed on `@xyflow/react` built-ins (styled to match). If a
capability fights the library, record the workaround before continuing. Decision already taken:
**lean on React Flow's built-in connect/pan/zoom/drag/selection**, styled to the prototype;
reimplement by hand only where the spike shows a genuine gap.

## 2. Scope

**In B:**
- The flowchart canvas: custom nodes (activity, start, end, junction) and custom edges.
- **View-only default + Edit mode** toggle (FR-I3). View: pan/zoom/fit only. Edit: drag,
  drag-to-link, delete, add activity, add junction, **undo/redo**, **relayout**.
- **Manual Save** — all edits held in memory; one `PUT /api/processes/{pid}` + one commit on
  Save; Cancel discards (reset from query cache).
- **Layout** (ARD §9): initial positions from the stored `process.json`; a manual move sets
  that node's `layout: "manual"`; a **relayout** button calls `POST /api/processes/{pid}/
  relayout` and applies returned positions to non-manual nodes.
- **Node detail drawer**: view (label, actor, description, ICOM chips, `source` line) and edit
  (label, actor, description, **subprocess link-by-ID with live validation** + **"create
  sub-process & enter"**); **inline conflict accept/reject** on the box (per-process `pending`,
  mirrors the inbox — FR-M4).
- **Junction gate editor**: XOR/AND/OR selector with explanations.
- **Sub-process navigation** (bidirectional, FR-D6): click a linked activity → navigate to the
  child's flow; "parent process" → return.

**Deferred / elsewhere:** the design-system, shell, routing, and `useProcess` read hook come
from **A**. The global conflict inbox modal, create-process modal, process-delete confirm,
overview/summary edit, and toasts are **C**. All query/mutation hooks live in A's
`ui/src/api/hooks.ts` data layer; B adds `usePutProcess` (Save) and imports the shared
`useResolvePending`/`useCreateProcess` from there (C adds the rest).

## 3. Architecture

### 3.1 React Flow model
- **Node types:** `activity`, `start`, `end`, `junction` — custom components matching the
  prototype. Junction renders the rotated diamond + type label; color by `junctionType`.
- **Edge type:** one custom edge with an optional label and, in edit mode, a delete button via
  `EdgeLabelRenderer`.
- **Connection:** coral `Handle`s on activity/junction/terminal nodes; `onConnect` appends an
  edge to the in-memory doc. Terminals/junction handle placement follows the prototype.
- **Controlled state:** the editor holds the editable `process.json` in React state; nodes/
  edges are derived for React Flow and changes flow back into the doc (positions, new/removed
  edges, new nodes with **temporary keys**). React Flow's `onNodesChange`/`onEdgesChange`
  drive position/selection; structural edits go through the editor's own actions so
  undo/redo and Save see a single source of truth.

### 3.2 Edit lifecycle
- **Enter edit** snapshots the loaded doc. **Undo/redo** walk a history stack of editable-doc
  snapshots (bounded). **Save** → `PUT /api/processes/{pid}` with the whole doc; the backend
  allocates real IDs for temp-keyed new nodes, runs layout for position-less nodes, validates,
  writes, and commits once. **Cancel** discards the snapshot and re-reads from the query cache.
- **New nodes** use temporary keys (never final IDs — INV-1); real IDs arrive in the Save
  response (and from `relayout`, which realizes temp IDs statelessly). The editor adopts the
  returned doc after Save.
- **Delete** (INV-4): deleting an activity re-links previous→next so the path doesn't break
  (prototype's confirm copy); undoable. (The process-level "flag not delete" semantics are the
  backend/merge concern; the UI delete removes from the working doc, and Save reconciles.)

### 3.3 Data adapter (node internals — first place B needs them)
Reconcile prototype in-memory shape → frozen schema:
`description` (not `desc`); node `source` is `{created_by, touched_by}` (not a string); every
node carries `layout: "auto"|"manual"`; `icom {inputs,controls,outputs,mechanisms}`; junction
`junctionType {AND,OR,XOR}` + `direction {split,join}`; `subprocess: string|null`. The
`source` line in the drawer renders from the object. Conflict rows come from `pending[]` with
`field` → a Persian label map (`fieldFa`).

### 3.4 File structure (adds to A)
```
ui/src/flow/
  FlowScreen.tsx           # toolbar + viewport + drawer; view/edit
  Canvas.tsx               # <ReactFlow> wiring, node/edge type registration
  nodes/ ActivityNode.tsx  StartNode.tsx  EndNode.tsx  JunctionNode.tsx
  edges/ LabeledEdge.tsx
  DetailDrawer.tsx         # activity view/edit; junction gate editor
  useFlowEditor.ts         # editable-doc state, actions, undo/redo history
  adapt.ts                 # node field-name reconciliation + fieldFa map
```
Replaces A's `FlowPlaceholder.tsx` at route `/processes/:pid/flow`.

## 4. Testing
- Custom node/edge components render correctly from fixtures (activity chips/actor/conflict
  badge/sub affordance; junction color+type; edge label + delete button in edit only).
- `useFlowEditor`: add activity/junction, link (onConnect), delete-with-relink, undo/redo
  round-trips, move sets `layout:"manual"`, Save payload equals the edited doc.
- Sub-process navigation routes to the child and back.
- Inline conflict accept/reject calls the resolve hook with the right index.
- View-only mode exposes no edit actions.

## 5. Exit criteria (B)
- The flow screen matches the prototype (nodes, junctions, edges, drawer, toolbar, legend,
  zoom controls, RTL) against live `data-repo` data.
- **AC-5:** repositioning is preserved after reopening, and a later voice/run does not break the
  manual layout (verified with Phase-3 output + the `layout` CLI).
- FR-D4 (detail drawer), FR-D6/D7 (bidirectional sub-process nav + link/create), FR-D9/D10
  (serpentine layout + relayout), FR-M4 (inline conflict) demonstrable.
- View-only default prevents accidental edits (FR-I3).
- Vitest suite passes.

## 6. Dependencies
No new packages (`@xyflow/react` already in `package.json`). Consumes A's tokens/shell/data
layer and the `useResolvePending`/`useCreateProcess` mutation hooks (shared with C).
