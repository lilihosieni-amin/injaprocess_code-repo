import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { screen } from '@testing-library/react'
import { Departments } from './Departments'
import { renderAt } from '../test/utils'
import { declarations, paint, winner } from '../test/paint'
import { SurfaceProvider } from '../ui/surface'

afterEach(() => vi.restoreAllMocks())

describe('Departments', () => {
  it('renders department cards with Persian counts, sub/conflict badges, and header stats', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([
        { code: 'cooking', name: 'پخت', count: 12, subs: 2, conflicts: 1 },
        { code: 'cashier', name: 'صندوق', count: 3, subs: 0, conflicts: 0 },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    // card title now carries the "دپارتمان" prefix
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('دپارتمان صندوق')).toBeInTheDocument()
    // per-card badges
    expect(screen.getByText('۱۲ فرآیند')).toBeInTheDocument()
    expect(screen.getByText('۲ زیرفرآیند')).toBeInTheDocument()
    expect(screen.getByText('۱ تعارض')).toBeInTheDocument()
    // header summary stats: total processes 12+3=15, and the open-conflict stat label
    expect(screen.getByText('۱۵')).toBeInTheDocument()
    expect(screen.getByText('فرآیند مستند')).toBeInTheDocument()
    expect(screen.getByText('تعارض باز')).toBeInTheDocument()
  })

  // GET /api/departments serves `conflicts` only to someone who may edit that
  // department, and it is ABSENT rather than zero for everyone else. A reader
  // must therefore not be shown ۰ open conflicts: zero is an answer, and it is
  // the wrong one whenever a conflict exists.
  it('says nothing at all about open conflicts when the count was not served', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([
        { code: 'cooking', name: 'پخت', count: 12, subs: 2 },
        { code: 'cashier', name: 'صندوق', count: 3, subs: 0 },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    // the stat tile is gone entirely — no label, and no ۰ standing in for it —
    // and no per-card badge either: the word does not appear on the screen at all
    expect(screen.queryByText('تعارض باز')).not.toBeInTheDocument()
    expect(screen.queryByText('۰')).not.toBeInTheDocument()
    expect(screen.queryByText(/تعارض/)).not.toBeInTheDocument()
    // the rest of the board is untouched
    expect(screen.getByText('۱۵')).toBeInTheDocument()
    expect(screen.getByText('فرآیند مستند')).toBeInTheDocument()
    expect(screen.getByText('۲ زیرفرآیند')).toBeInTheDocument()
  })

  // The mixed case a scoped editor actually sees: served for the department they
  // may edit, withheld for the one they may not. The tile then reports what they
  // were told and nothing more.
  it('counts only the departments whose conflicts were served', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([
        { code: 'cooking', name: 'پخت', count: 12, subs: 2, conflicts: 3 },
        { code: 'cashier', name: 'صندوق', count: 3, subs: 0 },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    // wait for a card: the header stats render before the board resolves, and
    // every count reads ۰ until it does
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('تعارض باز')).toBeInTheDocument()
    expect(screen.getByText('۳')).toBeInTheDocument()
    expect(screen.getByText('۳ تعارض')).toBeInTheDocument()          // cooking's own badge
    expect(screen.queryByText('۰ تعارض')).not.toBeInTheDocument()    // cashier gets no badge
  })
})

/* ------------------------------------------------------------------ *
 * Task 14 — R3's two surfaces, R7's two breakpoints, and the sweep
 * ------------------------------------------------------------------ */

const DEPTS = [
  { code: 'cooking', name: 'پخت', count: 12, subs: 2, conflicts: 1 },
  { code: 'cashier', name: 'صندوق', count: 3, subs: 0, conflicts: 0 },
]
function serveDepts(rows: unknown[] = DEPTS) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
    JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}
const on = (surface: 'panel' | 'reader') =>
  renderAt('/departments', (
    <SurfaceProvider surface={surface}><Departments /></SurfaceProvider>
  ), '/departments')

/** The first card the screen drew — `expectDesign` grades this exact element. */
const firstCard = () => document.querySelector('[data-card]') as HTMLElement

/**
 * The rest shadow an element wearing `classes` really lands on.
 *
 * Not simply `winner(p, '--tw-shadow')`: `shadow-card` is BOTH a `boxShadow`
 * key and — because `card` is also a colour — a `boxShadowColor` one, and
 * Tailwind emits the colour rule LAST, where it rewrites `--tw-shadow` to
 * `var(--tw-shadow-colored)`. Reading only the first property therefore reports
 * a variable name for every card in the product. The indirection is inert today
 * (a `var()` value cannot be decomposed into a colour, so `--tw-shadow-colored`
 * holds the token unchanged) and it is exactly the shape that stops being inert
 * the day one of these shadows is written as a literal.
 */
async function restShadow(classes: string): Promise<string> {
  const p = await paint(classes)
  const declared = winner(p, '--tw-shadow')
  return declared === 'var(--tw-shadow-colored)' ? winner(p, '--tw-shadow-colored') : declared
}

describe('the two surfaces', () => {
  it('is a three-column grid in the panel, and names the hooks both breakpoints target', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    const grid = document.querySelector('[data-r-deptgrid]')!
    expect(grid).toBeInTheDocument()
    // The same div wears `data-grid`: the panel DESIGN row names no
    // `grid.selector`, so it resolves `[data-grid]`, and the reader row names
    // `[data-r-deptgrid]`. One component draws both surfaces, so one div has to
    // answer to both names or one of the two rows grades a different element.
    expect(grid).toHaveAttribute('data-grid')
    expect(grid.className).toContain('grid-cols-3')
    expect(grid.className).toContain('max1080:grid-cols-2')
    expect(grid.className).toContain('max760:grid-cols-1')
    expect(grid.className).toContain('gap-s9')          // 18px
  })

  it('is a single-column list in the reader, at the reader’s own gap', async () => {
    serveDepts()
    on('reader')
    await screen.findByText('پخت')
    const grid = document.querySelector('[data-r-deptgrid]')!
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('gap-s7')          // 14px
    expect(grid.className).not.toContain('grid-cols-3')
    expect(grid.className).not.toContain('max1080:')
  })

  it('gives the panel H1 the hook and the variant that shrink it to 25px at ≤760', async () => {
    serveDepts()
    on('panel')
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveAttribute('data-r-title')
    expect(h1).toHaveAttribute('data-h1')
    expect(h1.className).toContain('text-fs-display')
    expect(h1.className).toContain('max760:text-fs-display-hand')
    // The colour branches with the size, and this is the arm that keeps the
    // retired cream: `departments.h1.color` is ON_FIELD #FBF7F1, the one screen
    // ledger L-01 did NOT move to white. Collapsing the two arms into one class
    // is what put #FBF7F1 on every other screen's title.
    expect(h1.className).toContain('text-on-dark')
    expect(h1.className).not.toContain('text-role-title-on-field')
  })

  it('writes the reader’s H1 in the white L-01 decided, not the cream it retired', async () => {
    serveDepts()
    on('reader')
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.className).toContain('text-fs-h1-reader-home')
    expect(h1.className).toContain('text-role-title-on-field')  // --card, #FFFFFF
    expect(h1.className).not.toContain('text-on-dark')          // --text-on-dark, #FBF7F1
    // …and it does NOT take the panel's ≤760 shrink: `departmentsReader.h1.size`
    // is 26px at all three widths.
    expect(h1.className).not.toContain('max760:text-fs-display-hand')
  })

  it('writes the lead line at the size each row states, and one colour for both', async () => {
    serveDepts()
    const panel = on('panel')
    const lead = await screen.findByText(/نقشهٔ فرآیندهای مجموعه/)
    expect(lead).toHaveAttribute('data-body')
    expect(lead.className).toContain('text-fs-body')            // 14px
    expect(lead.className).toContain('text-role-subtitle-on-field')
    // NOT `text-violet-on-dark-body`, whose name still reads like the answer:
    // Task 3 re-cut that token from #B7A6E0 to #C9BEEE (L-28), so the name and
    // the role have come apart and only the role class is safe to write.
    expect(lead.className).not.toContain('text-violet-on-dark-body')
    panel.unmount()

    serveDepts()
    on('reader')
    const readerLead = await screen.findByText(/کدام بخش/)
    expect(readerLead).toHaveAttribute('data-body')
    expect(readerLead.className).toContain('text-role-dense')   // 13px, R12
    expect(readerLead.className).toContain('text-role-subtitle-on-field')
    expect(readerLead.className).not.toContain('text-fs-body')
  })

  it('draws the panel’s editor chrome only in the panel', async () => {
    serveDepts()
    const panel = on('panel')
    await screen.findByText('دپارتمان پخت')
    expect(screen.getByText('فرآیند مستند')).toBeInTheDocument()
    // The ghosted index numeral is the panel's alone. `departmentsReader` carries
    // no `contrastWaived`, so a watermark drawn on the reader is type the harness
    // reports as invisible — a red that reads as a defect in the gate.
    expect(firstCard().querySelector('.pointer-events-none')).not.toBeNull()
    expect(screen.getByText('۲ زیرفرآیند')).toBeInTheDocument()
    panel.unmount()

    serveDepts()
    on('reader')
    await screen.findByText('پخت')
    expect(screen.queryByText('فرآیند مستند')).not.toBeInTheDocument()
    expect(firstCard().querySelector('.pointer-events-none')).toBeNull()
    // R5 — a reader may not edit, so the counts that exist for an editor are
    // absent rather than shown-and-inert.
    expect(screen.queryByText('۲ زیرفرآیند')).not.toBeInTheDocument()
    expect(screen.queryByText(/تعارض/)).not.toBeInTheDocument()
  })

  it('takes the card radius each row states — 20px panel, 18px reader', async () => {
    serveDepts()
    const panel = on('panel')
    await screen.findByText('دپارتمان پخت')
    expect(firstCard().className).toContain('rounded-feature')  // --radius-card-lg, 20px
    expect(firstCard().className).not.toContain('rounded-doc')
    panel.unmount()

    serveDepts()
    on('reader')
    await screen.findByText('پخت')
    expect(firstCard().className).toContain('rounded-doc')      // --radius-doc, 18px
    expect(firstCard().className).not.toContain('rounded-feature')
  })

  it('gives the screen root the ground the field check reads off it', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    const root = document.querySelector('[data-screen="departments"]') as HTMLElement
    expect(root).toHaveAttribute('data-r-pad')
    // `expectDesign` reads `background-color` off THIS element with
    // `getComputedStyle`, which does not inherit: a root that paints nothing
    // computes `rgba(0, 0, 0, 0)` however violet the shell behind it is.
    expect(root.className).toContain('bg-ink')
  })
})

describe('the cascade, not the class string', () => {
  it('lands the panel card on the design’s heavier feature shadow, not Card’s default', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    // `Card` writes `shadow-card` itself and this screen appends
    // `shadow-feature`. Which of the two paints is decided by Tailwind's output
    // order, never by the order of the class attribute — so the question is
    // asked of the compiled sheet.
    expect(await restShadow(firstCard().className)).toBe('var(--shadow-feature)')
  })

  it('leaves the reader card on the shadow its own row states', async () => {
    serveDepts()
    on('reader')
    await screen.findByText('پخت')
    expect(await restShadow(firstCard().className)).toBe('var(--shadow-card)')
    // …and the two really are two values, so neither test above could pass by
    // reading the other's token.
    expect(await restShadow('shadow-card')).not.toBe(await restShadow('shadow-feature'))
  })

  it('really shrinks the panel title inside the ≤760 media query', async () => {
    serveDepts()
    on('panel')
    const h1 = await screen.findByRole('heading', { level: 1 })
    const painted = await paint(h1.className)
    expect(winner(painted, 'font-size')).toBe('var(--fs-display)')
    expect(winner(painted, 'font-size', '', '(max-width: 760px)'))
      .toBe('var(--fs-display-hand)')
  })

  it('really overrides the screen padding inside the ≤760 media query', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    const root = document.querySelector('[data-screen="departments"]') as HTMLElement
    const painted = await paint(root.className)
    expect(winner(painted, 'padding-top')).toBe('var(--pad-departments-top)')
    expect(winner(painted, 'padding-left')).toBe('var(--pad-screen-x)')
    // `py-s9` and `px-s7` are appended to a `pt-`/`pb-`/`px-` set. Tailwind emits
    // `pt-*` AFTER `py-*`, so the two would fight if both sat outside a media
    // query; inside one they do not, and this is the assertion that says so.
    expect(winner(painted, 'padding-top', '', '(max-width: 760px)'))
      .toBe('var(--space-9)')
    expect(winner(painted, 'padding-bottom', '', '(max-width: 760px)'))
      .toBe('var(--space-9)')
    expect(winner(painted, 'padding-left', '', '(max-width: 760px)'))
      .toBe('var(--space-7)')
  })

  it('collapses the panel grid at both breakpoints and nowhere else', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    const grid = document.querySelector('[data-r-deptgrid]') as HTMLElement
    const painted = await paint(grid.className)
    const tracks = (media: string) => winner(painted, 'grid-template-columns', '', media)
    expect(tracks('')).toBe('repeat(3, minmax(0, 1fr))')
    expect(tracks('(max-width: 1080px)')).toBe('repeat(2, minmax(0, 1fr))')
    expect(tracks('(max-width: 760px)')).toBe('repeat(1, minmax(0, 1fr))')
  })
})

describe('the full declaration set, per element', () => {
  // A control asserted only to EXIST is not asserted. These three compare the
  // WHOLE set — every property the class string sets, at the value the cascade
  // lands on — so a swap that keeps the property and changes what it is set to
  // cannot walk through, and neither can a dropped one.

  it('pins the watermark numeral, inline END and all', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    const ghost = firstCard().querySelector('.pointer-events-none') as HTMLElement
    expect([...declarations(await paint(ghost.className))].sort()).toEqual([
      'color: var(--dept-numeral-coral)',
      'font-size: var(--fs-numeral)',
      'font-weight: var(--fw-extrabold)',
      // `inset-inline-end`, never `left`: in RTL this is the page's left, and a
      // physical spelling is invisible until an LTR locale exists. It is also
      // invisible to every check that reads a class string, because
      // `start-s10` and `end-s10` are both real classes.
      'inset-inline-end: var(--space-10)',
      'line-height: var(--lh-none)',
      'pointer-events: none',
      'position: absolute',
      'top: var(--space-7)',
    ])
  })

  it('pins the panel card — the interior, the edge, the radius and the shadow', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    expect([...declarations(await paint(firstCard().className))].sort()).toEqual([
      // The shadow chain in full; `restShadow` above says why there are three
      // custom properties here and not one.
      '--tw-shadow-color: var(--card)',
      '--tw-shadow-colored: var(--shadow-feature)',
      '--tw-shadow: var(--tw-shadow-colored)',
      'background-color: var(--card)',
      'border-color: var(--border-card)',
      'border-radius: var(--radius-card-lg)',
      'border-width: 1px',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'cursor: pointer',
      'overflow: hidden',
      'padding: var(--space-10)',
      'position: relative',
      'transition-duration: var(--duration)',
      'transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter',
      'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)',
    ])
  })

  it('pins the count chip, whose padding P3-4 normalised', async () => {
    serveDepts()
    on('panel')
    const chip = (await screen.findByText(/۱۲ فرآیند/)) as HTMLElement
    expect([...declarations(await paint(chip.className))].sort()).toEqual([
      'align-items: center',
      'background-color: var(--tile-v3)',
      'border-radius: var(--radius-pill)',
      'color: var(--text-dialog-ghost)',
      'display: inline-flex',
      'font-size: var(--fs-xs)',
      'font-weight: var(--fw-semibold)',
      'gap: var(--space-2)',
      // 4px 10px on every chip on this card — the sub chip's 4px 9px was a 1px
      // difference between two chips on one card (ledger P3-4).
      'padding-bottom: var(--space-1)',
      'padding-left: var(--space-5)',
      'padding-right: var(--space-5)',
      'padding-top: var(--space-1)',
    ])
  })

  it('pins both H1s — the size, the colour and the tracking each surface takes', async () => {
    serveDepts()
    const panel = on('panel')
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect([...declarations(await paint(h1.className))].sort()).toEqual([
      'color: var(--text-on-dark)',
      'font-size: var(--fs-display)',
      'font-weight: var(--fw-extrabold)',
      'letter-spacing: var(--tracking-display)',
      'line-height: var(--lh-tight)',
    ])
    panel.unmount()

    serveDepts()
    on('reader')
    const readerH1 = await screen.findByRole('heading', { level: 1 })
    // Three declarations, not five: the reader's hero carries no display
    // tracking and no tight leading, which is the deliverable and not an
    // oversight — its 26px title is a different drawing from the panel's 34px.
    expect([...declarations(await paint(readerH1.className))].sort()).toEqual([
      'color: var(--role-title-on-field)',
      'font-size: var(--fs-h1-reader-home)',
      'font-weight: var(--fw-extrabold)',
    ])
  })

  it('pins the chip row, whose floor keeps a one-chip card the height of a three-chip one', async () => {
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    // Found through the chip it contains, NOT by `.min-h-chiprow`: a selector
    // naming the class under test turns "the declaration is gone" into "the
    // element is gone", which is a kill for the wrong reason and reads the same
    // in the report.
    const row = screen.getByText(/۱۲ فرآیند/).parentElement as HTMLElement
    expect([...declarations(await paint(row.className))].sort()).toEqual([
      'align-items: center',
      'display: flex',
      'flex-wrap: wrap',
      'gap: var(--space-3)',
      'margin-top: var(--space-5)',
      'min-height: var(--size-chiprow)',
    ])
  })

  it('keeps each department’s own accent on its own tile', async () => {
    // §1.1 — a department is fixed violet or coral and is never re-assigned.
    // `IconTile` derives the tint from the code; passing it a literal accent
    // would paint all nine one colour and no length, radius or shadow above
    // would move.
    serveDepts()
    on('panel')
    await screen.findByText('دپارتمان پخت')
    const tiles = document.querySelectorAll('[data-tile]')
    expect(tiles).toHaveLength(2)
    expect(tiles[0].className).toContain('bg-tile-c')     // cooking — coral
    expect(tiles[1].className).toContain('bg-tile-v')     // cashier — violet
    expect(tiles[0].className).not.toContain('bg-tile-v')
  })
})

describe('the token sweep', () => {
  it('leaves no literal value in the file', () => {
    // guards.test.ts exempts src/screens/ until Task 25 deletes that line. This
    // is the same scan aimed at one file, so the sweep is pinned the moment it
    // happens rather than three tasks later.
    // Derived from this file's own location, and through `fileURLToPath` on the
    // STRING: under jsdom `new URL(...)` is the DOM's URL and `node:fs` rejects
    // it, so the first cut of this line threw instead of reading anything — a
    // test whose input was not the shape its name claimed.
    const src = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
    expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
    expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
    expect(src).not.toMatch(/\b(left|right)-\d/)
    // …and the scan is really reading the screen, not an empty string.
    expect(src).toContain('data-r-deptgrid')
  })
})
