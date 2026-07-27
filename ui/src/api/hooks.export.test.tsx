import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCreateExport } from './hooks'
import { createWrapper } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('useCreateExport', () => {
  it('posts to the department export endpoint for the given kind', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: '/exports/dining/steps-0123456789abcdef.html', generated_at: '2026-07-26T09:00:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useCreateExport('dining'), { wrapper: createWrapper() })
    result.current.mutate('steps')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/exports/steps', expect.objectContaining({ method: 'POST' }))
    expect(result.current.data?.url).toBe('/exports/dining/steps-0123456789abcdef.html')
  })

  it('surfaces the backend detail on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'خروجی‌گیری پیکربندی نشده است (EXPORT_DIR)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useCreateExport('dining'), { wrapper: createWrapper() })
    result.current.mutate('flowchart')
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('EXPORT_DIR')
  })
})
