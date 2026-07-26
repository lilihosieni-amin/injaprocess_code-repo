import { linearize, countSteps, groupTitle } from './linearize'
import type { Block } from './linearize'
import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import type { ActivityNode, Process } from '../../src/api/types'
import p from './print.module.css'

/** The activity that opens `x`, for its «این بخش مربوط به چیست؟» note.
 *
 *  Soft-deleted nodes are skipped, exactly as `linearize` skips them: a removed
 *  activity is no longer a step anywhere, so the on-screen guide — which takes
 *  this note from the step the reader tapped — can never show it. Quoting one
 *  here would put text in the PDF for a step that does not exist and make the
 *  paper disagree with the screen.
 *
 *  A subprocess can be called from more than one place, and the printed section
 *  has room for one note. `parent` records the call the merge engine wired, so
 *  that one wins; failing that the callers are ordered by process and node id.
 *  Either way the answer is a property of the data, never of the order the
 *  payload happens to list processes or nodes in. */
function callerOf(processes: Process[], x: Process): ActivityNode | null {
  const callers: { proc: string; node: ActivityNode }[] = []
  processes.forEach((o) => o.nodes.forEach((n) => {
    if (n.type === 'activity' && n.subprocess === x.id && !n.removed) callers.push({ proc: o.id, node: n })
  }))
  if (!callers.length) return null
  const rec = x.parent
  const owned = rec && callers.find((c) => c.proc === rec.process && c.node.id === rec.node)
  if (owned) return owned.node
  callers.sort((a, b) => a.proc.localeCompare(b.proc) || a.node.id.localeCompare(b.node.id))
  return callers[0].node
}

export function PrintDoc({ payload }: { payload: ExportPayload }) {
  const byId = new Map(payload.processes.map((x) => [x.id, x]))
  const model = new Map(payload.processes.map((x) => [x.id, linearize(x)]))

  return (
    <div className={p.printdoc}>
      <section className={`${p.psec} ${p.pindex}`} data-testid="print-index">
        <h2>راهنمای گام‌به‌گام کار — {payload.dept.name}</h2>
        <div className={p.ptype}>فهرست کارها</div>
        <ol className={p['plist-print']}>
          {payload.processes.map((x) => (
            <li key={x.id} className={x.parent ? p.sub : ''}>
              <span className={p.il}>{x.name}</span>
              <span className={`${p.it} ${x.parent ? p.sub : ''}`}>{x.parent ? 'زیرفرآیند' : 'فرآیند'}</span>
              <span className={p.ic}>{toFa(countSteps(model.get(x.id) ?? []))} مرحله</span>
            </li>
          ))}
        </ol>
      </section>

      {payload.processes.map((x) => {
        // the live parent node that links here, for the "what is this about?" note
        const via = callerOf(payload.processes, x)
        return (
          <section key={x.id} className={p.psec} data-testid={`print-section-${x.id}`}>
            <h2>{x.name}</h2>
            <div className={`${p.ptype} ${x.parent ? p.sub : ''}`}>{x.parent ? 'زیرفرآیند' : 'فرآیند'}</div>
            {via && via.description && (
              <div className={p.psum}><b>این بخش مربوط به چیست؟</b>{via.description}</div>
            )}
            <PrintBlocks blocks={model.get(x.id) ?? []} byId={byId} />
            <div className={p.pend}>کار تمام شد</div>
          </section>
        )
      })}
    </div>
  )
}

function PrintBlocks({ blocks, byId }: { blocks: Block[]; byId: Map<string, Process> }) {
  return (
    <>
      {blocks.map((b, i) => b.kind === 'group' ? (
        <div key={`g${i}`} className={p.pgrp}>
          <div className={p.h}>{groupTitle(b.type, b.branches.length)}</div>
          {b.branches.map((br, j) => (
            <div key={j} className={p.pbr}>
              <div className={p.h}>{br.label ? `اگر: ${br.label}` : `حالت ${toFa(j + 1)}`}</div>
              {br.blocks.length ? <PrintBlocks blocks={br.blocks} byId={byId} /> : <div className={p.pnone}>کاری لازم نیست</div>}
            </div>
          ))}
        </div>
      ) : (
        (() => {
          const n = b.node
          const sub = n.subprocess && byId.get(n.subprocess)
          return (
            <div key={n.id} className={`${p.pstep} ${sub ? p.sub : ''}`}>
              <span className={p.n}>{toFa(b.num)}</span>
              <span className={p.c}>
                <span className={p.l}>{n.label}</span>
                {n.actor && <div className={p.m}>مجری: {n.actor}</div>}
                {n.description && <div className={p.d}>{n.description}</div>}
                {(b.cond || b.back.some((r) => r.num) || sub) && (
                  <div className={p.tags}>
                    {b.cond && <span className={`${p.tg} ${p.cond}`}>اگر: {b.cond}</span>}
                    {/* keyed by target *and* index, as StepsApp is: one step can
                        carry two back-edges to the same target */}
                    {b.back.filter((r) => r.num).map((r, k) => <span key={`${r.to}-${k}`} className={`${p.tg} ${p.back}`}>برگرد به مرحلهٔ {toFa(r.num!)}</span>)}
                    {sub && <span className={`${p.tg} ${p.sub}`}>مراحل این کار: بخش «{sub.name}»</span>}
                  </div>
                )}
              </span>
            </div>
          )
        })()
      ))}
    </>
  )
}
