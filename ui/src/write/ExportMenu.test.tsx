import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportMenu } from './ExportMenu'

afterEach(() => vi.restoreAllMocks())

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ExportMenu department="dining" /></QueryClientProvider>)
}

function ok(url = '/exports/dining/flowchart-0123456789abcdef.html') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ url, generated_at: '2026-07-26T09:00:00Z' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
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

  it('disables the trigger while a request is in flight', async () => {
    ok()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'خروجی‌ها' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('خروجی مستندات کامل'))
    expect(trigger).toBeDisabled()
    await screen.findByText('خروجی آماده شد')
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
