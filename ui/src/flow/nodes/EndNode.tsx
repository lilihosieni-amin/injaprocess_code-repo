import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'
import type { TerminalNode } from '../../api/types'

export function EndNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const n = data.node as TerminalNode
  return (
    <div dir="rtl" className="bg-ink text-white rounded-full px-5 py-2 text-[12px] font-bold">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-[#9B86D9] !border-0" />
      {n.label}
    </div>
  )
}
