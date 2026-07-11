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
