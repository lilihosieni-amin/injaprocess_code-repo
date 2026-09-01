import { ENVELOPE_FIELD_LABELS, SCREEN_LABELS, label } from '../../lib/factsLabels'
import { toFa } from '../../lib/format'
import type { FactBundle } from '../../api/types'
import { refTitle } from '../bundle'
import { DetailCard, HeadBand, LabelRow, Mono, Pill, RefLink } from './parts'

/**
 * «اعتبار زمانی» — `Inja Panel.dc.html:1213-1242`, drawn for every kind.
 *
 * Where it sits is the design's and is not obvious: **between the rule's
 * decision table and «نام تابع»**, so on a record or an item it is the first
 * card under the statement. `FactDetail` renders it there.
 *
 * The dates are `1405-05-26` as the store holds them — Jalali already, not ISO
 * — so `toFa` puts them in Persian digits and nothing converts a calendar.
 * `jalali()` would read them as Gregorian and print a date five centuries out.
 */
export function LifecycleCard({ bundle, onOpen }: {
  bundle: FactBundle; onOpen: (id: string) => void
}) {
  const e = bundle.entry
  const supersedes = refTitle(bundle, e.supersedes)
  const supersededBy = refTitle(bundle, e.superseded_by)
  const dated = (e.valid_from ?? null) !== null || (e.valid_to ?? null) !== null
  if (!dated && e.supersedes == null && e.superseded_by == null) return null
  return (
    <DetailCard className="mt-s7">
      <HeadBand>{label(SCREEN_LABELS, 'heading_lifecycle')}</HeadBand>
      {dated && (
        <div className="flex items-center gap-s7 px-s9 py-s6 flex-wrap border-b border-line-row">
          {(e.valid_from ?? null) !== null && (
            <>
              <span className="text-fs-sm2 text-muted">
                {label(ENVELOPE_FIELD_LABELS, 'valid_from')}
              </span>
              <Mono className="text-fs-menu font-bold text-ink">{toFa(e.valid_from!)}</Mono>
            </>
          )}
          {(e.valid_to ?? null) !== null && (
            <>
              <span className="text-fs-sm2 text-muted">
                {label(ENVELOPE_FIELD_LABELS, 'valid_to')}
              </span>
              <Mono className="text-fs-menu font-bold text-conflict">{toFa(e.valid_to!)}</Mono>
              <Pill tone="danger">{label(SCREEN_LABELS, 'valid_to_closed')}</Pill>
            </>
          )}
        </div>
      )}
      {e.superseded_by != null && (
        <LabelRow text={label(ENVELOPE_FIELD_LABELS, 'superseded_by')}
          last={e.supersedes == null}>
          <RefLink named={supersededBy} onOpen={onOpen}>
            <Mono className="text-fs-micro text-faint">{e.superseded_by.ref}</Mono>
          </RefLink>
        </LabelRow>
      )}
      {e.supersedes != null && (
        <LabelRow text={label(ENVELOPE_FIELD_LABELS, 'supersedes')} last>
          <RefLink named={supersedes} onOpen={onOpen}>
            <Mono className="text-fs-micro text-faint">{e.supersedes.ref}</Mono>
          </RefLink>
        </LabelRow>
      )}
    </DetailCard>
  )
}
