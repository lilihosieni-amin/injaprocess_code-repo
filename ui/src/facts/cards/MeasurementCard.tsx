import type { ReactNode } from 'react'
import {
  PAYLOAD_FIELD_LABELS, QUANTITY_LABELS, SCREEN_LABELS, label,
} from '../../lib/factsLabels'
import { isMeasurement, type FactBundle, type MeasurementData } from '../../api/types'
import { refTitle } from '../bundle'
import { DetailCard, Mono, PX, RefLink, Unit, none } from './parts'

/**
 * The `measurement` kind — `Inja Panel.dc.html:1618-1653`.
 *
 * A 2×2 grid — «کمیت و واحد» · «برای» · «زمان · توسط» · «ثبت در» — then the
 * method and the exceptions.
 *
 * **Conformance note 2 lands on the fourth pane.** The design binds `sfMeasWrId`
 * and `sfMeasWrField` raw (:5027), so «ثبت در» reads `F-00011 end_stock` — two
 * machine keys where a reviewer needs a table and a column. Here it is the
 * record's own title, resolved from the bundle, with the column key kept as the
 * small mono hint §17 allows beside a Persian title. The column's *title* is not
 * served: `resolved` maps an id to `{kind, title, code?}` and carries no field
 * names, so the key is what stands for the column.
 */
export function MeasurementCard({ bundle, onOpen }: {
  bundle: FactBundle; onOpen: (id: string) => void
}) {
  const { entry } = bundle
  if (!isMeasurement(entry)) return null
  const d: MeasurementData = entry.data
  const of = refTitle(bundle, d.of)
  const writes = refTitle(bundle, d.writes_to)
  return (
    <DetailCard className="mt-s10">
      {/* :1620 — `[data-r-2col]`, `repeat(2,1fr)`, one column at ≤760. */}
      <div data-r-2col className="grid grid-cols-2 max760:grid-cols-1">
        <Pane text={label(SCREEN_LABELS, 'measurement_quantity')} edge>
          <span className="text-fs-h5 font-extrabold text-ink">
            {label(QUANTITY_LABELS, d.quantity)} ·{' '}
            <Unit bundle={bundle} symbol={d.unit} />
          </span>
        </Pane>
        <Pane text={label(PAYLOAD_FIELD_LABELS, 'of')}>
          <RefLink named={of} onOpen={onOpen} />
        </Pane>
        <Pane text={label(SCREEN_LABELS, 'measurement_when_by')} edge>
          <span className="text-fs-body font-semibold text-ink">
            {`${d.when ?? none()} · ${d.by ?? none()}`}
          </span>
        </Pane>
        <Pane text={label(PAYLOAD_FIELD_LABELS, 'writes_to')}>
          <RefLink named={writes} onOpen={onOpen} className="text-fs-sm">
            {d.writes_to?.field !== undefined && (
              <Mono className="text-fs-xs text-faint">{d.writes_to.field}</Mono>
            )}
          </RefLink>
        </Pane>
      </div>
      {d.method !== undefined && (
        <Prose text={label(PAYLOAD_FIELD_LABELS, 'method')}>{d.method}</Prose>
      )}
      <Prose text={label(PAYLOAD_FIELD_LABELS, 'exceptions')} last>
        {d.exceptions ?? none()}
      </Prose>
    </DetailCard>
  )
}

/** One pane of the 2×2 — an eyebrow over a value, with a rule on two sides. */
function Pane({ text, edge = false, children }: {
  text: string; edge?: boolean; children: ReactNode
}) {
  return (
    // A logical inline-end edge, never a physical one: F10 makes every side
    // logical, and the design's own `border-inline-end` (:1621) already is.
    <div className={`px-s9 py-s8 border-b border-line-row ${edge ? 'border-e' : ''}`}>
      <div className="text-fs-xxs text-faint">{text}</div>
      <div style={PX.mt7} className="flex items-baseline gap-s4 flex-wrap">{children}</div>
    </div>
  )
}

/** :1646 — the method and the exceptions, long-form prose at `--lh-looser`. */
function Prose({ text, last = false, children }: {
  text: string; last?: boolean; children: ReactNode
}) {
  return (
    <div className={`px-s9 py-s8 ${last ? '' : 'border-b border-line-row'}`}>
      <div className="text-fs-xxs text-faint">{text}</div>
      <div className="text-fs-lg text-ink leading-looser mt-s4 text-justify [text-wrap:pretty]">
        {children}
      </div>
    </div>
  )
}
