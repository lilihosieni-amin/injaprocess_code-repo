import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { createWrapper } from '../test/utils'
import { useSaveOrder } from './hooks'
import { ApiError } from './client'

afterEach(() => vi.restoreAllMocks())

describe('useSaveOrder', () => {
  it('PUTs the sequence to the department order endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-002', 'cooking-001'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-002', 'cooking-001'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/order',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ order: ['cooking-002', 'cooking-001'] }) }))
  })

  it('invalidates the processes query after a 200', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-002', 'cooking-001'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-002', 'cooking-001'] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['processes', 'cooking'] })
  })

  it('surfaces a 409 as an ApiError with that status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-003 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-001'] })
    await waitFor(() => expect(result.current.isError).toBe(true))
    const err = result.current.error as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
  })

  it('invalidates the processes query after a 409 too, because it settles on onSettled not onSuccess', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-003 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useSaveOrder('cooking'), { wrapper: createWrapper() })
    result.current.mutate({ order: ['cooking-001'] })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['processes', 'cooking'] })
  })
})
