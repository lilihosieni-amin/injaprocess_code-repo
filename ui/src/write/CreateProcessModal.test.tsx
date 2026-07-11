import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { CreateProcessModal } from './CreateProcessModal'

afterEach(() => vi.restoreAllMocks())
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('CreateProcessModal', () => {
  it('shows the suggested id and POSTs on create', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/next-id')) return Promise.resolve(new Response(JSON.stringify({ next_id: 'cooking-007' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-007' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={() => {}} />)
    expect(await screen.findByText('cooking-007')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/فرآیند/), { target: { value: 'فرآیند تست' } })
    fireEvent.click(screen.getByRole('button', { name: /ایجاد/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes', expect.objectContaining({ method: 'POST' })))
  })
})
