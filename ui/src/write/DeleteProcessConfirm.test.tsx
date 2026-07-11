import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { DeleteProcessConfirm } from './DeleteProcessConfirm'

afterEach(() => vi.restoreAllMocks())
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('DeleteProcessConfirm', () => {
  it('DELETEs and closes on confirm', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ deleted: 'cooking-002' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    expect(screen.getByText(/پخت/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /حذف کامل فرآیند/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'DELETE' })))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
