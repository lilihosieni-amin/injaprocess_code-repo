import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { FlowNodeData } from '../adapt'
import type { ActivityNode as ActivityNodeT } from '../../api/types'
import { toFa } from '../../lib/format'

export function ActivityNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const n = data.node as ActivityNodeT
  return (
    <div dir="rtl" className="relative bg-white border border-warm rounded-xl shadow-card px-3 py-2 w-[170px] text-center">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-[#9B86D9] !border-0" />
      {data.conflicts > 0 && (
        <div className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center bg-coral text-white rounded-full text-[9.5px] font-extrabold">! <span>{toFa(data.conflicts)}</span></div>
      )}
      <span className="id-badge bg-tile-v2 text-muted" dir="ltr">{n.id}</span>
      <div className="font-bold text-[12.5px] text-ink leading-tight mt-1 break-words">{n.label}</div>
      {n.actor && (
        <div className="flex items-center justify-center gap-1.5 mt-1.5">
          <span className="w-[15px] h-[15px] rounded-full bg-tile-v text-violet text-[8px] flex items-center justify-center font-bold">۰</span>
          <span className="text-[10.5px] text-muted break-words">{n.actor}</span>
        </div>
      )}
      {data.hasSub && (
        <div className="flex items-center justify-center gap-1 mt-1.5 text-[9px] text-conflict bg-[#FFE9E7] px-2 py-0.5 rounded-full font-semibold">زیرفرآیند — برای ورود کلیک کنید</div>
      )}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-coral !border-2 !border-white" />
    </div>
  )
}
