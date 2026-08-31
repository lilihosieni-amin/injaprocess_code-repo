import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { Card } from '../../ui/Card'
import { SCREEN_LABELS, label } from '../../lib/factsLabels'
import type { Named } from '../bundle'

/**
 * The pieces every card of the fact detail is built out of, and the one place
 * this screen writes a value the token set does not hold.
 *
 * ## Where the numbers come from
 *
 * `docs/superpowers/plans/facts-design-audit.md` §1.2 and the design's own
 * markup (`ui/design/Inja Panel.dc.html:1107-1750`), never memory. Audit §2
 * resolves every colour the section paints to a token, and those are written as
 * classes.
 *
 * ## `PX` — the values nothing holds
 *
 * Every entry below is a length the design draws that no token in
 * `src/styles/tokens.css` or the four frozen `_ds` files carries, and that this
 * task **may not mint** (audit §2.1: that list is the owner's). They are written
 * inline, exactly as drawn, rather than rounded to the nearest `--space-*` rung
 * — `src/facts/FactsList.tsx` opened the same escape hatch for the same reason
 * (its `gap:7px` and its six grid tracks), and guard F6 scans class strings, hex
 * and `rgb(`, none of which this is.
 *
 * **What is NOT here, because a call site already sanctioned the rounding:**
 *
 * * a **pill** is `py-s1 px-s5` (4×10). The design draws `4px 11px` (the header
 *   chips, :1112), `3px 10px` (the status pills, :1188) and `4px 12px` (the item
 *   category, :1560) for one role, which R8 makes a defect rather than three
 *   roles. `src/ui/Accordion.tsx:99-104` already normalised `3px 10px` onto this
 *   exact pair, with its own note that the 3px rung does not exist and that
 *   ledger P3-4 put the department card's chips here.
 * * an **inline tag** inside a row is `py-half px-s4` (2×8) — the columns
 *   table's own unit pill (:1385) drawn exactly, and the I/O pills' `2px 9px`
 *   (:1288) normalised onto it, one rung away.
 * * a **table shell band** is `px-s9 py-s7` (18×14) — `src/ui/DataTable.tsx`'s
 *   `LINE`, which R8 already fixed for the head of every table in the app, and
 *   which `FactsList.tsx` cites for the design's own `13px 18px`.
 * * an **eyebrow's gap** is `mb-s4` (8px). The design draws 8 six times
 *   (:1481, :1490, :1503, :1516, :1528, :1541) and 9 twice (:1267, :1592);
 *   R8 resolves that by dominance.
 * * `underline-offset-4` for the design's `text-underline-offset:3px` —
 *   `FactsList.tsx`'s clear-filters link, same offset, same reason.
 * * a **prose leading of `1.95` or `2`** is `leading-loose` (1.9). Ledger L-17
 *   names both values by number and normalises them onto the long-form prose
 *   role. `2.1` is `--lh-looser` exactly and needs nothing.
 */
export const PX = {
  /** :1109 — the detail column. `--width-doc` is 860 and `--width-summary` 960. */
  column: { maxWidth: '880px' } as CSSProperties,
  /** :1111 / :1120 — the header chip row's gutter, and the tick's. */
  gap9: { gap: '9px' } as CSSProperties,
  /** :1415 — the printed-row detail column. */
  gap7: { gap: '7px' } as CSSProperties,
  /** :1120 — the confirm tick's box. */
  tick: { padding: '11px 16px' } as CSSProperties,
  /** :1128 — the statement card. */
  statement: { padding: '20px 22px' } as CSSProperties,
  /** :1129 — the eyebrow's gap to the sentence under it. */
  eyebrowGap: { marginBottom: '9px' } as CSSProperties,
  /** :1130 — the statement's leading. L-17's census names 1.95 and 2, not this. */
  statementLh: { lineHeight: '2.15' } as CSSProperties,
  /** :1119 — the detail title's leading. */
  titleLh: { lineHeight: '1.55' } as CSSProperties,
  /** :1133 / :1156 — a rule inside a card, and the block it separates. */
  pt13: { paddingTop: '13px' } as CSSProperties,
  /** :1163 — the constant's second sub-row. */
  mt11: { marginTop: '11px' } as CSSProperties,
  /** :1267 / :1595 — a chip button, and an item's pack chip. */
  chip7: { padding: '7px 12px' } as CSSProperties,
  /** :1711 — one source row. */
  sourceRow: { padding: '11px 18px' } as CSSProperties,
  /** :1143 — the constant card. 24px has one owner in tokens.css: the dialog. */
  card24: { padding: '24px' } as CSSProperties,
  /** :1148 — the constant's numeral. `--fs-numeral` is 46px, a different role. */
  bigValue: { fontSize: '44px' } as CSSProperties,
  /** :1178 — the formula block. */
  formula: { padding: '18px 20px' } as CSSProperties,
  /** :1185 / :1344 / :1370 — a counted table's head band. */
  band: { padding: '15px 18px' } as CSSProperties,
  /** :1196 / :1357 / :1379 — one body cell of a grid. */
  cell: { padding: '11px 12px' } as CSSProperties,
  /** :1404 — the printed-rows card's head. */
  head1620: { padding: '16px 20px' } as CSSProperties,
  /** :1409 / :1606 — a printed-form row, and the item's tracked block. */
  row1420: { padding: '14px 20px' } as CSSProperties,
  /** :1567 — an item row. */
  row1320: { padding: '13px 20px' } as CSSProperties,
  /** :1558 — the item card's head. */
  head1820: { padding: '18px 20px' } as CSSProperties,
  /** :1675 — the accounts card. */
  accounts: { padding: '20px' } as CSSProperties,
  /** :1531 / :1544 — a foreign-key and a reconciliation row. */
  rowY7: { paddingBlock: '7px' } as CSSProperties,
  /** :1291 / :1626 — the gap under a title line. */
  mt7: { marginTop: '7px' } as CSSProperties,
  /** :1415 — the printed row's detail block. */
  mt9: { marginTop: '9px' } as CSSProperties,
  /** :1410 — a retired printed row. */
  retired: { opacity: '.55' } as CSSProperties,
  /** :1721 — the process row's name cell. */
  procName: { minWidth: '110px' } as CSSProperties,
  /** :1372 / :1377 — the columns table. */
  columnsGrid: { gridTemplateColumns: '1.6fr .8fr 1fr' } as CSSProperties,
  /** :1659 / :1663 — the edge-cases table. */
  edgesGrid: { gridTemplateColumns: '1fr 1fr 1.2fr' } as CSSProperties,
  /**
   * The five label-column widths the design pins on a `flex:none` span. None is
   * on the `--space-*` ladder and none has a token of any kind.
   */
  label70: { width: '70px' } as CSSProperties,    // :1157 — the constant's rows
  label96: { width: '96px' } as CSSProperties,    // :1320 — the output sub-rows
  label104: { width: '104px' } as CSSProperties,  // :1419 — the printed-row rows
  label110: { width: '110px' } as CSSProperties,  // :1568 — the item rows
  label120: { width: '120px' } as CSSProperties,  // :1219 — every other card
  /**
   * The three translucent whites on the violet header (:1112, :5067, :5069).
   *
   * Written as a mix of `--card` with `transparent` rather than as an `rgba()`
   * literal, which guard F6 forbids outright. This is the design's own value and
   * not a value chosen here: the audit reads the three as white at 16 / 8 / 20
   * percent, `--card` **is** the pure white they are mixed from, and the
   * percentage is the design's.
   * Nothing is minted — all three are on the audit's `UNTOKENISED` list for the
   * owner, and no token in any family can approximate a translucent fill.
   */
  chipOnField: { background: 'color-mix(in srgb, var(--card) 16%, transparent)' } as CSSProperties,
  tickRedChip: { background: 'color-mix(in srgb, var(--card) 8%, transparent)' } as CSSProperties,
  tickRedOuter: { borderColor: 'color-mix(in srgb, var(--card) 20%, transparent)' } as CSSProperties,
  /** :1128 — the statement card's 4px violet edge, on the inline start. */
  statementEdge: { borderInlineStart: '4px solid var(--violet)' } as CSSProperties,
} as const

/**
 * A detail card — the design's `border-radius:20px` white surface with the card
 * hairline and the two-layer neutral shadow, which `Card` already is.
 *
 * `overflow-hidden` by default: every one of these clips a head fill or a row
 * rule to the radius (:1185, :1214, :1343). The two that do not — the statement
 * (:1128) and the accounts card (:1673) — are padded boxes with nothing to clip.
 */
export function DetailCard({ radius = 'feature', clip = true, className = '', children, ...rest }:
  { radius?: 'feature' | 'doc'; clip?: boolean; children: ReactNode }
  & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <Card radius={radius} className={`${clip ? 'overflow-hidden ' : ''}${className}`} {...rest}>
      {children}
    </Card>
  )
}

/**
 * A card's title band — `padding:14px 18px`, `12px/700` ink on `--tile-v4` over
 * the `--border-current` rule (:1214, :1449, :1657).
 */
export function HeadBand({ children }: { children: ReactNode }) {
  return (
    <div className="px-s9 py-s7 text-fs-caption font-bold text-ink bg-tile-v4
                    border-b border-border-current">
      {children}
    </div>
  )
}

/**
 * The head band of a counted table — «{n} ردیف» and what stands beside it
 * (:1344, :1370, :1184). A wrapping flex line at `--space-5`, over the same rule.
 */
export function CountBand({ children }: { children: ReactNode }) {
  return (
    <div style={PX.band}
      className="flex items-center gap-s5 flex-wrap border-b border-border-current">
      {children}
    </div>
  )
}

/**
 * One `label · value` row — the shape almost every card of this screen repeats
 * (:1216, :1244, :1450, :1566). `padding:12px 18px` over `--line-row`, a
 * `--space-7` gutter, and a `flex:none` label at the card's own column width.
 */
export function LabelRow({ text, width = PX.label120, last = false, className = '', children }: {
  text: string
  width?: CSSProperties
  /** The last row of a card draws no rule under it. */
  last?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex items-center gap-s7 px-s9 py-s6 flex-wrap
                     ${last ? '' : 'border-b border-line-row'} ${className}`}>
      <span style={width} className="flex-none text-fs-sm2 text-muted">{text}</span>
      {children}
    </div>
  )
}

/**
 * A latin run — a key, a code, a formula, a path — kept in the order it was
 * stored in (§8, QF-42).
 *
 * **The screen's one `dir` island**, deliberately: every mono run on the detail
 * goes through here, so `guards.test.ts`'s `ISLANDS` names this file and not
 * eight card files. `Statement` below is the second and last, and it is here for
 * the same reason.
 */
export function Mono({ className = '', title, style, children }: {
  className?: string; title?: string; style?: CSSProperties; children: ReactNode
}) {
  return (
    <span dir="ltr" title={title} style={style} className={`font-mono ${className}`}>
      {children}
    </span>
  )
}

/**
 * A run that is Persian prose or a latin run, decided by what is in it (:1687).
 *
 * An account's `statement` is verbatim source text: «ببینید مصرف اعلامیشون…»
 * from a transcript, or `=MINUS(SUM(F6,E6),G6)` from a cell. The design chooses
 * the direction and the family from whether the string holds Persian, and so
 * does this.
 */
export function Statement({ text, className = '' }: { text: string; className?: string }) {
  const persian = /[؀-ۿ]/.test(text)
  return (
    <div dir={persian ? 'rtl' : 'ltr'} className={`${persian ? '' : 'font-mono '}${className}`}>
      {text}
    </div>
  )
}

/**
 * A neighbour's name — a link when the caller may open it, plain text when they
 * may not.
 *
 * R5: never draw a control you would refuse. A masked neighbour
 * («خارج از دسترسی شما») and one whose id the route does not serve — an item
 * key; see `Named.id` — are both drawn as text, so nothing on this screen
 * invites a press that would 404.
 */
export function RefLink({ named, onOpen, className = 'text-fs-body', children }: {
  named: Named | undefined
  onOpen?: (id: string) => void
  /** The run's own type size — the design draws this link at five of them. */
  className?: string
  /** Trailing content inside the line — the design puts the raw ref beside it. */
  children?: ReactNode
}) {
  if (named === undefined) return null
  const id = named.restricted ? undefined : named.id
  // §17 — the estate code rides beside an item's title, as its own island.
  const code = named.code === undefined ? null
    : <Mono className="text-fs-micro text-faint">{named.code}</Mono>
  if (id === undefined || onOpen === undefined) {
    return (
      <span className="inline-flex items-baseline gap-s3 min-w-0">
        <span className={`font-bold ${named.restricted ? 'text-muted' : 'text-ink'} ${className}`}>
          {named.text}
        </span>
        {code}
        {children}
      </span>
    )
  }
  return (
    <span className="inline-flex items-baseline gap-s3 min-w-0">
      <button type="button" onClick={() => onOpen(id)}
        className={`border-0 bg-transparent p-0 cursor-pointer font-sans text-start
                    font-bold text-violet underline decoration-dotted
                    underline-offset-4 ${className}`}>
        {named.text}
      </button>
      {code}
      {children}
    </span>
  )
}

/** The six pill tones the facts detail paints, resolved to tokens by audit §2. */
const TONE = {
  violet: 'bg-tile-v text-violet',       // the kind chip, the nature pill (:1152)
  quiet: 'bg-tile-v2 text-muted',        // «به ازای هر …» (:1153)
  violet2: 'bg-tile-v2 text-violet',     // an input's unit, a share (:1288, :1318)
  danger: 'bg-tile-c text-conflict',     // «بازنشسته», «واحد ثبت نشده» (:1116, :1385)
  warn: 'bg-tile-warn text-warn-fg',     // an aggregate, a tombstone (:1189, :1723)
  ok: 'bg-tile-ok text-green',           // an output's unit (:1315)
} as const

export type Tone = keyof typeof TONE

/** A pill — see `PX`'s note on why one padding serves the design's three. */
export function Pill({ tone, title, children }: {
  tone: Tone; title?: string; children: ReactNode
}) {
  return (
    <span title={title}
      className={`inline-flex items-center flex-none py-s1 px-s5 rounded-pill
                  text-fs-xs font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  )
}

/** The smaller pill that sits inside a run of type — a unit, a share (:1288). */
export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center flex-none py-half px-s4 rounded-pill
                      text-fs-caption font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  )
}

/** A card's small section label — `12.5px/--text-muted` (:1267, :1481). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-fs-sm2 text-muted mb-s4">{children}</div>
}

/** One cell of a `FactGrid`. */
export interface GridCell {
  node: ReactNode
  /** Paint for the cell box — the record grid's red and amber states. */
  className?: string
  title?: string
}

/**
 * The grid the decision table, the record grid, the columns table and the
 * edge-cases table are all drawn on (:1191, :1350, :1372, :1659).
 *
 * **Extracted rather than copied a third time.** `DataTable` cannot serve them:
 * it puts the padding on the ROW and gives a cell no ground of its own, and the
 * record grid's whole subject is a per-cell background (note 3). This is the
 * shape those four share — one track list, a `--tile-v4` head, `11px 12px` cells
 * over `--line-row` — and nothing else in the app draws it.
 */
export function FactGrid({
  label: name, tracks, head, rows, headFill = 'bg-tile-v4', rowClassName = '',
}: {
  label: string
  tracks: CSSProperties
  head: ReactNode[]
  rows: { key: string; cells: GridCell[] }[]
  /** :1662 — the edge-cases head is `--surface-sub`, not `--tile-v4`. */
  headFill?: string
  rowClassName?: string
}) {
  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label={name} className="min-w-full">
        <div role="row" style={tracks}
          className={`grid min-w-full ${headFill} border-b border-border-current`}>
          {head.map((cell, i) => (
            <span key={i} role="columnheader"
              className="px-s6 py-s5 text-fs-xxs font-bold text-muted whitespace-nowrap text-start">
              {cell}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.key} role="row" style={tracks}
            className={`grid min-w-full border-b border-line-row ${rowClassName}`}>
            {row.cells.map((cell, i) => (
              <div key={i} role="cell" title={cell.title} style={PX.cell}
                className={`min-w-0 overflow-hidden ${cell.className ?? ''}`}>
                {cell.node}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** «—» — a field the entry does not carry. Not «؟», which is a leaf the source
 *  never answered; the design draws the two differently and so does this. */
export const none = () => label(SCREEN_LABELS, 'value_none')

/** «؟» — a leaf the source never answered (:4842, :4909). */
export const unanswered = () => label(SCREEN_LABELS, 'value_unknown')

/**
 * A field's own Persian name, and the latin key beside it — conformance note 2.
 *
 * `title` is what the entry itself calls the field (`inputs[].title`,
 * `outputs[].title`, `fields[].title`); the design reached for a `KEY_FA`
 * dictionary instead (:4696). Where the entry gives no title there is no Persian
 * to show and the key stands alone as an island, which §17 permits — it is the
 * same case as `expr`.
 */
export function FieldName({ title, name, className = 'text-fs-body-lead' }: {
  title?: string; name: string; className?: string
}) {
  if (title === undefined || title === '') {
    return <Mono className={`${className} font-bold text-ink`}>{name}</Mono>
  }
  return (
    <>
      <span className={`${className} font-bold text-ink`}>{title}</span>
      <Mono className="text-fs-micro text-faint">{name}</Mono>
    </>
  )
}
