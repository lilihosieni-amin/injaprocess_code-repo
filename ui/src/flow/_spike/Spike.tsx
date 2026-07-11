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
