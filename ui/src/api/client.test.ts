import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchJson, onUnauthorized, ApiError, retryQuery, MAX_RETRIES } from './client'

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

afterEach(() => { onUnauthorized(() => {}); vi.unstubAllGlobals() })

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

  it('does not call the unauthorized handler on a 401 from the login endpoint', async () => {
    // FIX 2 — the backend answers 401 for a wrong password on /api/auth/login
    // itself; that must surface inline as "wrong password," not fire the
    // session-expiry redirect.
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(401, { detail: 'invalid credentials' })
    await expect(fetchJson('/api/auth/login')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('still calls the unauthorized handler on a 401 from any other path', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(401, { detail: 'authentication required' })
    await expect(fetchJson('/api/processes')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })
})

describe('retryQuery — the app-wide retry policy', () => {
  // TanStack Query's default is `retry: 3` with exponential backoff. Applied to
  // a refusal that meant about seven seconds of blank page before the 403/404
  // screen appeared, and four identical refusals at the server per navigation.
  // Every test of those surfaces builds its client with `retry: false`, so all
  // of them showed the screen instantly and passed — which is why this policy is
  // asserted here, on the function itself, rather than through a screen.
  it('never retries a refusal', () => {
    for (const status of [403, 404]) {
      expect(retryQuery(0, new ApiError(status, 'no'))).toBe(false)
    }
  })

  it('never retries any other 4xx either', () => {
    // 401 is the session ending and the shell is already redirecting; 422 is a
    // body the server will never accept. Neither changes by being asked again.
    for (const status of [400, 401, 422, 429]) {
      expect(retryQuery(0, new ApiError(status, 'no'))).toBe(false)
    }
  })

  it('retries a server error and a network failure, up to the cap', () => {
    expect(retryQuery(0, new ApiError(500, 'boom'))).toBe(true)
    expect(retryQuery(MAX_RETRIES - 1, new ApiError(503, 'boom'))).toBe(true)
    expect(retryQuery(MAX_RETRIES, new ApiError(500, 'boom'))).toBe(false)
    // Not an ApiError at all: DNS, a dropped connection, a body that would not
    // parse. Transient, and the one case a status cannot describe.
    expect(retryQuery(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retryQuery(MAX_RETRIES, new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('the retry policy is the one the app is actually built with', () => {
  // A policy nothing wires up is a policy nothing has. `main.tsx` cannot be
  // imported here — it calls createRoot on a document this suite does not have —
  // so the wiring is read from the source, the same way src/test/guards.test.ts
  // reads the components it polices. Brittle to a rename on purpose: a rename is
  // exactly the change that would silently restore TanStack's `retry: 3` and put
  // the seven-second blank page back in front of every refusal.
  it('main.tsx hands retryQuery to the QueryClient as the default for queries', () => {
    const main = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8')
    expect(main).toMatch(/defaultOptions:\s*{\s*queries:\s*{\s*retry:\s*retryQuery\s*}/)
    expect(main).toMatch(/import\s*{\s*retryQuery\s*}\s*from\s*'\.\/api\/client'/)
  })
})
