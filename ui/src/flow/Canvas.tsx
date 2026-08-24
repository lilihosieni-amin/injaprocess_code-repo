import { useEffect, useRef, useCallback } from 'react'
import {
  ReactFlow, Background, Controls, ControlButton, useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ActivityNode } from './nodes/ActivityNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { JunctionNode } from './nodes/JunctionNode'
import { LabeledEdge } from './edges/LabeledEdge'
import { A4Lane } from './A4Lane'

const nodeTypes = { activity: ActivityNode, start: StartNode, end: EndNode, junction: JunctionNode }
const edgeTypes = { labeled: LabeledEdge }
type Pos = { x: number; y: number }

/** How far the focused node sits from the pane's corner. Flush against it reads
 *  as clipped rather than as placed, and the node's own drop shadow needs the
 *  room. */
const FOCUS_PAD = 32

/** React Flow's own fit-view glyph, redrawn — the button below replaces theirs
 *  and must not look like a different control. */
const FIT_ICON = 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3'

export function Canvas({ docNodes, docEdges, revision, editing, mode = 'pan', focusId, onConnect, onNodeClick, onOpenDetail, onCommitPositions, onSetEdgeLabel, onDeleteEdge }: {
  docNodes: Node[]; docEdges: Edge[]; revision: number; editing: boolean; mode?: 'pan' | 'select'
  /**
   * The node the focus control scrolls to — owner ruling: *"when user click on
   * The square focus button located below the zoom buttons, It should focus in
   * such a way that the first node (the start node) is positioned exactly in the
   * top-left corner of the screen."*
   *
   * Which node that is, is `lib/linearize.entryNode`'s answer and is decided by
   * the caller, so the box under this button and «مرحلهٔ ۱» in the step view can
   * never be two different nodes of one process.
   *
   * Optional, and `undefined` restores React Flow's own fit-everything: the
   * exported document mounts this same canvas and its reader has no step view to
   * agree with, so nothing there is worse for the default.
   */
  focusId?: string
  onConnect?: (c: Connection) => void
  onNodeClick?: (id: string) => void
  onOpenDetail?: (id: string) => void
  // Optional so a read-only consumer — the export document — can mount the very
  // same canvas without inventing handlers for edits it will never make.
  onCommitPositions?: (updates: { id: string; pos: Pos }[]) => void
  onSetEdgeLabel?: (from: string, to: string, label: string) => void
  onDeleteEdge?: (from: string, to: string) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const seeded = useRef<Map<string, Pos>>(new Map())
  const rf = useReactFlow()

  // Edge action handlers are baked into edge `data` at re-seed time (below). A drag
  // updates the doc WITHOUT re-seeding, so a seed-time closure would delete/label
  // against the pre-drag doc and wipe unsaved positions. Route through refs kept
  // current every render so the handlers always act on the latest doc.
  const onSetEdgeLabelRef = useRef(onSetEdgeLabel); onSetEdgeLabelRef.current = onSetEdgeLabel
  const onDeleteEdgeRef = useRef(onDeleteEdge); onDeleteEdgeRef.current = onDeleteEdge

  // Re-seed from the doc ONLY when structure changes (revision) or the edit flag flips.
  // moveNodes/setEdgeLabel don't bump revision, so a drag/type won't snap back.
  useEffect(() => {
    setNodes(docNodes.map((n) => ({ ...n, data: { ...n.data, onOpenDetail }, draggable: editing, selectable: editing })))
    setEdges(docEdges.map((e) => ({
      ...e, selectable: editing,
      data: { ...(e.data as object), editing, onSetLabel: (v: string) => onSetEdgeLabelRef.current?.(e.source, e.target, v), onDelete: () => onDeleteEdgeRef.current?.(e.source, e.target) },
    })))
    seeded.current = new Map(docNodes.map((n) => [n.id, n.position]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, editing])

  // Highlight the two nodes joined by the selected edge, so it's clear which
  // way the edge runs. Driven off selection (not a re-seed) to preserve positions.
  const onSelectionChange = useCallback(({ edges: sel }: { edges: Edge[] }) => {
    const ends = new Set(sel.flatMap((e) => [e.source, e.target]))
    setNodes((nds) => nds.map((n) => {
      const hl = ends.has(n.id)
      return n.data.highlighted === hl ? n : { ...n, data: { ...n.data, highlighted: hl } }
    }))
  }, [setNodes])

  /**
   * The focus control — owner ruling, see `focusId`.
   *
   * React Flow's own `fitView` frames the WHOLE graph, which on a real
   * department's flowchart zooms out until the node labels are unreadable: the
   * button that looks like "show me where I am" answered "show me everything at
   * once". This puts the process's first node in the corner instead and leaves
   * the graph running off the screen from there, which is what reading a
   * flowchart from its start looks like.
   *
   * **The zoom is not touched.** The two buttons directly above this one are the
   * zoom, and a control that silently reset it would undo whatever they were
   * just used for. `setViewport` is the pan alone: at zoom z, a node at flow
   * `(nx, ny)` lands at screen `(nx·z + x, ny·z + y)`, so the offset that puts it
   * at the pane's `(pad, pad)` is `pad − n·z` on each axis.
   *
   * Read off `nodes` and not off `docNodes`, so an unsaved drag is where the
   * button goes — the node under the pointer a moment ago is the one on screen.
   */
  const focus = useCallback(() => {
    const node = nodes.find((n) => n.id === focusId)
    // A process whose entry node this canvas has not seen — nothing to focus,
    // so the control does what it always did.
    if (!node) { void rf.fitView(); return }
    const zoom = rf.getZoom()
    rf.setViewport({
      x: FOCUS_PAD - node.position.x * zoom,
      y: FOCUS_PAD - node.position.y * zoom,
      zoom,
    })
  }, [nodes, focusId, rf])

  const commitMoved = useCallback(() => {
    const moved = nodes
      .filter((n) => { const s = seeded.current.get(n.id); return s && (s.x !== n.position.x || s.y !== n.position.y) })
      .map((n) => ({ id: n.id, pos: n.position }))
    if (moved.length && onCommitPositions) { onCommitPositions(moved); for (const m of moved) seeded.current.set(m.id, m.pos) }
  }, [nodes, onCommitPositions])

  return (
    <div dir="ltr" className="w-full h-full">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={editing ? onConnect : undefined}
        onNodeClick={(_, n) => onNodeClick?.(n.id)}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={commitMoved}
        nodesConnectable={editing}
        selectionOnDrag={editing && mode === 'select'}
        panOnDrag={editing && mode === 'select' ? [1, 2] : true}
        fitView proOptions={{ hideAttribution: true }}
      >
        {/* **Only while it is being edited** — owner ruling: *"it just show in
            editor of flowchrt.in edit mode.not read mode."* A reader has nothing
            to do with the page the export prints on, and the exported document
            mounts this same canvas. */}
        {editing && <A4Lane />}
        <Background />
        {/* **`showFitView={false}` and our own button in its place — and the
            reason is a race, not a preference.** `ControlsComponent`'s handler
            is `fitView(); onFitView?.()`, and in v12 `fitView` is asynchronous:
            it resolves a Promise and writes the transform after the synchronous
            handler has returned. So an `onFitView` that called `setViewport`
            ran FIRST and was overwritten a tick later by the frame-everything
            transform it was there to replace — measured, the viewport came out
            at React Flow's own `matrix(0.83…, 66.5, 39)` every time.

            Withdrawing their action is the only way to have ours. The button
            keeps the class the stylesheet and the checks address it by, and the
            glyph is theirs redrawn, so nothing about the control moves. Without
            a `focusId` — the exported document, which has no step view to agree
            with — theirs is left exactly as it was. */}
        <Controls showInteractive={false} showFitView={focusId === undefined}>
          {focusId !== undefined && (
            <ControlButton className="react-flow__controls-fitview" onClick={focus}
              title="نمایش از ابتدای فرآیند" aria-label="نمایش از ابتدای فرآیند">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"><path d={FIT_ICON} /></svg>
            </ControlButton>
          )}
        </Controls>
      </ReactFlow>
    </div>
  )
}
