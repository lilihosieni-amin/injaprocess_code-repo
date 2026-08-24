import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, fireEvent, within } from '@testing-library/react'
import { ProcessList } from './ProcessList'
import { renderAt } from '../test/utils'
import { ToastProvider } from '../write/ToastProvider'
import { SurfaceProvider } from '../ui/surface'
import type { SessionDescriptor } from '../auth/session'
import { declarations, paint, winner } from '../test/paint'
import { expectExpandedHitArea } from '../test/a11y'

/** The one media query §6.16's mobile pass is written behind, as postcss
 *  serialises the `max760` variant's params. Named once: a typo in it makes
 *  every `winner(..., MOBILE)` below read an empty rule set and agree with
 *  everything. */
const MOBILE = '(max-width: 760px)'

/** `join(process.cwd(), …)` and not `new URL(…, import.meta.url)`: under jsdom
 *  the global `URL` is jsdom's own class, `readFileSync` type-checks against
 *  Node's, and the two are not the same constructor — so the URL form throws
 *  «Received an instance of URL» in this environment. */
const SOURCE = join(process.cwd(), 'src/screens/ProcessList.tsx')

/**
 * Opens one row's `⋮` — owner ruling: *"add ather buttomn in card to : menue"*,
 * and `Inja Panel.dc.html:354-366`.
 *
 * «اطلاعات کلی» and the delete are behind it now, so every assertion that used
 * to reach for them directly goes through here. Named by the process, because a
 * list draws one of these per row and `getByRole` would find three.
 */
function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `کارهای «${name}»` }))
}

afterEach(() => vi.restoreAllMocks())

// The three descriptors below differ from EDITOR one field at a time, so an
// assertion that separates any two of them can only be separating them on that
// field. READER is EDITOR minus `edit` and nothing else; OTHER_DEPT_EDITOR holds
// `edit` but over a different department, which is the case a check that asked
// "does this person hold edit anywhere?" would get wrong.
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const READER: SessionDescriptor = { ...EDITOR, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'] }
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:cashier'] }

/** An ICOM with nothing in it — what `visibility.filtered` blanks `idef0` to,
 *  and what a process nobody has drawn an A-0 for genuinely holds. Written out
 *  on every fixture below because `Process.idef0` is REQUIRED: the server sends
 *  the key on every document, blanked or filled, so a fixture without one is a
 *  payload the API cannot produce. */
const NO_ICOM = { inputs: [], controls: [], outputs: [], mechanisms: [] }

// Curated order deliberately diverges from id order (cooking-014 before cooking-001):
// if ProcessList ever started sorting by id before numbering, the position assertions
// below would flip and fail. See finding A in the Task 11 review.
const PROCS = [
  { id: 'cooking-014', department: 'cooking', name: 'پرداخت هزینه', summary: 's2', parent: { process: 'cooking-001', node: 'n' }, idef0: NO_ICOM, kpis: [], pending: [], nodes: [{ type: 'activity' }] },
  { id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: 's1', parent: null, idef0: NO_ICOM, kpis: [{ name: 'k' }], pending: [], nodes: [{ type: 'activity' }, { type: 'start' }] },
  { id: 'cooking-002', department: 'cooking', name: 'فرآیند قدیمی', summary: 's3', parent: null, idef0: NO_ICOM, kpis: [], pending: [], nodes: [], tombstoned: true, superseded_by: ['cooking-050'] },
]

function mock(procs: unknown[] = PROCS) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/processes')) return Promise.resolve(new Response(JSON.stringify(procs), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 2 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}

describe('ProcessList', () => {
  it('renders cards with derived tags and no activity count', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByText('زیرفرآیند')).toBeInTheDocument()   // cooking-014
    // …and «دارای KPI» is not a tag any more — owner ruling, *"delete kpi tag
    // too"*. cooking-001 in this fixture carries one KPI, so a row that still
    // derived the tag would draw it here.
    expect(screen.queryByText('دارای KPI')).toBeNull()
    // **Owner ruling: *"in process list page, it shouldn't have 11 فعالیت
    // tag.remove it."*** The chip was never one of §6.2's three — this app added
    // it, on the argument that dropping the number would take information no
    // other screen carries — and the owner has decided against that argument.
    // Asserted by the testid AND by the word, so a chip that came back with its
    // hook renamed is still caught.
    expect(screen.queryByTestId('activity-count-cooking-014')).toBeNull()
    expect(screen.queryByText(/فعالیت/)).toBeNull()
  })

  it('paints a sub-process card cream and leaves every other one white', async () => {
    // **Owner ruling** — *"for the ones that are sub-processes, in addition to
    // the sub-process tag, I want the entire box — instead of white — to be a
    // very light cream color."* The value they named is `--tile-warn`, which the
    // palette already calls "amber tint: sub-process tags".
    //
    // Driven off `deriveTag`'s own answer, so the tint and the chip can never
    // disagree about which rows are sub-processes: cooking-014 has a parent,
    // cooking-001 does not.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    const card = (name: string) =>
      screen.getByText(name).closest('[data-r-prow]') as HTMLElement
    expect(card('پرداخت هزینه').className).toContain('bg-tile-warn')
    expect(card('خرید و پرداخت').className).toContain('bg-card')
  })

  it('gives «تأیید نشده» a skin of its own, not the sub-process tag’s', async () => {
    // *"I want the 'not approved' tag's color to be different from the
    // sub-process tag's color."* They were the same pair —
    // `--tile-warn`/`--warn` — so the two commonest chips on this screen were
    // one chip. Now: violet for the sub tag (the chip `Inja Panel.dc.html:389`
    // already gives that word), filled amber for the unconfirmed mark.
    //
    // A tint would not have done: the sub-process CARD is `--tile-warn` now, so
    // a `--tile-warn` chip on it is invisible.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/confirmations')
        ? [{ target: 'cooking-014', kind: 'process', fingerprint: 'a', confirmed: false }]
        : url.includes('/processes') ? PROCS
          : [{ code: 'cooking', name: 'پخت', count: 2 }]
      return Promise.resolve(new Response(JSON.stringify(body),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    // `confirm` on this department, or the row never asks for the marks and the
    // chip this test is about is not drawn at all.
    const CONFIRMER: SessionDescriptor = {
      ...EDITOR, capabilities: [...EDITOR.capabilities, 'confirm'],
    }
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
    const unconfirmed = await screen.findByText('تأیید نشده')
    const sub = screen.getByText('زیرفرآیند')
    expect(sub.className).toContain('bg-tile-v')
    expect(unconfirmed.className).toContain('bg-warn')
    expect(unconfirmed.className).not.toContain('bg-tile-warn')
  })

  it('shows a reader the sub-process tag and nothing else on the meta line', async () => {
    // **Owner ruling: *"in reader process list, we shouldnt show process id and
    // 11 فعالیت in process card. just show زیرفرایند if it is."*** The reader
    // deliverable draws no meta line at all (`Inja Reader.dc.html:215-221`); the
    // ruling is more generous by exactly one chip, because a sub-process a reader
    // cannot tell from a top-level one is the one fact this row has to carry.
    mock()
    renderAt('/departments/:code',
      <SurfaceProvider surface="reader"><ProcessList /></SurfaceProvider>,
      '/departments/cooking', READER)
    await screen.findByText('پرداخت هزینه')
    const sub = screen.getByTestId('meta-cooking-014')
    expect(within(sub).getByText('زیرفرآیند')).toBeInTheDocument()
    expect(within(sub).queryByText('cooking-014')).toBeNull()
    // …and a row that is not a sub-process draws an empty meta line, not an id.
    const plain = screen.getByTestId('meta-cooking-001')
    expect(within(plain).queryByText('cooking-001')).toBeNull()
    expect(plain.textContent).toBe('')
  })

  it('filters by id', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-014' } })
    expect(screen.queryByText('خرید و پرداخت')).not.toBeInTheDocument()
    expect(screen.getByText('پرداخت هزینه')).toBeInTheDocument()
  })

  it('shows a tombstoned process labelled باطل‌شده with an heir link and a (read-only) flowchart button', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.getByText('باطل‌شده')).toBeInTheDocument()
    // heir link present, points at the heir process
    const heir = screen.getByRole('link', { name: /cooking-050/ })
    expect(heir).toHaveAttribute('href', '/processes/cooking-050')
    // the tombstoned row still exposes the flowchart button (view is read-only)
    const row = screen.getByText('فرآیند قدیمی').closest('[data-r-prow]') as HTMLElement
    expect(row).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'فلوچارت' })).toBeInTheDocument()
    // permanent delete stays available — behind the row's ⋮ as of the ruling
    openRowMenu('فرآیند قدیمی')
    expect(screen.getByRole('menuitem', { name: 'حذف دائمی فرآیند' })).toBeInTheDocument()
  })

  it('numbers active processes in the order the API returned', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByTestId('pos-cooking-014')).toHaveTextContent('۱')
    expect(screen.getByTestId('pos-cooking-001')).toHaveTextContent('۲')
  })

  it('gives a tombstoned process no position number', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.queryByTestId('pos-cooking-002')).not.toBeInTheDocument()
  })

  it('numbering ignores the search filter', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-001' } })
    // cooking-001 keeps position ۲ even though it is now the only visible row — if
    // positions were ever recomputed from the filtered list it would show ۱ instead.
    expect(screen.getByTestId('pos-cooking-001')).toHaveTextContent('۲')
  })

  it('gives an editor of this department the create, reorder and delete controls', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    // wait for the rows, not for a header button: the header renders before the
    // list resolves, and a delete count taken then would be zero for that reason
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'فرآیند جدید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترتیب فرآیندها' })).toBeInTheDocument()
    // One ⋮ per row, tombstone included, and a delete inside each of them: the
    // affordance moved behind a press, it did not go. Counted per row rather
    // than in total, so a menu drawn on one row and not the others still fails.
    expect(screen.queryAllByRole('button', { name: /^کارهای «/ })).toHaveLength(PROCS.length)
    for (const p of PROCS) {
      openRowMenu(p.name)
      expect(screen.getByRole('menuitem', { name: /حذف/ })).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
    }
  })

  it('draws no create, reorder or delete control for a reader', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
    // The fixture keeps the tombstone a reader would not actually be served, so
    // both delete titles — «حذف فرآیند» and «حذف دائمی فرآیند» — are in play here.
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'فرآیند جدید' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ترتیب فرآیندها' })).not.toBeInTheDocument()
    expect(screen.queryAllByTitle(/حذف/)).toHaveLength(0)
    // and what a reader may do is untouched
    expect(screen.getByRole('button', { name: 'اطلاعات دپارتمان' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'فلوچارت' })).toHaveLength(PROCS.length)
  })

  it('draws no edit control for an editor scoped to a different department', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', OTHER_DEPT_EDITOR)
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'فرآیند جدید' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ترتیب فرآیندها' })).not.toBeInTheDocument()
    expect(screen.queryAllByTitle(/حذف/)).toHaveLength(0)
  })

  // the modal calls useToast, so this one test wraps the screen in ToastProvider
  it('opens the reorder panel from the button', async () => {
    mock()
    renderAt('/departments/:code', <ToastProvider><ProcessList /></ToastProvider>, '/departments/cooking', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ترتیب فرآیندها' }))
    expect(await screen.findByText(/ترتیب فرآیندهای/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-014', 'cooking-001'])
  })
})

describe('the scroll container', () => {
  it('pins no direction with an attribute', () => {
    // O1 — `dir="ltr"` on the region plus `dir="rtl"` on one child left every
    // dialog mounted here LTR, and five files in src/write/ carry a re-pin with
    // a comment explaining this screen. The design expresses the same intent as
    // a stylesheet rule that catches all children, so the workaround has nothing
    // left to work around.
    const src = readFileSync(SOURCE, 'utf8')
    expect(src).not.toMatch(/\bdir=/)
  })

  it('carries the hook the rule targets', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    expect(document.querySelector('[data-r-pad]')).toBeInTheDocument()
  })

  it('flips the box one way and every immediate child back, as a rule', () => {
    // The value half, not the property half: a rule that set `direction` to
    // anything at all would satisfy a check that only collected property names,
    // and the pair only works if the two values are opposite. `> *` is the load-
    // bearing character — `[data-r-pad] *` would flip a nested LTR island back
    // too, and `[data-r-pad] > div` would flip back only the children someone
    // remembered, which is the attribute form spelled as CSS.
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
    expect(css).toContain('[data-r-pad] { direction: ltr; }')
    expect(css).toContain('[data-r-pad] > * { direction: rtl; }')
  })
})

const CONFIRMER: SessionDescriptor = { ...EDITOR, capabilities: [...EDITOR.capabilities, 'confirm'] }

/** A row carrying a stored mark, with `confirmed` as the caller asks for it.
 *
 *  Parameterised rather than fixed at `true`, and that is the whole point: a
 *  chip that ignores the field and always reads «تأیید شده» is correct on every
 *  confirmed fixture there is, and telling an editor that a document they have
 *  since edited is still vouched for is the one thing the fingerprint exists to
 *  prevent. `_row` sets `confirmed_by`/`confirmed_at` only when the stored
 *  fingerprint still matches, so an unconfirmed row carries nulls here too. */
function mockMark(confirmed: boolean) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.startsWith('/api/confirmations')
      ? [{ target: 'cooking-001', kind: 'process', fingerprint: 'a'.repeat(64),
           confirmed,
           confirmed_by: confirmed ? '09120000001' : null,
           confirmed_at: confirmed ? 1770000000 : null }]
      : url.includes('/processes') ? PROCS
      : [{ code: 'cooking', name: 'پخت', count: 2 }]
    return Promise.resolve(new Response(JSON.stringify(body),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}
const mockConfirmed = () => mockMark(true)

describe('the confirmation on a row', () => {
  it('states the mark and offers no act', async () => {
    // §6.2 gives the row a confirmation *chip* in the meta line and no button.
    // The act lives where the design puts it — the summary header (§6.3) and
    // the flow bar's confirmed toggle (§6.5). Keeping a `min-h-touch` Button in
    // a 15px title line is what made every row 44px tall.
    mockConfirmed()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
    expect(await screen.findByText('تأیید شده')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تأیید محتوا' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'لغو تأیید' })).not.toBeInTheDocument()
  })

  it('says the row is NOT confirmed when the stored mark is for other bytes', async () => {
    // The other half of the chip, and the half a fixture that is always
    // `confirmed: true` cannot ask for. `row.confirmed` means "the stored mark
    // is for THESE bytes", not "a mark exists", so a document edited after
    // being confirmed arrives false — and a chip that ignored the field would
    // tell the one person who can act that the page is still vouched for.
    mockMark(false)
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
    expect(await screen.findByText('تأیید نشده')).toBeInTheDocument()
    expect(screen.queryByText('تأیید شده')).not.toBeInTheDocument()
  })

  it('puts the mark in the meta line and leaves the title line free of controls', async () => {
    // The 44px title line, asserted where jsdom can see it: the design's title
    // row is a position numeral and a name, and every one of the row's controls
    // is in the actions cluster. A `min-h-touch` control anywhere in the title
    // row sets the row's height whatever the type size says, and the browser
    // check measures the same claim as a box.
    mockConfirmed()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
    const mark = await screen.findByText('تأیید شده')
    const row = mark.closest('[data-r-prow]') as HTMLElement
    expect(mark.closest('[data-r-pmeta]')).toBe(within(row).getByTestId('meta-cooking-001'))
    const title = within(row).getByTestId('title-cooking-001')
    expect(within(title).queryAllByRole('button')).toHaveLength(0)
    expect(within(title).queryAllByRole('link')).toHaveLength(0)
    expect(title.contains(mark)).toBe(false)
  })
})

describe('the row, the empty state and the mobile overflow', () => {
  it('says the right nothing for an empty department and for a fruitless search', async () => {
    // The reader deliverable's own defect #3 (§6.17), reproduced in this app:
    // an empty department shows the search-miss copy. Two states, two sentences.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([]),
        { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('فرآیندی برای این دپارتمان ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByText('فرآیندی با این نام پیدا نشد')).not.toBeInTheDocument()
  })

  it('says it is loading instead of saying the department is empty', async () => {
    // **Owner ruling — the sharpest of the six loading screens, and the only one
    // that was not merely blank.** *"i want to add load status for page that
    // makes time like process list."*
    //
    // While `GET /api/departments/{code}/processes` was in flight this screen
    // drew its header and, under it, «فرآیندی برای این دپارتمان ثبت نشده است» —
    // the EMPTY state. A department with sixteen processes announced that it had
    // none, every time somebody opened it, for as long as the request took.
    // `isPending` is the difference between "the answer is nothing" and "there
    // is no answer yet".
    let release: (r: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/processes')) {
        return new Promise<Response>((resolve) => { release = resolve })
      }
      return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 2 }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)

    expect(await screen.findByTestId('screen-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'در حال بارگذاری' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('فرآیندی برای این دپارتمان ثبت نشده است.')).toBeNull()

    release(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    // …and once the answer really is «nothing», the sentence is the right one.
    expect(await screen.findByText('فرآیندی برای این دپارتمان ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByTestId('screen-skeleton')).toBeNull()
  })

  it('keeps the search-miss sentence for a search that misses', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'),
      { target: { value: 'زززز' } })
    expect(screen.getByText('فرآیندی با این نام پیدا نشد')).toBeInTheDocument()
    expect(screen.queryByText('فرآیندی برای این دپارتمان ثبت نشده است.')).not.toBeInTheDocument()
  })

  it('swaps the action bar for the ⋯ at ≤760, rather than drawing both', async () => {
    // The class ATTRIBUTE decides nothing — Tailwind's emitted order does — so
    // both halves are read out of the compiled sheet at the two widths that
    // matter. `display` is asserted by VALUE at each: an append (`flex` and
    // `hidden` on one element) reads identically in the class string and paints
    // one of them at every width.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    const bar = document.querySelector('[data-r-plistactions]') as HTMLElement
    const more = document.querySelector('[data-r-plistmore]') as HTMLElement
    const barPaint = await paint(bar.className)
    const morePaint = await paint(more.className)
    expect(winner(barPaint, 'display')).toBe('flex')
    expect(winner(barPaint, 'display', '', MOBILE)).toBe('none')
    expect(winner(morePaint, 'display')).toBe('none')
    expect(winner(morePaint, 'display', '', MOBILE)).toBe('inline-flex')
  })

  it('draws the ⋯ at the size the design draws it and grows only its target', async () => {
    // §6.2 — `36×36`. The plan's standing rule for every rung of the design's
    // 30/32/34/36/40/42 ladder is that the drawn box stays the design's and a
    // transparent ::before brings the hit area up to F11's 44: 36 + 2×4 = 44.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    const btn = await screen.findByRole('button', { name: 'کارهای بیشتر' })
    expectExpandedHitArea(btn)
    expect(declarations(await paint(btn.className))).toEqual(new Set([
      'position: relative',
      'display: inline-flex',
      'width: var(--size-menu-more)',
      'height: var(--size-menu-more)',
      'flex: none',
      'cursor: pointer',
      'align-items: center',
      'justify-content: center',
      'border-radius: var(--radius-control)',
      'border-width: var(--border-hairline)',
      'border-color: var(--line)',
      'background-color: var(--tile-v2)',
      'font-size: var(--fs-h5)',
      'font-weight: var(--fw-bold)',
      'color: var(--violet)',
    ]))
  })

  it('puts nothing in the ⋯ that the caller may not do', async () => {
    // R5 — the overflow is the action bar, not a superset of it. A reader's ⋯
    // holds «اطلاعات دپارتمان» and nothing else.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
    fireEvent.click(await screen.findByRole('button', { name: 'کارهای بیشتر' }))
    expect(screen.getByRole('menuitem', { name: 'اطلاعات دپارتمان' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'فرآیند جدید' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'ترتیب فرآیندها' })).not.toBeInTheDocument()
  })

  it('offers an editor every act the bar holds, exports included', async () => {
    // The other half of R5: the overflow REPLACES the bar at ≤760, so an act
    // the bar offers and the ⋯ drops is an act that stops existing on a phone.
    //
    // **The two export kinds were exactly that** — owner ruling, *"in mobile
    // version we don't have download buttomn in : menu.add it."* The bar's
    // fourth control is `ExportMenu`, and it was the one act the ⋯ never
    // mirrored, so a person on a phone could not take a document out of the
    // product at all.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'کارهای بیشتر' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'ترتیب فرآیندها', 'اطلاعات دپارتمان', 'فرآیند جدید',
      'خروجی مستندات کامل', 'خروجی راهنمای گام‌به‌گام',
    ])
  })

  it('offers no export in the ⋯ to somebody who may not take one', async () => {
    // `reader_no_download` holds no `export_pdf`, and that role exists for
    // exactly this: the affordance must never be drawn for them. `READER` here
    // holds it, so the pairing is what proves the row is gated rather than
    // absent — a menu that never drew exports would pass the second half alone.
    mock()
    const { unmount } = renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
    fireEvent.click(await screen.findByRole('button', { name: 'کارهای بیشتر' }))
    expect(screen.getByRole('menuitem', { name: 'خروجی مستندات کامل' })).toBeInTheDocument()
    unmount()

    const NO_DOWNLOAD: SessionDescriptor = { ...READER, capabilities: ['view', 'comment'] }
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', NO_DOWNLOAD)
    fireEvent.click(await screen.findByRole('button', { name: 'کارهای بیشتر' }))
    expect(screen.queryByRole('menuitem', { name: /^خروجی/ })).toBeNull()
  })

  it('opens the reorder panel from the ⋯ as well as from the bar', async () => {
    // A menu whose rows are drawn and inert is the failure a "the row exists"
    // assertion cannot see.
    mock()
    renderAt('/departments/:code', <ToastProvider><ProcessList /></ToastProvider>, '/departments/cooking', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'کارهای بیشتر' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'ترتیب فرآیندها' }))
    expect(await screen.findByText(/ترتیب فرآیندهای/)).toBeInTheDocument()
  })

  it('links an heir only when it is one this reader can open', async () => {
    // R5 — a list never renders a row it would then refuse to open. An heir in
    // this department is reachable by anyone who was served the tombstone; an
    // heir named in another department is a 404 waiting to be clicked, so it is
    // drawn as the design draws it — mono text, not an anchor.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const body = String(input).includes('/processes')
        ? [{ ...PROCS[2], superseded_by: ['cooking-050', 'cashier-007'] }]
        : [{ code: 'cooking', name: 'پخت', count: 1 }]
      return Promise.resolve(new Response(JSON.stringify(body),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByRole('link', { name: /cooking-050/ }))
      .toHaveAttribute('href', '/processes/cooking-050')
    expect(screen.queryByRole('link', { name: /cashier-007/ })).not.toBeInTheDocument()
    expect(screen.getByText(/cashier-007/)).toBeInTheDocument()
  })

  it('stacks the row and drops its meta at ≤760, as a swap in the sheet', async () => {
    // §6.16's `[data-r-prow]` block: `flex-direction:column`, the meta row and
    // the position numeral gone. Read by value at both widths, because the base
    // row must NOT already be a column — `flex-col` appended rather than put
    // behind the variant paints a stacked row at 1440 and nothing in a class
    // check can tell the two apart.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    const row = document.querySelector('[data-r-prow]') as HTMLElement
    const meta = screen.getByTestId('meta-cooking-014')
    const pos = screen.getByTestId('pos-cooking-014')
    const rowPaint = await paint(row.className)
    expect(winner(rowPaint, 'flex-direction')).toBe('')
    expect(winner(rowPaint, 'flex-direction', '', MOBILE)).toBe('column')
    expect(winner(await paint(meta.className), 'display')).toBe('flex')
    expect(winner(await paint(meta.className), 'display', '', MOBILE)).toBe('none')
    expect(winner(await paint(pos.className), 'display', '', MOBILE)).toBe('none')
  })

  it('draws the row menu at the design’s 34px and grows only its target', async () => {
    // `Inja Panel.dc.html:355` — `width:34px;height:34px;border:1.5px solid
    // #E3D8F5;background:#fff;border-radius:11px;color:#4A25A9`. The same rung
    // the trash square used to draw at, which is why the swap is a swap and not
    // a resize; F11's 44px floor is a transparent ::before around it (34+2×5).
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    const more = screen.getAllByRole('button', { name: /^کارهای «/ })[0]
    expectExpandedHitArea(more)
    const painted = await paint(more.className)
    expect(winner(painted, 'width')).toBe('var(--size-tool)')
    expect(winner(painted, 'height')).toBe('var(--size-tool)')
    expect(winner(painted, 'background-color')).toBe('var(--card)')
    expect(winner(painted, 'color')).toBe('var(--violet)')
    expect(winner(painted, 'border-color')).toBe('var(--line)')
  })

  it('puts «گام‌به‌گام» beside «فلوچارت» on every row', async () => {
    // **Owner ruling: *"where is step by step bottumn? i have it in design, but
    // in currebt version no. add it"*** — `Inja Panel.dc.html:352`. It goes
    // first in the DOM, which in RTL puts it on the right, which is the
    // deliverable's own order.
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    const row = screen.getByText('خرید و پرداخت').closest('[data-r-prow]') as HTMLElement
    const labels = within(row).getAllByRole('button').map((b) => b.textContent)
    expect(labels.slice(0, 2)).toEqual(['گام‌به‌گام', 'فلوچارت'])
  })

  it('leaves no literal value in the file', () => {
    const src = readFileSync(SOURCE, 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
    expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
    expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
  })
})

/**
 * R39 — «اطلاعات کلی» leads to `Summary`, and a screen that will refuse must not
 * be offered a door (R5).
 *
 * When the department's three content switches are all off, `visibility.filtered`
 * hands a non-editor a document whose `summary`, `idef0` and `kpis` are present
 * and emptied, and `Summary` then draws its header and **nothing else**. Owner
 * ruling R43 removed the §6.3 card that used to stand in for the three sections,
 * so that screen no longer even carries a sentence about the absence: a list
 * that keeps offering the button is walking every reader in that department into
 * a page with a title on it and nothing beneath.
 *
 * **How the list knows, and why it discloses nothing new (NFR-12 / AC-25).**
 * `GET /api/departments/{code}/processes` runs `shown.redact(d, code)` over every
 * row — the same `Disclosure` that `GET /api/processes/{pid}` runs — so each row
 * in this list is byte-identical to what the summary screen would be served for
 * that process. The predicate reads the bytes the caller already holds. It is not
 * a count, not a flag and not a second endpoint: nothing crosses the wire that
 * did not cross it before, and a reader who may not have the fields still cannot
 * tell "withheld" from "never recorded" — which is precisely why the button is
 * withdrawn in BOTH cases rather than only the first.
 *
 * `hasPublishedDetail` is imported from `src/lib/published.ts`, the one place it
 * is written. Two spellings of one rule is how this project got its worst bugs,
 * and the OR-versus-per-field defect Task 16 removed was exactly that.
 */
describe('R39 — the list stops offering a summary that would be empty', () => {
  /** All three switchable fields as `visibility.filtered` blanks them. */
  const WITHHELD = {
    id: 'cooking-007', department: 'cooking', name: 'فرآیند بی‌جزئیات',
    summary: '', parent: null, idef0: NO_ICOM, kpis: [], pending: [], nodes: [],
  }

  it('draws no «اطلاعات کلی» for a reader whose row arrived with all three fields blank', async () => {
    mock([WITHHELD])
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
    await screen.findByText('فرآیند بی‌جزئیات')
    // Not merely missing from an open menu — the ⋮ itself is gone, because
    // «اطلاعات کلی» was the only thing a reader could have found in it and a
    // menu with nothing in it is a control that leads nowhere.
    expect(screen.queryByRole('button', { name: /^کارهای «/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'اطلاعات کلی' })).toBeNull()
    // …and the row is not gutted: «فلوچارت» is a screen that IS served to this
    // reader — §6.3's own card says so in as many words — so it stays.
    expect(screen.getByRole('button', { name: 'فلوچارت' })).toBeInTheDocument()
  })

  for (const [what, survivor] of [
    ['a published summary', { summary: 'این فرآیند خلاصه دارد' }],
    ['one ICOM term', { idef0: { ...NO_ICOM, inputs: ['درخواست خرید'] } }],
    ['one KPI', { kpis: [{ name: 'زمان چرخه' }] }],
  ] as const) {
    it(`keeps «اطلاعات کلی» when ${what} survives the filter`, async () => {
      // The three switches are INDEPENDENT (`visibility.py`: summary→
      // process_summary, idef0→process_idef0, kpis→process_kpis, each set
      // separately by `/visibility`), so "all three withheld" is the only case
      // that empties the page. Any one survivor and the summary has something on
      // it — which is what makes a predicate reading only `summary` wrong.
      mock([{ ...WITHHELD, ...survivor }])
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
      await screen.findByText('فرآیند بی‌جزئیات')
      openRowMenu('فرآیند بی‌جزئیات')
      expect(screen.getByRole('menuitem', { name: 'اطلاعات کلی' })).toBeInTheDocument()
    })
  }

  it('never withdraws it from an editor — their blank process is empty, not filtered', async () => {
    // `visibility.filtered` returns the document untouched for an editor, and
    // `_skeleton` writes every new process with `summary: ""`, an empty `idef0`
    // and `kpis: []`. So without the `mayEdit` half, EVERY process would lose
    // its button from the moment its own editor created it — and the summary
    // screen they were being kept away from is the one place they can fill it in.
    mock([WITHHELD])
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('فرآیند بی‌جزئیات')
    openRowMenu('فرآیند بی‌جزئیات')
    expect(screen.getByRole('menuitem', { name: 'اطلاعات کلی' })).toBeInTheDocument()
  })

  it('asks about THIS department: an editor of another one is served the reader’s document', async () => {
    // `Disclosure` passes `editor=self.edits(dept)` for the department the
    // document is in, so `dept:cashier` is filtered out of `cooking` exactly as
    // a reader is. Asking "does this person hold edit anywhere?" would leave
    // them the one button that leads nowhere.
    mock([WITHHELD])
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', OTHER_DEPT_EDITOR)
    await screen.findByText('فرآیند بی‌جزئیات')
    expect(screen.queryByRole('button', { name: /^کارهای «/ })).toBeNull()
  })

  it('decides per row, not per screen', async () => {
    // The mutation this exists for: a screen-wide guard — "does ANY row in this
    // department have published detail" — passes every test above on a
    // single-row fixture and takes the button off every row in a department
    // where one process is withheld, or leaves it on every row where one is not.
    mock([WITHHELD, { ...WITHHELD, id: 'cooking-008', name: 'فرآیند پرجزئیات', summary: 'خلاصهٔ منتشرشده' }])
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
    await screen.findByText('فرآیند پرجزئیات')
    // The ⋮ is the door now, and for a reader «اطلاعات کلی» is the only thing
    // behind it — so "one menu on two rows" is the same claim the button count
    // used to make, read one control further out.
    const offered = screen.getAllByRole('button', { name: /^کارهای «/ })
    expect(offered).toHaveLength(1)
    const rows = [...document.querySelectorAll('[data-r-prow]')]
    const withDoor = rows.find((r) => r.contains(offered[0]))!
    expect(within(withDoor as HTMLElement).getByText('فرآیند پرجزئیات')).toBeInTheDocument()
  })
})
