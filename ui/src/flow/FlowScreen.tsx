import { useNavigate, useParams, Link } from 'react-router-dom'
import { useState, useRef } from 'react'
import { ReactFlowProvider, useReactFlow, type Connection } from '@xyflow/react'
import { useProcess, useProcesses, usePutProcess, useRelayout, useCreateProcess, useResolvePending } from '../api/hooks'
import { useFlowEditor } from './useFlowEditor'
import { neighborProcess } from '../lib/process-nav'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

export function FlowScreen() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}

function FlowEditor() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: server } = useProcess(pid)
  const { data: siblings = [] } = useProcesses(server?.department ?? '', { enabled: !!server?.department })
  const ed = useFlowEditor(server)
  const put = usePutProcess(pid)
  const relayout = useRelayout(pid)
  const createProcess = useCreateProcess()
  const resolve = useResolvePending(pid)
  const [pendingDel, setPendingDel] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [mode, setMode] = useState<'pan' | 'select'>('pan')
  const rf = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)

  function centerPos() {
    const el = wrapRef.current
    if (!el) return { x: 120, y: 120 }
    const r = el.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }

  if (!ed.doc) return <div className="flex-1 bg-bg" />
  const proc = ed.doc
  const tombstoned = !!proc.tombstoned
  const editing = ed.editing
  const prevProc = neighborProcess(siblings, proc.id, -1)
  const nextProc = neighborProcess(siblings, proc.id, 1)

  function onSave() {
    if (tombstoned) return
    put.mutate(proc, { onSuccess: (saved) => { ed.adopt(saved); ed.exitEdit() } })
  }

  function onRelayout() { relayout.mutate(proc, { onSuccess: (laid) => ed.adopt(laid) }) }

  function onNodeClick(id: string) {
    const n = proc.nodes.find((x) => x.id === id)
    if (n && n.type === 'junction') { if (editing) ed.select(id); setDetailId(id); return }
    if (editing) { ed.select(id); return }
    if (n && n.type === 'activity' && (n as ActivityNode).subprocess) nav(`/processes/${(n as ActivityNode).subprocess}/flow`)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        {!editing && (prevProc || nextProc) && (
          <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
            {/* next process — sits on the right in RTL (first in DOM), '>' icon */}
            <button onClick={() => nextProc && nav(`/processes/${nextProc.id}/flow`)} disabled={!nextProc}
              title={nextProc ? `فرآیند بعدی: ${nextProc.name}` : undefined} aria-label={nextProc ? `فرآیند بعدی: ${nextProc.name}` : undefined}
              className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <div className="w-px h-[18px] bg-[#D9CEF0]" />
            {/* previous process — on the left, '<' icon */}
            <button onClick={() => prevProc && nav(`/processes/${prevProc.id}/flow`)} disabled={!prevProc}
              title={prevProc ? `فرآیند قبلی: ${prevProc.name}` : undefined} aria-label={prevProc ? `فرآیند قبلی: ${prevProc.name}` : undefined}
              className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          </div>
        )}
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
          {tombstoned ? null : !editing ? (
            <Button variant="violet" onClick={ed.enter} className="px-4 py-2 text-[13px]" data-testid="enter-edit">ویرایش</Button>
          ) : (
            <>
              {/* undo / redo */}
              <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
                <button disabled={!ed.canUndo} onClick={ed.undo} title="واگرد" className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
                </button>
                <button disabled={!ed.canRedo} onClick={ed.redo} title="ازنو" className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
                </button>
              </div>
              {/* mouse mode: move (pan) vs select */}
              <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
                <button onClick={() => setMode('pan')} title="حالت جابه‌جایی" className={`w-[34px] h-[34px] flex items-center justify-center rounded-[9px] ${mode === 'pan' ? 'bg-violet text-white' : 'bg-white text-violet'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
                </button>
                <button onClick={() => setMode('select')} title="حالت انتخاب" className={`w-[34px] h-[34px] flex items-center justify-center rounded-[9px] ${mode === 'select' ? 'bg-violet text-white' : 'bg-white text-violet'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 17 2.51-7.39L20 10.07z" /></svg>
                </button>
              </div>
              {/* relayout */}
              <div className="flex items-center gap-[7px] bg-tile-v2 rounded-xl p-[5px]">
                <button onClick={onRelayout} disabled={relayout.isPending} className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[9px] bg-white text-[12px] font-semibold text-violet disabled:opacity-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>چیدمان
                </button>
              </div>
              {/* add activity / junction */}
              <div className="flex items-center gap-[7px] bg-tile-v2 rounded-xl p-[5px]">
                <button onClick={() => ed.addActivity(centerPos())} className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[9px] bg-white text-[12px] font-semibold text-violet">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M12 10v4M10 12h4" strokeWidth="2.2" /></svg>فعالیت
                </button>
                <button onClick={() => ed.addJunction(centerPos())} className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[9px] bg-white text-[12px] font-semibold text-violet">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l9 9-9 9-9-9z" /></svg>اتصال
                </button>
              </div>
              <button onClick={ed.cancel} className="px-3.5 py-[9px] border-[1.5px] border-line bg-white rounded-[11px] font-semibold text-[12.5px] text-muted hover:bg-[#F4EFFB]">انصراف</button>
              <button onClick={onSave} disabled={put.isPending} data-testid="save" className="flex items-center gap-1.5 px-[18px] py-[9px] rounded-[11px] bg-green text-white font-bold text-[13px] shadow-green hover:brightness-105">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>ذخیره
              </button>
            </>
          )}
        </div>
      </div>

      {tombstoned && (
        <div className="shrink-0 border-b border-warm bg-[#EDEAF3] px-[22px] py-2.5 text-[13px] text-muted flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">این فرآیند باطل شده است.</span>
          {(proc.superseded_by ?? []).length > 0 && (
            <>
              <span>جانشین:</span>
              {(proc.superseded_by ?? []).map((h) => (
                <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
              ))}
            </>
          )}
        </div>
      )}

      <div ref={wrapRef} className="flex-1 min-h-0 relative">
        <Canvas
          docNodes={toFlowNodes(proc)} docEdges={toFlowEdges(proc)} revision={ed.revision} editing={editing} mode={mode}
          onNodeClick={onNodeClick}
          onConnect={(c: Connection) => c.source && c.target && ed.connect(c.source, c.target)}
          onOpenDetail={setDetailId}
          onCommitPositions={(u) => ed.moveNodes(u)}
          onSetEdgeLabel={(f, t, v) => ed.setEdgeLabel(f, t, v)}
          onDeleteEdge={(f, t) => ed.deleteEdge(f, t)}
        />
        <div className="absolute bottom-4 right-4 flex gap-3.5 bg-white border border-warm rounded-xl px-3.5 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-coral rotate-45 inline-block" />XOR</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-violet rotate-45 inline-block" />AND</span>
          <span className="flex items-center gap-1"><span className="w-[11px] h-[11px] bg-[#E8A33D] rotate-45 inline-block" />OR</span>
        </div>
        {(() => {
          if (!detailId) return null
          const detailNode = proc.nodes.find((x) => x.id === detailId)
          if (!detailNode) return null
          return (
            <DetailDrawer
              node={detailNode}
              editing={editing}
              conflicts={(proc.pending ?? []).map((pending, index) => ({ pending, index })).filter((x) => x.pending.status === 'open' && x.pending.node === detailId)}
              process={proc}
              onClose={() => setDetailId(null)}
              onEdit={() => {}}
              onAccept={(index) => resolve.mutate({ index, decision: 'accept' })}
              onReject={(index) => resolve.mutate({ index, decision: 'reject' })}
              onOpenSub={(sub) => nav(`/processes/${sub}/flow`)}
              onPatch={(patch) => ed.patchActivity(detailId, patch as Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>)}
              onLinkSub={(s) => ed.linkSub(detailId, s)}
              onSetJunction={(t) => ed.setJunction(detailId, t)}
              onDeleteNode={() => { setPendingDel(detailId); setDetailId(null) }}
              onCreateSub={() => {
                createProcess.mutate(
                  { department: proc.department, name: 'زیرفرآیند جدید', parent: { process: proc.id, node: detailId! } },
                  { onSuccess: (child) => { setDetailId(null); nav(`/processes/${child.id}/flow`) } },
                )
              }}
            />
          )
        })()}
      </div>
      {pendingDel && (() => {
        const n = proc.nodes.find((x) => x.id === pendingDel)
        const label = n && 'label' in n ? (n as { label: string }).label : pendingDel
        return <DeleteNodeConfirm label={label} onCancel={() => setPendingDel(null)} onConfirm={() => { ed.deleteNode(pendingDel); setPendingDel(null) }} />
      })()}
    </div>
  )
}
