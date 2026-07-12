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

export function Canvas({ docNodes, docEdges, revision, editing, mode = 'pan', onConnect, onNodeClick, onOpenDetail, onCommitPositions, onSetEdgeLabel, onDeleteEdge }: {
  docNodes: Node[]; docEdges: Edge[]; revision: number; editing: boolean; mode?: 'pan' | 'select'
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
        selectionOnDrag={editing && mode === 'select'}
        panOnDrag={editing && mode === 'select' ? [1, 2] : true}
        fitView proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
