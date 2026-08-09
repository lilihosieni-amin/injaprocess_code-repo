export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

let unauthorizedHandler: () => void = () => {}

/**
 * Registered once by the shell. A 401 means the session ended, which is a
 * redirect to sign-in — not an error for a component to render (F14).
 * 403 and 404 are deliberately excluded: 403 is a refused action the screen
 * should show, and 404 is indistinguishable from a typo by design (D56).
 */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    if (res.status === 401) unauthorizedHandler()
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
