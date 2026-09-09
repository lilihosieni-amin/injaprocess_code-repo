import { useId, useState } from 'react'
import {
  AGGREGATE_LABELS, DIVERGENCE_LABELS, FROM_LITERAL_LABELS, HIT_LABELS, NATURE_LABELS,
  PAYLOAD_FIELD_LABELS, SCREEN_LABELS, cellLabel, label,
} from '../../lib/factsLabels'
import { toFa } from '../../lib/format'
import { Icon } from '../../ui/Icon'
import {
  isRule, type FactBundle, type FactRef, type RuleBinding, type RuleData, type RuleInput,
  type RuleOutput,
} from '../../api/types'
import { refTitle } from '../bundle'
import {
  CountBand, DetailCard, Eyebrow, FactGrid, FieldName, HeadBand, LabelRow, Mono, PX, Pill,
  RefLink, Tag, Unit, none, unanswered, type GridCell,
} from './parts'

/**
 * The `rule` kind — `Inja Panel.dc.html:1142-1211`, `:1244-1340` and `:1657`.
 *
 * **Two components, because the design interleaves one cross-kind card.** The
 * lifecycle card (:1213) sits *between* the decision table and «نام تابع», so a
 * single rule component could not be dropped into the screen in the design's own
 * order. `RuleValueCards` is what stands above the lifecycle card and `RuleCard`
 * is what stands below it; `FactDetail` renders the three in that order and the
 * DOM matches the deliverable line for line. Nothing else on the screen is
 * interleaved — a rule draws no record, item or measurement card, so the edge
 * cases (:1657) follow the I/O pair directly.
 *
 * Titles are the entry's own (`inputs[].title`, `outputs[].title`) and a unit's
 * Persian is the units record's (`bundle.unit_titles`) — conformance note 2 —
 * and every other Persian word comes from `lib/factsLabels.ts` (note 9).
 */

/**
 * What a value slot shows: the number itself, «؟» for a `null`, «—» for absent.
 *
 * A range may be open at one end — the schema lets either be `null`, and a
 * target («دست‌کم ۹۵ درصد») or a cap («حداکثر ۲ درصد») is exactly that — so it
 * reads «≥ 95» / «≤ 2», never «95–null».
 */
function valueText(o: RuleOutput): { text: string; unanswered: boolean } {
  if (o.value === null) return { text: unanswered(), unanswered: true }
  if (o.value !== undefined) return { text: String(o.value), unanswered: false }
  const min = o.range?.min
  const max = o.range?.max
  if (min != null && max != null) return { text: `${min}–${max}`, unanswered: false }
  if (min != null) return { text: `≥ ${min}`, unanswered: false }
  if (max != null) return { text: `≤ ${max}`, unanswered: false }
  return { text: none(), unanswered: false }
}

export function RuleValueCards({ bundle, onOpen }: {
  bundle: FactBundle; onOpen: (id: string) => void
}) {
  const { entry } = bundle
  if (!isRule(entry)) return null
  const d = entry.data
  const constant = (d.inputs ?? []).length === 0
  return (
    <>
      {constant && (d.outputs ?? []).length > 0 && (
        <ConstantCard bundle={bundle} outputs={d.outputs} onOpen={onOpen} />
      )}
      {typeof d.expr === 'string' && d.expr !== '' && <FormulaCard expr={d.expr} />}
      {d.table !== undefined && <DecisionTable data={d} />}
    </>
  )
}

/** :1142 — one big number per output, with what it is of and where it is written. */
function ConstantCard({ bundle, outputs, onOpen }: {
  bundle: FactBundle; outputs: RuleOutput[]; onOpen: (id: string) => void
}) {
  return (
    <DetailCard clip={false} style={PX.card24} className="mt-s10">
      {outputs.map((o) => {
        const value = valueText(o)
        const of = refTitle(bundle, o.of)
        const writes = refTitle(bundle, o.writes_to)
        return (
          <div key={o.key}>
            <div style={PX.gap9} className="flex items-baseline flex-wrap mb-s5">
              <FieldName title={o.title} name={o.key} />
            </div>
            <div className="flex items-baseline gap-s6 flex-wrap">
              {/* QF-42 — a value is an LTR island in Latin digits. `--fs-numeral`
                  is 46px and belongs to the department card's ghosted index, so
                  the design's 44 is written out (`PX.bigValue`). */}
              <Mono style={PX.bigValue}
                className={`font-extrabold leading-none ${value.unanswered ? 'text-conflict' : 'text-ink'}`}>
                {value.text}
              </Mono>
              <Unit bundle={bundle} symbol={o.unit} className="text-fs-h5 font-bold text-muted" />
              <span style={PX.gap7} className="ms-auto flex flex-wrap">
                {o.nature !== undefined && (
                  <Pill tone="violet">{label(NATURE_LABELS, o.nature)}</Pill>
                )}
                {o.per !== undefined && (
                  <Pill tone="quiet">
                    {/* :4847 — the design writes `keyFa(o.per)` and note 2
                        deletes `KEY_FA`, so the basis stays its stored key:
                        `unit_sold`, `kg_cooked`, `pizza`. Every other key on
                        this screen is an island, and a latin run inside
                        «به ازای هر …» is the bidi mix note 6 is about. */}
                    {label(PAYLOAD_FIELD_LABELS, 'per')} <Mono>{o.per}</Mono>
                  </Pill>
                )}
              </span>
            </div>
            {of !== undefined && (
              <div style={{ ...PX.gap9, ...PX.pt13 }}
                className="flex items-center flex-wrap mt-s7 border-t border-line-soft">
                <span style={PX.label70} className="flex-none text-fs-sm2 text-muted">
                  {label(PAYLOAD_FIELD_LABELS, 'of')}
                </span>
                <RefLink named={of} onOpen={onOpen} />
              </div>
            )}
            {writes !== undefined && (
              <div style={{ ...PX.gap9, ...PX.mt11 }} className="flex items-baseline flex-wrap">
                <span style={PX.label70} className="flex-none text-fs-sm2 text-muted">
                  {label(PAYLOAD_FIELD_LABELS, 'writes_to')}
                </span>
                <RefLink named={writes} onOpen={onOpen} />
              </div>
            )}
          </div>
        )
      })}
    </DetailCard>
  )
}

/** :1174 — the expression, the one place §17 lets keys stand on their own. */
function FormulaCard({ expr }: { expr: string }) {
  return (
    <DetailCard clip={false} className="mt-s10 p-s10">
      <div className="flex items-center gap-s4 mb-s7">
        <span className="text-fs-xxs font-bold text-muted">
          {label(PAYLOAD_FIELD_LABELS, 'expr')}
        </span>
      </div>
      <Mono style={PX.formula}
        className="block text-fs-lg leading-looser text-ink bg-surface-sub
                   border border-border-current rounded-tile overflow-x-auto">
        {expr}
      </Mono>
    </DetailCard>
  )
}

/**
 * A decision-table cell.
 *
 * A number stays a Latin island (QF-42). Everything else goes through
 * `cellLabel`, which is the design's own `enumFa` (:4693) — the estate's tables
 * hold `wed` / `thu` / `fri` (`F-00032`, `F-00050`) and would otherwise render
 * an English word inside a Persian table.
 *
 * **The same function as the record grid's cell**, deliberately: the design
 * applies `enumFa` at both sites (:4860 and :4912) and covering one of them is
 * what let «wed» ship while «mass» was still English two cards away.
 */
function tableCell(v: unknown, output: boolean): GridCell {
  const ink = output ? 'font-extrabold text-violet' : 'font-semibold text-ink'
  if (v === undefined || v === null) {
    return {
      node: <span className={`text-fs-sm ${ink}`}>{label(SCREEN_LABELS, 'table_default')}</span>,
    }
  }
  const text = String(v)
  const numeric = text !== '' && !Number.isNaN(Number(text))
  if (numeric) return { node: <Mono className={`text-fs-sm ${ink}`}>{text}</Mono> }
  return { node: <span className={`text-fs-sm ${ink}`}>{cellLabel(text)}</span> }
}

/** A row's cell — `{when, then}` as the design nests it (:4855), or flat
 *  `{key: value}` as the engine's units write it; the schema types `table` as
 *  a bare object and both shapes are in the store. */
function cellOf(row: Record<string, unknown>, group: 'when' | 'then', key: string): unknown {
  const nested = row[group]
  return nested !== null && typeof nested === 'object'
    ? (nested as Record<string, unknown>)[key] : row[key]
}

/** :1183 — «جدول تصمیم», its hit rule, its rows and its default band. */
function DecisionTable({ data }: { data: RuleData }) {
  const t = data.table
  if (t === undefined) return null
  const ins = t.inputs ?? []
  const outs = t.outputs ?? []
  const columns = [...ins, ...outs]
  // Note 2 — a column's head is the rule's own title for that key.
  const titleOf = (key: string) =>
    (data.inputs ?? []).find((i) => i.key === key)?.title
    ?? (data.outputs ?? []).find((o) => o.key === key)?.title
  const heading = label(SCREEN_LABELS, 'heading_decision_table')
  return (
    <DetailCard className="mt-s10">
      <CountBand>
        <span className="text-fs-sm font-bold text-ink">{heading}</span>
        {t.hit !== undefined && <Pill tone="violet">{label(HIT_LABELS, t.hit)}</Pill>}
        {t.aggregate !== undefined && (
          <Pill tone="warn">{label(AGGREGATE_LABELS, t.aggregate)}</Pill>
        )}
      </CountBand>
      <FactGrid
        label={heading}
        // Owner's correction, 2026-09-06 — see `FactGrid`'s `align`. The
        // decision table's cells are one value each, like the record grid's.
        align="center"
        // :4854 — one `minmax(120px,1fr)` per column. No token holds a track.
        tracks={{ gridTemplateColumns: columns.map(() => 'minmax(120px,1fr)').join(' ') }}
        head={columns.map((k) => {
          const title = titleOf(k)
          return title === undefined
            ? <Mono key={k}>{k}</Mono>
            : <span key={k}>{title}</span>
        })}
        rows={(t.rows ?? []).map((row, i) => ({
          key: String(i),
          cells: [
            ...ins.map((k) => tableCell(cellOf(row, 'when', k), false)),
            ...outs.map((k) => tableCell(cellOf(row, 'then', k), true)),
          ],
        }))}
      />
      {t.default !== undefined && (
        <div className="flex items-center gap-s6 px-s9 py-s6 bg-surface-sub flex-wrap">
          <span className="flex-none text-fs-caption text-muted">
            {label(SCREEN_LABELS, 'table_default')}
          </span>
          {/* :4862 — «، » between the pairs, which is the design's own join. */}
          <Mono className="text-fs-sm font-bold text-violet">
            {Object.entries(t.default).map(([k, v]) => `${k} = ${String(v)}`)
              .join(label(SCREEN_LABELS, 'list_separator'))}
          </Mono>
        </div>
      )}
    </DetailCard>
  )
}

export function RuleCard({ bundle, onOpen }: {
  bundle: FactBundle; onOpen: (id: string) => void
}) {
  const { entry } = bundle
  if (!isRule(entry)) return null
  const d = entry.data
  const template = refTitle(bundle, d.template_of)
  const hasIO = (d.inputs ?? []).length > 0
  return (
    <>
      {(d.identifier !== undefined || d.original !== undefined
        || d.original_ref !== undefined) && (
        <DetailCard className="mt-s7">
          {d.identifier !== undefined && (
            <LabelRow text={label(PAYLOAD_FIELD_LABELS, 'identifier')}
              last={d.original === undefined && d.original_ref === undefined}>
              <Mono className="text-fs-lg font-extrabold text-violet">{d.identifier}</Mono>
            </LabelRow>
          )}
          {/* `bundle.original` is the file's own text, read out of
              `facts/originals/` by the route; `d.original` is the inline form a
              delta carries before QF-31 moves it. Either is "the original", and
              the served one wins where both somehow exist — it is the body that
              is actually in the store. */}
          <OriginalBlock original={bundle.original ?? d.original}
            ref_={d.original_ref} lang={d.lang} />
        </DetailCard>
      )}

      {d.template_of !== undefined && (
        <DetailCard clip={false} className="mt-s7 px-s9 py-s8">
          <div className="flex items-center gap-s7 flex-wrap">
            <span style={PX.label120} className="flex-none text-fs-sm2 text-muted">
              {label(PAYLOAD_FIELD_LABELS, 'template_of')}
            </span>
            <RefLink named={template} onOpen={onOpen} />
            {d.divergence !== undefined && (
              <span className={`ms-auto text-fs-xs font-bold ${DIVERGENCE_INK[d.divergence]}`}>
                {label(DIVERGENCE_LABELS, d.divergence)}
              </span>
            )}
          </div>
        </DetailCard>
      )}

      {(d.applies_to ?? []).length > 0 && (
        <AppliesTo bundle={bundle} bindings={d.applies_to ?? []} onOpen={onOpen} />
      )}

      {(d.calls ?? []).length > 0 && (
        <DetailCard clip={false} className="mt-s7 px-s9 py-s8">
          <Eyebrow>{label(PAYLOAD_FIELD_LABELS, 'calls')}</Eyebrow>
          <div className="flex gap-s4 flex-wrap">
            {(d.calls ?? []).map((c) => {
              const named = refTitle(bundle, c)
              return (
                <button key={c.ref} type="button" style={PX.chip7}
                  onClick={() => { if (named?.id !== undefined) onOpen(named.id) }}
                  className="inline-flex items-center gap-button-icon font-sans text-fs-sm2
                             font-semibold text-ink bg-surface-sub border border-border-current
                             rounded-input cursor-pointer hover:border-border-pick hover:bg-tile-v2">
                  <Mono className="text-fs-micro text-muted">{c.ref}</Mono>
                  {named?.text ?? ''}
                </button>
              )
            })}
          </div>
        </DetailCard>
      )}

      {hasIO && (
        // :1279 — `[data-r-2col]`, two equal columns collapsing to one at ≤760.
        <div data-r-2col className="grid grid-cols-2 gap-s7 mt-s7 max760:grid-cols-1">
          <DetailCard>
            <IoHead heading="heading_inputs" hint="heading_inputs_hint"
              fill="bg-tile-v4 border-border-current" ink="text-violet" />
            {(d.inputs ?? []).map((i) => (
              <InputRow key={i.key} bundle={bundle} input={i}
                params={d.applies_to?.[0]?.params} onOpen={onOpen} />
            ))}
          </DetailCard>
          <DetailCard>
            {/* :1308 — the head is a paler green than the unit pill inside the
                card, and both were `--tile-ok` until the owner ruled on it
                (2026-09-01): drawn the same, the two bands flatten together and
                the card loses its hierarchy. `--tile-ok2` / `--border-ok2` are
                that ruling, minted in `tokens.css` on the family's own ladder. */}
            <IoHead heading="heading_outputs" hint="heading_outputs_hint"
              fill="bg-tile-ok2 border-border-ok2" ink="text-green" />
            {(d.outputs ?? []).map((o) => (
              <OutputRow key={o.key} bundle={bundle} output={o} onOpen={onOpen} />
            ))}
          </DetailCard>
        </div>
      )}

      {(d.edge_cases ?? []).length > 0 && (
        <DetailCard className="mt-s7">
          <HeadBand>{label(SCREEN_LABELS, 'heading_edge_cases')}</HeadBand>
          <FactGrid
            label={label(SCREEN_LABELS, 'heading_edge_cases')}
            tracks={PX.edgesGrid}
            headFill="bg-surface-sub"
            head={[
              label(PAYLOAD_FIELD_LABELS, 'input'),
              label(PAYLOAD_FIELD_LABELS, 'expected'),
              label(PAYLOAD_FIELD_LABELS, 'why'),
            ]}
            rows={(d.edge_cases ?? []).map((e, i) => ({
              key: String(i),
              cells: [
                { node: <span className="text-fs-sm2 text-ink leading-sub">{e.input ?? ''}</span> },
                { node: <span className="text-fs-sm2 font-semibold text-green">{e.expected ?? ''}</span> },
                { node: <span className="text-fs-caption text-faint">{e.why ?? ''}</span> },
              ],
            }))}
          />
        </DetailCard>
      )}
    </>
  )
}

/**
 * «محل اجرا» — QF-47's `applies_to[]`, one row per binding.
 *
 * **Owner ruling, 2026-09-06: the structure is shown and the placement is
 * delegated.** So this is the card's own `HeadBand` over the same `FactGrid`
 * the decision table and the edge cases already draw, at the same tokens; no
 * new design value is introduced. `align` stays `start`: a workbook title and a
 * tab name are names, not values, and the centred variant belongs to the two
 * grids whose columns hold one number each.
 *
 * The workbook, the tab and the branch come from `bundle.binding_labels` and
 * not from the entry — a binding names a column of ANOTHER entry, and the
 * workbook's title is the manifest's, so neither is reachable from here. A
 * binding the server could not resolve draws the record's own title and no
 * workbook, which is still a true statement about where the rule runs.
 */
function AppliesTo({ bundle, bindings, onOpen }: {
  bundle: FactBundle; bindings: RuleBinding[]; onOpen: (id: string) => void
}) {
  const heading = label(PAYLOAD_FIELD_LABELS, 'applies_to')
  return (
    <DetailCard className="mt-s7">
      <HeadBand>{heading}</HeadBand>
      <FactGrid
        label={heading}
        tracks={{
          gridTemplateColumns:
            'minmax(140px,1fr) minmax(110px,1fr) minmax(90px,1fr) '
            + 'minmax(100px,1fr) minmax(180px,1.4fr)',
        }}
        head={[
          label(PAYLOAD_FIELD_LABELS, 'workbook'),
          label(PAYLOAD_FIELD_LABELS, 'sheet'),
          label(PAYLOAD_FIELD_LABELS, 'branch'),
          label(PAYLOAD_FIELD_LABELS, 'cell_range'),
          label(PAYLOAD_FIELD_LABELS, 'params'),
        ]}
        rows={bindings.map((b) => {
          const where = bundle.binding_labels[b.key]
          const record = refTitle(bundle, b.record)
          return {
            key: b.key,
            cells: [
              { node: where?.workbook
                ? <Mono className="text-fs-sm2 text-ink">{where.workbook}</Mono>
                : <RefLink named={record} onOpen={onOpen} className="text-fs-sm2" /> },
              { node: <span className="text-fs-sm2 text-ink">{where?.sheet ?? none()}</span> },
              { node: <span className="text-fs-sm2 text-muted">{where?.branch ?? none()}</span> },
              { node: <Mono className="text-fs-sm2 text-faint">{b.range ?? none()}</Mono> },
              { node: <Params bundle={bundle} params={b.params} /> },
            ],
          }
        })}
      />
    </DetailCard>
  )
}

/**
 * A binding's parameters — the numbers, and nothing else raw.
 *
 * §2.5's rule, kept identically here and in `gate-b.md`: a **numeric** value is
 * shown; a value that is a `{ref}` or a table name is shown as the referenced
 * record's Persian title, or omitted. A `Table_*` string in front of a reader is
 * exactly what the style card exists to prevent, and a parameter is the one
 * place one could still reach a screen.
 */
function Params({ bundle, params }: {
  bundle: FactBundle; params?: Record<string, unknown>
}) {
  const entries = Object.entries(params ?? {})
  if (entries.length === 0) return <span className="text-fs-sm2 text-faint">{none()}</span>
  const parts = entries.map(([key, value]) => {
    if (typeof value === 'number') {
      return <Mono key={key} className="text-fs-sm2 text-ink">{`${key} = ${value}`}</Mono>
    }
    const named = refTitle(bundle, value as never)
    return named === undefined
      ? null
      : <span key={key} className="text-fs-sm2 text-muted">{named.text}</span>
  }).filter((x) => x !== null)
  if (parts.length === 0) return <span className="text-fs-sm2 text-faint">{none()}</span>
  return <span className="flex flex-wrap gap-s4">{parts}</span>
}

/** :1260 — drift is `--conflict`, an intentional difference `--warn-fg`,
 *  anything else `--green`. */
const DIVERGENCE_INK: Record<string, string> = {
  drift: 'text-conflict',
  intentional: 'text-warn-fg',
  none: 'text-green',
  unknown: 'text-green',
}

/** :1282 / :1308 — the two heads of the I/O pair, a heading over a hint. */
function IoHead({ heading, hint, fill, ink }: {
  heading: string; hint: string; fill: string; ink: string
}) {
  return (
    <div className={`px-s9 py-s7 border-b ${fill}`}>
      <div className={`text-fs-sm font-extrabold ${ink}`}>{label(SCREEN_LABELS, heading)}</div>
      <div className="text-fs-xs text-muted leading-sub mt-s2">{label(SCREEN_LABELS, hint)}</div>
    </div>
  )
}

function InputRow({ bundle, input, params, onOpen }: {
  bundle: FactBundle; input: RuleInput
  /** The FIRST binding's `params` — what the parameter below stands for. */
  params?: Record<string, unknown>
  onOpen: (id: string) => void
}) {
  const literal = typeof input.from === 'string' ? input.from : undefined
  const edge = input.from !== null && typeof input.from === 'object' ? input.from : undefined
  // QF-47's third form: the value differs per binding, so the input names a
  // parameter and the bindings say what it is. **Spec §3.7** — the owner asked
  // what «ref_1» was, so the first binding answers it: a `{ref, field}` reads
  // exactly as a direct edge does, a number reads «ref_1 = 75», and only a
  // parameter nothing maps stays a bare LTR island (QF-42) — which is still
  // better than the empty «خوانده می‌شود از» a dangling ref would draw.
  const param = edge !== undefined && 'param' in edge ? edge.param : undefined
  const bound = param === undefined ? undefined : params?.[param]
  const boundRef = typeof bound === 'object' && bound !== null && 'ref' in bound
    ? bound as FactRef : undefined
  const from = edge !== undefined && 'ref' in edge
    ? refTitle(bundle, edge) : refTitle(bundle, boundRef)
  const paramText = param === undefined ? undefined
    : typeof bound === 'number' ? `${param} = ${bound}` : param
  const via = refTitle(bundle, input.via)
  // A decision table's input is the table's own axis and reads from nowhere;
  // «خوانده می‌شود از» over an empty slot says nothing, so the line is skipped.
  const source = literal !== undefined || paramText !== undefined
    || from !== undefined || via !== undefined
  return (
    // :1287 — `13px 18px`, and 13px HAS a token: `--pad-table-row-y`
    // (`tokens.css:395`), which `FactsList.tsx:215` already writes for the
    // design's own 13px. An exact token beats a rounding.
    <div className="px-s9 py-table-row-y border-b border-line-row">
      <div title={input.key} className="flex items-baseline gap-s4 flex-wrap">
        <FieldName title={input.title} name={input.key} />
        {input.unit != null && (
          <Tag tone="violet2"><Unit bundle={bundle} symbol={input.unit} /></Tag>
        )}
      </div>
      {source && (
        <div style={PX.mt7} className="flex items-baseline gap-s3 flex-wrap">
          <span className="text-fs-sm2 text-muted">{label(PAYLOAD_FIELD_LABELS, 'from')}</span>
          {literal !== undefined
            ? <span className="text-fs-sm2 font-bold text-muted">
              {label(FROM_LITERAL_LABELS, literal)}
            </span>
            : paramText !== undefined && from === undefined
              ? <Mono className="text-fs-sm2 text-ink">{paramText}</Mono>
              : <RefLink named={from} onOpen={onOpen} className="text-fs-sm2" />}
          {via !== undefined && (
            <>
              <span className="text-fs-sm2 text-muted">{label(PAYLOAD_FIELD_LABELS, 'via')}</span>
              <RefLink named={via} onOpen={onOpen} className="text-fs-sm2" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function OutputRow({ bundle, output, onOpen }: {
  bundle: FactBundle; output: RuleOutput; onOpen: (id: string) => void
}) {
  const of = refTitle(bundle, output.of)
  const writes = refTitle(bundle, output.writes_to)
  return (
    // :1313 — the same `13px 18px` as the input row above.
    <div className="px-s9 py-table-row-y border-b border-line-row">
      <div title={output.key} className="flex items-baseline gap-s4 flex-wrap">
        <FieldName title={output.title} name={output.key} />
        {output.unit != null && (
          <Tag tone="ok"><Unit bundle={bundle} symbol={output.unit} /></Tag>
        )}
        {output.share !== undefined && (
          <Tag tone="violet2">
            {label(PAYLOAD_FIELD_LABELS, 'share')}{' '}
            {label(SCREEN_LABELS, 'percent')
              .replace('{n}', toFa(Math.round(output.share * 1000) / 10))}
          </Tag>
        )}
      </div>
      {output.nature !== undefined && (
        <div style={PX.mt7} className="text-fs-sm2 text-muted">
          {label(NATURE_LABELS, output.nature)}
        </div>
      )}
      {of !== undefined && (
        <div className="flex items-center gap-s3 mt-s3 flex-wrap">
          <span style={PX.label96} className="flex-none text-fs-caption text-faint">
            {label(PAYLOAD_FIELD_LABELS, 'of')}
          </span>
          <RefLink named={of} onOpen={onOpen} className="text-fs-caption" />
        </div>
      )}
      {writes !== undefined && (
        <div className="flex items-baseline gap-s3 mt-s3 flex-wrap">
          <span style={PX.label96} className="flex-none text-fs-caption text-faint">
            {label(PAYLOAD_FIELD_LABELS, 'writes_to_output')}
          </span>
          <RefLink named={writes} onOpen={onOpen} className="text-fs-caption" />
        </div>
      )}
    </div>
  )
}

/**
 * «متن اصلی» — **the owner's decision of 2026-08-31** (facts-design-audit §6.1),
 * and conformance note 8's "reachable as a collapsed block".
 *
 * Closed by default is part of the decision and not a detail: the block holds a
 * raw formula or a script body, which is the one place §17 lets keys stand on
 * their own, and it must not push the entry's Persian off the first screen.
 *
 * The design computes `sfHasOriginalRef` / `sfOriginalRef` (:4883) and
 * `sfOriginalNote` (:4885) and renders none of them; this is the card they were
 * computed for, beside the «نام تابع» row that is the only other consumer of
 * `rl.original*`. The note is the design's own sentence, one per `lang`.
 */
function OriginalBlock({ original, ref_, lang }: {
  original?: string | null; ref_?: string; lang?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  if ((original === undefined || original === null) && ref_ === undefined) return null
  const note = lang === 'gs' ? 'original_note_gs'
    : lang === 'sheets' ? 'original_note_sheets' : 'original_note'
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="w-full min-h-touch flex items-center gap-s7 px-s9 py-s6
                   bg-transparent border-0 cursor-pointer text-start">
        <span style={PX.label120} className="flex-none text-fs-sm2 text-muted">
          {label(PAYLOAD_FIELD_LABELS, 'original')}
        </span>
        {/* The chevron sits at the inline END of the row, as every disclosure in
            this app draws it (`src/ui/Accordion.tsx`), with the label's own
            120px column on the start — the width the card's other row keeps. */}
        <span aria-hidden
          className={`ms-auto flex-none flex text-muted transition-transform duration-chev
                      ease-css ${open ? 'rotate-90' : 'rotate-0'}`}>
          <Icon name="chevronEnd" px={14} stroke={2.4} />
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-s9 pb-s6">
          {original !== undefined && original !== null && (
            // **Owner request, 2026-09-06:** «th box wit fix hight and
            // scollable». Capped at `--height-popover`, this app's existing
            // scroll cap (the dropdown's), rather than a new length: a formula
            // file is a few dozen lines and a card that grows to fit one pushes
            // everything the reviewer came for off the screen. `overflow-auto`
            // and not `-y`: a long unwrapped line needs the other axis too, and
            // `auto` draws neither bar until it is needed.
            <Mono style={PX.formula}
              className="block text-fs-sm2 leading-looser text-ink bg-surface-sub
                         border border-border-current rounded-tile
                         max-h-popover overflow-auto whitespace-pre-wrap">
              {original}
            </Mono>
          )}
          {ref_ !== undefined && (
            <Mono className="block text-fs-xs text-muted mt-s4">{ref_}</Mono>
          )}
          <p className="text-fs-sm2 text-muted leading-sub m-0 mt-s4">
            {label(SCREEN_LABELS, note)}
          </p>
        </div>
      )}
    </div>
  )
}
