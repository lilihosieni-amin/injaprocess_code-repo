import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, ApiError } from './client'

afterEach(() => vi.restoreAllMocks())

describe('fetchJson', () => {
  it('returns parsed JSON and sends credentials', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const data = await fetchJson<{ ok: number }>('/api/x')
    expect(data).toEqual({ ok: 1 })
    expect(spy).toHaveBeenCalledWith('/api/x', expect.objectContaining({ credentials: 'include' }))
  })

  it('throws ApiError with status on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    )
    await expect(fetchJson('/api/auth/me')).rejects.toMatchObject({ status: 401, message: 'nope' })
    await expect(fetchJson('/api/auth/me')).rejects.toBeInstanceOf(ApiError)
  })

  it('preserves Content-Type and merges caller headers without being overwritten by init spread', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await fetchJson<{ ok: number }>('/api/x', { method: 'POST', headers: { 'X-Custom': '1' } })
    expect(spy).toHaveBeenCalledWith('/api/x', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Custom': '1',
      }),
    }))
  })
})
