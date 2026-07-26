import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportMenu } from './ExportMenu'

afterEach(() => vi.restoreAllMocks())

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
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
