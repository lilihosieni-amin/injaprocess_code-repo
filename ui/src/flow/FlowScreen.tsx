import { useNavigate, useParams } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { useProcess } from '../api/hooks'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import type { ActivityNode } from '../api/types'

export function FlowScreen() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: proc } = useProcess(pid)
  if (!proc) return <div className="flex-1 bg-bg" />

  const nodes = toFlowNodes(proc)
  const edges = toFlowEdges(proc)

  function onNodeClick(id: string) {
    const n = proc!.nodes.find((x) => x.id === id)
    if (n && n.type === 'activity' && (n as ActivityNode).subprocess) {
      nav(`/processes/${(n as ActivityNode).subprocess}/flow`)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        {proc.parent && (
          <Button variant="ghost" onClick={() => nav(`/processes/${proc.parent!.process}/flow`)} className="px-3 py-[7px] text-[12px]">فرآیند والد</Button>
        )}
        <div className="flex items-center gap-2.5">
          <IdBadge tone="violet">{proc.id}</IdBadge>
          <span className="font-bold text-[15px] text-ink">{proc.name}</span>
        </div>
        <div className="ms-auto flex items-center gap-2.5">
          <Button variant="violet" className="px-4 py-2 text-[13px]" data-testid="enter-edit">ویرایش</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <Canvas nodes={nodes} edges={edges} editing={false} onNodeClick={onNodeClick} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
