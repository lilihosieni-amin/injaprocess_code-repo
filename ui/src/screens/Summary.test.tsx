import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { screen } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** READER is EDITOR minus `edit` and nothing else — same scope over the process's
 *  own department — so only `edit` can explain a difference between the two. */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const READER: SessionDescriptor = { ...EDITOR, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'] }
/** Holds `edit` — but over another department, so the screen must ask about the
 *  process's own department rather than about the person. */
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:cashier'] }

const withKpi = {
  id: 'cooking-002', department: 'cooking', name: 'پخت غذای روز', summary: 'خلاصه', parent: null,
  idef0: { inputs: ['لیست سفارش'], controls: ['دستور پخت'], outputs: ['غذای آماده'], mechanisms: ['آشپز'] },
  kpis: [{ name: 'زمان آماده‌سازی', definition: 'میانگین زمان', target: 'کمتر از ۱۵ دقیقه' }],
  nodes: [], edges: [], pending: [],
}

function mock(doc: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(doc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('Summary', () => {
  it('renders the A-0 ICOM chips and KPI cards', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    expect(await screen.findAllByText('پخت غذای روز')).toHaveLength(2)
    expect(screen.getByText('لیست سفارش')).toBeInTheDocument()
    expect(screen.getByText('غذای آماده')).toBeInTheDocument()
    expect(screen.getByText('زمان آماده‌سازی')).toBeInTheDocument()
  })

  it('shows the no-fabrication note when there are no KPIs — to the editor it is true for', async () => {
    // EDITOR, not the default sessionless render. `visibility.filtered` returns
    // the document untouched for an editor and blanks `kpis` for everybody else,
    // so «سامانه اطلاعات را نمی‌سازد» is a statement only an editor's empty list
    // can carry. Without the session this passed for a caller the claim is
    // false for.
    mock({ ...withKpi, kpis: [] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    expect(await screen.findByText(/سامانه اطلاعات را نمی‌سازد/)).toBeInTheDocument()
  })

  it('offers the edit button to an editor of the process\'s department', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    expect(await screen.findByRole('button', { name: 'ویرایش اطلاعات' })).toBeInTheDocument()
  })

  it('draws no edit button for a reader, and keeps the flowchart button', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', READER)
    expect(await screen.findByRole('button', { name: 'مشاهدهٔ فلوچارت' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش اطلاعات' })).not.toBeInTheDocument()
  })

  it('draws no edit button for an editor scoped to a different department', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', OTHER_DEPT_EDITOR)
    expect(await screen.findByRole('button', { name: 'مشاهدهٔ فلوچارت' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش اطلاعات' })).not.toBeInTheDocument()
  })
})

describe('a read that failed', () => {
  it('says so, and offers the retry, instead of a page that stays blank for ever', async () => {
    // `refusalStatus` maps 403 and 404 and nothing else, so a 500, a dropped
    // connection or an unparseable body fell through to `!p` and drew
    // `<div class="flex-1 …"/>` — nothing to read, nothing to press, no way to
    // tell it from a slow network. `Users`, `UserDetail` and `Visibility` each
    // grew this branch on this branch; this screen did not.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    expect(await screen.findByText('اطلاعات فرآیند بارگذاری نشد.')).toBeInTheDocument()
    // Worth asking again, which is what a 5xx is and a 4xx is not — decided by
    // `retryQuery`, the same predicate the query itself uses.
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
  })

  it('paints the violet field while the read is in flight, not the warm cream', async () => {
    // `background-color` does not inherit, which is the reason every rebuilt
    // `[data-screen]` repeats `bg-ink`. The in-flight blank wrote `bg-bg` — the
    // warm cream — so the first navigation to this screen flashed a full
    // viewport of it over the field. Measured in Chrome at 1440x1000.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    const { container } = renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    const blank = container.firstElementChild as HTMLElement
    expect(blank.className).toContain('bg-ink')
    expect(blank.className).not.toContain('bg-bg')
  })
})

const TOMB = {
  id: 'cooking-002', department: 'cooking', name: 'فرآیند قدیمی', summary: 's',
  source: { type: 'voice', ref: null, run: null }, parent: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [], edges: [], pending: [],
  tombstoned: true, superseded_by: ['cooking-050'],
}

describe('Summary — tombstoned', () => {
  it('shows a tombstone banner + heir link, hides edit, but keeps the (read-only) flowchart button', async () => {
    mock(TOMB)
    // As an EDITOR: a tombstone hides the edit button from the very person who
    // would otherwise have it, which is the only way this assertion means anything.
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    expect(await screen.findAllByText('فرآیند قدیمی')).not.toHaveLength(0)
    expect(screen.getByText(/باطل شده/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cooking-050/ })).toHaveAttribute('href', '/processes/cooking-050')
    expect(screen.queryByRole('button', { name: 'ویرایش اطلاعات' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'مشاهدهٔ فلوچارت' })).toBeInTheDocument()
  })
})

/**
 * A process as `visibility.filtered` hands it to a reader whose department has
 * the content switch off: `summary`, `idef0` and `kpis` are **present and
 * emptied**, not dropped (`api/types.ts`, `ReadableProcess`). Byte for byte
 * this is also what a genuinely empty process looks like, which is the whole
 * point — the screen cannot tell them apart and must not pretend it can.
 */
const BLANKED = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت',
  summary: '', parent: null,
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [], edges: [], pending: [],
}

describe('a reader whose policy blanked the detail', () => {
  it('is told the fields are not shown, and is not told they are empty', async () => {
    // «شاخصی ثبت نشده است» asserts that nobody recorded one. When the policy
    // blanked the field the app cannot tell that from "withheld", so it says
    // neither — it states the only thing it knows, which is that they are not
    // being shown. Same rule as the departments conflict tile.
    mock(BLANKED)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).toBeInTheDocument()
    expect(screen.queryByText(/شاخصی برای این فرآیند ثبت نشده است/)).not.toBeInTheDocument()
    expect(screen.queryByText('نمای IDEF0 سطح فرآیند (A-0)')).not.toBeInTheDocument()
  })

  it('draws the detail the moment any of it arrives', async () => {
    mock({ ...BLANKED, summary: 'خلاصهٔ واقعی' })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('خلاصهٔ واقعی')).toBeInTheDocument()
    expect(screen.queryByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).not.toBeInTheDocument()
  })

  it('keeps «ثبت نشده است» for an editor looking at a genuinely empty KPI list', async () => {
    // The editor is served everything, so an empty list here really is empty.
    mock({ ...BLANKED, summary: 'خلاصه', idef0: { inputs: ['ورودی'], controls: [], outputs: [], mechanisms: [] } })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
    expect(await screen.findByText(/شاخصی برای این فرآیند ثبت نشده است/)).toBeInTheDocument()
  })

  it('says the opposite to a reader on the SAME payload — the session is what decides', async () => {
    // The pair that makes the test above mean something. `READER` is `EDITOR`
    // minus `edit` and nothing else, and the document is byte-identical, so only
    // the capability can explain the difference. Swapping the session in that
    // test used to change nothing at all: `hasPublishedDetail` and the KPI
    // branch read the payload alone, which is F2 restated as a test.
    mock({ ...BLANKED, summary: 'خلاصه', idef0: { inputs: ['ورودی'], controls: [], outputs: [], mechanisms: [] } })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText(/نمایش داده نمی‌شوند\.$/)).toBeInTheDocument()
    expect(screen.queryByText(/شاخصی برای این فرآیند ثبت نشده است/)).toBeNull()
  })

  it('is the ordinary mixed case — summary published, KPIs withheld — and says nothing about the list', async () => {
    // **The defect Task 16 existed to fix, one level down.** The three switches
    // are independent (`visibility.py`: summary→process_summary,
    // idef0→process_idef0, kpis→process_kpis) and `/visibility` sets each
    // separately, so this is not an exotic fixture: it is what a department with
    // `process_kpis` off looks like to every non-editor. `hasPublishedDetail` is
    // an OR, so the detail block was drawn and the screen printed «شاخصی برای
    // این فرآیند ثبت نشده است» — a claim that nobody recorded one — about a list
    // the policy had withheld.
    mock({ ...BLANKED, summary: 'خلاصهٔ منتشرشده' })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('خلاصهٔ منتشرشده')).toBeInTheDocument()
    expect(screen.queryByText(/ثبت نشده است/)).toBeNull()
    // …and the A-0 block is not drawn as an empty diagram either: four labelled
    // columns with no chips is the same claim made in pictures.
    expect(document.querySelector('[data-r-idef0]')).toBeNull()
    expect(screen.getByText(/نمای IDEF0 این فرآیند نمایش داده نمی‌شود/)).toBeInTheDocument()
  })

  it('never shows the withheld card to an editor — a brand-new process is empty, not filtered', async () => {
    // `routers/processes.py`'s `_skeleton` writes every new process with
    // `summary: ""`, an empty `idef0` and `kpis: []`. So EVERY process, at the
    // moment its own editor created it, told that editor «سیاست نمایش محتوای
    // این دپارتمان تعیین می‌کند…» — false, because `visibility.filtered` returns
    // early for an editor and filters nothing — and hid the honest empty states
    // behind it.
    mock(BLANKED)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
    expect(await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeInTheDocument()
    expect(screen.queryByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).toBeNull()
    expect(screen.getByText(/شاخصی برای این فرآیند ثبت نشده است/)).toBeInTheDocument()
  })
})

describe('the screen’s own shape', () => {
  it('names the two hooks the ≤760 pass targets', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
    const idef0 = document.querySelector('[data-r-idef0]')!
    expect(idef0.className).toContain('max760:flex')
    expect(idef0.className).toContain('max760:flex-col')
    expect(idef0.className).toContain('max760:gap-s6')
    // The read branch's two-column grid is the KPI pair; the edit branch puts
    // the same hook on the ICOM pair. Both collapse at ≤760.
    const twoCol = document.querySelector('[data-r-2col]')!
    expect(twoCol.className).toContain('grid-cols-2')
    expect(twoCol.className).toContain('max760:grid-cols-1')
  })

  it('puts the title and the section heading on the dark field, in white', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.className).toContain('text-role-title-on-field')
    // Ledger P3-2: §6.3 says this heading is #2A1D5E, which is the field it
    // sits on. §6.0 settles it — headings on the field are #fff.
    expect(screen.getByText('شاخص‌های کلیدی عملکرد (KPI)').className).toContain('text-role-title-on-field')
  })

  it('paints the field it sits on, and caps the column where the design does', async () => {
    // `getComputedStyle` does not inherit, and the e2e gate reads
    // `background-color` off THIS element: a root that painted nothing would
    // compute transparent however violet the shell behind it is.
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
    const root = document.querySelector('[data-screen="summary"]')!
    expect(root.className).toContain('bg-ink')
    expect(root).toHaveAttribute('data-r-pad')
    expect(document.querySelector('[data-col]')!.className).toContain('max-w-summary')
  })

  it('uses no character as an icon', () => {
    const src = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8')
    expect(src).not.toMatch(/>×</)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
    expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
    expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
  })
})

describe('what counts as published detail', () => {
  // Three fields, three clauses, and the card must stay away if ANY of them
  // arrived. A predicate that only looked at `summary` would tell a reader
  // holding a full ICOM diagram that it is not being shown.
  it('draws the A-0 card for a process whose only detail is its ICOM', async () => {
    mock({ ...BLANKED, idef0: { inputs: ['درخواست خرید'], controls: [], outputs: [], mechanisms: [] } })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeInTheDocument()
    expect(screen.queryByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).not.toBeInTheDocument()
  })

  it('draws the detail for a process whose only detail is a KPI', async () => {
    mock({ ...BLANKED, kpis: [{ name: 'زمان چرخه' }] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('زمان چرخه')).toBeInTheDocument()
    expect(screen.queryByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).not.toBeInTheDocument()
  })

  it('renders no subtitle hook at all when the summary is the blanked field', async () => {
    // `[data-body]` is what the browser gate grades the subtitle on. An
    // unguarded paragraph would put an EMPTY hook on the page — a zero-height
    // run of type the gate then measures, and a margin the design does not draw.
    mock({ ...BLANKED, kpis: [{ name: 'زمان چرخه' }] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    await screen.findByText('زمان چرخه')
    expect(document.querySelector('[data-body]')).toBeNull()
  })
})

describe('the values the browser gate grades, named where jsdom can see them', () => {
  // jsdom lays nothing out, so each of these proves a class STRING was written
  // and nothing about a pixel. They exist because `e2e/summary.spec.ts` is the
  // only thing that measures the paint, and a red there is a slow, three-width
  // round trip; a wrong token name is cheaper to catch here.
  it('gives the A-0 card the recipe the summary row is graded against', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
    const card = document.querySelector('[data-card]')!
    // radius 18 (`--radius-doc`), the L-15 hairline, the two-layer card shadow,
    // white — the four values `DESIGN.summary.card` holds.
    expect(card.className).toContain('rounded-doc')
    expect(card.className).toContain('border-border-card')
    expect(card.className).toContain('shadow-card')
    expect(card.className).toContain('bg-card')
  })

  it('writes the subtitle in the colour ledger L-28 decided', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
    expect(document.querySelector('[data-body]')!.className).toContain('text-role-subtitle-on-field')
  })

  it('keeps the A-0 box violet with the mono id as an LTR island', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    const id = await screen.findByText(/A-0 ·/)
    // §8 — a latin run inside RTL prose is pinned, and this is the one thing on
    // the screen that pins it. `src/test/guards.test.ts` declares the file as
    // an island for exactly this attribute.
    expect(id).toHaveAttribute('dir', 'ltr')
    expect(id.className).toContain('font-mono')
    expect(id.parentElement!.className).toContain('bg-violet')
  })
})
