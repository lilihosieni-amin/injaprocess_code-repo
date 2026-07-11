# Phase 6 UI — Flowchart Editor Revision (canvas fixes) Design

| | |
|---|---|
| **Date** | 2026-07-11 |
| **Status** | Design for review |
| **Repo** | `code-repo/ui/` (frontend only) |
| **Basis** | 8 issues reported from live testing of the sub-B flowchart editor (now on `main`) |
| **Scope** | Bug fixes + two small redesigns + one feature on the `@xyflow/react` canvas; no backend change |

## 0. Context

The sub-B flowchart editor shipped a **fully-controlled** `<ReactFlow>`: `nodes`/`edges`
are re-derived from the `useFlowEditor` doc on every render, and `onNodesChange`/
`onEdgesChange` are never passed. React Flow disables smooth dragging without
`onNodesChange`, and re-passing derived positions every render fights any in-progress
interaction. That single architectural gap is the root of the drag lag, the "add does
nothing" feel, and the missing multi-select. The rest are targeted UI bugs and two small
UX redesigns. This revision fixes all eight.

## 1. Issues → root causes → fixes

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | Dragging a node is laggy/non-tactile | `<ReactFlow>` controlled; no `onNodesChange` → RF fights the re-derived positions every render | §2 canvas state rework |
| 4 | «فعالیت»/«اتصال» buttons seem to do nothing | Node IS added to the doc but at a fixed off-view position and can't be dragged (same as #1) | §2 + place new node at viewport center, select+reveal it |
| 8 | Can't select several nodes/edges and move together | No selection state tracked (no `onNodesChange`); multi-drag never commits | §2 (RF selection + commit-all-moved) |
| 2 | Detail drawer has no close button / never closes | Drawer rendered as a sibling **outside** the `relative` canvas container → `absolute top-0` header (with ×) hidden behind the top bars | §3 render the drawer inside the relative canvas container |
| 6 | A node with a conflict can't open its detail drawer | The ⋯ button is at `start-1` = **right** in RTL, same corner as the conflict badge (`right-1`); the badge overlaps and covers ⋯, and the badge has no click handler | §4 move ⋯ to the left corner; make the conflict badge open the drawer |
| 5 | Clicking an AND/OR/XOR node doesn't open a type editor | Junction nodes have no open-drawer affordance; the drawer's XOR/AND/OR editor exists but is unreachable | §5 clicking a junction opens the drawer (which already edits the gate type) |
| 7 | Edges have no direction arrowhead | Edges never set `markerEnd` | §6 `markerEnd: ArrowClosed` on every edge |
| 3 | Edge labels aren't editable; the × sits on top of the label | Label and × render at the same midpoint; no label-edit path/action | §7 click-edge-to-edit: inline label input + separately-placed × + a `setEdgeLabel` action |

## 2. Canvas state rework (fixes #1, #4, #8)

Adopt React Flow's recommended **controlled-with-change-handlers** pattern instead of
re-deriving every render.

- The canvas holds its own node/edge arrays via `useNodesState`/`useEdgesState`, seeded
  from the editor doc.
- **`onNodesChange`/`onEdgesChange` are wired** (`applyNodeChanges`/`applyEdgeChanges`) so
  React Flow owns live positions and selection during interaction — this restores tactile
  dragging and enables box/multi-select.
- **Re-seed only on structural change, not on every render.** `useFlowEditor` exposes a
  monotonically-increasing **`revision`** counter bumped by every *structural/content*
  action (add/delete/connect/deleteEdge/setJunction/patchActivity/linkSub/setName/
  setEdgeLabel/adopt/undo/redo/cancel/enter) — but **not** by `moveNode`. A `useEffect`
  keyed on `revision` (and the node/edge identity set) re-seeds the RF arrays from the doc.
  Because a drag commit (`moveNode`) does not bump `revision`, the committed position never
  triggers a re-seed that would snap the node back.
- **Commit positions on drag stop, for all moved nodes.** `onNodeDragStop` (and the
  selection-drag equivalent) reads the current RF node positions and commits every node
  whose position changed to the editor via a batch `moveNodes(updates)` action (each set to
  `layout:"manual"`). This makes multi-select move persist (#8).
- **New nodes appear where the user is looking.** `addActivity`/`addJunction` place the new
  node at the **center of the current viewport** (via `useReactFlow().screenToFlowPosition`
  of the canvas center) and mark it selected, so it's visibly created and immediately
  draggable (#4).
- Enable React Flow selection affordances in edit mode: `selectionOnDrag` (drag on empty
  canvas draws a selection box), `panOnDrag` on the right mouse / space as appropriate,
  `multiSelectionKeyCode` default (Shift). View mode stays pan/zoom-only.

**New `useFlowEditor` surface:** `revision: number`; `moveNodes(updates: {id, pos}[])`
(batch, each `layout:"manual"`, one history entry); `setEdgeLabel(from, to, label)`.
`moveNode` stays (single) for programmatic use; `moveNodes` is what the canvas commits with.

This keeps the editor doc the single source of truth for structure/content and undo/redo,
while React Flow owns transient interaction state — the standard, robust integration.

## 3. Drawer placement (fixes #2)

Render `<DetailDrawer>` **inside** the `relative` canvas container (the `div` that wraps
`<ReactFlowProvider>`), not as a sibling after it. Then its `absolute top-0 bottom-0 left-0`
box is measured against the canvas area (below the toolbars), so the header — id badge +
× close — is visible and clickable. The × already calls `onClose`; it was simply off-screen.

## 4. Activity node affordances (fixes #6)

- Move the ⋯ detail button from `start-1` to the **left** corner (`end-1` in RTL, i.e. the
  corner opposite the conflict badge) so it never collides with the badge.
- Make the **conflict badge itself open the drawer**: give it an `onClick`
  (`stopPropagation` + `onOpenDetail(id)`) and a pointer cursor, so clicking «! N» opens the
  box and lands on its conflicts. Both the ⋯ and the badge now open the drawer.

## 5. Junction opens the gate editor (fixes #5)

Clicking a junction node in **edit** mode opens the detail drawer for that node
(`onOpenDetail(id)` from the junction node, or FlowScreen routing a junction click to
`setDetailId`). The drawer already renders the junction **view** (gate type + explanation)
and, in edit mode, the **XOR/AND/OR selector** wired to `setJunction`. No new editor UI —
just make the junction reachable. (In view mode a junction click does nothing special.)

## 6. Edge arrowheads (fixes #7)

Every edge carries `markerEnd: { type: MarkerType.ArrowClosed, color: '#9B86D9', width, height }`
(set in `toFlowEdges` or via `defaultEdgeOptions` on `<ReactFlow>`), so `BaseEdge` renders a
filled arrowhead at the target — matching the prototype's directional edges.

## 7. Edge label editing (fixes #3)

Redesign the edge interaction:

- The `×` delete affordance is **no longer drawn on the label**. Instead, clicking an edge
  **selects** it; only the **selected** edge shows edit affordances.
- For the selected edge (in edit mode), the `LabeledEdge` renders an **inline text input**
  at the edge midpoint (pre-filled with the current label) that edits the label live via a
  new `setEdgeLabel(from, to, value)` editor action, plus a **× delete button offset from
  the input** (e.g. above / to the side, not overlapping the text).
- Non-selected edges render their label as read-only text (as today). In view mode, edges
  are not selectable and show read-only labels.
- The edit help banner copy updates: drag from the coral handle to create an edge; **click
  an edge to rename or delete it** (replacing "click a line to delete").

**New `useFlowEditor` action:** `setEdgeLabel(from, to, label)` (immutably updates the
matching edge's `label`; one history entry; bumps `revision`).

## 8. Testing

- `useFlowEditor`: `moveNodes` sets each node's position + `layout:"manual"` in one history
  entry and is undoable; `setEdgeLabel` updates the right edge's label; `revision` increments
  on structural actions but **not** on `moveNode`/`moveNodes` position commits (guard against
  the re-seed loop — assert `revision` unchanged across a `moveNodes`).
- `adapt`/edges: `toFlowEdges` sets `markerEnd` (ArrowClosed).
- Canvas/FlowScreen (RTL jsdom): entering edit and clicking «فعالیت» adds an activity that
  appears in the rendered nodes; the drawer renders **inside** the canvas container and its
  close × is present; a conflict node's badge click opens the drawer; a junction click in
  edit opens the drawer with the XOR/AND/OR selector; the selected edge shows a label input
  and a delete button; the help banner mentions renaming an edge.
- All existing sub-B flow tests continue to pass (the reducer's existing actions and the
  drawer/junction/conflict branches are unchanged in contract).

## 9. Out of scope

- No backend/engine change. No change to the read screens, write flows (sub-A/C), or the
  save/relayout/pending contracts. The `?node=` "focus a specific node after navigation"
  follow-up (from the sub-B/C final reviews) is **not** included here — it remains a separate
  follow-up.

## 10. Exit criteria

Against live `data-repo` data in the running app: dragging a node is smooth and tactile
(#1); «فعالیت»/«اتصال» visibly create a draggable node at the viewport center (#4); several
nodes can be box/shift-selected and moved together, persisting on Save (#8); the detail
drawer opens with a working × close (#2); a conflict node opens its drawer via the badge or ⋯
(#6); clicking a junction opens the XOR/AND/OR editor (#5); edges show arrowheads (#7);
clicking an edge lets you rename its label and delete it via a × that isn't on the text (#3).
The frontend test suite stays green.
