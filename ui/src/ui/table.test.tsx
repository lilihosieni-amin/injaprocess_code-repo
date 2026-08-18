import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import { DataTable, type DataColumn, type DataTableProps } from './DataTable'
import { Pager } from './Pager'
import { expectExpandedHitArea } from '../test/a11y'

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

describe('DataTable', () => {
  it('lays the head and every row on the same six tracks', () => {
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="کاربری با این نام پیدا نشد" />,
    )
    const tracks = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
      .map((el) => el.style.gridTemplateColumns)
    expect(tracks).toEqual(Array(3).fill('16px 1.4fr 1fr 1.1fr 1fr 34px'))
  })

  it('is a plain table, and no row invites a click, when nothing may be opened', () => {
    // R5 — a list never renders a row it would then refuse to open.
    render(<DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />)
    expect(screen.getByRole('table', { name: 'کاربران' })).toBeInTheDocument()
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0)
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
    const row = screen.getByRole('row', { name: 'پروندهٔ سحر بیات' })
    expect(row).toHaveAttribute('tabindex', '0')
    row.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(screen.getByRole('row', { name: 'پروندهٔ رضا کریمی' }))
    expect(opened).toEqual(['09120000001', '09120000002'])
  })

  it('states the emptiness rather than drawing an empty grid', () => {
    render(<DataTable label="کاربران" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty="کاربری با این نام پیدا نشد" />)
    expect(screen.getByText('کاربری با این نام پیدا نشد')).toBeInTheDocument()
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
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

function shell(props: Partial<DataTableProps<Row>> = {}) {
  const { container } = render(
    <DataTable
      label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی"
      {...props}
    />,
  )
  return {
    head: (container.querySelector('[data-r-thead]') as HTMLElement).className,
    row: (container.querySelector('[data-r-trow]') as HTMLElement).className,
    cell: (key: string) => (container.querySelector(`[data-col="${key}"]`) as HTMLElement).className,
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
    const { row } = shell({ onOpen: () => {} })
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
  })
})

describe('what the pager’s class strings compile to', () => {
  const nav = () => {
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    return screen.getByRole('button', { name: 'صفحهٔ بعدی' }).className
  }

  it('draws the design’s 34px box and grows the target around it', async () => {
    const p = await paint(nav())
    expect(winner(p, 'width')).toBe('var(--size-pager)')
    expect(winner(p, 'height')).toBe('var(--size-pager)')
    // Never inflated: a `min-height` would beat `height` and silently turn the
    // drawn control into a 44px one.
    expect(winner(p, 'min-height')).toBe('')
    expect(winner(p, 'position')).toBe('relative')
    expect(winner(p, 'position', '::before')).toBe('absolute')
    expect(winner(p, 'inset', '::before')).toBe('-5px')
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
})

/* -------------------------------------------------------------------------
   `expectExpandedHitArea` is a shared helper — Task 11's row chevron and the
   crumb home button assert with it next, and src/ui/Overlay.tsx's 32px close
   control is already built the way it describes. A helper that only ever runs
   green proves nothing, so these pin what it REFUSES. There is no
   src/test/a11y.test.ts to put them in and this task owns four files; Task 12
   should move them when it takes the a11y helpers.
   ------------------------------------------------------------------------- */
describe('expectExpandedHitArea', () => {
  const control = (className: string) => {
    const el = document.createElement('button')
    el.className = className
    return el
  }
  const PAGER = 'relative before:absolute before:content-[""] before:-inset-[5px] w-pager h-pager'

  it('passes the 34px pager button and the 32px close control alike', () => {
    // 34 + 2×5 and 32 + 2×6 are both 44. A helper that matched one literal
    // inset would reject src/ui/Overlay.tsx, which is already built this way.
    expectExpandedHitArea(control(PAGER))
    expectExpandedHitArea(control('relative before:absolute before:-inset-[6px] w-close h-close'))
  })

  it('refuses a drawn box with no ::before around it', () => {
    // Everything the rule asks for except the one thing that does the growing.
    expect(() => expectExpandedHitArea(control('relative before:absolute w-pager h-pager')))
      .toThrow(/before:-inset/)
  })

  it('refuses a control that states no drawn box to measure from', () => {
    expect(() => expectExpandedHitArea(control('relative before:absolute before:-inset-[5px]')))
      .toThrow(/measured/)
  })

  it('refuses a ::before that does not reach 44px', () => {
    // The mistake the helper exists to catch: 32 + 2×5 is 42, and nothing about
    // it is visible, so nothing else would ever catch it.
    expect(() => expectExpandedHitArea(control('relative before:absolute before:-inset-[5px] w-close h-close')))
      .toThrow(/42px/)
  })

  it('refuses a ::before that grows from the wrong box', () => {
    expect(() => expectExpandedHitArea(control('before:absolute before:-inset-[5px] w-pager h-pager')))
      .toThrow(/relative/)
  })

  it('refuses a control whose drawn box was inflated to the floor instead', () => {
    // The plan's rule, in the direction the helper can be misused: never grow
    // the painted control to 44px. That control is asserted with
    // expectTouchTarget; this one is for the design's smaller ladder.
    expect(() => expectExpandedHitArea(control('relative before:absolute before:-inset-[5px] w-touch h-touch')))
      .toThrow(/expectTouchTarget/)
  })
})
