import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { screen } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'
import { hasPublishedDetail } from '../lib/published'
import type { Process } from '../api/types'
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

/**
 * **Owner ruling R43 — where a field was withheld, a non-editor sees nothing.**
 *
 * Not a stated limit, not a heading over an explanation: nothing. The owner was
 * shown both readings of this screen and chose the deliverable's, under a rule
 * they gave in their own words — *"if user couldn't see anything, we shouldn't
 * see anything about it. like design."*
 *
 * `ui/design/Inja Panel.dc.html` is the specification and says it structurally.
 * Line 409 opens `<sc-if value="{{ isEditor }}">` and line 463 closes it; the
 * A-0 card (:410), its heading «نمای IDEF0 سطح فرآیند (A-0)» (:412), the KPI
 * heading (:446) and both KPI states (:447, :460) sit inside that one guard. A
 * non-editor's summary screen in the deliverable is its header and nothing
 * beneath it.
 *
 * **This reverses part of Task 16.** That task implemented §6.3's *"a non-editor
 * sees a stated limit, not a blank"* and was right to, given the spec it had.
 * §6.3 still says it; the owner has overruled §6.3 for this screen, so a later
 * reader who finds that clause and no stated limit here is looking at a
 * decision, not a regression. The sentence «خلاصه، نمای IDEF0 و شاخص‌ها نمایش
 * داده نمی‌شوند» went with the sections — a sentence naming three withheld
 * sections is itself the disclosure the ruling removes.
 *
 * **What Task 16 got right is kept, and is what the pairs below are for.** The
 * three switches are INDEPENDENT — `visibility.py` maps summary→process_summary,
 * idef0→process_idef0, kpis→process_kpis and `/visibility` sets each separately
 * — so a withheld KPI list may not take the A-0 card down with it. An OR across
 * the three was a real defect. Every case is written twice, absent and present,
 * because a one-sided absence test passes just as happily against a screen that
 * draws nothing for anybody.
 */
describe('R43 — a non-editor sees nothing where a withheld field would be', () => {
  it('draws no A-0 card, no KPI heading, and no sentence naming either', async () => {
    mock(BLANKED)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    // The screen still RENDERS. The ruling withdraws the sections, not the page:
    // the name, the id and the flowchart door are not switchable fields.
    expect(await screen.findByRole('heading', { level: 1, name: 'خرید و پرداخت' })).toBeInTheDocument()
    expect(screen.getByText('cooking-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'مشاهدهٔ فلوچارت' })).toBeInTheDocument()

    expect(screen.queryByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeNull()
    expect(screen.queryByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeNull()
    expect(document.querySelector('[data-card]')).toBeNull()
    expect(document.querySelector('[data-r-idef0]')).toBeNull()
    expect(document.querySelector('[data-body]')).toBeNull()
    // No sentence about any of it, in either wording — neither the stated limit
    // R43 removes nor a «ثبت نشده است» that would be a claim of absence.
    expect(screen.queryByText(/نمایش داده نمی/)).toBeNull()
    expect(screen.queryByText(/ثبت نشده است/)).toBeNull()
  })

  it('serves an EDITOR every one of them, on the same bytes', async () => {
    // The pair, and the only thing that makes the test above mean anything.
    // `READER` is `EDITOR` minus `edit` and nothing else and the document is
    // byte-identical, so the capability is all that can explain a difference.
    // `routers/processes.py`'s `_skeleton` writes every new process exactly like
    // `BLANKED`, so this is also every process at the moment its own editor
    // created it: empty rather than filtered, and theirs to fill in here.
    mock(BLANKED)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
    expect(await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeInTheDocument()
    expect(screen.getByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeInTheDocument()
    expect(document.querySelector('[data-r-idef0]')).not.toBeNull()
    // …and «ثبت نشده است» survives for the one caller it is true for.
    expect(screen.getByText(/شاخصی برای این فرآیند ثبت نشده است/)).toBeInTheDocument()
  })

  it('keeps the A-0 card for a non-editor whose ICOM survived, and drops only the KPIs', async () => {
    mock({ ...BLANKED, idef0: { inputs: ['درخواست خرید'], controls: [], outputs: [], mechanisms: [] } })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeInTheDocument()
    expect(screen.getByText('درخواست خرید')).toBeInTheDocument()
    // The independence, from the side an OR would break: one withheld switch
    // takes its own section away and no other.
    expect(screen.queryByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeNull()
    expect(screen.queryByText(/ثبت نشده است/)).toBeNull()
  })

  it('keeps the KPI section for a non-editor whose KPIs survived, and drops only the A-0 card', async () => {
    mock({ ...BLANKED, kpis: [{ name: 'زمان چرخه', definition: 'میانگین', target: '۲ ساعت' }] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeInTheDocument()
    expect(screen.getByText('زمان چرخه')).toBeInTheDocument()
    expect(screen.queryByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeNull()
    // Four labelled columns with no chips is a claim of absence drawn instead of
    // written, so the frame goes with the heading.
    expect(document.querySelector('[data-r-idef0]')).toBeNull()
  })

  it('keeps the summary for a non-editor when the summary is the one that survived', async () => {
    // The ordinary mixed case: a department with `process_idef0` and
    // `process_kpis` off and `process_summary` on.
    mock({ ...BLANKED, summary: 'خلاصهٔ منتشرشده' })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    expect(await screen.findByText('خلاصهٔ منتشرشده')).toBeInTheDocument()
    expect(screen.queryByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeNull()
    expect(screen.queryByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeNull()
    expect(screen.queryByText(/نمایش داده نمی/)).toBeNull()
  })

  it('renders no subtitle hook at all when the summary is the withheld field', async () => {
    // `[data-body]` is what the browser gate grades the subtitle on. An
    // unguarded paragraph would put an EMPTY hook on the page — a zero-height
    // run of type the gate then measures, and a margin the design does not draw.
    mock({ ...BLANKED, kpis: [{ name: 'زمان چرخه' }] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    await screen.findByText('زمان چرخه')
    expect(document.querySelector('[data-body]')).toBeNull()
  })

  it('keeps «ثبت نشده است» for an editor looking at a genuinely empty KPI list', async () => {
    // The editor is served everything, so an empty list here really is empty.
    mock({ ...BLANKED, summary: 'خلاصه', idef0: { inputs: ['ورودی'], controls: [], outputs: [], mechanisms: [] } })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
    expect(await screen.findByText(/شاخصی برای این فرآیند ثبت نشده است/)).toBeInTheDocument()
  })

  it('says nothing at all to a reader on the SAME payload — the session is what decides', async () => {
    // The pair for the test above. Swapping the session in it once changed
    // nothing whatever: the KPI branch read the payload alone, which is F2
    // restated as a test.
    mock({ ...BLANKED, summary: 'خلاصه', idef0: { inputs: ['ورودی'], controls: [], outputs: [], mechanisms: [] } })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
    // Its ICOM survived, so the A-0 card is drawn…
    expect(await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeInTheDocument()
    // …and its KPI list did not, so that section is simply not there — neither
    // «ثبت نشده است», which would claim nobody recorded one, nor a sentence
    // saying the list is being withheld, which is what R43 removes.
    expect(screen.queryByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeNull()
    expect(screen.queryByText(/ثبت نشده است/)).toBeNull()
    expect(screen.queryByText(/نمایش داده نمی/)).toBeNull()
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

/**
 * **R39 × R43 — the door and the room, proved to agree.**
 *
 * `ProcessList` withdraws «اطلاعات کلی» exactly when `!mayEdit &&
 * !hasPublishedDetail(p)` (R39): never offer a control that leads somewhere with
 * nothing on it. Until R43 this screen *called* that same predicate, so the two
 * could not drift by construction — the list's question and the screen's whole
 * top-level branch were one expression.
 *
 * R43 deleted that branch. Each section now asks only about its own field, and
 * "nothing was published" is no longer a state this screen has a branch for: it
 * is simply every section declining to draw. The coupling therefore has to be
 * ASSERTED rather than compiled, and this table is the assertion. Over all eight
 * combinations of the three switchable fields, what a non-editor actually finds
 * below the header must equal `hasPublishedDetail` of the very bytes they were
 * served.
 *
 * It is a real mutation test and not a restatement: turning `published.ts`'s
 * `||` into `&&` reddens the six mixed rows here, exactly as it reddens the four
 * R39 rows in `ProcessList.test.tsx`. Widening the predicate reddens the empty
 * row. Neither file can move without the other going red.
 */
describe('what counts as published detail', () => {
  /** The three switchable fields, each as `visibility.filtered` leaves it when
   *  its switch is ON. Absent from a row means the switch was off — which is
   *  byte-identical to never having been recorded, which is the point. */
  const SURVIVES = {
    summary: { summary: 'خلاصهٔ منتشرشده' },
    idef0: { idef0: { inputs: ['درخواست خرید'], controls: [], outputs: [], mechanisms: [] } },
    kpis: { kpis: [{ name: 'زمان چرخه' }] },
  } as const
  const NAMES = ['summary', 'idef0', 'kpis'] as const

  /** All eight subsets, smallest first. */
  const CASES = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (bits) => NAMES.filter((_, i) => bits & (1 << i)))

  for (const on of CASES) {
    const label = on.length ? on.join(' + ') : 'nothing'
    it(`a non-editor served ${label} sees detail iff hasPublishedDetail says so`, async () => {
      const doc = Object.assign({ ...BLANKED }, ...on.map((k) => SURVIVES[k]))
      mock(doc)
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
      // The header is unconditional, so it is what tells us the read landed —
      // waiting on any section would beg the question this test asks.
      await screen.findByRole('heading', { level: 1, name: 'خرید و پرداخت' })

      // The three hooks the three sections put on the page, and nothing else is
      // below the header: the subtitle, the A-0 card, the KPI heading.
      const drawn = document.querySelector('[data-body]') !== null
        || document.querySelector('[data-card]') !== null
        || screen.queryByText('شاخص‌های کلیدی عملکرد (KPI)') !== null

      expect(drawn).toBe(hasPublishedDetail(doc as unknown as Process))
    })
  }

  it('offers an editor the whole screen on the row where a non-editor gets none of it', async () => {
    // The pair for the `nothing` row above, and the reason `hasPublishedDetail`
    // is never asked on its own: `visibility.filtered` returns the document
    // untouched to anyone holding `edit` on its department, so a blank one of
    // theirs is genuinely blank and every section is theirs to fill.
    mock(BLANKED)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
    await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
    expect(document.querySelector('[data-card]')).not.toBeNull()
    expect(screen.getByText('شاخص‌های کلیدی عملکرد (KPI)')).toBeInTheDocument()
    expect(hasPublishedDetail(BLANKED as unknown as Process)).toBe(false)
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

  /**
   * **Owner ruling — the summary is prose in a card, not a subtitle on the
   * field.** *"the information in top of this page, i want to put this text in
   * white box like IDEF0 box, exactly like department information page."*
   *
   * So ledger L-28's `--role-subtitle-on-field` no longer applies to it: that
   * colour is for type on the violet, and this paragraph is on white. «exactly
   * like» is checked against `Overview.tsx`'s own «شرح دپارتمان» recipe rather
   * than against a remembered list — the five classes below are that
   * paragraph's, and `DESIGN.summary.body` grades the paint they compile to.
   */
  it('draws the summary as card prose on Overview’s own recipe', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
    const body = document.querySelector('[data-body]')!
    expect(body.className).toContain('text-fs-body')
    expect(body.className).toContain('text-ink')
    expect(body.className).toContain('leading-loose')
    expect(body.className).toContain('text-justify')
    expect(body.className).not.toContain('text-role-subtitle-on-field')
    // …and it is inside the screen's FIRST card, above the A-0 block, which is
    // what «in white box like IDEF0 box» asks for and what `DESIGN.summary.card`
    // grades `.first()` of.
    const card = document.querySelector('[data-card]')!
    expect(card.contains(body)).toBe(true)
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
