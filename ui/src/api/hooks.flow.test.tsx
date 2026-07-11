import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '../test/utils'
import { usePutProcess, useRelayout, useResolvePending, useCreateProcess } from './hooks'

afterEach(() => vi.restoreAllMocks())

function mock(status = 200, body: unknown = { id: 'cooking-001' }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

describe('flow hooks', () => {
  it('usePutProcess PUTs the doc to the process endpoint', async () => {
    const spy = mock()
    const { result } = renderHook(() => usePutProcess('cooking-001'), { wrapper: createWrapper() })
    result.current.mutate({ id: 'cooking-001' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001', expect.objectContaining({ method: 'PUT' }))
  })
  it('useRelayout POSTs to the relayout endpoint', async () => {
    const spy = mock()
    const { result } = renderHook(() => useRelayout('cooking-001'), { wrapper: createWrapper() })
    result.current.mutate({ id: 'cooking-001' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/relayout', expect.objectContaining({ method: 'POST' }))
  })
  it('useResolvePending POSTs decision to the pending index endpoint', async () => {
    const spy = mock()
    const { result } = renderHook(() => useResolvePending('cooking-001'), { wrapper: createWrapper() })
    result.current.mutate({ index: 2, decision: 'accept' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/2', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'accept' }) }))
  })
  it('useCreateProcess POSTs to the processes collection', async () => {
    const spy = mock(201)
    const { result } = renderHook(() => useCreateProcess(), { wrapper: createWrapper() })
    result.current.mutate({ department: 'cooking', name: 'x' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/processes', expect.objectContaining({ method: 'POST' }))
  })
})
