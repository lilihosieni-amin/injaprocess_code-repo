import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { useState, useRef } from 'react'
import { ReactFlowProvider, useReactFlow, type Connection } from '@xyflow/react'
import { useProcess, useProcesses, usePutProcess, useRelayout, useCreateProcess, useResolvePending } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useFlowEditor } from './useFlowEditor'
import { neighborProcess } from '../lib/process-nav'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button, Spinner } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { readerBack } from '../shell/crumbs'
import { IdBadge } from '../ui/IdBadge'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'
import { DetailDrawer } from './DetailDrawer'
import { JunctionLegend } from './JunctionLegend'
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
  const { pathname } = useLocation()
  const { data: server } = useProcess(pid)
  const can = useCan(useSession().data)
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
  // R21's destination. `readerBack` answers `undefined` for a path that IS the
  // root it is handed, which `/processes/{pid}/flow` against a department never
  // is; the coalesce narrows `string | undefined` to the `To` a `<Link>` takes
  // and is not a second answer to the question.
  const deptRoot = `/departments/${proc.department}`
  const backTo = readerBack(pathname, deptRoot) ?? deptRoot
  // R5 — the edit control is not drawn to someone the edit path would refuse.
  //
  // Cosmetic only, like every other `useCan` on a screen (D48): PUT
  // /api/processes/{pid}, POST .../relayout, DELETE and the pending resolver
  // all re-derive `edit` from the session row and refuse regardless
  // (`routers/processes.py:280,358,386,416`). What it fixes is the app leading
  // a reader to that refusal: signed in as one, the complete set of controls
  // this screen offers is «بازگشت», «ویرایش» and React Flow's three zoom
  // buttons — so the one in-app action a reader was offered here was the one
  // action they may not take.
  //
  // Asked about THIS process's department, not about the person, because
  // `_pid_target` gates every one of those endpoints on `dept:{dept_of(pid)}`
  // — the same question `Summary.tsx:67` and `ProcessList.tsx:42` ask. The
  // scope argument is load-bearing and not decoration: without it the head of
  // another department is handed a button whose save 403s, which is the same
  // R5 defect one level in. (`session.ts`'s bare `can(descriptor, capability)`
  // takes no target at all and would do exactly that; this is `auth/can.ts`'s
  // `useCan`, which does.)
  const mayEdit = can('edit', `dept:${proc.department}`)

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
    // R40 — **the flowchart screen is cream, for everyone.** Owner ruling, and a
    // regression rather than a preference: at this branch's merge base
    // `PanelShell` painted `bg-bg` on its root and this screen inherited it; the
    // shell rebuild moved both shell roots to `bg-ink` (§6.0's violet field,
    // which is right for every other screen) and this file declares no ground of
    // its own, so the canvas silently went violet. Ledger **L-01** records
    // `#FBF7F1` as "the flow canvas's ground".
    //
    // **Here, not on the shells.** `bg-ink` on `[data-screen]` is fixed into
    // place across the rebuild and `e2e/sweep.spec.ts` pins it for eight screens;
    // repainting a shell would make this screen right and take the other eight
    // off the field. `background-color` does not inherit, so this is the element
    // that has to say it — one declaration on the one root that is an ancestor of
    // all three regions.
    //
    // **And only here.** `Canvas.tsx` paints nothing and must go on painting
    // nothing: `@xyflow/react`'s own `.react-flow` background-color is
    // `transparent` by default, and the pane, its viewport and the renderer are
    // transparent too, so the cream declared on this box is what shows through
    // the canvas — exactly as it did before the regression. The two toolbars
    // (`bg-white`) and the tombstone strip are opaque and cover it deliberately;
    // the in-flight blank forty lines up is already `bg-bg`, so the route is one
    // colour from first paint to last. Measured in Chrome by `e2e/flow.spec.ts`
    // at three widths on both surfaces — `data-r-flow` is that spec's hook, and
    // deliberately not `data-screen`, which means "sits on §6.0's field" and is
    // the one thing this screen does not do.
    <div data-r-flow className="flex-1 flex flex-col min-h-0 bg-bg">
      <div className="flex items-center gap-3 px-[22px] py-[11px] bg-white border-b border-warm shrink-0">
        {/* R21 — `Inja Reader.dc.html:312-313`. On the flowchart the design puts
            «بازگشت» INSIDE this toolbar, as its first child, and draws no bar of
            its own above it; that is why `ReaderShell` renders no chrome on this
            route at all. Without this control the screen is a dead end for a
            reader: signed in as one, the complete set of controls rendered here
            is «ویرایش» and React Flow's three zoom buttons — no back, no home,
            no sign-out, no link of any kind.

            `readerBack` rather than a literal `/processes/{pid}`, so the one
            function that answers "where does back go" stays the only one. On
            this route it answers the process summary (`crumbs.ts:116`) whatever
            root it is handed, which is why this department — a page anyone who
            can open this process can also reach — is a safe thing to hand it.

            Drawn at reader 313's own numbers (`9px 13px`, radius 11, 13px, the
            lavender tile behind a 1.5px hairline), spelled the way the rest of
            this file spells a value: F16 keeps `src/flow/` out of F6's token
            guard, and a token minted for one button on a frozen screen would be
            a fifth spelling of a colour this file already writes four ways. */}
        <Link
          to={backTo}
          data-r-flowback
          className="inline-flex items-center gap-1.5 px-[13px] py-[9px] rounded-[11px] font-bold text-[13px] bg-tile-v2 text-violet border-[1.5px] border-line flex-none no-underline"
        >
          <Icon name="chevronStart" px={15} stroke={2.4} />
          بازگشت
        </Link>
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
          {tombstoned || !mayEdit ? null : !editing ? (
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
              <button onClick={onSave} disabled={put.isPending} aria-busy={put.isPending || undefined} data-testid="save" className={`flex items-center gap-1.5 px-[18px] py-[9px] rounded-[11px] bg-green text-white font-bold text-[13px] shadow-green hover:brightness-105 ${put.isPending ? 'cursor-progress' : ''}`}>
                {put.isPending
                  ? <Spinner />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                {put.isPending ? 'در حال ذخیره…' : 'ذخیره'}
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
        <JunctionLegend />
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
