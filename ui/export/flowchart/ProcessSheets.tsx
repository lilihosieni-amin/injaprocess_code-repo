import { toFa } from '../../src/lib/format'
import type { ExportPayload } from '../shared/payload'
import d from './document.module.css'

/** One print-only page per process. On screen the flow viewer opens instead, so
 *  these sheets are hidden; Stage 4 fills each `.pf-wrap` with the SVG bands.
 *  Content is exactly the mockup's (D12): name, id, counts, diagram. */
export function ProcessSheets({ payload }: { payload: ExportPayload }) {
  const pad2 = (i: number) => toFa(String(i).padStart(2, '0'))
  return (
    <>
      {payload.processes.map((p, i) => {
        const activities = p.nodes.filter((n) => n.type !== 'junction').length
        const junctions = p.nodes.filter((n) => n.type === 'junction').length
        return (
          <div key={p.id} className={`${d.view} ${d['print-only']}`} data-testid={`sheet-${p.id}`}>
            <div className={d.sheet}>
              <div className={d['sheet-head']}>
                <span className={d['sec-num']}>{pad2(i + 1)}</span>
                <h2 style={{ fontSize: 22 }}>{p.name}</h2>
              </div>
              <div className={d['proc-num-strip']}>
                <span className={d['id-badge']} dir="ltr">{p.id}</span>
                {p.parent && <span className={d['sub-badge']}>زیرفرآیند از {p.parent.process}</span>}
              </div>
              <div className={d['proc-meta']}>
                <span className={d.pm}><b>{toFa(activities)}</b> فعالیت</span>
                <span className={d.pm}><b>{toFa(junctions)}</b> انشعاب</span>
              </div>
              {/* NOT a module class: `print.css` styles `.pf-wrap` globally, and
                  the SVG bands are injected as raw HTML — a hashed name would
                  never match either. */}
              <div className="pf-wrap" data-pf={p.id} />
            </div>
          </div>
        )
      })}
    </>
  )
}
