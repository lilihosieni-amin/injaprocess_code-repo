import type { ReactNode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWrapper } from '../test/utils'
import { useApproveComment, useInbox } from './comments'

afterEach(() => vi.restoreAllMocks())
const mock = (body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))

describe('comment hooks', () => {
  it('useInbox asks for the tab and page', async () => {
    const spy = mock({ items: [], total: 0, page: 2, pages: 2 })
    const { result } = renderHook(() => useInbox('all', 2), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy.mock.calls[0][0]).toBe('/api/comments/inbox?tab=all&page=2')
  })
  it('useApproveComment POSTs the note and invalidates the session', async () => {
    const spy = mock({ id: 'CMT-1' })
    const client = new QueryClient()
    const inv = vi.spyOn(client, 'invalidateQueries')
    const Wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useApproveComment(), { wrapper: Wrapper })
    result.current.mutate({ ref: 'CMT-1', note: 'یادداشت' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/comments/CMT-1/approve',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ note: 'یادداشت' }) }))
    expect(inv).toHaveBeenCalledWith({ queryKey: ['session'] })
    expect(inv).toHaveBeenCalledWith({ queryKey: ['comments'] })
  })
})
