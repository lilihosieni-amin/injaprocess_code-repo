import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useBuildReport, useReport, useReports } from './hooks'
import { createWrapper } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const REGISTRY = {
  reports: [
    { id: 'flowchart', name: 'سند فلوچارت دپارتمان', short: 'مستندات کامل',
      description: 'هر فرآیند در یک برگ، به ترتیب سازمان‌یافتهٔ دپارتمان.' },
    { id: 'steps', name: 'راهنمای گام‌به‌گام', short: 'راهنمای گام‌به‌گام',
      description: 'همان فرآیندها، بازنویسی‌شده به گام‌های شماره‌دار.' },
  ],
}

describe('useReports', () => {
  it('reads the backend registry from GET /api/reports', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(REGISTRY),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useReports(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/reports', expect.objectContaining({ credentials: 'include' }))
    expect(result.current.data?.reports).toEqual(REGISTRY.reports)
  })
})

describe('useReport', () => {
  it('reads one department report from GET /api/departments/{code}/reports/{kind}', async () => {
    const payload = { dept: null, processes: [], generated_at: '2026-09-23T09:00:00Z' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useReport('dining', 'steps'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/reports/steps', expect.objectContaining({ credentials: 'include' }))
    expect(result.current.data).toEqual(payload)
  })
})

describe('useBuildReport', () => {
  it('posts to the department report endpoint for the given kind', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ pdf_url: '/api/departments/dining/reports/steps/file.pdf', generated_at: '2026-07-26T09:00:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useBuildReport('dining'), { wrapper: createWrapper() })
    result.current.mutate('steps')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/departments/dining/reports/steps', expect.objectContaining({ method: 'POST' }))
    expect(result.current.data?.pdf_url).toBe('/api/departments/dining/reports/steps/file.pdf')
  })

  it('answers success with no pdf_url when no PDF was produced', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ generated_at: '2026-07-26T09:00:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useBuildReport('dining'), { wrapper: createWrapper() })
    result.current.mutate('flowchart')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pdf_url).toBeUndefined()
  })

  it('surfaces the backend detail on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'خروجی‌گیری پیکربندی نشده است (CHROMIUM_PATH)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useBuildReport('dining'), { wrapper: createWrapper() })
    result.current.mutate('flowchart')
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('CHROMIUM_PATH')
  })
})
