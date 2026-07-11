import { ReactFlow, Background, Controls, type Node, type Edge, type NodeChange, type EdgeChange, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ActivityNode } from './nodes/ActivityNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { JunctionNode } from './nodes/JunctionNode'
import { LabeledEdge } from './edges/LabeledEdge'

const nodeTypes = { activity: ActivityNode, start: StartNode, end: EndNode, junction: JunctionNode }
const edgeTypes = { labeled: LabeledEdge }

export function Canvas({ nodes, edges, editing, onNodesChange, onEdgesChange, onConnect, onNodeClick, onNodeDragStop }: {
  nodes: Node[]; edges: Edge[]; editing: boolean
  onNodesChange?: (c: NodeChange[]) => void
  onEdgesChange?: (c: EdgeChange[]) => void
  onConnect?: (c: Connection) => void
  onNodeClick?: (id: string) => void
  onNodeDragStop?: (id: string, pos: { x: number; y: number }) => void
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
        onNodeDragStop={(_, n) => onNodeDragStop?.(n.id, n.position)}
        fitView proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
