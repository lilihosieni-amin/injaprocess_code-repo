import type { ReactNode } from 'react'
import {
  CADENCE_LABELS, FIELD_TYPE_LABELS, PAYLOAD_FIELD_LABELS, SCREEN_LABELS,
  cellLabel, label,
} from '../../lib/factsLabels'
import { toFa } from '../../lib/format'
import {
  isRecordFact, type FactBundle, type RecordData, type RecordField,
} from '../../api/types'
import { redPath, refTitle, resolvedTitle, rowCount, rowTitle } from '../bundle'
import {
  CELL_TRUNCATE, CountBand, DetailCard, Eyebrow, FactGrid, Filled, HeadBand, LabelRow, Mono,
  PX, Pill, RefLink,
  none, unanswered, type GridCell,
} from './parts'

/**
 * The `record` kind — `Inja Panel.dc.html:1342-1552`.
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
 * (`LOGKEYS`, :4663). A row with a cell makes the record a grid.
 *
 * **The design's set, exactly.** `valid_to` is NOT on it, and a printed row that
 * carried one would flip a paper form into grid mode — but that is the design's
 * behaviour rather than a conformance note's correction, and no entry in the
 * mock exercises it (`F-00014`'s retired row carries `valid_to` and cells both).
 * Recorded in the task report rather than quietly widened here.
 *
 * **`unit_title` is the same trap, and it is the one this build has ASKED for.**
 * A row's unit symbol has no served Persian (report §13.6 row 27); serving
 * `rows[].unit_title` is the fix, and the day it is served every printed row
 * gains a key this set does not know, so `F-00011` and `F-00012` become grids of
 * mostly-«؟» cells. It is deliberately not pre-added: `unit_title` is already a
 * real COLUMN key in the estate (`F-00017`'s FOURTH field — `symbol`,
 * `dimension`, `factor_to_base`, `unit_title`), so putting it here
 * would widen the very coincidence-of-names hazard §5.9's proposed note is
 * about. Whoever serves the field adds it here in the same change — which is
 * why the request in the report says so rather than leaving it to be found.
 */
const LOG_KEYS = new Set([
  'key', 'title', 'unit', 'unit_raw', 'section', 'when', 'open', 'retired', 'note',
])

/**
 * Whether the record's rows are DATA (a grid) or printed items on a form.
 *
 * The design's `recHasGrid` (:4667) is a three-way disjunct and this is two of
 * the three: `r.cells` is a shape no served entry uses, and
 * `Object.keys(r).some(k => !LOGKEYS[k])` is the general test — a row with any
 * non-bookkeeping key is a data row.
 *
 * **The third disjunct is deliberately not here, and `F-00012` is why.**
 * `recFieldKeys.some(k => r[k] !== undefined)` asks "does this row have a value
 * for a declared column", which is a strict subset of the general test EXCEPT
 * where a column key happens to be spelled like a bookkeeping key. `F-00012`
 * («درخواست کالا بخش کانتر آشپزخانه») is exactly that: a paper request form
 * whose columns include one keyed `unit`, and whose printed rows each carry a
 * bookkeeping `unit`. Under the design's own expression that coincidence of
 * names makes the form a grid — four rows by five columns, four of them «؟» —
 * and suppresses «قلم‌های چاپ‌شده روی فرم» entirely. Pinned by
 * `RecordCard.test.tsx`'s *reads a paper form with a column keyed `unit`…* so
 * the divergence is asserted rather than argued.
 */
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
        // Owner's correction, 2026-09-06: a value sits in the middle of its
        // column. Every cell here is one value, which is what makes this grid
        // (and the decision table) the two the correction applies to.
        align="center"
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
  const cls = `text-fs-sm2 ${CELL_TRUNCATE} ${ink}`

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
  if (numeric) {
    // QF-42 — a number is an LTR island in Latin digits.
    return { node: <Mono className={cls}>{raw}</Mono>, className: paint }
  }
  // :4912 — the design runs every non-numeric cell through `enumFa`, and this
  // is the second of that function's two sites. `F-00017` («واحدها») is the
  // entry that proves it matters: its `dimension` column holds `mass`,
  // `volume`, `count`, `pack`, `duration`, `money` and `dimensionless`, which
  // reached a Persian-only screen as seven English words.
  //
  // An id-shaped column stays latin — a symbol or a key is a code (QF-42), and
  // `cellLabel` would leave it alone anyway; the island is what says so.
  if (ID_COLUMNS.has(f.key)) return { node: <Mono className={cls}>{raw}</Mono>, className: paint }
  const named = cellLabel(raw)
  return {
    // :4913 — `latin`: a value no map covers stays an LTR island rather than a
    // latin run inside an RTL text node (QF-42), which is the same rule the
    // `refItems` branch above keeps for an unresolved key.
    node: named === raw && LATIN_VALUE.test(raw)
      ? <Mono className={cls}>{raw}</Mono>
      : <span className={cls}>{named}</span>,
    className: paint,
    // :4914 — the stored value is the cell's tooltip wherever the label differs
    // from it. It is the only place the machine value survives on a translated
    // cell: «بسته» has to be able to say `pack`, exactly as the `refItems`
    // branch shows the item key behind a resolved title.
    title: named === raw ? undefined : raw,
  }
}

/** :4913 — the design's own test for "this text is still a machine value". */
const LATIN_VALUE = /^[a-z_0-9.\-+]+$/i

/** :4909 — the columns whose cells are machine identifiers, not words. */
const ID_COLUMNS = new Set(['symbol', 'key', 'code', 'id'])

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
                    {/* :1393 — this one is NOT the screen's pill: the design
                        draws it `2px 8px` at `--radius-badge`, which is `Tag`'s
                        geometry at the badge radius rather than `Pill`'s
                        `999px`. Drawn through `Pill` it also took `Pill`'s
                        11.5px where the design writes 12.5, which is how the
                        shape mismatch surfaced. */}
                    {missing
                      ? <UnitBadge tone="bg-tile-c text-conflict">
                        {label(SCREEN_LABELS, 'unit_missing')}
                      </UnitBadge>
                      : f.unit_raw !== undefined
                        // The source's own word for the unit, when it wrote one.
                        ? <UnitBadge tone="bg-tile-v2 text-violet">{f.unit_raw}</UnitBadge>
                        : f.unit == null
                          ? <span className="text-fs-sm2 text-muted">{none()}</span>
                          // …otherwise the stored symbol, as its own island
                          // (:4981's `unitDir`/`unitFont` switch, read through
                          // note 6: a symbol is latin and stays latin).
                          : <UnitBadge tone="bg-tile-v2 text-violet">
                            <Mono>{f.unit}</Mono>
                          </UnitBadge>}
                    {f.type !== undefined && (
                      <div className="text-fs-xxs text-faint mt-s2">
                        {label(FIELD_TYPE_LABELS, f.type)}
                      </div>
                    )}
                  </div>
                ),
              },
              { node: <Mono className={`${CELL_TRUNCATE} text-fs-xxs text-muted`}>{f.key}</Mono> },
            ],
          }
        })}
      />
    </DetailCard>
  )
}

/** :1393 — the columns table's own unit box: `12.5px/700`, `2px 8px`, at
 *  `--radius-badge`. Local to this card, because it is the one site the design
 *  draws it and it is a different shape from the screen's pill. */
function UnitBadge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center py-half px-s4 rounded-badge
                      text-fs-sm2 font-bold ${tone}`}>
      {children}
    </span>
  )
}

/** :4943 — «۱ تا ۵». The hyphen is a latin range operator and the design
 *  replaces it before the digits are converted. */
function rowRange(range: string): string {
  const [from, to] = range.split('-')
  return to === undefined
    ? toFa(range)
    : label(SCREEN_LABELS, 'range_to').replace('{n}', toFa(from)).replace('{m}', toFa(to))
}

/**
 * :4983 — everything the design writes into a column's note line, as
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
    // A column's allowed values are the same open vocabulary its CELLS hold, so
    // they take the same map — «مقادیر مجاز: جرم · حجم», never the seven English
    // words `F-00017`'s `dimension` column declares. No served entry reaches
    // this line today (`F-00017` has cells, so it is drawn as a grid rather than
    // as a columns table), which is exactly why it is pinned by a test.
    parts.push(`${L('enum')}: ${f.constraints.enum.map(cellLabel).join(' · ')}`)
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
        // :4934 — the source's own word for the unit, else the stored symbol.
        const unitRaw = r.unit_raw as string | undefined
        const symbol = r.unit as string | undefined
        const unit = unitRaw ?? symbol
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
                    {/* **TWO nodes, as the design draws them** (:1419-1420): the
                        unit phrase, and the raw symbol beside it as a 10.5px
                        mono LTR hint. The hint is the design's own element and
                        an earlier round deleted it on the columns table's rule
                        — «never both» belongs to that ONE-node cell (:4981 →
                        :1393) and was never this row's. `F-00012`'s `burger_box`
                        and `cup_lid` are the two rows it cost: «کارتن ۱۰۰تایی»
                        with `carton` nowhere on the screen.
                        The phrase itself: `unit_raw` when the source wrote one,
                        otherwise the stored symbol as its own island. The design
                        writes `unit_raw || UNIT_FA[unit] || unit` (:4934) and
                        note 2 deletes that inline map; its sanctioned
                        replacement is the units record's `unit_title`, which the
                        bundle does not carry for a ROW — `RecordField` has
                        `unit_raw`, `rows[]` has neither, and
                        `RuleInput`/`RuleOutput` both have `unit_title`. Filed in
                        the report as the one served-shape gap this screen has.
                        The hint is then skipped for exactly the case where it
                        would repeat the phrase verbatim (`F-00012`'s
                        `staff_sugar`, `pack` with no `unit_raw`) — that is one
                        string drawn once, not the deleted element. */}
                    {unitRaw !== undefined
                      ? <span className="text-fs-menu font-semibold text-ink">{unitRaw}</span>
                      : <Mono className="text-fs-menu font-semibold text-ink">{symbol}</Mono>}
                    {unitRaw !== undefined && symbol !== undefined && (
                      <Mono className="text-fs-micro text-faint">{symbol}</Mono>
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
                    {/* :4932 — the day is Persian. `F-00012`'s `staff_sugar`
                        holds `"when": "thursday"`, which the design maps through
                        its inline `WD`; unmapped it reads «فقط thursday‌ها». */}
                    <span className="text-fs-menu font-semibold text-warn-fg">
                      {label(SCREEN_LABELS, 'printed_row_day_value')
                        .replace('{n}', cellLabel(when))}
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

/** :1450 — «ساختار و مکان جدول», which every record draws. */
function StructureCard({ bundle, data, onOpen }: {
  bundle: FactBundle; data: RecordData; onOpen: (id: string) => void
}) {
  const L = (k: string) => label(PAYLOAD_FIELD_LABELS, k)
  const loc = data.location ?? {}
  // Note 6 — the file name, the sheet or the authority; NEVER the spreadsheet id
  // beside a Persian word inside one LTR run. The id is in the footer chip.
  //
  // **Every one of the three is a stored value, and none is reliably Persian**:
  // a path's last segment is `photo.jpg`, a sheet is `Pizza` as often as
  // «پیتزا», and the only authority in the estate is `Sepidz`. So each is drawn
  // through the same rule the rest of this screen keeps — `Filled` for a value
  // inside a sentence, `Mono` for a value standing alone.
  const where = loc.path !== undefined
    ? <Mono className="text-fs-menu font-semibold text-ink">{loc.path.split('/').pop()}</Mono>
    : loc.sheet !== undefined
      ? (
        <Filled text={label(SCREEN_LABELS, 'location_sheet')} values={{ n: loc.sheet }}
          className="text-fs-menu font-semibold text-ink" />
      )
      : loc.identifier_scheme?.authority !== undefined
        ? (
          <Mono className="text-fs-menu font-semibold text-ink">
            {loc.identifier_scheme.authority}
          </Mono>
        )
        : <span className="text-fs-menu font-semibold text-ink">{none()}</span>
  // :4955 — `sfRecLocExtra`'s SECOND half. Note 6 deletes its first («شناسهٔ
  // فایل {spreadsheetId}», the bidi mix); «قالب {format}» keeps the Persian word
  // and islands the format string, which is the SAME mix one field over —
  // `F-00018` (the Sepidz till) drew «قالب receipt number», two English words at
  // a Persian prose node.
  const format = loc.identifier_scheme?.format
  const mirror = refTitle(bundle, data.mirror_of)
  // **Owner report, 2026-09-06:** every stored `foreignKeys` member is an
  // import descriptor — `{spreadsheetId, sheet, range, target}` — where the
  // spec's `{fields, reference, …}` (:903) belongs, and the row below joined
  // `fk.fields` unguarded, so the mirrors would not open at all. The content
  // pass refuses that shape now; a member with neither side describes no join,
  // so it is skipped rather than half-drawn — a row naming no columns and no
  // table is worse than its absence. This is the same never-raise reading every
  // other value on this screen already gets.
  const foreignKeys = (data.foreignKeys ?? []).filter(
    (fk) => Array.isArray(fk?.fields) && fk.fields.length > 0 && fk.reference?.ref,
  )
  return (
    <DetailCard className="mt-s7">
      <HeadBand>{label(SCREEN_LABELS, 'heading_record_structure')}</HeadBand>
      <LabelRow text={L('location')}>
        {where}
        {format !== undefined && (
          <Filled text={label(SCREEN_LABELS, 'location_format')} values={{ n: format }}
            className="text-fs-micro text-faint" />
        )}
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
          // **The design disagrees with itself here and this picks a side.**
          // `sfRecBoundary` (:4957) is the raw string, while `sfRecSigs.range`
          // (:4943) runs the same kind of number through `toFa` — so «۰۱:۱۵» and
          // «۱ تا ۵» could not both be the design's rule.
          //
          // The rule taken, stated against QF-42: Latin digits are for a VALUE,
          // a code, a key or a formula — what a reader copies or types, and what
          // an island is around. A number inside a Persian sentence is prose,
          // and this screen has sent those through `toFa` since round 1
          // («{n} ردیف», «صفحهٔ ۱۱», «خط ۷۴», «ردیف ۱ تا ۵»). A closing time in a
          // sentence is the second kind. The two rows now agree, and the latin
          // run leaves the prose without needing an island.
          <span className="text-fs-caption text-faint">
            {label(SCREEN_LABELS, 'day_boundary_value').replace('{n}', toFa(data.day_boundary))}
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
                {/* :4938 writes `x.title || keyFa(x.key)`; note 2 deletes
                    `KEY_FA`, so a header field the estate never titled falls
                    back to its latin key — and a key is an island, not Persian
                    prose. Every header field in the mock carries a title, so
                    this is the class closed rather than an instance fixed. */}
                {h.title ?? <Mono>{h.key}</Mono>}
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
                // :4943 — the design replaces the hyphen with « تا », so a
                // reviewer reads «ردیف ۱ تا ۵ را امضا می‌کند» rather than a
                // latin range operator inside a Persian sentence.
                <span className="text-fs-caption text-muted">
                  {label(SCREEN_LABELS, 'signature_range').replace('{n}', rowRange(s.row_range))}
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
      {foreignKeys.length > 0 && (
        <div className="px-s9 py-s6 border-b border-line-row">
          <Eyebrow>{L('foreignKeys')}</Eyebrow>
          {foreignKeys.map((fk) => (
            <div key={fk.fields.join('+')} style={PX.rowY7}
              className="flex items-center gap-s4 flex-wrap">
              <Mono className="text-fs-xs text-body-ink">{fk.fields.join(' + ')}</Mono>
              {/* :1532 — the relation mark between the two sides. A directional
                  glyph in a data row, not an icon standing in for one. */}
              <span aria-hidden className="text-fs-xxs text-faint">←</span>
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
                {/* :1545 — the machine cell beside its Persian name, as the
                    small mono hint §17 allows. */}
                <Mono className="text-fs-nano text-faint">
                  {[r.cell.row, r.cell.field].filter((x) => x !== undefined).join(' › ')}
                </Mono>
                {/* :1546 — «this cell is reconciled AGAINST that constant». */}
                <span aria-hidden className="text-fs-xxs text-faint">↔</span>
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
