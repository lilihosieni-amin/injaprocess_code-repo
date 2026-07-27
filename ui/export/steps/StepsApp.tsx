import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import { linearize, countSteps, groupTitle } from './linearize'
import type { Block } from './linearize'
import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import type { ActivityNode, ReadableProcess } from '../../src/api/types'
import { markPrintReady } from '../shared/ready'
import { servedPdfHref } from '../shared/pdfLink'
import s from './steps.module.css'

type Crumb = { pid: string; via: ActivityNode | null }
/** One "jump to step N" request. `seq` makes every tap a fresh value, so
 *  jumping twice to the same step still re-triggers the effect. */
type Jump = { num: number; seq: number }
/** Which way a navigation goes. Forward opens something new and lands at the
 *  top; back returns to a page the reader has already read, and lands where
 *  they left it. */
type Nav = 'forward' | 'back'

/** The identity of a page, for the remembered scroll offsets: the whole path,
 *  not its depth. One subprocess opened from two different parents is two
 *  pages, and neither may restore against the other's offset. */
const pageKey = (trail: Crumb[]) => trail.map((c) => c.pid).join('/')

const icon = (d: string, size = 20, w = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const CHEV = '<path d="M9 18l6-6-6-6"/>'
const CHEV_L = '<path d="M15 18l-6-6 6-6"/>'
// the mockup draws both chevrons at stroke-width 2.6, everything else at 2
const icoChev = icon(CHEV, 20, 2.6)
const icoChevL = icon(CHEV_L, 20, 2.6)
const icoBack = icon('<path d="M9 14l-4-4 4-4"/><path d="M5 10h9a4 4 0 0 1 0 8h-1"/>', 16)
const icoUser = icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 19)

export function StepsApp({ payload }: { payload: ExportPayload }) {
  const [trail, setTrail] = useState<Crumb[]>([])
  const [jump, setJump] = useState<Jump | null>(null)
  // Both maps are a pure function of the payload, and the payload of a
  // standalone export never changes — but every step tap, every navigation and
  // every jump re-renders this component, and `linearize` walks every node and
  // edge of every process. Memoised, that work happens once.
  const byId = useMemo(() => new Map(payload.processes.map((p) => [p.id, p])), [payload])
  const model = useMemo(() => new Map(payload.processes.map((p) => [p.id, linearize(p)])), [payload])

  // where each page stood when it was last left, by `pageKey`
  const seen = useRef(new Map<string, number>())
  // where the page about to be rendered must land — set by `go` on the way out
  const land = useRef(0)

  // Going forward lands at the top of the new page, as the mockup does —
  // otherwise a step tapped near the bottom opens its subprocess mid-page.
  // Going back lands where the reader left that page.
  //
  // A layout effect, not an effect: it runs once React has put the new page in
  // the DOM — so the document is already as tall as the offset assumes — but
  // still before the browser paints, so the reader never sees the top of the
  // page flash past on the way to their place.
  useLayoutEffect(() => { window.scrollTo(0, land.current) }, [trail])

  // This guide builds no diagrams: nothing is measured offscreen, nothing is
  // sliced into bands, nothing is retried — what React commits is what prints.
  // So it has settled the moment it is mounted, and it says so on the same
  // signal the flowchart raises, because the renderer waits on one flag for
  // both documents. Staying silent here would cost every steps render its
  // full timeout. `PrintDoc` is committed in the same pass, so by the time
  // this effect runs the printed half is in the document too.
  useEffect(() => { markPrintReady() }, [])

  /** Every navigation goes through here: a pending jump belongs to the page it
   *  was tapped on, never to the one we are about to show — and the outgoing
   *  page's offset is read *now*, while its own layout is still on screen. */
  const go = (next: Crumb[], nav: Nav = 'forward') => {
    seen.current.set(pageKey(trail), window.scrollY)
    land.current = nav === 'back' ? seen.current.get(pageKey(next)) ?? 0 : 0
    setJump(null)
    setTrail(next)
  }

  if (!trail.length) {
    return (
      <Shell onHome={() => go([], 'back')}>
        <div className={s['home-head']}>
          <h1>راهنمای گام‌به‌گام کار</h1>
          <p>{payload.dept.name} — روی نام هر کار بزنید تا مرحله‌به‌مرحله ببینید.</p>
        </div>
        <div className={s.plist}>
          {payload.processes.map((p) => (
            <button key={p.id} className={s.pbtn} onClick={() => go([{ pid: p.id, via: null }])}>
              <span className={`${s.pn} ${p.parent ? s.sub : ''}`}>
                {icon(p.parent ? '<path d="M4 4v7a4 4 0 0 0 4 4h9"/><path d="M14 11l4 4-4 4"/>' : '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9h8M8 13h5"/>')}
              </span>
              <span className={s.pt}>
                {p.name}
                <span className={`${s.ptag} ${p.parent ? s.sub : ''}`}>{p.parent ? 'زیرفرآیند' : 'فرآیند'}</span>
              </span>
              <span className={s.pc}>{toFa(countSteps(model.get(p.id) ?? []))} مرحله</span>
              <span className={s.pg}>{icoChevL}</span>
            </button>
          ))}
        </div>
      </Shell>
    )
  }

  const cur = trail[trail.length - 1]
  const proc = byId.get(cur.pid)
  if (!proc) return <Shell onHome={() => go([], 'back')}><div /></Shell>

  return (
    <Shell onHome={() => go([], 'back')}>
      <button className={s.backbtn} onClick={() => go(trail.slice(0, -1), 'back')}>
        {icoChev}{trail.length > 1 ? 'بازگشت' : 'بازگشت به فهرست کارها'}
      </button>
      {trail.length > 1 && (
        <div className={s.crumbs}>
          {trail.slice(0, -1).map((t, i) => (
            <span key={t.pid + i}>
              <span style={{ cursor: 'pointer' }} onClick={() => go(trail.slice(0, i + 1), 'back')}>{byId.get(t.pid)?.name}</span>
              <span className={s.sep}>›</span>
            </span>
          ))}
          <b>{proc.name}</b>
        </div>
      )}
      <h1 className={s['page-title']}>{proc.name}</h1>
      {cur.via?.description && (
        <div className={s['page-sum']}>
          <span className={s.sl}>این بخش مربوط به چیست؟</span>{cur.via.description}
        </div>
      )}
      <div className={s.howto}>
        {icon('<path d="M9 11V6a2 2 0 1 1 4 0v9"/><path d="M13 12h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-4l-4-4-2-4a1.5 1.5 0 0 1 2.4-1.8L9 13"/>')}
        روی هر مرحله بزنید تا توضیح کامل و مسئول آن را ببینید.
      </div>
      <Blocks blocks={model.get(proc.id) ?? []} byId={byId} jump={jump}
        onEnter={(sub, via) => go([...trail, { pid: sub, via }])}
        onJump={(num) => setJump((j) => ({ num, seq: (j?.seq ?? 0) + 1 }))} />
      <div className={s.endmark}>
        <span className={s.ei}>{icon('<path d="M20 6L9 17l-5-5"/>', 20, 3)}</span>کار تمام شد
      </div>
    </Shell>
  )
}

function Shell({ children, onHome }: { children: React.ReactNode; onHome: () => void }) {
  /** The server's PDF when this guide is being served *and* the server printed
   *  one; `null` when it was opened from a file or the render did not happen —
   *  the same one rule the flowchart document uses (`pdfLink`).
   *
   *  Probed once, not per navigation. `StepsApp` returns a `Shell` from every
   *  branch, at the same position in its tree, so React keeps this one instance
   *  across every page of the guide and the answer is not re-fetched — nor does
   *  the control flicker back to a button when a reader opens a task. */
  const [pdf, setPdf] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    servedPdfHref().then((href) => { if (live) setPdf(href) })
    return () => { live = false }
  }, [])
  return (
    <>
      <div className={s.topbar}>
        <div className={s.tt}>راهنمای گام‌به‌گام کار</div>
        <div className={s.sp} />
        <button className={s.tbtn} onClick={onHome}>فهرست کارها</button>
        {/* Served, and the PDF is there: hand it over. Opened from a file, or no
            PDF was produced: print in place, as before. In a new tab so the
            reader keeps their place in the guide — they may be several
            subprocesses deep. */}
        {pdf
          ? <a className={s.tbtn} href={pdf} target="_blank" rel="noopener">چاپ</a>
          : <button className={s.tbtn} onClick={() => window.print()}>چاپ</button>}
      </div>
      <div className={s.wrap}>{children}</div>
    </>
  )
}

function Blocks({ blocks, byId, jump, onEnter, onJump }: {
  blocks: Block[]
  byId: Map<string, ReadableProcess>
  jump: Jump | null
  onEnter: (sub: string, via: ActivityNode) => void
  onJump: (num: number) => void
}) {
  return (
    <div className={s.steps}>
      {blocks.map((b, i) => b.kind === 'group' ? (
        <div key={`g${i}`} className={s.grp}>
          <div className={s['grp-h']}>
            <span className={s.gi}>{b.type === 'AND' ? '&' : b.type === 'OR' ? 'O' : 'X'}</span>
            {groupTitle(b.type, b.branches.length)}
          </div>
          {b.branches.map((br, j) => (
            <div key={j} className={s.branch}>
              <div className={s['branch-h']}>
                <span className={s.bl}>{toFa(j + 1)}</span>
                {br.label ? `اگر: ${br.label}` : `حالت ${toFa(j + 1)}`}
              </div>
              {br.blocks.length
                ? <Blocks blocks={br.blocks} byId={byId} jump={jump} onEnter={onEnter} onJump={onJump} />
                : <div className={s.nothing}>کاری لازم نیست</div>}
            </div>
          ))}
        </div>
      ) : (
        <Step key={b.node.id} block={b} byId={byId} jump={jump} onEnter={onEnter} onJump={onJump} />
      ))}
    </div>
  )
}

function Step({ block, byId, jump, onEnter, onJump }: {
  block: Extract<Block, { kind: 'step' }>
  byId: Map<string, ReadableProcess>
  jump: Jump | null
  onEnter: (sub: string, via: ActivityNode) => void
  onJump: (num: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const n = block.node
  const sub = n.subprocess && byId.has(n.subprocess) ? n.subprocess : null

  // a back-reference badge opens *this* card through React state, so the next
  // tap on it really toggles — a class added straight to the DOM would not
  useEffect(() => {
    if (jump?.num !== block.num) { setFlash(false); return }
    setOpen(true)
    setFlash(true)
    const el = ref.current
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 90
      window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' })
    }
    const t = setTimeout(() => setFlash(false), 1600)
    return () => clearTimeout(t)
  }, [jump, block.num])

  return (
    <div ref={ref} id={`stp-${block.num}`}
      className={`${s.step} ${sub ? s['has-sub'] : ''} ${open ? s.open : ''} ${flash ? s.flash : ''}`}>
      <button className={s['step-row']} onClick={() => sub ? onEnter(sub, n) : setOpen((v) => !v)}>
        <span className={s.sn}>{toFa(block.num)}</span>
        <span className={s.st}>
          <span className={s.label}>{n.label}</span>
          {(block.cond || block.back.some((r) => r.num) || sub) && (
            <span className={s.badges}>
              {block.cond && <span className={`${s.bdg} ${s.cond}`}>اگر: {block.cond}</span>}
              {/* only back-edges that resolved to a numbered step get a badge — a
                  back-edge to a junction carries a label but no number */}
              {block.back.filter((r) => r.num).map((r, i) => (
                <span key={`${r.to}-${i}`} className={`${s.bdg} ${s.back}`} role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onJump(r.num!) }}>
                  {icoBack} برگرد به مرحلهٔ {toFa(r.num!)}
                </span>
              ))}
              {sub && <span className={`${s.bdg} ${s.sub}`}>{icoChev} مراحل این کار را ببین</span>}
            </span>
          )}
        </span>
        <span className={s.chev}>{icoChevL}</span>
      </button>
      {!sub && (
        <div className={s['step-body']}>
          {n.actor && (
            <div className={s.fld}>
              <span className={s.k}>این کار را چه کسی انجام می‌دهد؟</span>
              <span className={s.actor}>{icoUser}{n.actor}</span>
            </div>
          )}
          {n.description && (
            <div className={s.fld}>
              <span className={s.k}>توضیح کار</span>
              <div className={s.v}>{n.description}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
