import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { InboxModal } from './InboxModal'

afterEach(() => vi.restoreAllMocks())
const ROW = { process: 'cooking-001', department: 'cooking', name: 'خرید', node: 'cooking-001-n020',
  index: 0, field: 'actor', current: 'مدیر رستوران', proposed: 'معاون مدیر', source: 'جلسه', status: 'open' }
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('InboxModal', () => {
  it('lists pending and accepts by (pid, index)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/pending')) return Promise.resolve(new Response(JSON.stringify([ROW]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-001' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    wrap(<InboxModal onClose={() => {}} />)
    expect(await screen.findByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /پذیرش/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/0', expect.objectContaining({ method: 'POST' })))
  })
})
