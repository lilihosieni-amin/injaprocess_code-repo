import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { appRoutes } from './routes'

afterEach(() => vi.restoreAllMocks())

function boot(initial: string, authed: boolean) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return Promise.resolve(new Response(authed ? JSON.stringify({ username: 'analyst' }) : 'x', { status: authed ? 200 : 401, headers: { 'Content-Type': 'application/json' } }))
    if (url.endsWith('/api/departments')) return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(appRoutes, { initialEntries: [initial] })
  return render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
}

describe('routing', () => {
  it('redirects an unauthenticated visit to /login', async () => {
    boot('/departments', false)
    await waitFor(() => expect(screen.getByPlaceholderText('analyst')).toBeInTheDocument())
  })
  it('shows the departments grid when authenticated', async () => {
    boot('/departments', true)
    await waitFor(() => expect(screen.getAllByText('دپارتمان‌ها').length).toBeGreaterThan(0))
  })
})
