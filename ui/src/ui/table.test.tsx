import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import {
  DataTable,
  type DataColumn,
  type DataTableProps,
  type TemplatedColumn,
} from './DataTable'
import { Pager } from './Pager'
import { Dialog } from './Overlay'
import { expectExpandedHitArea } from '../test/a11y'

/*
 * A test file, and src/test/theme.test.ts's R11 scan proves it never reads one
 * by looking for this marker in every file it does read. Its predecessor pinned
 * the same thing with `expect(written('w-touch')).toBe(false)` — and `w-touch`
 * is F11's 44px floor utility, which Task 11 onward will legitimately write, so
 * the first honest use of it turned two unrelated tests red.
 *
 *   marker: zz-only-a-test-file-writes-this
 */

interface Row { id: string; name: string; role: string }

const ROWS: Row[] = [
  { id: '09120000001', name: 'سحر بیات', role: 'ادیتور' },
  { id: '09120000002', name: 'رضا کریمی', role: 'خواننده' },
]

// §6.7 — the users grid, exactly: status dot · نام · نقش · سرپرست · دپارتمان · chevron.
const COLUMNS: DataColumn<Row>[] = [
  { key: 'dot', head: '', track: '16px', cell: () => <span data-dot /> },
  { key: 'name', head: 'نام', track: '1.4fr', cell: (r) => r.name },
  { key: 'role', head: 'نقش', track: '1fr', cell: (r) => r.role },
  { key: 'sup', head: 'سرپرست', track: '1.1fr', cell: () => '—', mobile: false },
  { key: 'dept', head: 'دپارتمان', track: '1fr', cell: () => 'سالن', mobile: false },
  { key: 'go', head: '', track: '34px', cell: () => null },
]

/** The same six columns with the tracks taken out — the templated form. */
const TEMPLATED: TemplatedColumn<Row>[] = COLUMNS.map((c) => ({
  key: c.key, head: c.head, cell: c.cell, mobile: c.mobile,
}))

describe('DataTable', () => {
  it('lays the head and every row on the same six tracks', () => {
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="کاربری با این نام پیدا نشد" />,
    )
    const tracks = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
      .map((el) => el.style.gridTemplateColumns)
    expect(tracks).toEqual(Array(3).fill('16px 1.4fr 1fr 1.1fr 1fr 34px'))
  })

  it('writes every head label, once, over the column it belongs to', () => {
    // Three separate claims, none of which anything else in this file made.
    // `{[...columns].reverse().map(…)}` on the head alone put all six labels
    // over the wrong columns and stayed green; `columns.slice(0, 5)` put five
    // labels over six tracks and stayed green; and printing `c.key` instead of
    // `c.head` headed a Persian table `dot name role sup dept go` in Latin and
    // stayed green. Order, COUNT and TEXT, read off the rendered element.
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    const head = container.querySelector('[data-r-thead]') as HTMLElement
    const cells = Array.from(head.children) as HTMLElement[]
    expect(cells.map((e) => e.dataset.headcol)).toEqual(COLUMNS.map((c) => c.key))
    expect(cells.map((e) => e.textContent)).toEqual(COLUMNS.map((c) => c.head))
    // …and the body is laid on the same order, for the same reason: a row whose
    // cells came out reversed sits under the head it disagrees with.
    for (const row of Array.from(container.querySelectorAll<HTMLElement>('[data-r-trow]'))) {
      expect(Array.from(row.children).map((e) => (e as HTMLElement).dataset.col))
        .toEqual(COLUMNS.map((c) => c.key))
    }
  })

  it('is a plain table, and no row invites a click, when nothing may be opened', () => {
    // R5 — a list never renders a row it would then refuse to open.
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    expect(screen.getByRole('table', { name: 'کاربران' })).toBeInTheDocument()
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0)
    // …and the three claims the name actually makes, which the line above does
    // not: `role='cell'` instead of `gridcell` passes it, and so does a
    // `tabIndex={0}` on every row. A row that opens nothing is not a tab stop,
    // carries no name, and is not a pointer target.
    expect(screen.queryAllByRole('cell')).toHaveLength(COLUMNS.length * ROWS.length)
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-r-trow]'))
    expect(rows).toHaveLength(ROWS.length)
    for (const row of rows) {
      expect(row).not.toHaveAttribute('tabindex')
      expect(row).not.toHaveAttribute('aria-label')
      expect(row.className).not.toMatch(/cursor-pointer/)
    }
  })

  it('becomes a keyboard-reachable grid when rows open', async () => {
    const opened: string[] = []
    render(
      <DataTable
        label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی"
        onOpen={(r) => opened.push(r.id)} rowLabel={(r) => `پروندهٔ ${r.name}`}
      />,
    )
    expect(screen.getByRole('grid', { name: 'کاربران' })).toBeInTheDocument()
    // Every cell of an openable table is a `gridcell`, not a `cell`: the two
    // are different roles and only one of them belongs inside a grid.
    expect(screen.queryAllByRole('gridcell')).toHaveLength(COLUMNS.length * ROWS.length)
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
    const row = screen.getByRole('row', { name: 'پروندهٔ سحر بیات' })
    expect(row).toHaveAttribute('tabindex', '0')
    row.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(screen.getByRole('row', { name: 'پروندهٔ رضا کریمی' }))
    expect(opened).toEqual(['09120000001', '09120000002'])
  })

  it('leaves a control inside a cell to its own click, and does not open behind it', async () => {
    // Task 19's users row draws a chevron in its last column. Without a guard,
    // one press works the control AND opens the row behind it.
    const onOpen = vi.fn()
    const pressed = vi.fn()
    const withButton: DataColumn<Row>[] = [
      ...COLUMNS.slice(0, -1),
      { key: 'go', head: '', track: '34px', cell: () => <button type="button" onClick={pressed}>باز</button> },
    ]
    render(
      <DataTable
        label="کاربران" columns={withButton} rows={ROWS} rowKey={(r) => r.id} empty="خالی"
        onOpen={onOpen} rowLabel={(r) => `پروندهٔ ${r.name}`}
      />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'باز' })[0])
    expect(pressed).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()

    // The guard is about controls, not about the row: a click on a plain cell
    // still opens it, which `e.target === e.currentTarget` would have broken.
    await userEvent.click(screen.getAllByText('سحر بیات')[0])
    expect(onOpen).toHaveBeenCalledOnce()

    // …and a key pressed on that control belongs to the control alone.
    onOpen.mockClear()
    screen.getAllByRole('button', { name: 'باز' })[0].focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('states the emptiness rather than drawing an empty grid', () => {
    render(<DataTable label="کاربران" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty="کاربری با این نام پیدا نشد" />)
    expect(screen.getByText('کاربری با این نام پیدا نشد')).toBeInTheDocument()
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })

  it('keeps the filter bar, the empty line and the pager out of the table structure', () => {
    // A `role="table"`/`grid` may hold rows and rowgroups. A filter bar full of
    // comboboxes and a pager full of buttons are neither, and `presentation`
    // does not launder them because it is dropped from anything focusable.
    const { container } = render(
      <DataTable
        label="کاربران" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty="خالی"
        filters={<button type="button">فیلتر</button>}
        pager={<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />}
      />,
    )
    const table = screen.getByRole('table', { name: 'کاربران' })
    for (const child of Array.from(table.children)) {
      expect(child.getAttribute('role')).toBe('row')
    }
    for (const sel of ['[data-r-tfilters]', '[data-r-empty]', '[data-r-pager]']) {
      const el = container.querySelector(sel)
      expect(el, sel).not.toBeNull()
      expect(table.contains(el), `${sel} is inside role="table"`).toBe(false)
    }
  })

  it('hides the head and drops the two wide columns at 760px', () => {
    // §6.7 — at ≤760px the head goes, the row becomes a flex line, and the
    // department and supervisor columns are dropped rather than squeezed.
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    const head = container.querySelector('[data-r-thead]') as HTMLElement
    expect(head.className).toMatch(/\bmax760:hidden\b/)
    const dropped = container.querySelectorAll('[data-col="sup"], [data-col="dept"]')
    // Two dropped columns in EVERY row, not two cells in the table: `data-col`
    // is on the body cells, and the head's own two are inside a head that is
    // hidden whole at this width. The brief asked for 2 here, which is the
    // count for a one-row table and passes only if the two columns are dropped
    // from the first row and left in the second.
    expect(dropped).toHaveLength(2 * ROWS.length)
    dropped.forEach((el) => expect(el.className).toMatch(/\bmax760:hidden\b/))
  })

  it('fills its head only when asked to', () => {
    const { container, unmount } = render(
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    expect(container.querySelector('[data-r-thead]')?.className).not.toMatch(/bg-tile-v4/)
    unmount()
    const filled = render(
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" headFill />,
    )
    expect(filled.container.querySelector('[data-r-thead]')).toHaveClass('bg-tile-v4')
  })
})

/* -------------------------------------------------------------------------
   Owner ruling R11 — the three minted templates are USED, not deleted.

   `--grid-users`, `--grid-audit` and `--grid-activity` are named by
   tailwind.config.js as `grid-cols-users`/`-audit`/`-activity`. The component
   built to lay tables out could not reach them, so the users template was
   written down twice: once in tokens.css and once as six `track` strings at the
   call site. `template` is the seam that closes that.
   ------------------------------------------------------------------------- */
describe('DataTable, laid out by a minted template', () => {
  it('writes the template class and NO inline template', () => {
    const { container } = render(
      <DataTable label="کاربران" columns={TEMPLATED} rows={ROWS} rowKey={(r) => r.id} empty="خالی" template="users" />,
    )
    const lines = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
    expect(lines).toHaveLength(1 + ROWS.length)
    for (const line of lines) {
      expect(line.className).toMatch(/\bgrid-cols-users\b/)
      // An inline `gridTemplateColumns` beats a class unconditionally, so a
      // template that sat BESIDE one would be named and ignored. This is the
      // assertion that says it replaces it.
      expect(line.style.gridTemplateColumns).toBe('')
    }
  })

  it('names the other two templates as themselves, not as one class with a hole in it', () => {
    for (const [template, klass] of [['audit', 'grid-cols-audit'], ['activity', 'grid-cols-activity']] as const) {
      const { container, unmount } = render(
        <DataTable label="ک" columns={TEMPLATED} rows={ROWS} rowKey={(r) => r.id} empty="خالی" template={template} />,
      )
      expect((container.querySelector('[data-r-thead]') as HTMLElement).className).toMatch(
        new RegExp(`\\b${klass}\\b`),
      )
      unmount()
    }
  })

  it('brings as many columns as the minted template has tracks', () => {
    // `template` decouples the column list from the track list, and nothing in
    // the TYPE can close that: the count lives in a CSS custom property.
    // `TEMPLATED.slice(0, 4)` with template="users" type-checks and renders
    // four cells over six tracks — two empty columns, no error anywhere.
    //
    // So the count is pinned against the token itself, for the one table this
    // task builds. Task 19 (users), the audit screen and the activity screen
    // each owe the same line for their own column list.
    const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
    const tracks = /--grid-users:\s*([^;]+);/.exec(tokens)![1].trim().split(/\s+/)
    expect(tracks).toHaveLength(6)
    expect(TEMPLATED).toHaveLength(tracks.length)

    const { container } = render(
      <DataTable label="ک" columns={TEMPLATED} rows={ROWS} rowKey={(r) => r.id} empty="خالی" template="users" />,
    )
    for (const line of Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))) {
      expect(line.children).toHaveLength(tracks.length)
    }
  })

  it('gives a track table no template class at all', () => {
    const { container } = render(
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    expect(container.innerHTML).not.toMatch(/grid-cols-/)
  })

  it('refuses, at compile time, the two shapes that could disagree', () => {
    // Not a runtime assertion: `@ts-expect-error` FAILS the type-check when the
    // line below stops being an error, which is how a type is tested. The
    // reviewer's warning was that `track` and `template` could come to
    // disagree; the answer is that a caller cannot write both down.
    const both = (
      // @ts-expect-error — a templated table's columns carry no `track`.
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r: Row) => r.id} empty="خ" template="users" />
    )
    // …and the same for a focusable row with no accessible name.
    const nameless = (
      // @ts-expect-error — `onOpen` without `rowLabel` ships nameless tab stops.
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r: Row) => r.id} empty="خ" onOpen={() => {}} />
    )
    expect([both, nameless].every(Boolean)).toBe(true)
  })
})

describe('Pager', () => {
  it('writes every number in Persian', () => {
    render(<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />)
    expect(screen.getByText('۱ تا ۵ از ۱۲')).toBeInTheDocument()
    expect(screen.getByText('صفحهٔ ۱ از ۳')).toBeInTheDocument()
  })

  it('refuses to step off either end', () => {
    const { unmount } = render(<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />)
    expect(screen.getByRole('button', { name: 'صفحهٔ قبلی' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'صفحهٔ بعدی' })).toBeEnabled()
    unmount()
    render(<Pager from={11} to={12} count={12} page={3} pages={3} onPage={() => {}} />)
    expect(screen.getByRole('button', { name: 'صفحهٔ بعدی' })).toBeDisabled()
  })

  it('steps', async () => {
    const seen: number[] = []
    render(<Pager from={6} to={10} count={12} page={2} pages={3} onPage={(p) => seen.push(p)} />)
    await userEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
    await userEvent.click(screen.getByRole('button', { name: 'صفحهٔ قبلی' }))
    expect(seen).toEqual([3, 1])
  })

  it('points each chevron at the page it will take you to, in a right-to-left row', () => {
    // The one thing in this component that no class-string test, no snapshot
    // and no build can see: an SVG `d`. Swapped, the two arrows point inward at
    // each other and each points at the page it will NOT open — a first-click
    // error every time, on the most-used control in three screens.
    //
    // The design draws exactly this in both its pagers
    // (design/Inja Panel.dc.html:1602 and :1720): «قبلی» is first in the DOM,
    // which in RTL is the RIGHT side, and the page before this one lies to the
    // right — so it points right. The row chevron (:1274) and the department
    // CTA (:257) are the same rule.
    const { container } = render(<Pager from={6} to={10} count={12} page={2} pages={3} onPage={() => {}} />)
    const d = (name: string) =>
      screen.getByRole('button', { name }).querySelector('path')!.getAttribute('d')

    expect(d('صفحهٔ قبلی')).toBe('M9 6l6 6-6 6')
    expect(d('صفحهٔ بعدی')).toBe('M15 6l-6 6 6 6')
    // Two lines that each pin a literal would both still pass if the component
    // drew one glyph twice and the labels moved instead, so the pairing is
    // asserted as a pairing: the labels are in this DOM order, and the glyphs
    // differ.
    expect(
      Array.from(container.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['صفحهٔ قبلی', 'صفحهٔ بعدی'])
    expect(d('صفحهٔ قبلی')).not.toBe(d('صفحهٔ بعدی'))
  })

  it('fades the glyph when disabled rather than hiding the control', () => {
    // §4.6 — "Disabled keeps its surface and fades the glyph to #cfc7e0;
    // controls are never hidden."
    render(<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />)
    expect(screen.getByRole('button', { name: 'صفحهٔ قبلی' })).toHaveClass('disabled:text-disabled')
  })

  it('keeps the 34px box the design draws and a 44px box the thumb can hit', () => {
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    expectExpandedHitArea(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
  })
})

/* -------------------------------------------------------------------------
   Everything above proves that a string was written into a class attribute.
   jsdom paints nothing, so it cannot tell `py-table-row-y` from `py-tabel-row-y`
   — an invented utility emits no rule and the build still exits 0, which is
   this project's signature defect — and it cannot tell which of two utilities
   setting the same property actually wins, because that is decided by
   Tailwind's output order and not by the order of the class string.

   So the block below runs the components' OWN rendered class strings through
   the real `tailwind.config.js` and asserts the declarations that come out.

   `paint` and `winner` are the two helpers src/ui/primitives.design.test.tsx
   already uses, copied rather than shared: they live inside a `.test.tsx` file,
   and importing that file from this one would register its whole suite a second
   time. Task 12 (which owns the design-conformance layer) is where they should
   be lifted into a module both files import.
   ------------------------------------------------------------------------- */

/** One emitted rule, split into the class that carries it and the state it applies in. */
type Painted = { klass: string; state: string; media: string; decls: string }

/** Compile a class string through the real `tailwind.config.js`. */
async function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const out: Painted[] = []
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this block exists to catch.
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    for (const sel of rule.selectors) {
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      out.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return out
}

/**
 * The winning value of `prop` for an element wearing these classes, in `state`
 * and at `media` — the LAST declaration in emitted order, which is how the
 * cascade resolves two utilities that set the same property. Returns `''` when
 * nothing sets it, so a missing declaration and an invented class fail alike.
 */
function winner(painted: Painted[], prop: string, state = '', media = ''): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== state || p.media !== media) continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

const R760 = '(max-width: 760px)'

/**
 * Render the table and hand back the class string of every part of it.
 *
 * `filters` and `pager` are slots, and a slot nothing ever renders is a class
 * string nothing ever compiles: `bg-tile-v4` → `bg-tile-v9` on the filter bar
 * survived the whole suite, and `bg-tile-v9` emits nothing at all. Both slots
 * go through here so `paint()` sees them.
 *
 * The cast is the harness', not the component's: `DataTableProps` is two unions
 * (tracks × openability) and `Partial<>` of their intersection flattens both.
 * The exclusivity that matters is asserted at a real call site by the two
 * `@ts-expect-error` cases above.
 */
function shell(props: Partial<DataTableProps<Row>> = {}) {
  const { container } = render(
    <DataTable<Row>
      {...({
        label: 'کاربران', columns: COLUMNS, rows: ROWS, rowKey: (r: Row) => r.id, empty: 'خالی',
        ...props,
      } as DataTableProps<Row>)}
    />,
  )
  const cls = (sel: string) => {
    const el = container.querySelector(sel)
    if (el === null) throw new Error(`shell(): nothing rendered for \`${sel}\``)
    return (el as HTMLElement).className
  }
  return {
    container,
    card: cls('[data-r-tshell]'),
    head: cls('[data-r-thead]'),
    row: cls('[data-r-trow]'),
    headcol: (key: string) => cls(`[data-headcol="${key}"]`),
    cell: (key: string) => cls(`[data-col="${key}"]`),
    filters: () => cls('[data-r-tfilters]'),
    pager: () => cls('[data-r-pager]'),
  }
}

describe('the compiler this block is asserted with', () => {
  // Every assertion below reads `winner()`, which returns '' both for "nothing
  // sets it" and for "the class was invented". If `paint()` silently produced
  // nothing, a `.not.toBe(…)` would pass over an empty sheet.
  it('resolves a real utility and nothing at all for an invented one', async () => {
    expect(winner(await paint('py-table-row-y'), 'padding-top')).toBe('var(--pad-table-row-y)')
    expect(winner(await paint('py-tabel-row-y'), 'padding-top')).toBe('')
  })
})

describe('what the table’s class strings compile to', () => {
  it('gives the head and the row one padding each, per R8’s ruling', async () => {
    const { head, row } = shell()
    const h = await paint(head)
    const r = await paint(row)
    // R8 — head 12px (--space-6), row 13px (--pad-table-row-y), gap 12px
    // (--space-6), gutter 18px (--space-9). One rule per role: the users table
    // loses 1px top and bottom and 2px of gap against what the design draws for
    // that one instance, which is the stated cost of not having three rules.
    expect(winner(h, 'padding-top')).toBe('var(--space-6)')
    expect(winner(h, 'padding-bottom')).toBe('var(--space-6)')
    expect(winner(r, 'padding-top')).toBe('var(--pad-table-row-y)')
    expect(winner(r, 'padding-bottom')).toBe('var(--pad-table-row-y)')
    expect(winner(h, 'gap')).toBe('var(--space-6)')
    expect(winner(r, 'gap')).toBe('var(--space-6)')
    // px-* is what Tailwind 3 emits for the inline gutter.
    expect(winner(h, 'padding-right')).toBe('var(--space-9)')
    expect(winner(r, 'padding-left')).toBe('var(--space-9)')
    // §6.7 — both lines centre their content on the cross axis. `items-start`
    // compiles just as happily and drops every short cell to the top of a row
    // sized by its tallest.
    expect(winner(h, 'align-items')).toBe('center')
    expect(winner(r, 'align-items')).toBe('center')
  })

  it('resolves the head and the body cells by the SAME track rule', async () => {
    // A grid item's automatic minimum size is its content, so a `1fr` track
    // holding an unbreakable string resolves wider than 1fr. `min-w-0` on the
    // body cell alone left the head computing its columns by a different rule
    // from the rows underneath — the one disagreement this component's own
    // docstring promises is impossible.
    const s = shell()
    for (const key of ['name', 'role', 'sup']) {
      expect(winner(await paint(s.headcol(key)), 'min-width'), `head ${key}`).toBe('0px')
      expect(winner(await paint(s.cell(key)), 'min-width'), `cell ${key}`).toBe('0px')
    }
  })

  it('sets the head’s type, weight and colour — its TEXT is pinned above', async () => {
    // design/Inja Panel.dc.html:1245 — 11.5px / 700 / #8a7db0. Three values,
    // three tokens, and every one of them compiles to something else if the
    // class is changed, with nothing else in the suite noticing.
    const h = await paint(shell().headcol('name'))
    expect(winner(h, 'font-size')).toBe('var(--fs-xs)')
    expect(winner(h, 'font-weight')).toBe('var(--fw-bold)')
    expect(winner(h, 'color')).toBe('var(--text-muted)')
  })

  it('keeps the card clipping its rows at the 18px radius', async () => {
    // The comment on the shell says `overflow-hidden` is what makes the head
    // fill and the row rules stop at the corner; deleting it changes nothing
    // any other test can see.
    const c = await paint(shell().card)
    expect(winner(c, 'overflow')).toBe('hidden')
    expect(winner(c, 'border-radius')).toBe('var(--radius-doc)')
  })

  it('collapses the row and drops the head at exactly 760px', async () => {
    const { head, row, cell } = shell()
    const h = await paint(head)
    const r = await paint(row)
    const sup = await paint(cell('sup'))
    const name = await paint(cell('name'))

    // The head is a grid on a desktop and gone below the breakpoint. Asserted
    // as `display: none` and not as the class name: `max760:flex` and
    // `max760:hidden` both land in this media block, and only Tailwind's
    // emitted order decides which one an element wearing both obeys.
    expect(winner(h, 'display')).toBe('grid')
    expect(winner(h, 'display', '', R760)).toBe('none')

    // The row becomes a flex line, and its `p-s7` has to beat the `py-…`/`px-…`
    // it is written to override — again a matter of emitted order, not class
    // order. `p-s7` is the `padding` SHORTHAND, which is why it resets all four
    // sides of a row whose base rule sets two of them by longhand; the media
    // block is emitted after every unprefixed utility, so it wins.
    expect(winner(r, 'display')).toBe('grid')
    expect(winner(r, 'display', '', R760)).toBe('flex')
    expect(winner(r, 'padding-top')).toBe('var(--pad-table-row-y)')
    expect(winner(r, 'padding', '', R760)).toBe('var(--space-7)')
    expect(winner(r, 'gap', '', R760)).toBe('11px')

    // Two columns are dropped, the other four are not.
    expect(winner(sup, 'display', '', R760)).toBe('none')
    expect(winner(name, 'display', '', R760)).toBe('')
  })

  it('hovers a row over the theme’s one duration, on the background alone', async () => {
    const { row } = shell({ onOpen: () => {}, rowLabel: (r) => r.name })
    const r = await paint(row)
    // R8 — the design's .14s is a token nowhere else in 4018 lines; the row
    // hover runs at --duration like every other transition in the app. There is
    // no `duration-*` class for it: Tailwind keeps DEFAULT out of that scale,
    // and a bare `transition-…` already carries the theme's default duration.
    expect(winner(r, 'transition-property')).toBe('background')
    expect(winner(r, 'transition-duration')).toBe('var(--duration)')
    expect(winner(r, 'background-color', ':hover')).toBe('var(--surface-sub)')
    expect(winner(r, 'cursor')).toBe('pointer')
  })

  it('leaves a row that opens nothing without a hover or a pointer', async () => {
    const { row } = shell()
    const r = await paint(row)
    expect(winner(r, 'background-color', ':hover')).toBe('')
    expect(winner(r, 'cursor')).toBe('')
  })

  it('tints the head with the design’s own fill, and only when asked', async () => {
    expect(winner(await paint(shell().head), 'background-color')).toBe('')
    expect(winner(await paint(shell({ headFill: true }).head), 'background-color'))
      .toBe('var(--tile-v4)')
  })

  it('separates the head and the rows with the two hairlines the design names', async () => {
    const { head, row } = shell()
    const h = await paint(head)
    const r = await paint(row)
    // `border-b` sets the WIDTH of one edge and `border-<colour>` sets the
    // colour of all four; the other three widths are 0 from preflight, so only
    // the bottom paints. §4.3's sub-panel border under the head, §1.2's row
    // separator under each row — two different tokens for two different rules.
    expect(winner(h, 'border-bottom-width')).toBe('1px')
    expect(winner(h, 'border-color')).toBe('var(--border-current)')
    expect(winner(r, 'border-bottom-width')).toBe('1px')
    expect(winner(r, 'border-color')).toBe('var(--line-row)')
  })

  it('lays a templated table on the minted track list, and on nothing else', async () => {
    const { head, row } = shell({ columns: TEMPLATED, template: 'users' })
    for (const line of [await paint(head), await paint(row)]) {
      expect(winner(line, 'grid-template-columns')).toBe('var(--grid-users)')
    }
  })

  it('states an empty table at the inline padding minted for it', async () => {
    const { container } = render(
      <DataTable label="ک" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty="خالی" />,
    )
    const p = await paint((container.querySelector('[data-r-empty]') as HTMLElement).className)
    // --pad-empty-y-inline (44px) is the empty row INSIDE a table; --pad-empty-y
    // (48px) is the card variant, and they are not interchangeable.
    expect(winner(p, 'padding-top')).toBe('var(--pad-empty-y-inline)')
    expect(winner(p, 'padding-right')).toBe('var(--pad-empty-x)')
    expect(winner(p, 'font-size')).toBe('var(--fs-sm)')
    expect(winner(p, 'color')).toBe('var(--text-faint)')
    // The one line of an empty table sits under the middle of it, not at the
    // reading edge — the design's `text-align:center` on every empty state.
    expect(winner(p, 'text-align')).toBe('center')
  })
})

describe('what the table’s two SLOTS compile to', () => {
  // Rendered, not described. Until this block existed, `filters` and `pager`
  // were props no test ever passed, so their class strings never reached the
  // compiler: `bg-tile-v4` → `bg-tile-v9` survived 975 tests, and `bg-tile-v9`
  // emits nothing at all.
  const slots = () => shell({
    filters: <button type="button">دپارتمان</button>,
    pager: <Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />,
  })

  it('draws the filter bar the design draws (`:1516`, `:1635`)', async () => {
    const f = await paint(slots().filters())
    expect(winner(f, 'display')).toBe('flex')
    // The one value this bar had wrong: the design centres its controls, and a
    // filter bar of two different control heights left-hangs them without it.
    expect(winner(f, 'align-items')).toBe('center')
    expect(winner(f, 'flex-wrap')).toBe('wrap')
    expect(winner(f, 'gap')).toBe('var(--space-4)')
    expect(winner(f, 'padding-top')).toBe('var(--space-7)')
    expect(winner(f, 'padding-right')).toBe('var(--space-9)')
    expect(winner(f, 'background-color')).toBe('var(--tile-v4)')
    expect(winner(f, 'border-bottom-width')).toBe('1px')
    expect(winner(f, 'border-color')).toBe('var(--border-current)')
    // §6.16 — `[data-r-afilters]` becomes a stretched column at ≤760px.
    expect(winner(f, 'flex-direction', '', R760)).toBe('column')
    expect(winner(f, 'align-items', '', R760)).toBe('stretch')
  })

  it('draws the pager bar, and stacks it on a phone like every other data-r-stack', async () => {
    const p = await paint(slots().pager())
    expect(winner(p, 'display')).toBe('flex')
    expect(winner(p, 'align-items')).toBe('center')
    expect(winner(p, 'justify-content')).toBe('space-between')
    // Not reversed either: the count reads at the start of an RTL line and the
    // buttons at the end, and `flex-row-reverse` swaps them with nothing else
    // in the suite noticing.
    expect(winner(p, 'flex-direction')).toBe('')
    expect(winner(p, 'gap')).toBe('var(--space-6)')
    expect(winner(p, 'padding-top')).toBe('var(--space-7)')
    expect(winner(p, 'padding-right')).toBe('var(--space-9)')
    // design/Inja Panel.dc.html:45 — `[data-r-stack]` is a stretched column at
    // ≤760px, and both design pagers sit in one.
    expect(winner(p, 'flex-direction', '', R760)).toBe('column')
    expect(winner(p, 'align-items', '', R760)).toBe('stretch')
  })
})

describe('what the pager’s class strings compile to', () => {
  const nav = () => {
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    return screen.getByRole('button', { name: 'صفحهٔ بعدی' }).className
  }

  /** The row the two buttons sit in, and the two glyphs inside them. */
  const parts = () => {
    const { container } = render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    const row = container.querySelector('[data-r-pagernav]')
    if (row === null) throw new Error('the pager draws no [data-r-pagernav] row')
    return {
      row: (row as HTMLElement).className,
      glyphs: Array.from(container.querySelectorAll('svg')).map((s) => s.getAttribute('class') ?? ''),
    }
  }

  it('never reverses the row the two arrows sit in', async () => {
    // F1's defect, re-entering one level up. `flex-row-reverse` here swaps the
    // two buttons on screen so each arrow again points at the page it will NOT
    // open — and it moves neither the DOM order, nor the `aria-label`, nor the
    // `d`, which are the only three things the chevron test reads. Visual order
    // is a compiled declaration, so it is asserted as one.
    const r = await paint(parts().row)
    expect(winner(r, 'flex-direction')).toBe('')
    expect(winner(r, 'flex-direction', '', R760)).toBe('')
    // …and the row itself, which nothing compiled before: `gap-s4` → `gap-s99`
    // emits nothing at all and the two buttons close up against each other.
    expect(winner(r, 'display')).toBe('flex')
    expect(winner(r, 'align-items')).toBe('center')
    expect(winner(r, 'gap')).toBe('var(--space-4)')
  })

  it('sizes both chevrons from the theme, inside a 34px button', async () => {
    // The SVGs carry no `width`/`height` ATTRIBUTE, so a dead size class does
    // not fall back to something a little wrong — it falls back to the replaced
    // element default of 300×150 and blows the 34px button apart. Both glyphs,
    // because only one of them is ever the one that was edited.
    const { glyphs } = parts()
    expect(glyphs).toHaveLength(2)
    for (const g of glyphs) {
      const s = await paint(g)
      expect(winner(s, 'width'), g).toBe('var(--size-chevron)')
      expect(winner(s, 'height'), g).toBe('var(--size-chevron)')
    }
    // …and the WEIGHT the design draws them at, which is not a class and so is
    // not in the two lines above. §8 gives the pager chevron 2.4; at 2 the two
    // arrows are visibly thinner than every other 15px chevron on the screen,
    // and nothing else in this file — or in the swap that moved both glyphs
    // into `Icon` — would say so.
    const { container } = render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    const strokes = Array.from(container.querySelectorAll('svg'))
      .map((s) => s.getAttribute('stroke-width'))
    expect(strokes).toEqual(['2.4', '2.4'])
  })

  it('draws the design’s 34px box and grows the target around it', async () => {
    const p = await paint(nav())
    expect(winner(p, 'width')).toBe('var(--size-pager)')
    expect(winner(p, 'height')).toBe('var(--size-pager)')
    // Never inflated: a `min-width`/`min-height` beats `width`/`height` and
    // silently turns the drawn control into a 44px one, which is the rule this
    // whole ladder exists to keep. `expectExpandedHitArea` resolves the same
    // three properties off the class list; this is the compiled counterpart,
    // and the reason that helper is allowed to stay synchronous.
    expect(winner(p, 'min-height')).toBe('')
    expect(winner(p, 'min-width')).toBe('')
    expect(winner(p, 'max-width')).toBe('')
    expect(winner(p, 'max-height')).toBe('')
    // Nothing clips the ::before back to the drawn box, and nothing takes the
    // pointer events off it — a 44px box that catches nothing is the failure
    // with no symptom.
    expect(winner(p, 'overflow')).toBe('')
    expect(winner(p, 'pointer-events')).toBe('')
    expect(winner(p, 'pointer-events', '::before')).toBe('')
    // …and the ::before is generated at all: `display:none`, `visibility:hidden`
    // and `transform:scale(0)` each leave the selector emitting and the box gone.
    expect(winner(p, 'display', '::before')).toBe('')
    expect(winner(p, 'visibility', '::before')).toBe('')
    expect(winner(p, 'transform', '::before')).toBe('')
    expect(winner(p, 'position')).toBe('relative')
    expect(winner(p, 'position', '::before')).toBe('absolute')
    expect(winner(p, 'inset', '::before')).toBe('-5px')
    // Tailwind routes `content` through its own custom property, so the value
    // to read is the one it sets, not the shorthand that reads it back.
    expect(winner(p, '--tw-content', '::before')).toBe('""')
    expect(winner(p, 'content', '::before')).toBe('var(--tw-content)')
  })

  it('fades the glyph and keeps the surface when it cannot step', async () => {
    const p = await paint(nav())
    // §4.6 — the surface stays, the glyph fades, the pointer goes.
    expect(winner(p, 'color')).toBe('var(--violet)')
    expect(winner(p, 'color', ':disabled')).toBe('var(--text-disabled)')
    expect(winner(p, 'background-color')).toBe('var(--card)')
    expect(winner(p, 'background-color', ':disabled')).toBe('')
    expect(winner(p, 'cursor')).toBe('pointer')
    expect(winner(p, 'cursor', ':disabled')).toBe('default')
    expect(winner(p, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(p, 'border-color')).toBe('var(--line)')
    expect(winner(p, 'border-radius')).toBe('var(--radius-control)')
  })

  it('holds the page label at the width that stops the row twitching', async () => {
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    const p = await paint(screen.getByText('صفحهٔ ۲ از ۳').className)
    expect(winner(p, 'min-width')).toBe('var(--width-page-label)')
    expect(winner(p, 'font-size')).toBe('var(--fs-sm2)')
    expect(winner(p, 'color')).toBe('var(--text-body)')
  })

  it('writes the count in the quieter of the two type roles', async () => {
    // design/Inja Panel.dc.html:1600 — 12px --text-muted, against the page
    // label's 12.5px/600 --text-body. Two different roles in one 34px-tall bar;
    // nothing else in the suite could tell them apart.
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    const p = await paint(screen.getByText('۱ تا ۵ از ۱۲').className)
    expect(winner(p, 'font-size')).toBe('var(--fs-caption)')
    expect(winner(p, 'color')).toBe('var(--text-muted)')
  })
})

/* -------------------------------------------------------------------------
   `expectExpandedHitArea` is a shared helper — Task 11's row chevron and the
   crumb home button assert with it next, src/ui/PasswordField.tsx's reveal
   button already does, and src/ui/Overlay.tsx's 32px close control is built the
   way it describes. A helper that only ever runs green proves nothing, so these
   pin what it REFUSES. There is no src/test/a11y.test.ts to put them in and
   this task owns four files; Task 12 should move them when it takes the a11y
   helpers.
   ------------------------------------------------------------------------- */
describe('expectExpandedHitArea', () => {
  const control = (className: string) => {
    const el = document.createElement('button')
    el.className = className
    return el
  }

  /* -----------------------------------------------------------------------
     Every fixture below is ASSEMBLED, and none of them is spelled.

     Every .ts/.tsx under `./src` is inside a Tailwind CONTENT glob, and the
     scanner does not read a test fixture differently from a component: FIVE
     classes were being minted into the shipped stylesheet by the strings that
     exist to see them REFUSED — `before:content-` at `none` in both its
     spellings, the `md:`-prefixed inset in two sizes, and the 16.5px inset in
     the spacing-scale test below, which no component writes at all. A fixture
     is by definition a rule nothing renders, so a fixture in the sheet is dead
     weight at best and, in the `content: none` case, a rule that would silently
     defeat this helper if anything ever wrote the class.

     What survives the rebuild is the empty content string and the 4/5/6px
     insets, because NavTabTray, Pager, Overlay and PasswordField genuinely
     write those — which is the useful half of the distinction: a class with a
     real consumer is a consumer and not a leak, and the same is true of the
     arbitrary paddings the un-migrated screens still write.

     src/ui/composites.test.tsx holds this file to it, together with itself and
     src/test/a11y.ts.
     ----------------------------------------------------------------------- */

  /** Two or more halves of a class name, joined here so the whole never appears. */
  const join = (...parts: string[]) => parts.join('')
  /** `<variants><utility>[<value>]`, built from its parts. */
  const arb = (variants: string, utility: string, value: string) =>
    join(variants, utility, '[', value, ']')
  /** The ::before's content at the one value that generates a box. */
  const CONTENT = arb('before:', 'content-', '""')
  /** The negative outset that grows the hit area, N px on every side. */
  const inset = (px: string, variants = 'before:') => arb(variants, '-inset-', `${px}px`)
  /** The whole overlay: a positioned control, an absolute ::before, a box, a size. */
  const overlay = (px = '5') => `relative before:absolute ${CONTENT} ${inset(px)}`
  /** The 34px pager button inside a 44px target — the shape most of these vary. */
  const PAGER = `${overlay()} w-pager h-pager`

  it('passes the 34px pager button and the 32px close control alike', () => {
    // 34 + 2×5 and 32 + 2×6 are both 44. A helper that matched one literal
    // inset would reject the close control, which is already built this way.
    //
    // Both are the REAL controls, rendered — a hand-written string here is a
    // test whose input is not the shape its name claims, and would keep passing
    // after either component stopped matching it.
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    expectExpandedHitArea(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))

    render(<Dialog open onClose={() => {}} title="حذف"><button type="button">تأیید</button></Dialog>)
    expectExpandedHitArea(screen.getByRole('button', { name: 'بستن' }))
  })

  it('measures a box the theme names on `spacing` alone, not only on `width`', () => {
    // Tailwind derives `w-*` and `h-*` from `spacing` as well as from their own
    // keys, so `w-tick-row` (11px, spacing-only) is a legal utility. Reading
    // `theme.extend.width` alone rejected it as a key "this theme knows"
    // nothing about — a refusal with a misleading reason, which is worse than
    // no refusal. 11 + 2×16.5 = 44.
    expectExpandedHitArea(control(`${overlay('16.5')} w-tick-row h-tick-row`))
  })

  it('refuses a drawn box with no ::before around it', () => {
    // Everything the rule asks for except the one thing that does the growing.
    expect(() => expectExpandedHitArea(control(
      `relative before:absolute ${CONTENT} w-pager h-pager`,
    ))).toThrow(/before:-inset/)
  })

  it('refuses a ::before with no content, which generates no box at all', () => {
    expect(() => expectExpandedHitArea(control(
      `relative before:absolute ${inset('5')} w-pager h-pager`,
    ))).toThrow(/before:content/)
  })

  it('refuses the one content VALUE that passes a spelling check and draws nothing', () => {
    // A bracketed `before:content-` matched the old spelling check exactly and
    // set `content: none`, which generates no box at all — the check was
    // defeated by the single value that defeats its purpose. Both spellings of
    // it, the bracketed one and Tailwind's own bare utility.
    for (const spelling of [arb('before:', 'content-', 'none'), join('before:content-', 'none')]) {
      expect(() => expectExpandedHitArea(control(
        `relative before:absolute ${spelling} ${inset('5')} w-pager h-pager`,
      )), spelling).toThrow(/content: none/)
    }
  })

  it('refuses a ::before that is generated and then told not to draw', () => {
    const base = PAGER
    for (const [klass, why] of [
      ['before:hidden', /display: none/],
      ['before:invisible', /visibility: hidden/],
      ['before:scale-0', /scales the box to nothing/],
      ['before:static', /back into the layout/],
      ['md:before:hidden', /display: none/],
    ] as const) {
      expect(() => expectExpandedHitArea(control(`${base} ${klass}`)), klass).toThrow(why)
    }
  })

  it('refuses a control that clips its own ::before back to the drawn box', () => {
    // `overflow-hidden` is the most ordinary class in the file — it is on the
    // table shell three lines from here — and on a control it cuts the 44px
    // overlay back to the 34px the control looks like.
    const base = PAGER
    for (const klass of ['overflow-hidden', 'overflow-clip', 'overflow-x-hidden']) {
      expect(() => expectExpandedHitArea(control(`${base} ${klass}`)), klass).toThrow(/clips its own/)
    }
  })

  it('refuses pointer-events-none on the CONTROL, not only on the ::before', () => {
    // The strictly weaker `before:` form was refused while the stronger one —
    // which takes the ::before with it, because pointer-events inherits —
    // passed.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} pointer-events-none w-pager h-pager`,
    ))).toThrow(/on the CONTROL/)
  })

  it('refuses a drawn box that a min-width quietly inflates to the floor', () => {
    // `min-width` beats `width`, so this control paints 44px — exactly the
    // "never inflate a drawn control to the floor" rule this helper says it
    // enforces, defeated by reading `w-`/`h-` while the browser resolves
    // `min-*`. Same species as the `w-pager h-chevron` hole.
    expect(() => expectExpandedHitArea(control(
      `${PAGER} min-w-touch min-h-touch`,
    ))).toThrow(/44px wide \(`min-w-touch`\).+expectTouchTarget/s)
  })

  it('refuses a control that states one axis twice, rather than guessing which wins', () => {
    // `drawnBox()` returned the first match in CLASS-STRING order while CSS
    // resolves by EMITTED order — the exact mistake this file's own
    // `paint`/`winner` docstring warns about, made by the helper beside it.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} w-pager w-touch h-pager`,
    ))).toThrow(/EMITTED order/)
  })

  it('refuses an inset that holds at one width and shrinks at another', () => {
    // 34 + 2×1 = 36. Below 768px the target is 44px and above it 36px, and the
    // check that read the unconditional class alone called that correct.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} ${inset('1', 'md:before:')} w-pager h-pager`,
    ))).toThrow(/36px wide/)
  })

  it('refuses a ::before that is told not to take pointer events', () => {
    // The ::before IS the hit area. This is the one declaration that measures
    // 44px and catches nothing, and it is the single most plausible thing for
    // someone to add to a decorative-looking pseudo-element.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} before:pointer-events-none w-pager h-pager`,
    ))).toThrow(/pointer-events-none/)
  })

  it('refuses a control that states no drawn box to measure from', () => {
    expect(() => expectExpandedHitArea(control(
      overlay(),
    ))).toThrow(/measured/)
  })

  it('refuses a ::before that does not reach 44px', () => {
    // The mistake the helper exists to catch: 32 + 2×5 is 42, and nothing about
    // it is visible, so nothing else would ever catch it.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} w-close h-close`,
    ))).toThrow(/42px/)
  })

  it('refuses a box that reaches 44px on one axis only', () => {
    // `-inset-` grows all four sides, but the drawn box has TWO numbers and
    // only the width used to be read: this control is 44px wide and 25px tall,
    // and a thumb misses it exactly as often as it misses a 25px square. The
    // design's ladder is square today; nothing makes it stay square.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} w-pager h-chevron`,
    ))).toThrow(/25px tall/)
  })

  it('refuses a ::before that grows from the wrong box', () => {
    expect(() => expectExpandedHitArea(control(
      `before:absolute ${CONTENT} ${inset('5')} w-pager h-pager`,
    ))).toThrow(/relative/)
  })

  it('refuses each of the three rules when it holds only at some widths', () => {
    // `\brelative\b` also matches inside `md:relative`, because `\b` sits
    // between the `:` and the `r`. All three of these passed a helper that
    // pattern-matched the raw class string, and each one is a control that is
    // built correctly on a desktop and unhittable on the phone that needs it.
    const base = PAGER
    const swap = (from: string, to: string) => control(base.replace(from, to))
    expect(() => expectExpandedHitArea(swap('relative', 'md:relative')))
      .toThrow(/unconditional `relative`/)
    expect(() => expectExpandedHitArea(swap('before:absolute', 'max760:before:absolute')))
      .toThrow(/unconditional `before:absolute`/)
    expect(() => expectExpandedHitArea(swap(inset('5'), inset('5', 'md:before:'))))
      .toThrow(/unconditional `before:-inset/)
  })

  it('refuses a control whose drawn box was inflated to the floor instead', () => {
    // The plan's rule, in the direction the helper can be misused: never grow
    // the painted control to 44px. That control is asserted with
    // expectTouchTarget; this one is for the design's smaller ladder.
    expect(() => expectExpandedHitArea(control(
      `${overlay()} w-touch h-touch`,
    ))).toThrow(/expectTouchTarget/)
  })
})
