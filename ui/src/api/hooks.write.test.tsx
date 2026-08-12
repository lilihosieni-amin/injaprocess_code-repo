import type { ReactNode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWrapper } from '../test/utils'
import { useCreateProcess, useDeleteProcess, useNextId, usePending, usePutOverview,
  usePutProcess, useResolveInboxPending, useResolvePending } from './hooks'

afterEach(() => vi.restoreAllMocks())
function mock(body: unknown = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

/** `createWrapper` keeps its client to itself, and these tests are about what a
 *  mutation does to that client rather than about the request it sends. Same
 *  recording as `ConfirmMark.test.tsx`: note the key, then invalidate for real. */
function recordingWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const keys: unknown[][] = []
  const real = client.invalidateQueries.bind(client)
  vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) => {
    keys.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])
    return real(filters)
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { Wrapper, keys }
}

describe('write hooks', () => {
  it('usePutOverview PUTs the overview', async () => {
    const spy = mock()
    const { result } = renderHook(() => usePutOverview('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ department: 'cooking' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' }))
  })
  it('useDeleteProcess DELETEs', async () => {
    const spy = mock({ deleted: 'cooking-002' })
    const { result } = renderHook(() => useDeleteProcess(), { wrapper: createWrapper() })
    result.current.mutate('cooking-002')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'DELETE' }))
  })
  it('useNextId GETs the preview id', async () => {
    mock({ next_id: 'cooking-007' })
    const { result } = renderHook(() => useNextId('cooking'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data?.next_id).toBe('cooking-007'))
  })
  it('usePending GETs the aggregate', async () => {
    mock([{ process: 'cooking-001', index: 0 }])
    const { result } = renderHook(() => usePending(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data?.length).toBe(1))
  })
  it('useResolveInboxPending POSTs the decision', async () => {
    const spy = mock({ id: 'cooking-001' })
    const { result } = renderHook(() => useResolveInboxPending(), { wrapper: createWrapper() })
    result.current.mutate({ pid: 'cooking-001', index: 2, decision: 'accept' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/2', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'accept' }) }))
  })
})

/**
 * A confirmation is a fingerprint over the content (D20), so every one of these
 * endpoints can un-confirm a document — and the mark's listing is the only thing
 * that carries that fact. The observer stays mounted across a write, so a write
 * that does not invalidate leaves «تأیید شده» on screen for a page every reader
 * has just stopped being served.
 */
describe('every write that can move a fingerprint re-asks the confirmations listing', () => {
  it('usePutProcess — a saved description, name or node position moves the hash', async () => {
    mock({ id: 'cooking-002' })
    const { Wrapper, keys } = recordingWrapper()
    const { result } = renderHook(() => usePutProcess('cooking-002'), { wrapper: Wrapper })
    result.current.mutate({ id: 'cooking-002' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(keys).toContainEqual(['confirmations'])
  })

  it('usePutOverview — the department document is a confirmable target of its own', async () => {
    mock()
    const { Wrapper, keys } = recordingWrapper()
    const { result } = renderHook(() => usePutOverview('cooking'), { wrapper: Wrapper })
    result.current.mutate({ department: 'cooking' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // The one write path that already knows its department, so it names it.
    expect(keys).toContainEqual(['confirmations', 'cooking'])
  })

  it('useResolvePending — an accepted conflict writes content, not just `pending`', async () => {
    mock({ id: 'cooking-002' })
    const { Wrapper, keys } = recordingWrapper()
    const { result } = renderHook(() => useResolvePending('cooking-002'), { wrapper: Wrapper })
    result.current.mutate({ index: 0, decision: 'accept' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(keys).toContainEqual(['confirmations'])
  })

  it('useResolveInboxPending — the same endpoint from the inbox', async () => {
    mock({ id: 'cooking-002' })
    const { Wrapper, keys } = recordingWrapper()
    const { result } = renderHook(() => useResolveInboxPending(), { wrapper: Wrapper })
    result.current.mutate({ pid: 'cooking-002', index: 0, decision: 'accept' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(keys).toContainEqual(['confirmations'])
  })

  it('useDeleteProcess — the row goes, and the sweep moves every document that linked to it', async () => {
    // Not only "one fewer row". `delete_process` walks all nine departments
    // clearing `subprocess` and `parent` links to the deleted id, and those are
    // content: the documents it rewrites are un-confirmed by it, in departments
    // this hook could not have named. Hence the prefix key.
    mock({ deleted: 'cooking-002' })
    const { Wrapper, keys } = recordingWrapper()
    const { result } = renderHook(() => useDeleteProcess(), { wrapper: Wrapper })
    result.current.mutate('cooking-002')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(keys).toContainEqual(['confirmations'])
  })

  it('useCreateProcess — a new confirmable target has no row in the cached listing', async () => {
    mock({ id: 'cooking-003' })
    const { Wrapper, keys } = recordingWrapper()
    const { result } = renderHook(() => useCreateProcess(), { wrapper: Wrapper })
    result.current.mutate({ department: 'cooking' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(keys).toContainEqual(['confirmations'])
  })
})
