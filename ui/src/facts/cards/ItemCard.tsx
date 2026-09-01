import {
  CATEGORY_LABELS, GROUP_LABELS, PAYLOAD_FIELD_LABELS, SCREEN_LABELS, STATE_LABELS, label,
} from '../../lib/factsLabels'
import { isItem, type FactBundle, type ItemData } from '../../api/types'
import { DetailCard, Eyebrow, LabelRow, Mono, PX, Pill, none, unanswered } from './parts'

/**
 * The `item` kind — `Inja Panel.dc.html:1555-1616`.
 *
 * The estate code, the category and the base unit on one line; then the pack,
 * the group, the grade, the state, the packaging units and the tracking rows.
 *
 * **A `factor_to_base` may be a number, a two-ended range or `null`** (§7), and
 * the three are three different statements: 10, «۰٫۲۸–۰٫۳۲», and "nobody has
 * said". The range is written as one Latin island, min–max, because QF-42 makes
 * a value a Latin island and a range is a value.
 */
export function ItemCard({ bundle }: { bundle: FactBundle }) {
  const { entry } = bundle
  if (!isItem(entry)) return null
  const d: ItemData = entry.data
  const L = (k: string) => label(PAYLOAD_FIELD_LABELS, k)
  return (
    <DetailCard className="mt-s7">
      <div style={PX.head1820}
        className="flex items-baseline gap-s6 flex-wrap border-b border-border-current">
        <Mono className="text-fs-steps-title font-extrabold text-ink">
          {d.code ?? (d.code_absent === true ? L('code_absent') : none())}
        </Mono>
        {/* :1559 — 13px here, beside a 26px code, and not the pill's own
            11.5px. See `Pill`'s `fs`. */}
        <Pill tone="violet" fs="text-fs-sm">{label(CATEGORY_LABELS, d.category)}</Pill>
        <span className="ms-auto inline-flex items-baseline gap-s3">
          <span className="text-fs-xxs text-faint">{label(SCREEN_LABELS, 'item_base_unit')}</span>
          <Mono className="text-fs-h4 font-extrabold text-violet">{d.unit}</Mono>
          {d.unit_raw !== undefined && (
            <span className="text-fs-caption text-muted">({d.unit_raw})</span>
          )}
        </span>
      </div>

      <LabelRow text={L('pack')} width={PX.label110}>
        {d.pack === undefined
          ? <span className="text-fs-body font-semibold text-ink">{none()}</span>
          // :5008 writes `toFa(size) + ' ' + unitFa(unit)` — Persian digits and
          // a Persian unit word. **QF-42 is a global constraint and overrides
          // the design for the digits**: a number is Latin, and `unitFa` is the
          // map note 2 deletes with nothing served to replace a PACK unit
          // (`RuleInput`/`RuleOutput` carry `unit_title`; `ItemData.pack` does
          // not). Both halves are therefore latin, and «16 l» inside a Persian
          // row is the bidi mix note 6 is about — so it is one island.
          : (
            <Mono className="text-fs-body font-semibold text-ink">
              {`${d.pack.size} ${d.pack.unit}`}
            </Mono>
          )}
      </LabelRow>

      {d.group !== undefined && (
        <LabelRow text={L('group')} width={PX.label110}>
          {/* :1573-1574 — **two nodes**: the group's Persian word at 13.5px,
              then the stored key as a 10.5px mono hint. `GROUP_LABELS` is the
              design's own `GROUP_FA` (:4684) moved into `factsLabels.ts`, and
              an earlier draft of this row deleted it on a false claim: note 2's
              replacement — `resolved`, or the group's own title — is **not
              served** (`facts_store._labels` maps ids and item keys only,
              `facts_store.py:291`), so what still binds is note 9's other half,
              "not in a component". Read with `??` and not `label()`: `oil` and
              `vegetables` are in the estate and in neither map, and a miss is
              ordinary data rather than a schema defect. Where there is no
              Persian word the key stands ALONE rather than twice, and never at
              the prose node — the rule the printed row's unit already keeps. */}
          {GROUP_LABELS[d.group] !== undefined && (
            <span className="text-fs-menu font-semibold text-ink">{GROUP_LABELS[d.group]}</span>
          )}
          <Mono className="text-fs-micro text-faint">{d.group}</Mono>
        </LabelRow>
      )}
      {d.grade !== undefined && (
        <LabelRow text={L('grade')} width={PX.label110}>
          <span className="text-fs-body font-semibold text-ink">{d.grade}</span>
        </LabelRow>
      )}
      {d.state !== undefined && (
        <LabelRow text={L('state')} width={PX.label110}>
          <span className="text-fs-body font-semibold text-ink">
            {label(STATE_LABELS, d.state)}
          </span>
        </LabelRow>
      )}

      {(d.units ?? []).length > 0 && (
        <div style={PX.row1320} className="border-b border-line-row">
          <Eyebrow>{label(SCREEN_LABELS, 'heading_item_packs')}</Eyebrow>
          <div className="flex gap-s4 flex-wrap">
            {(d.units ?? []).map((u) => (
              <span key={u.pack_unit} style={{ ...PX.chip7, ...PX.gap7 }}
                className="inline-flex items-baseline bg-surface-sub border border-border-current
                           rounded-input">
                <Mono className="text-fs-sm font-bold text-violet">{u.pack_unit}</Mono>
                <span aria-hidden className="text-fs-xxs text-faint">=</span>
                {/* :1598 — the chip ends at the factor. The base unit is the
                    card's own header row and is not repeated on every chip. */}
                <Mono className="text-fs-sm2 text-ink">{factor(u.factor_to_base)}</Mono>
              </span>
            ))}
          </div>
        </div>
      )}

      {(d.tracked ?? []).length > 0 && (
        <div style={PX.row1420}>
          <Eyebrow>{L('tracked')}</Eyebrow>
          {(d.tracked ?? []).map((t, i) => (
            <div key={i} className="flex items-start gap-s5 py-s4">
              <span className={`flex-none text-fs-xs font-bold
                                ${t.value ? 'text-green' : 'text-conflict'}`}>
                {label(SCREEN_LABELS, t.value ? 'tracked_yes' : 'tracked_no')}
              </span>
              {/* Ledger L-17 — the design's `line-height:2` normalises onto the
                  long-form prose role (`--lh-loose`). */}
              <span className="flex-1 text-fs-body text-ink leading-loose text-justify">
                {t.reason ?? none()}
              </span>
            </div>
          ))}
        </div>
      )}
    </DetailCard>
  )
}

/** :5014 — a flat factor, a range, or a leaf nobody answered. */
function factor(v: number | null | { min: number; max: number } | undefined): string {
  if (v === null || v === undefined) return unanswered()
  return typeof v === 'object' ? `${v.min}–${v.max}` : String(v)
}
