import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportDownloads } from './ReportDownloads'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/**
 * The registry the hook reads (D26, `GET /api/reports`) — the same two entries
 * every other fixture holds, in the same order. The row labels are the
 * registry's own `name`, so they are fixture data here and nothing this file
 * asserts a wording for: `ProcessList.test.tsx` owns the labels and their order.
 */
const REPORTS = {
  reports: [
    { id: 'steps', name: 'دانلود گام‌به‌گام', short: 'راهنمای گام‌به‌گام',
      description: 'همان فرآیندها، بازنویسی‌شده به گام‌های شماره‌دار.' },
    { id: 'flowchart', name: 'دانلود فلوچارتی', short: 'مستندات کامل',
      description: 'هر فرآیند در یک برگ، به ترتیب سازمان‌یافتهٔ دپارتمان.' },
  ],
}

/** Holds `export_pdf` over the whole department shown — every report. */
const EXPORTER: SessionDescriptor = {
  username: '09120000001', displayName: 'کاربر', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
/** `export_pdf` over ONE report of this department — the narrower of the two
 *  shapes D10 allows, and the target the build route itself gates on
 *  (`dept:{code}/report:{id}`). Differs from EXPORTER in `scopes` alone. */
const STEPS_ONLY: SessionDescriptor = { ...EXPORTER, scopes: ['dept:dining/report:steps'] }

/**
 * Where a built report really lives: the file is served BY the build endpoint
 * (`…/reports/{kind}/file.pdf`), which re-derives the caller's scope on every
 * request. A fixture shaped like the retired public `/exports/…` path would make
 * this file pass while the dialog handed over a link the deployment cannot
 * answer — which is how the withdrawn viewer's own test put it: such a url
 * "would otherwise sit here indefinitely, as the retired one did".
 */
const PDF = '/api/departments/dining/reports/steps/file.pdf'

/** A built report. `pdf_url` is **absent**, never null, when the server printed
 *  no PDF — that is the shape `ExportResult` declares and the one the failure
 *  below has to be built from. */
function built(pdfUrl?: string) {
  return new Response(JSON.stringify(pdfUrl === undefined
    ? { generated_at: '2026-07-26T09:00:00Z' }
    : { pdf_url: pdfUrl, generated_at: '2026-07-26T09:00:00Z' }),
  { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** The registry for the rows, `build` for the POST the pressed row fires. */
function mock(build: () => Promise<Response> = () => Promise.resolve(built(PDF))) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if ((init as RequestInit | undefined)?.method === 'POST') return build()
    if (String(input) === '/api/reports') {
      return Promise.resolve(new Response(JSON.stringify(REPORTS),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}

/** The builds that went out — asserted on the requests themselves rather than on
 *  a disabled attribute, so the guard may live anywhere and still be pinned. */
function posts(spy: ReturnType<typeof mock>) {
  return spy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
}

/**
 * The hook as its three callers use it: a row per report, and `modal` rendered
 * at the root beside them (never inside a menu — at ≤760 the panel's own menu
 * box is `display:none`, and a `position:fixed` dialog inside one is not
 * painted). The rows are plain buttons because the hook does not know what draws
 * them: the bar's ⋯, the title row's ⋯ and the reader's ⋮ all draw these same
 * three lines.
 */
function Downloads({ department = 'dining' }: { department?: string }) {
  const { reports, run, modal } = useReportDownloads(department)
  return (
    <>
      {reports.map((r) => (
        <button key={r.id} type="button" onClick={() => run(r)}>{r.name}</button>
      ))}
      {modal}
    </>
  )
}

/** Escape, the dismissal the finding names — on `document`, which is where
 *  `Overlay` listens; an event dispatched on `window` never reaches it. Used in
 *  place of the close button because «بستن» names two controls in the settled
 *  states (the header's × and the footer's button) and either one is this act. */
function dismiss() {
  fireEvent.keyDown(document, { key: 'Escape' })
}

function renderDownloads(session: SessionDescriptor = EXPORTER) {
  return renderAt('/', <Downloads />, '/', session)
}

describe('useReportDownloads', () => {
  it('builds the report the pressed row names', async () => {
    const spy = mock()
    renderDownloads()
    fireEvent.click(await screen.findByRole('button', { name: 'دانلود گام‌به‌گام' }))
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    await screen.findByText('خروجی آماده شد')
    expect(posts(spy)[0][0]).toBe('/api/departments/dining/reports/steps')

    dismiss()
    fireEvent.click(screen.getByRole('button', { name: 'دانلود فلوچارتی' }))
    await waitFor(() => expect(posts(spy)).toHaveLength(2))
    expect(posts(spy)[1][0]).toBe('/api/departments/dining/reports/flowchart')
  })

  it('hands the modal the server pdf_url, made absolute', async () => {
    mock()
    renderDownloads()
    fireEvent.click(await screen.findByRole('button', { name: 'دانلود گام‌به‌گام' }))
    await screen.findByText('خروجی آماده شد')
    // Absolute so the copied text is worth pasting, and on this host (D16) —
    // and the path is the endpoint's own, which is why it resolves at all.
    expect(screen.getByDisplayValue(`${window.location.origin}${PDF}`)).toBeInTheDocument()
  })

  it('calls a 2xx with no pdf_url a failure, and says why', async () => {
    // The PDF **is** the deliverable (D28), so "the build ran and printed
    // nothing" is a failed download and not a success with no link — a
    // deployment fault (no browser, a crash, a timeout) the person pressing the
    // row can only report, which is what the sentence tells them to do.
    mock(() => Promise.resolve(built()))
    renderDownloads()
    fireEvent.click(await screen.findByRole('button', { name: 'دانلود گام‌به‌گام' }))
    expect(await screen.findByText('خروجی گرفته نشد')).toBeInTheDocument()
    expect(screen.getByText(/فایل PDF آن روی سرور تولید نشد/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /باز کردن خروجی/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
  })

  it('draws a report-scoped caller only the row their grant covers', async () => {
    // Cosmetic (every route re-derives permission), but the direction that
    // matters is over-hiding: asking about the bare department instead of about
    // each report would draw nothing for this session, hiding a download the
    // server would happily serve.
    mock()
    renderDownloads(STEPS_ONLY)
    expect(await screen.findByRole('button', { name: 'دانلود گام‌به‌گام' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'دانلود فلوچارتی' })).toBeNull()
  })

  it('starts no second build while one is in flight, dismissed modal or not', async () => {
    // Nothing aborts the POST (D-abort) and the filename is deterministic, so a
    // second build would race the first for the same file and the older write
    // could land last. The dialog is dismissible in every state (Escape and the
    // close button), so «press → close → press» is the reachable sequence, and
    // the rows stay live throughout: the guard is in the hook, which is the only
    // place that covers all three menus that draw them.
    let release!: (r: Response) => void
    const spy = mock(() => new Promise<Response>((resolve) => { release = resolve }))
    renderDownloads()
    fireEvent.click(await screen.findByRole('button', { name: 'دانلود گام‌به‌گام' }))
    await waitFor(() => expect(posts(spy)).toHaveLength(1))

    dismiss()
    expect(screen.queryByText('در حال آماده‌سازی خروجی…')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'دانلود گام‌به‌گام' }))
    // …the same build, back on screen, and no second request behind it.
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'دانلود فلوچارتی' }))
    await waitFor(() => expect(posts(spy)).toHaveLength(1))

    // …and once it settles the next build goes out normally.
    release(built(PDF))
    await screen.findByText('خروجی آماده شد')
    dismiss()
    fireEvent.click(screen.getByRole('button', { name: 'دانلود فلوچارتی' }))
    await waitFor(() => expect(posts(spy)).toHaveLength(2))
  })
})
