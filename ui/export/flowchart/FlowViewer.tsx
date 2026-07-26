import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '../../src/flow/Canvas'
import { toFlowNodes, toFlowEdges } from '../../src/flow/adapt'
import { DetailDrawer } from '../../src/flow/DetailDrawer'
import { JunctionLegend } from '../../src/flow/JunctionLegend'
import { IdBadge } from '../../src/ui/IdBadge'
import type { ActivityNode, Process } from '../../src/api/types'

/** The site's flow page, minus the app chrome that has no meaning in a document.
 *
 *  Everything inside the canvas is the app's own components (D2): node markup,
 *  colours, edge geometry, markers, background and zoom controls all come from
 *  Canvas. This file owns only the surrounding frame, which on the site is
 *  drawn by AppShell/TopBar — an inbox and a user avatar belong to the editing
 *  app, not to an exported document.
 */
export function FlowViewer({ processes, startId, onClose }: {
  processes: Process[]
  startId: string
  onClose: () => void
}) {
  const [trail, setTrail] = useState<string[]>([startId])
  const [detailId, setDetailId] = useState<string | null>(null)
  const byId = new Map(processes.map((p) => [p.id, p]))

  const pid = trail[trail.length - 1]
  const proc = byId.get(pid)
  if (!proc) return null

  const rootIndex = processes.findIndex((p) => p.id === trail[0])
  const prev = rootIndex > 0 ? processes[rootIndex - 1] : null
  const next = rootIndex >= 0 && rootIndex < processes.length - 1 ? processes[rootIndex + 1] : null

  function step(delta: number) {
    const target = delta < 0 ? prev : next
    if (target) { setTrail([target.id]); setDetailId(null) }
  }

  function onNodeClick(id: string) {
    const n = proc!.nodes.find((x) => x.id === id)
    if (!n) return
    if (n.type === 'junction') { setDetailId(id); return }
    if (n.type === 'activity' && (n as ActivityNode).subprocess && byId.has((n as ActivityNode).subprocess!)) {
      setTrail([...trail, (n as ActivityNode).subprocess!])
      setDetailId(null)
      return
    }
    setDetailId(id)
  }

  const detailNode = detailId ? proc.nodes.find((x) => x.id === detailId) : null

  return (
    <div dir="rtl" className="fixed inset-0 z-[100] bg-bg flex flex-col font-sans text-ink">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
          <button onClick={() => step(1)} disabled={!next}
            title={next ? `فرآیند بعدی: ${next.name}` : undefined} aria-label={next ? `فرآیند بعدی: ${next.name}` : 'فرآیند بعدی'}
            className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="w-px h-[18px] bg-[#D9CEF0]" />
          <button onClick={() => step(-1)} disabled={!prev}
            title={prev ? `فرآیند قبلی: ${prev.name}` : undefined} aria-label={prev ? `فرآیند قبلی: ${prev.name}` : 'فرآیند قبلی'}
            className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[12.5px] min-w-0 flex-wrap">
          {trail.slice(0, -1).map((id, i) => (
            <span key={id + i} className="flex items-center gap-1.5">
              <button onClick={() => { setTrail(trail.slice(0, i + 1)); setDetailId(null) }} className="text-muted hover:text-coral">
                {byId.get(id)?.name}
              </button>
              <span className="text-faint">/</span>
            </span>
          ))}
          <IdBadge tone="violet">{proc.id}</IdBadge>
          <span className="font-bold text-[15px] text-ink">{proc.name}</span>
        </div>

        <button onClick={onClose} aria-label="بستن" title="بستن"
          className="ms-auto w-9 h-9 flex items-center justify-center rounded-[10px] border-[1.5px] border-line bg-white text-ink hover:bg-tile-c hover:text-conflict">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ReactFlowProvider key={proc.id}>
          <Canvas
            docNodes={toFlowNodes(proc)} docEdges={toFlowEdges(proc)}
            revision={1} editing={false}
            onNodeClick={onNodeClick} onOpenDetail={setDetailId}
          />
        </ReactFlowProvider>

        {/* the app's own legend component — same markup, same colour map as the diamonds */}
        <JunctionLegend />

        {detailNode && (
          <DetailDrawer
            node={detailNode} editing={false} conflicts={[]} process={proc}
            onClose={() => setDetailId(null)}
            onEdit={() => {}} onAccept={() => {}} onReject={() => {}}
            onOpenSub={(sub) => { if (byId.has(sub)) { setTrail([...trail, sub]); setDetailId(null) } }}
            onPatch={() => {}} onLinkSub={() => {}} onSetJunction={() => {}}
            onCreateSub={() => {}} onDeleteNode={() => {}}
          />
        )}
      </div>
    </div>
  )
}
