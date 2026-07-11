import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { ReactFlowProvider, type Connection } from '@xyflow/react'
import { useProcess, usePutProcess, useRelayout } from '../api/hooks'
import { useFlowEditor } from './useFlowEditor'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'
import type { ActivityNode } from '../api/types'

export function FlowScreen() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: server } = useProcess(pid)
  const ed = useFlowEditor(server)
  const put = usePutProcess(pid)
  const relayout = useRelayout(pid)
  const [pendingDel, setPendingDel] = useState<string | null>(null)
  if (!ed.doc) return <div className="flex-1 bg-bg" />
  const proc = ed.doc
  const editing = ed.editing

  function onSave() {
    put.mutate(proc, { onSuccess: (saved) => { ed.adopt(saved); ed.cancel() } })
  }

  function onRelayout() { relayout.mutate(proc, { onSuccess: (laid) => ed.adopt(laid) }) }

  const nodes = toFlowNodes(proc)
  const edges = toFlowEdges(proc).map((e) => ({
    ...e, data: { ...(e.data as object), editing, onDelete: () => ed.deleteEdge(e.source, e.target) },
  }))

  function onNodeClick(id: string) {
    if (editing) { ed.select(id); return }
    const n = proc.nodes.find((x) => x.id === id) as ActivityNode | undefined
    if (n && n.type === 'activity' && n.subprocess) nav(`/processes/${n.subprocess}/flow`)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        {proc.parent && !editing && (
          <Button variant="ghost" onClick={() => nav(`/processes/${proc.parent!.process}/flow`)} className="px-3 py-[7px] text-[12px]">فرآیند والد</Button>
        )}
        <div className="flex items-center gap-2.5">
          <IdBadge tone="violet">{proc.id}</IdBadge>
          {!editing
            ? <span className="font-bold text-[15px] text-ink">{proc.name}</span>
            : <input value={proc.name} onChange={(e) => ed.setName(e.target.value)} className="font-bold text-[15px] text-ink border-[1.5px] border-line rounded-lg px-2.5 py-1 outline-none focus:border-coral w-[280px]" />}
        </div>
        <div className="ms-auto flex items-center gap-2">
          {!editing ? (
            <Button variant="violet" onClick={ed.enter} className="px-4 py-2 text-[13px]" data-testid="enter-edit">ویرایش</Button>
          ) : (
            <>
              <div className="flex items-center gap-0.5 bg-tile-v2 rounded-xl p-1">
                <button disabled={!ed.canUndo} onClick={ed.undo} title="واگرد" className="px-2 py-1 rounded-lg disabled:opacity-40 text-violet">↶</button>
                <button disabled={!ed.canRedo} onClick={ed.redo} title="ازنو" className="px-2 py-1 rounded-lg disabled:opacity-40 text-violet">↷</button>
              </div>
              <Button variant="ghost" onClick={() => ed.addActivity()} className="px-3 py-2 text-[12.5px]">فعالیت</Button>
              <Button variant="ghost" onClick={() => ed.addJunction()} className="px-3 py-2 text-[12.5px]">اتصال</Button>
              <Button variant="ghost" onClick={onRelayout} disabled={relayout.isPending} className="px-3 py-2 text-[12.5px]">چیدمان</Button>
              <Button variant="ghost" onClick={() => ed.selected && setPendingDel(ed.selected)} className="px-3 py-2 text-[12.5px]">حذف</Button>
              <Button variant="ghost" onClick={ed.cancel} className="px-3 py-2 text-[12.5px]">انصراف</Button>
              <Button variant="green" onClick={onSave} disabled={put.isPending} className="px-4 py-2 text-[13px]" data-testid="save">ذخیره</Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ReactFlowProvider>
          <Canvas
            nodes={nodes} edges={edges} editing={editing}
            onNodeClick={onNodeClick}
            onNodeDragStop={(id, pos) => ed.moveNode(id, pos)}
            onConnect={(c: Connection) => c.source && c.target && ed.connect(c.source, c.target)}
          />
        </ReactFlowProvider>
        {editing && (
          <div className="absolute top-3.5 left-1/2 -translate-x-1/2 bg-ink text-white text-[11.5px] px-4 py-2 rounded-full pointer-events-none z-10">
            از نقطهٔ مرجانیِ کنار هر گره بکشید تا خط بسازید · روی یک خط کلیک کنید تا حذف شود
          </div>
        )}
        <div className="absolute bottom-4 right-4 flex gap-3.5 bg-white border border-warm rounded-xl px-3.5 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-coral rotate-45 inline-block" />XOR</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-violet rotate-45 inline-block" />AND</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-[#E8A33D] rotate-45 inline-block" />OR</span>
        </div>
      </div>
      {pendingDel && (() => {
        const n = proc.nodes.find((x) => x.id === pendingDel)
        const label = n && 'label' in n ? (n as { label: string }).label : pendingDel
        return <DeleteNodeConfirm label={label} onCancel={() => setPendingDel(null)} onConfirm={() => { ed.deleteNode(pendingDel); setPendingDel(null) }} />
      })()}
    </div>
  )
}
