import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, onUnauthorized, ApiError } from './client'

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

afterEach(() => onUnauthorized(() => {}))

function mockFetch(status: number, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })))
}

describe('fetchJson', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(200, { ok: true })
    await expect(fetchJson<{ ok: boolean }>('/api/x')).resolves.toEqual({ ok: true })
  })

  it('calls the unauthorized handler on 401 and still rejects', async () => {
    // F14 — an expired session must be a redirect, not an error surfacing inside
    // whatever query happens to run next.
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(401, { detail: 'authentication required' })
    await expect(fetchJson('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call the unauthorized handler on 403', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(403, { detail: 'forbidden' })
    await expect(fetchJson('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call the unauthorized handler on 404', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(404, { detail: 'not found' })
    await expect(fetchJson('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })
})
