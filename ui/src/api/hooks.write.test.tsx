import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '../test/utils'
import { usePutOverview, useDeleteProcess, useNextId, usePending, useResolveInboxPending } from './hooks'

afterEach(() => vi.restoreAllMocks())
function mock(body: unknown = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
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
