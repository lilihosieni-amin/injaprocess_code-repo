import type { ReactNode } from 'react'
import {
  CADENCE_LABELS, FIELD_TYPE_LABELS, PAYLOAD_FIELD_LABELS, SCREEN_LABELS, label,
} from '../../lib/factsLabels'
import { toFa } from '../../lib/format'
import {
  isRecordFact, type FactBundle, type RecordData, type RecordField,
} from '../../api/types'
import { redPath, refTitle, resolvedTitle, rowCount, rowTitle } from '../bundle'
import {
  CountBand, DetailCard, Eyebrow, FactGrid, HeadBand, LabelRow, Mono, PX, Pill, RefLink,
  none, unanswered, type GridCell,
} from './parts'

/**
 * The `record` kind — `Inja Panel.dc.html:1341-1552`.
 *
 * Four cards in the design's own order: the reference grid, the columns table
 * for a record with no grid, the printed rows of a paper form, and «ساختار و
 * مکان جدول», which every record draws.
 *
 * ## The three conformance notes that land here
 *
 * * **note 3 — red is `red_paths` and nothing else.** The design paints
 *   «واحد ثبت نشده» on every numeric column without a `unit` (`sfRecFields`,
 *   :4978), which reddens a confirmed entry's `day` and `year` columns. An
 *   omitted `unit` is "not applicable"; only a present-and-`null` one is
 *   «بی‌پاسخ», and the server has already decided which is which.
 * * **note 2 — titles come from the served data.** A column's head is
 *   `fields[].title`, a `refItems` cell is `resolved[key]` with the key as its
 *   tooltip, a row's name is `row_titles[key]`.
 * * **note 6 — the «محل» row carries no bidi mix.** The design puts «شناسهٔ فایل
 *   {spreadsheetId}» — a Persian label INSIDE the latin island beside it
 *   (:1454) — and it renders garbled. The id lives in the footer chip only,
 *   which is where `FactDetail` draws it.
 */

/**
 * The bookkeeping keys a printed form's row carries; anything else is a cell
 * (`LOGKEYS`, :4664). A row with a cell makes the record a grid.
 *
 * **The design's set, exactly.** `valid_to` is NOT on it, and a printed row that
 * carried one would flip a paper form into grid mode — but that is the design's
 * behaviour rather than a conformance note's correction, and no entry in the
 * mock exercises it (`F-00014`'s retired row carries `valid_to` and cells both).
 * Recorded in the task report rather than quietly widened here.
 */
const LOG_KEYS = new Set([
  'key', 'title', 'unit', 'unit_raw', 'section', 'when', 'open', 'retired', 'note',
])

const hasGrid = (d: RecordData) =>
  (d.fields ?? []).length > 0
  && (d.rows ?? []).some((r) => Object.keys(r).some((k) => !LOG_KEYS.has(k)))

export function RecordCard({ bundle, onOpen }: {
  bundle: FactBundle; onOpen: (id: string) => void
}) {
  const { entry } = bundle
  if (!isRecordFact(entry)) return null
  const d = entry.data
  const grid = hasGrid(d)
  return (
    <>
      {grid && <RecordGrid bundle={bundle} data={d} />}
      {!grid && (d.fields ?? []).length > 0 && <ColumnsTable bundle={bundle} data={d} onOpen={onOpen} />}
      {!grid && (d.rows ?? []).length > 0 && <PrintedRows data={d} />}
      <StructureCard bundle={bundle} data={d} onOpen={onOpen} />
    </>
  )
}

/**
 * :1342 — the reference grid, whose whole subject is the colour of one cell.
 *
 * `--tile-c` / `--conflict` is a disputed cell, `--tile-warn` / `--conflict` an
 * unanswered one, and both are read out of `red_paths` (note 3).
 */
function RecordGrid({ bundle, data }: { bundle: FactBundle; data: RecordData }) {
  const fields = data.fields ?? []
  const rows = (data.rows ?? []).filter((r) => r.retired !== true)
  // :4666 — the row key becomes a column only when `primaryKey` does not
  // compose it; a composed key is already the row's title.
  const showRowKey = (data.primaryKey ?? []).length === 0
  const heading = rowCount((data.rows ?? []).length, rows.length)
  return (
    <DetailCard className="mt-s10">
      <CountBand>
        <span className="text-fs-sm font-bold text-ink">{heading}</span>
        {data.grain !== undefined && (
          <span className="text-fs-xs text-faint">{data.grain}</span>
        )}
        <span className="ms-auto text-fs-xxs text-faint">
          {label(SCREEN_LABELS, 'grid_legend')}
        </span>
      </CountBand>
      <FactGrid
        label={heading}
        // :4899 — `minmax(140px,1fr)` for the row key, `minmax(110px,1fr)` per
        // column. No token holds a track; see `FactsList`'s `TRACKS`.
        tracks={{
          gridTemplateColumns: (showRowKey ? 'minmax(140px,1fr) ' : '')
            + fields.map(() => 'minmax(110px,1fr)').join(' '),
        }}
        head={[
          ...(showRowKey ? [label(SCREEN_LABELS, 'row_key_column')] : []),
          ...fields.map((f) => columnHead(f)),
        ]}
        rows={rows.map((r) => ({
          key: String(r.key),
          cells: [
            ...(showRowKey
              ? [{
                node: <Mono className="text-fs-sm2 text-faint">{String(r.key ?? '')}</Mono>,
                className: 'bg-surface-sub',
              }]
              : []),
            ...fields.map((f) => cellOf(bundle, String(r.key ?? ''), f, r[f.key])),
          ],
        }))}
      />
    </DetailCard>
  )
}

/**
 * :4898 — the column's own title, with its unit beside it where they differ.
 *
 * **Two nodes, not one string.** The design writes `fl.title + ' · ' +
 * unitFa(fl.unit)` and gets two Persian words; here the unit is often the stored
 * SYMBOL, because `resolved` carries no unit titles and `RecordField` has no
 * `unit_title` — so «گرم · g» would be a latin run inside a Persian text node,
 * which is the bidi mix note 6 is about. The symbol is an island of its own.
 */
function columnHead(f: RecordField): ReactNode {
  const raw = f.unit_raw
  const symbol = f.unit ?? undefined
  if (raw !== undefined && raw !== f.title) return `${f.title} · ${raw}`
  if (raw === undefined && symbol !== undefined && symbol !== f.title) {
    return <>{f.title} · <Mono>{symbol}</Mono></>
  }
  return f.title
}

/** One grid cell — its ground, its ink and whether it is a latin island. */
function cellOf(
  bundle: FactBundle, rowKey: string, f: RecordField, value: unknown,
): GridCell {
  const red = redPath(bundle, `data/rows/${rowKey}/${f.key}`)
  const paint = red === 'disputed' ? 'bg-tile-c'
    : red === 'unknown' ? 'bg-tile-warn' : ''
  const ink = red !== undefined ? 'text-conflict font-extrabold' : 'text-ink font-semibold'
  const cls = `text-fs-sm2 block truncate ${ink}`

  if (value === null || value === undefined) {
    return { node: <span className={cls}>{unanswered()}</span>, className: paint }
  }
  const raw = String(value)
  // Note 2 — a `refItems` cell is the item's resolved title; the stored key is
  // the tooltip and never the cell's own text.
  if (f.refItems !== undefined) {
    const named = resolvedTitle(bundle, raw)
    return {
      node: named === undefined
        ? <Mono className={cls}>{raw}</Mono>
        : (
          <span className={cls}>
            {named.text}
            {named.code !== undefined && <>{' '}<Mono>{named.code}</Mono></>}
          </span>
        ),
      className: paint,
      title: raw,
    }
  }
  const numeric = raw !== '' && !Number.isNaN(Number(raw))
  return {
    node: numeric
      // QF-42 — a number is an LTR island in Latin digits.
      ? <Mono className={cls}>{raw}</Mono>
      : <span className={cls}>{raw}</span>,
    className: paint,
  }
}

/**
 * :1368 — the columns of a record with no grid, and the one place «واحد ثبت
 * نشده» is drawn.
 */
function ColumnsTable({ bundle, data, onOpen }: {
  bundle: FactBundle; data: RecordData; onOpen: (id: string) => void
}) {
  const fields = data.fields ?? []
  const heading = label(SCREEN_LABELS, 'column_count').replace('{n}', toFa(fields.length))
  return (
    <DetailCard className="mt-s10">
      <CountBand>
        <span className="text-fs-sm font-bold text-ink">{heading}</span>
        <span className="text-fs-xs text-faint">
          {[data.grain, data.cadence === undefined ? undefined : label(CADENCE_LABELS, data.cadence)]
            .filter((x) => x !== undefined).join(' · ')}
        </span>
      </CountBand>
      <FactGrid
        label={heading}
        tracks={PX.columnsGrid}
        head={[
          label(SCREEN_LABELS, 'column_title_head'),
          label(PAYLOAD_FIELD_LABELS, 'unit'),
          label(PAYLOAD_FIELD_LABELS, 'key'),
        ]}
        rowClassName="items-start"
        rows={fields.map((f) => {
          const derived = refTitle(bundle, f.derived)
          const notes = columnNotes(f)
          // Note 3 — the pill is red only where the SERVER says the unit is a
          // `null` leaf. An omitted unit is "not applicable" and draws «—».
          const missing = redPath(bundle, `data/fields/${f.key}/unit`) !== undefined
          return {
            key: f.key,
            cells: [
              {
                node: (
                  <div>
                    <div className="text-fs-body font-bold text-ink">{f.title}</div>
                    {notes !== '' && (
                      <div className="text-fs-caption text-muted leading-loose mt-s2
                                      [text-wrap:pretty]">{notes}</div>
                    )}
                    {derived !== undefined && (
                      <div className="flex items-baseline gap-s3 mt-s2 flex-wrap">
                        <span className="text-fs-caption text-muted">
                          {label(PAYLOAD_FIELD_LABELS, 'derived')}
                        </span>
                        <RefLink named={derived} onOpen={onOpen} className="text-fs-sm2" />
                      </div>
                    )}
                  </div>
                ),
              },
              {
                node: (
                  <div>
                    {missing
                      ? <Pill tone="danger">{label(SCREEN_LABELS, 'unit_missing')}</Pill>
                      : f.unit_raw !== undefined
                        // The source's own word for the unit, when it wrote one.
                        ? <Pill tone="violet2">{f.unit_raw}</Pill>
                        : f.unit == null
                          ? <span className="text-fs-sm2 text-muted">{none()}</span>
                          // …otherwise the stored symbol, as its own island
                          // (:4981's `unitDir`/`unitFont` switch, read through
                          // note 6: a symbol is latin and stays latin).
                          : <Pill tone="violet2"><Mono>{f.unit}</Mono></Pill>}
                    {f.type !== undefined && (
                      <div className="text-fs-xxs text-faint mt-s2">
                        {label(FIELD_TYPE_LABELS, f.type)}
                      </div>
                    )}
                  </div>
                ),
              },
              { node: <Mono className="block truncate text-fs-xxs text-muted">{f.key}</Mono> },
            ],
          }
        })}
      />
    </DetailCard>
  )
}

/**
 * :4986 — everything the design writes into a column's note line, as
 * `label: value` pairs.
 *
 * The design composes sentences («این ستون را {x} پر می‌کند», «مقادیر مجاز: …»);
 * conformance note 9 puts the words in `factsLabels.ts`, and Appendix D gives
 * each of these a field NAME rather than a sentence. So the note reads as the
 * field names it is made of, which is what the appendix decided.
 */
function columnNotes(f: RecordField): string {
  const L = (k: string) => label(PAYLOAD_FIELD_LABELS, k)
  const parts: string[] = []
  if (f.filled_by !== undefined) parts.push(`${L('filled_by')}: ${f.filled_by}`)
  if (f.refItems !== undefined) parts.push(L('refItems'))
  if (f.group?.title !== undefined) parts.push(`${L('group')}: ${f.group.title}`)
  if (f.constraints?.readOnly === true) parts.push(L('readOnly'))
  if (f.constraints?.required === true) parts.push(L('required'))
  if (f.constraints?.enum !== undefined) {
    parts.push(`${L('enum')}: ${f.constraints.enum.join(' · ')}`)
  }
  if (f.constraints?.minimum !== undefined) {
    parts.push(`${L('minimum')} ${toFa(f.constraints.minimum)}`)
  }
  if (f.constraints?.maximum !== undefined) {
    parts.push(`${L('maximum')} ${toFa(f.constraints.maximum)}`)
  }
  if (f.unit_raw !== undefined) parts.push(`${L('unit_raw')}: ${f.unit_raw}`)
  if (f.description !== undefined) parts.push(f.description)
  return parts.join(' · ')
}

/** :1402 — the items already printed on a paper form; the clerk fills the number. */
function PrintedRows({ data }: { data: RecordData }) {
  const rows = data.rows ?? []
  const sections = data.sections ?? []
  return (
    <DetailCard className="mt-s7">
      <div style={PX.head1620} className="border-b border-border-current">
        <div className="text-fs-body font-extrabold text-ink">
          {label(SCREEN_LABELS, 'heading_printed_rows')}
        </div>
        <div className="text-fs-sm2 text-muted leading-loose mt-s3 [text-wrap:pretty]">
          {label(SCREEN_LABELS, 'printed_rows_lede').replace('{n}', toFa(rows.length))}
        </div>
      </div>
      {rows.map((r) => {
        const unit = (r.unit_raw ?? r.unit) as string | undefined
        const section = sections.find((s) => s.key === r.section)?.title
          ?? (r.section as string | undefined)
        const when = r.when as string | undefined
        const open = r.open === true
        return (
          <div key={String(r.key)}
            style={r.retired === true ? { ...PX.row1420, ...PX.retired } : PX.row1420}
            className="border-b border-line-row">
            <div className="flex items-baseline gap-s5 flex-wrap">
              <span className="text-fs-lg font-bold text-ink">{String(r.title ?? r.key ?? '')}</span>
              {r.retired === true && (
                <Pill tone="danger">{label(SCREEN_LABELS, 'printed_row_retired')}</Pill>
              )}
            </div>
            {(unit !== undefined || section !== undefined || when !== undefined || open) && (
              <div style={{ ...PX.gap7, ...PX.mt9 }} className="flex flex-col">
                {unit !== undefined && (
                  <PrintedDetail text={label(SCREEN_LABELS, 'printed_row_unit')}>
                    <span className="text-fs-menu font-semibold text-ink">{unit}</span>
                    {r.unit !== undefined && (
                      <Mono className="text-fs-micro text-faint">{String(r.unit)}</Mono>
                    )}
                  </PrintedDetail>
                )}
                {section !== undefined && (
                  <PrintedDetail text={label(SCREEN_LABELS, 'printed_row_section')}>
                    <span className="text-fs-menu font-semibold text-ink">{section}</span>
                  </PrintedDetail>
                )}
                {when !== undefined && (
                  <PrintedDetail text={label(SCREEN_LABELS, 'printed_row_day')}>
                    <span className="text-fs-menu font-semibold text-warn-fg">
                      {label(SCREEN_LABELS, 'printed_row_day_value').replace('{n}', when)}
                    </span>
                  </PrintedDetail>
                )}
                {open && (
                  <PrintedDetail text={label(PAYLOAD_FIELD_LABELS, 'open')}>
                    <span className="text-fs-menu font-semibold text-violet">
                      {label(SCREEN_LABELS, 'printed_row_open_value')}
                    </span>
                  </PrintedDetail>
                )}
              </div>
            )}
          </div>
        )
      })}
    </DetailCard>
  )
}

function PrintedDetail({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div style={PX.gap9} className="flex items-baseline flex-wrap">
      <span style={PX.label104} className="flex-none text-fs-caption text-faint">{text}</span>
      {children}
    </div>
  )
}

/** :1448 — «ساختار و مکان جدول», which every record draws. */
function StructureCard({ bundle, data, onOpen }: {
  bundle: FactBundle; data: RecordData; onOpen: (id: string) => void
}) {
  const L = (k: string) => label(PAYLOAD_FIELD_LABELS, k)
  const loc = data.location ?? {}
  // Note 6 — the file name, the sheet or the authority; NEVER the spreadsheet id
  // beside a Persian word inside one LTR run. The id is in the footer chip.
  const where = loc.path !== undefined ? loc.path.split('/').pop()
    : loc.sheet !== undefined ? label(SCREEN_LABELS, 'location_sheet').replace('{n}', loc.sheet)
      : loc.identifier_scheme?.authority ?? none()
  const mirror = refTitle(bundle, data.mirror_of)
  return (
    <DetailCard className="mt-s7">
      <HeadBand>{label(SCREEN_LABELS, 'heading_record_structure')}</HeadBand>
      <LabelRow text={L('location')}>
        <span className="text-fs-menu font-semibold text-ink">{where}</span>
      </LabelRow>
      {data.grain !== undefined && (
        <LabelRow text={L('grain')}>
          {/* Ledger L-17 — the design's 1.95 normalises onto the long-form
              prose role, which is `--lh-loose`. */}
          <span className="text-fs-body text-ink leading-loose">{data.grain}</span>
        </LabelRow>
      )}
      <LabelRow text={L('cadence')}>
        <span className="text-fs-menu text-ink">
          {data.cadence === undefined ? none() : label(CADENCE_LABELS, data.cadence)}
        </span>
        {data.day_boundary !== undefined && (
          <span className="text-fs-caption text-faint">
            {label(SCREEN_LABELS, 'day_boundary_value').replace('{n}', data.day_boundary)}
          </span>
        )}
        {data.blank_master === true && (
          <Pill tone="violet" title={label(SCREEN_LABELS, 'blank_master_hint')}>
            {L('blank_master')}
          </Pill>
        )}
      </LabelRow>
      {(data.primaryKey ?? []).length > 0 && (
        <LabelRow text={L('primaryKey')}>
          <Mono className="text-fs-sm2 text-ink">{(data.primaryKey ?? []).join(' + ')}</Mono>
        </LabelRow>
      )}
      {data.approved_by !== undefined && (
        <LabelRow text={L('approved_by')}>
          <span className="text-fs-menu font-semibold text-ink">{data.approved_by}</span>
        </LabelRow>
      )}
      {(data.header_fields ?? []).length > 0 && (
        <div className="px-s9 py-s6 border-b border-line-row">
          <Eyebrow>{L('header_fields')}</Eyebrow>
          <div className="flex gap-s4 flex-wrap">
            {(data.header_fields ?? []).map((h) => (
              <span key={h.key}
                className="text-fs-sm font-semibold text-ink bg-surface-sub
                           border border-border-current px-s6 py-s3 rounded-control">
                {h.title ?? h.key}
              </span>
            ))}
          </div>
        </div>
      )}
      {(data.sections ?? []).length > 0 && (
        <div className="px-s9 py-s6 border-b border-line-row">
          <Eyebrow>{L('sections')}</Eyebrow>
          {(data.sections ?? []).map((s) => (
            <div key={s.key} className="flex items-center gap-s5 py-s3">
              <span className="text-fs-menu font-semibold text-ink">{s.title}</span>
              {s.doc_number_field !== undefined && (
                <span title={s.doc_number_field} className="text-fs-caption text-muted">
                  {label(SCREEN_LABELS, 'section_has_doc')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {(data.signatures ?? []).length > 0 && (
        <div className="px-s9 py-s6 border-b border-line-row">
          <Eyebrow>{L('signatures')}</Eyebrow>
          {(data.signatures ?? []).map((s) => (
            <div key={s.role} className="flex items-center gap-s5 py-s3">
              <span className="text-fs-menu font-semibold text-ink">{s.role}</span>
              {s.row_range !== undefined && (
                <span className="text-fs-caption text-muted">
                  {label(SCREEN_LABELS, 'signature_range').replace('{n}', toFa(s.row_range))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {data.movement !== undefined && (
        <div className="px-s9 py-s6 border-b border-line-row">
          <Eyebrow>{L('movement')}</Eyebrow>
          <div className="text-fs-body text-ink leading-loose">
            {label(SCREEN_LABELS, 'movement_value')
              .replace('{n}', refTitle(bundle, data.movement.from)?.text ?? none())
              .replace('{m}', refTitle(bundle, data.movement.to)?.text ?? none())
              .replace('{r}', data.movement.reason ?? none())}
          </div>
        </div>
      )}
      {data.mirror_of !== undefined && (
        <LabelRow text={L('mirror_of')}>
          <RefLink named={mirror} onOpen={onOpen} className="text-fs-menu" />
        </LabelRow>
      )}
      {(data.foreignKeys ?? []).length > 0 && (
        <div className="px-s9 py-s6 border-b border-line-row">
          <Eyebrow>{L('foreignKeys')}</Eyebrow>
          {(data.foreignKeys ?? []).map((fk) => (
            <div key={fk.fields.join('+')} style={PX.rowY7}
              className="flex items-center gap-s4 flex-wrap">
              <Mono className="text-fs-xs text-body-ink">{fk.fields.join(' + ')}</Mono>
              <RefLink named={refTitle(bundle, fk.reference)} onOpen={onOpen}
                className="text-fs-sm">
                <Mono className="text-fs-xxs text-faint">
                  {(fk.reference_fields ?? []).join(' + ')}
                </Mono>
              </RefLink>
            </div>
          ))}
        </div>
      )}
      {(data.reconciled_against ?? []).length > 0 && (
        <div className="px-s9 py-s6">
          <Eyebrow>{L('reconciled_against')}</Eyebrow>
          {(data.reconciled_against ?? []).map((r, i) => {
            const row = r.cell.row === undefined ? undefined : rowTitle(bundle, r.cell.row)
            const column = (data.fields ?? []).find((f) => f.key === r.cell.field)?.title
            return (
              <div key={i} style={PX.rowY7} className="flex items-center gap-s4 flex-wrap">
                <span className="text-fs-sm font-semibold text-ink">
                  {[row?.text, column].filter((x) => x !== undefined).join(' › ')}
                </span>
                <RefLink named={refTitle(bundle, r.against)} onOpen={onOpen}
                  className="text-fs-sm" />
              </div>
            )
          })}
        </div>
      )}
    </DetailCard>
  )
}
