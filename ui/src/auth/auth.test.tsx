import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { RequireAuth } from './RequireAuth'

afterEach(() => vi.restoreAllMocks())

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)),
  )
}

describe('RequireAuth', () => {
  it('redirects to /login when unauthenticated', async () => {
    mockFetch((url) => url.endsWith('/api/auth/me') ? new Response('x', { status: 401 }) : new Response('', { status: 404 }))
    const { MemoryRouter, Routes, Route, Navigate } = await import('react-router-dom')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const { render } = await import('@testing-library/react')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/departments']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/departments" element={<div>secret</div>} />
            </Route>
            <Route path="/login" element={<div data-testid="login-marker" />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('login-marker')).toBeInTheDocument())
  })
})

// The sign-in screen's own tests live in src/screens/SignIn.test.tsx: the
// credential-submitting case that used to sit here exercised Login's username
// field, which no longer exists.
