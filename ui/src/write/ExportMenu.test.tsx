import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportMenu } from './ExportMenu'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

// The four descriptors below differ from EXPORTER one field at a time, so an
// assertion that separates any two of them can only be separating them on that
// field.
/** The seeded `reader`: holds `export_pdf` over the whole department shown. */
const EXPORTER: SessionDescriptor = {
  username: '09120000001', displayName: 'کاربر', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
/** The seeded `reader_no_download`: `reader` minus `export_pdf` and nothing else
 *  (ui-backend/inja_ui_backend/seed.py). Withholding download is the entire
 *  reason that role exists, so its holder must not be offered the menu at all. */
const NO_DOWNLOAD: SessionDescriptor = {
  ...EXPORTER, role: 'reader_no_download', capabilities: ['view', 'comment'],
}
/** Holds `export_pdf` — but over another department. Separates "may this person
 *  export anything?" from "may they export THIS department?". */
const OTHER_DEPT: SessionDescriptor = { ...EXPORTER, scopes: ['dept:cooking'] }
/** Holds `export_pdf` for one report kind of this department — the narrower of
 *  the two shapes D10 allows, and the target the export route actually gates on
 *  (`dept:{code}/report:{kind}` in routers/exports.py). */
const STEPS_ONLY: SessionDescriptor = { ...EXPORTER, scopes: ['dept:dining/report:steps'] }

function renderMenu(session: SessionDescriptor = EXPORTER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['session'], session)
  return render(<QueryClientProvider client={client}><ExportMenu department="dining" /></QueryClientProvider>)
}

function body(url: string) {
  return new Response(JSON.stringify({ url, generated_at: '2026-07-26T09:00:00Z' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function ok(url = '/exports/dining/flowchart-0123456789abcdef.html') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(body(url))
}

/** A fetch that stays in flight until `settle()` is called, so the pending
 *  window can be inspected instead of only the instant after the click. */
function inFlight() {
  let release!: (r: Response) => void
  const spy = vi.spyOn(globalThis, 'fetch')
    .mockReturnValue(new Promise<Response>((resolve) => { release = resolve }))
  return {
    spy,
    settle: (url = '/exports/dining/flowchart-0123456789abcdef.html') => release(body(url)),
  }
}

describe('ExportMenu — who is offered an export at all', () => {
  it('offers every kind to a holder of export_pdf over the department', () => {
    // The over-hiding guard: a department-wide grant covers every report kind,
    // including kinds added later, so neither item may go missing.
    renderMenu(EXPORTER)
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    expect(screen.getByText('خروجی مستندات کامل')).toBeInTheDocument()
    expect(screen.getByText('خروجی راهنمای گام‌به‌گام')).toBeInTheDocument()
  })

  it('draws nothing for a reader_no_download holder', () => {
    renderMenu(NO_DOWNLOAD)
    expect(screen.queryByRole('button', { name: 'خروجی‌ها' })).not.toBeInTheDocument()
  })

  it('draws nothing for an export_pdf holder scoped to another department', () => {
    renderMenu(OTHER_DEPT)
    expect(screen.queryByRole('button', { name: 'خروجی‌ها' })).not.toBeInTheDocument()
  })

  it('offers only the kind a report-scoped grant covers', () => {
    renderMenu(STEPS_ONLY)
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    expect(screen.getByText('خروجی راهنمای گام‌به‌گام')).toBeInTheDocument()
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()
  })
})

describe('ExportMenu', () => {
  it('opens and closes the dropdown', () => {
    renderMenu()
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    expect(screen.getByText('خروجی مستندات کامل')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()
  })

  it('posts the flowchart kind and shows the pending modal immediately', async () => {
    const fetchSpy = ok()
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))

    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()  // menu closed
    // react-query dispatches the mutationFn on a microtask, so the request is
    // asserted once it has actually gone out — the modal is up before it does.
    await screen.findByText('خروجی آماده شد')
    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/exports/flowchart', expect.objectContaining({ method: 'POST' }))
  })

  it('posts the steps kind', async () => {
    const fetchSpy = ok('/exports/dining/steps-0123456789abcdef.html')
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی راهنمای گام‌به‌گام'))
    await screen.findByText('خروجی آماده شد')
    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/exports/steps', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the link as an absolute url', async () => {
    ok('/exports/dining/flowchart-0123456789abcdef.html')
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    await screen.findByText('خروجی آماده شد')
    expect(screen.getByDisplayValue(`${window.location.origin}/exports/dining/flowchart-0123456789abcdef.html`)).toBeInTheDocument()
  })

  it('closes the dropdown on an outside click', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    expect(screen.getByText('خروجی مستندات کامل')).toBeInTheDocument()
    // the handler listens on mousedown, which fireEvent.click does not emit
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('خروجی مستندات کامل')).not.toBeInTheDocument()
  })

  it('disables the trigger for the whole request, not just the instant after the click', async () => {
    const req = inFlight()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'خروجی‌ها' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    expect(trigger).toBeDisabled()

    // still in flight after the microtasks that dispatch the request have run
    await Promise.resolve()
    expect(trigger).toBeDisabled()

    req.settle()
    await screen.findByText('خروجی آماده شد')
    expect(trigger).toBeEnabled()
  })

  it('keeps the trigger disabled after a pending modal is closed', async () => {
    const req = inFlight()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'خروجی‌ها' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'بستن پنجره' }))
    expect(screen.queryByText('در حال آماده‌سازی خروجی…')).not.toBeInTheDocument()
    // nothing aborts the POST, so the write is still on its way to the same
    // deterministic filename; a second export here would race it (last writer
    // wins on content). The trigger must follow the request, not the modal.
    expect(trigger).toBeDisabled()

    req.settle()
    await waitFor(() => expect(trigger).toBeEnabled())
    expect(req.spy).toHaveBeenCalledTimes(1)
  })

  it('starts the next export clean after a pending modal was closed', async () => {
    const first = inFlight()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'خروجی‌ها' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    fireEvent.click(screen.getByRole('button', { name: 'بستن پنجره' }))
    first.settle()
    await waitFor(() => expect(trigger).toBeEnabled())

    // the settled-but-unreset mutation must not leak its old result into the
    // next modal: the second export opens pending, never a stale ready link.
    vi.restoreAllMocks()
    ok('/exports/dining/steps-fedcba9876543210.html')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('خروجی راهنمای گام‌به‌گام'))
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    await screen.findByText('خروجی آماده شد')
    expect(screen.getByDisplayValue(`${window.location.origin}/exports/dining/steps-fedcba9876543210.html`)).toBeInTheDocument()
  })

  it('surfaces a backend failure and retries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }))
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'خروجی‌ها' }))
    fireEvent.click(screen.getByText('خروجی راهنمای گام‌به‌گام'))
    await screen.findByText('خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)')

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
  })
})
