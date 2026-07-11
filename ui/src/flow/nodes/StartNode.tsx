import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'
import type { TerminalNode } from '../../api/types'

export function StartNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const n = data.node as TerminalNode
  return (
    <div dir="rtl" className="bg-violet text-white rounded-full px-5 py-2 text-[12px] font-bold shadow-violet">
      {n.label}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-coral !border-2 !border-white" />
    </div>
  )
}
