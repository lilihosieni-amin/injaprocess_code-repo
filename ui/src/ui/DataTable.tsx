import type { ReactNode } from 'react'
import { Card } from './Card'

export interface DataColumn<Row> {
  key: string
  /** Empty for a column whose head carries no label (the status dot, the chevron). */
  head: string
  /** One CSS grid track: '16px' | '1.4fr' | '34px'. */
  track: string
  cell: (row: Row) => ReactNode
  /** `false` drops the column at ≤760px, where the grid collapses (§6.7). */
  mobile?: boolean
}

export interface DataTableProps<Row> {
  /** F11 — every table needs a name; the design gives none, so the screen does. */
  label: string
  columns: DataColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Stated, never a blank grid. */
  empty: string
  /**
   * Present ⇒ the rows open something, so the shell is a `grid` and each row is
   * focusable. Absent ⇒ a plain `table` and no row invites a click. R5: a list
   * never renders a row it would then refuse to open, so the screen decides
   * this per person, not per screen.
   */
  onOpen?: (row: Row) => void
  rowLabel?: (row: Row) => string
  /** §9.7 c — the design fills the head on one of its three tables. */
  headFill?: boolean
  filters?: ReactNode
  pager?: ReactNode
}

/**
 * The head and every row are laid on the same tracks, which is the whole point
 * of the object: a column is declared once and the head and the cells cannot
 * come to disagree about where it starts.
 *
 * R8 — ONE padding per role, not three per screen. The design draws the head at
 * 13/12/12 across its three tables, the row at 14/13/13 and the gap at 14/12/12;
 * dominant usage wins, so the head is `--space-6`, the row `--pad-table-row-y`
 * and the gap `--space-6` everywhere. The visible cost, stated rather than
 * buried: the users table loses 1px at the top and bottom of its head and 2px
 * of gap against what the design draws for that one instance. The owner asked
 * for one rule per role, and a per-instance padding would be the three back.
 */
const LINE = 'grid items-center gap-s6 px-s9'

/**
 * At ≤760px the row stops being a grid and becomes a flex line (§6.7). The head
 * carries none of this: it is gone at that width, and a `max760:flex` on
 * something that also says `max760:hidden` would leave which one wins to
 * Tailwind's output order.
 *
 * The 11px gap is the one value here the token layer does not name — every
 * 11px token it holds (`--gap-tick-row`, `--pad-option-y`, `--pad-note-x`) is
 * minted for another component's role, and this task may not add a thirteenth.
 * Reported rather than borrowed.
 */
const COLLAPSE = 'max760:flex max760:gap-[11px] max760:p-s7'

const HEAD = `${LINE} py-s6 border-b border-border-current max760:hidden`

/**
 * R8 — the design's `.14s` row-hover is the only use of that number in 4018
 * lines and is a token nowhere, so the hover runs at `--duration` (.16s) like
 * every other transition in the app. There is no `duration-*` class for it and
 * none can exist: Tailwind keeps `DEFAULT` out of that scale, and a bare
 * `transition-…` already emits the theme's default duration.
 */
const ROW = `${LINE} py-table-row-y ${COLLAPSE} border-b border-line-row transition-[background]`

export function DataTable<Row>({
  label, columns, rows, rowKey, empty, onOpen, rowLabel,
  headFill = false, filters, pager,
}: DataTableProps<Row>) {
  const template = { gridTemplateColumns: columns.map((c) => c.track).join(' ') }
  const openable = onOpen !== undefined
  return (
    // §5.2 — the shell is the card, at the 18px radius: the white surface, the
    // near-invisible violet hairline and the two-layer neutral shadow that does
    // the work on the violet field. `overflow-hidden` is what makes the head
    // fill and the row rules stop at that radius.
    <Card
      radius="doc"
      className="overflow-hidden"
      role={openable ? 'grid' : 'table'}
      aria-label={label}
    >
      {filters !== undefined && (
        <div className="flex flex-wrap gap-s4 px-s9 py-s7 bg-tile-v4 border-b border-border-current">
          {filters}
        </div>
      )}
      <div
        data-r-thead
        role="row"
        style={template}
        className={`${HEAD} ${headFill ? 'bg-tile-v4' : ''}`}
      >
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className="text-fs-xs font-bold text-muted">{c.head}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p data-r-empty className="m-0 px-empty-x py-empty-y-inline text-center text-fs-sm text-faint">{empty}</p>
      ) : (
        rows.map((row) => (
          <div
            key={rowKey(row)}
            data-r-trow
            role="row"
            style={template}
            aria-label={openable && rowLabel ? rowLabel(row) : undefined}
            tabIndex={openable ? 0 : undefined}
            onClick={openable ? () => onOpen(row) : undefined}
            onKeyDown={
              openable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row) }
                  }
                : undefined
            }
            className={`${ROW} ${openable ? 'cursor-pointer hover:bg-surface-sub' : ''}`}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                data-col={c.key}
                role={openable ? 'gridcell' : 'cell'}
                className={`min-w-0 ${c.mobile === false ? 'max760:hidden' : ''}`}
              >
                {c.cell(row)}
              </div>
            ))}
          </div>
        ))
      )}
      {pager}
    </Card>
  )
}
