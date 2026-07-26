import { useState } from 'react'
import { linearize, countSteps, groupTitle } from './linearize'
import type { Block } from './linearize'
import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import type { ActivityNode, Process } from '../../src/api/types'
import s from './steps.module.css'

type Crumb = { pid: string; via: ActivityNode | null }

const icon = (d: string, size = 20, w = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const CHEV = '<path d="M9 18l6-6-6-6"/>'
const CHEV_L = '<path d="M15 18l-6-6 6-6"/>'

export function StepsApp({ payload }: { payload: ExportPayload }) {
  const [trail, setTrail] = useState<Crumb[]>([])
  const byId = new Map(payload.processes.map((p) => [p.id, p]))
  const model = new Map(payload.processes.map((p) => [p.id, linearize(p)]))

  if (!trail.length) {
    return (
      <Shell onHome={() => setTrail([])}>
        <div className={s['home-head']}>
          <h1>راهنمای گام‌به‌گام کار</h1>
          <p>واحد {payload.dept.name} — روی نام هر کار بزنید تا مرحله‌به‌مرحله ببینید.</p>
        </div>
        <div className={s.plist}>
          {payload.processes.map((p) => (
            <button key={p.id} className={s.pbtn} onClick={() => setTrail([{ pid: p.id, via: null }])}>
              <span className={`${s.pn} ${p.parent ? s.sub : ''}`}>
                {icon(p.parent ? '<path d="M4 4v7a4 4 0 0 0 4 4h9"/><path d="M14 11l4 4-4 4"/>' : '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9h8M8 13h5"/>')}
              </span>
              <span className={s.pt}>
                {p.name}
                <span className={`${s.ptag} ${p.parent ? s.sub : ''}`}>{p.parent ? 'زیرفرآیند' : 'فرآیند'}</span>
              </span>
              <span className={s.pc}>{toFa(countSteps(model.get(p.id) ?? []))} مرحله</span>
              <span className={s.pg}>{icon(CHEV_L)}</span>
            </button>
          ))}
        </div>
      </Shell>
    )
  }

  const cur = trail[trail.length - 1]
  const proc = byId.get(cur.pid)
  if (!proc) return <Shell onHome={() => setTrail([])}><div /></Shell>

  return (
    <Shell onHome={() => setTrail([])}>
      <button className={s.backbtn} onClick={() => setTrail(trail.slice(0, -1))}>
        {icon(CHEV)}{trail.length > 1 ? 'بازگشت' : 'بازگشت به فهرست کارها'}
      </button>
      {trail.length > 1 && (
        <div className={s.crumbs}>
          {trail.slice(0, -1).map((t, i) => (
            <span key={t.pid + i}>
              <span style={{ cursor: 'pointer' }} onClick={() => setTrail(trail.slice(0, i + 1))}>{byId.get(t.pid)?.name}</span>
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
      <Blocks blocks={model.get(proc.id) ?? []} proc={proc} byId={byId}
        onEnter={(sub, via) => setTrail([...trail, { pid: sub, via }])} />
      <div className={s.endmark}>
        <span className={s.ei}>{icon('<path d="M20 6L9 17l-5-5"/>', 20, 3)}</span>کار تمام شد
      </div>
    </Shell>
  )
}

function Shell({ children, onHome }: { children: React.ReactNode; onHome: () => void }) {
  return (
    <>
      <div className={s.topbar}>
        <div className={s.tt}>راهنمای گام‌به‌گام کار</div>
        <div className={s.sp} />
        <button className={s.tbtn} onClick={onHome}>فهرست کارها</button>
        <button className={s.tbtn} onClick={() => window.print()}>چاپ</button>
      </div>
      <div className={s.wrap}>{children}</div>
    </>
  )
}

function Blocks({ blocks, proc, byId, onEnter }: {
  blocks: Block[]
  proc: Process
  byId: Map<string, Process>
  onEnter: (sub: string, via: ActivityNode) => void
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
                ? <Blocks blocks={br.blocks} proc={proc} byId={byId} onEnter={onEnter} />
                : <div className={s.nothing}>کاری لازم نیست</div>}
            </div>
          ))}
        </div>
      ) : (
        <Step key={b.node.id} block={b} byId={byId} onEnter={onEnter} />
      ))}
    </div>
  )
}

function Step({ block, byId, onEnter }: {
  block: Extract<Block, { kind: 'step' }>
  byId: Map<string, Process>
  onEnter: (sub: string, via: ActivityNode) => void
}) {
  const [open, setOpen] = useState(false)
  const n = block.node
  const sub = n.subprocess && byId.has(n.subprocess) ? n.subprocess : null
  return (
    <div id={`stp-${block.num}`} className={`${s.step} ${sub ? s['has-sub'] : ''} ${open ? s.open : ''}`}>
      <button className={s['step-row']} onClick={() => sub ? onEnter(sub, n) : setOpen((v) => !v)}>
        <span className={s.sn}>{toFa(block.num)}</span>
        <span className={s.st}>
          <span className={s.label}>{n.label}</span>
          {(block.cond || block.back.some((r) => r.num) || sub) && (
            <span className={s.badges}>
              {block.cond && <span className={`${s.bdg} ${s.cond}`}>اگر: {block.cond}</span>}
              {/* only back-edges that resolved to a numbered step get a badge — a
                  back-edge to a junction carries a label but no number */}
              {block.back.filter((r) => r.num).map((r) => (
                <span key={r.to} className={`${s.bdg} ${s.back}`} role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); jumpStep(r.num!) }}>
                  برگرد به مرحلهٔ {toFa(r.num!)}
                </span>
              ))}
              {sub && <span className={`${s.bdg} ${s.sub}`}>مراحل این کار را ببین</span>}
            </span>
          )}
        </span>
        <span className={s.chev}>{icon(CHEV_L)}</span>
      </button>
      {!sub && (
        <div className={s['step-body']}>
          {n.actor && (
            <div className={s.fld}>
              <span className={s.k}>این کار را چه کسی انجام می‌دهد؟</span>
              <span className={s.actor}>{n.actor}</span>
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

/** Scroll to a back-reference target and flash it. */
function jumpStep(num: number) {
  const el = document.getElementById(`stp-${num}`)
  if (!el) return
  el.classList.add(s.open, s.flash)
  const y = el.getBoundingClientRect().top + window.scrollY - 90
  window.scrollTo({ top: y < 0 ? 0 : y, behavior: 'smooth' })
  setTimeout(() => el.classList.remove(s.flash), 1600)
}
