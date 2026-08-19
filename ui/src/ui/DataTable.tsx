import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Card } from './Card'

interface DataColumnBase<Row> {
  key: string
  /** Empty for a column whose head carries no label (the status dot, the chevron). */
  head: string
  cell: (row: Row) => ReactNode
  /** `false` drops the column at ≤760px, where the grid collapses (§6.7). */
  mobile?: boolean
}

/** A column that carries its own track, for a table with no minted template. */
export interface DataColumn<Row> extends DataColumnBase<Row> {
  /** One CSS grid track: '16px' | '1.4fr' | '34px'. */
  track: string
}

/**
 * A column in a table laid out by `template`. It has no `track`, and the type
 * says so rather than a comment: `track?: never` is what makes the two forms
 * mutually exclusive at the call site.
 */
export interface TemplatedColumn<Row> extends DataColumnBase<Row> {
  track?: never
}

/**
 * The three grid templates the theme mints — `--grid-users`, `--grid-audit`,
 * `--grid-activity` — named as the classes that carry them.
 *
 * Written out rather than assembled from the key because a reader grepping for
 * `grid-cols-audit` should land here, and for no stronger reason than that.
 * The earlier claim on this docstring — that an assembled name "is invisible to
 * Tailwind's scanner and would emit nothing" — was false for this repo:
 * tailwind.config.js puts ./tailwind-probe.txt in `content` and all three live
 * there, so all three are built whatever this file spells. The R11 guard in
 * src/test/theme.test.ts does not read this file's TEXT either; it renders the
 * component and reads the class off the element.
 */
const TEMPLATE = {
  users: 'grid-cols-users',
  audit: 'grid-cols-audit',
  activity: 'grid-cols-activity',
} as const

export type GridTemplate = keyof typeof TEMPLATE

interface DataTableBase<Row> {
  /** F11 — every table needs a name; the design gives none, so the screen does. */
  label: string
  rows: Row[]
  rowKey: (row: Row) => string
  /** Stated, never a blank grid. */
  empty: string
  /** §9.7 c — the design fills the head on two of its three tables. */
  headFill?: boolean
  filters?: ReactNode
  pager?: ReactNode
}

/**
 * Where the tracks come from — and they come from exactly one place.
 *
 * An inline `gridTemplateColumns` always beats a class, so a table that passed
 * both would silently ignore the template while still naming it. The two are
 * therefore alternatives in the TYPE: `template` columns cannot carry a `track`
 * and a `track` table cannot name a `template`, so a caller cannot express the
 * disagreement in the first place and nothing has to police it afterwards.
 */
type Tracks<Row> =
  | { columns: DataColumn<Row>[]; template?: never }
  | { columns: TemplatedColumn<Row>[]; template: GridTemplate }

/**
 * `onOpen` is what makes a row openable — R5: a list never renders a row it
 * would then refuse to open, so the screen decides this per person, not per
 * screen. Present ⇒ the shell is a `grid` and each row is focusable; absent ⇒ a
 * plain `table` and no row invites a click.
 *
 * A focusable row with no accessible name is a tab stop a screen reader can
 * only announce as "row", so `rowLabel` is not optional once `onOpen` is
 * given — again in the type, because "remember to pass both" is the kind of
 * documentation twenty-one later call sites read once.
 */
type Opening<Row> =
  | { onOpen?: never; rowLabel?: never }
  | { onOpen: (row: Row) => void; rowLabel: (row: Row) => string }

export type DataTableProps<Row> = DataTableBase<Row> & Tracks<Row> & Opening<Row>

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
 * The 11px gap HAS a name, and this file was writing it out. `--gap-table-row-
 * mobile` ("the <=760px table row gap") was minted for exactly this line and
 * exactly this role — not borrowed from one of the eight other 11px tokens,
 * each of which is another component's — and the class was never written, so it
 * sat on `theme.test.ts`'s PENDING ledger as an orphan while its one consumer
 * spelled the number instead. Both halves of that are now closed.
 */
const COLLAPSE = 'max760:flex max760:gap-table-row-mobile max760:p-s7'

const HEAD = `${LINE} py-s6 border-b border-border-current max760:hidden`

/**
 * R8 — the design's `.14s` row-hover is the only use of that number in 4018
 * lines and is a token nowhere, so the hover runs at `--duration` (.16s) like
 * every other transition in the app. There is no `duration-*` class for it and
 * none can exist: Tailwind keeps `DEFAULT` out of that scale, and a bare
 * `transition-…` already emits the theme's default duration.
 */
const ROW = `${LINE} py-table-row-y ${COLLAPSE} border-b border-line-row transition-[background]`

/**
 * Controls inside a cell that own their own click. Task 19's users row draws a
 * chevron in its last column and its screens will put menus and toggles in
 * others; without this, one press on such a control both works it AND opens the
 * row behind it, which is a navigation the reader did not ask for.
 */
const INTERACTIVE =
  'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="menuitem"],[contenteditable="true"]'

export function DataTable<Row>({
  label, columns, rows, rowKey, empty, onOpen, rowLabel,
  headFill = false, filters, pager, template,
}: DataTableProps<Row>) {
  // Exactly one of the two, never both: an inline style would win over the
  // class, so the templated form must not emit one at all.
  const style = template === undefined
    ? { gridTemplateColumns: (columns as DataColumn<Row>[]).map((c) => c.track).join(' ') }
    : undefined
  const tracks = template === undefined ? '' : TEMPLATE[template]
  const openable = onOpen !== undefined
  return (
    // §5.2 — the shell is the card, at the 18px radius: the white surface, the
    // near-invisible violet hairline and the two-layer neutral shadow that does
    // the work on the violet field. `overflow-hidden` is what makes the head
    // fill and the row rules stop at that radius.
    <Card data-r-tshell radius="doc" className="overflow-hidden">
      {/* The filter bar, the empty line and the pager are siblings of the
          table, not children of it. A `role="table"`/`grid` may hold rows and
          rowgroups; a filter bar full of comboboxes and a pager full of buttons
          are neither, and `role="presentation"` does not launder them because
          it is dropped from anything focusable. Nesting them changed nothing
          visible and left every interactive control in this component sitting
          in a table structure that cannot describe it. */}
      {filters !== undefined && (
        <div
          data-r-tfilters
          // The design's filter bar exactly (`:1516`, `:1635`): a wrapping flex
          // line, centred, 8px gap, 14/18 padding, --tile-v4 over a
          // --border-current rule. At ≤760 it becomes a stretched column.
          className={
            'flex items-center flex-wrap gap-s4 px-s9 py-s7 bg-tile-v4 border-b border-border-current ' +
            'max760:flex-col max760:items-stretch'
          }
        >
          {filters}
        </div>
      )}
      <div role={openable ? 'grid' : 'table'} aria-label={label}>
        <div
          data-r-thead
          role="row"
          style={style}
          className={`${HEAD} ${tracks} ${headFill ? 'bg-tile-v4' : ''}`}
        >
          {columns.map((c) => (
            // `min-w-0` on the head span as well as on the body cell: a grid
            // item's automatic minimum size is its content, so a `1fr` track
            // holding an unbreakable string resolves WIDER than 1fr. Set on one
            // and not the other, the head and the body compute their tracks by
            // different rules and drift apart — which is precisely the
            // disagreement this component's docstring promises cannot happen.
            <span
              key={c.key}
              data-headcol={c.key}
              role="columnheader"
              className="min-w-0 text-fs-xs font-bold text-muted"
            >
              {c.head}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            data-r-trow
            role="row"
            style={style}
            aria-label={openable ? rowLabel(row) : undefined}
            tabIndex={openable ? 0 : undefined}
            onClick={
              openable
                ? (e: MouseEvent<HTMLDivElement>) => {
                    const control = (e.target as HTMLElement).closest<HTMLElement>(INTERACTIVE)
                    if (control && e.currentTarget.contains(control)) return
                    onOpen(row)
                  }
                : undefined
            }
            onKeyDown={
              openable
                ? (e: KeyboardEvent<HTMLDivElement>) => {
                    // The row is the tab stop; a key pressed on a control
                    // inside it belongs to that control and bubbles to here.
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row) }
                  }
                : undefined
            }
            className={`${ROW} ${tracks} ${openable ? 'cursor-pointer hover:bg-surface-sub' : ''}`}
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
        ))}
      </div>
      {rows.length === 0 && (
        <p data-r-empty className="m-0 px-empty-x py-empty-y-inline text-center text-fs-sm text-faint">
          {empty}
        </p>
      )}
      {pager}
    </Card>
  )
}
