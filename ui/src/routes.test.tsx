import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { appRoutes } from './routes'

afterEach(() => vi.restoreAllMocks())

/** A real descriptor, because the shell is now chosen from one. */
function descriptor(capabilities: string[]) {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes: ['dept:cooking'], supervisor: null,
    canSupervise: false, pendingApprovals: 0,
  }
}

function boot(initial: string, authed: boolean, capabilities = ['view', 'comment', 'edit']) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return Promise.resolve(new Response(authed ? JSON.stringify(descriptor(capabilities)) : 'x', { status: authed ? 200 : 401, headers: { 'Content-Type': 'application/json' } }))
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
    // The sign-in screen's own field, not a placeholder: /login renders SignIn,
    // which asks for a mobile number rather than a username.
    await waitFor(() => expect(screen.getByLabelText('شمارهٔ موبایل')).toBeInTheDocument())
  })
  it('shows the departments grid when authenticated', async () => {
    boot('/departments', true)
    await waitFor(() => expect(screen.getAllByText('دپارتمان‌ها').length).toBeGreaterThan(0))
  })

  // The route tree carried a hardcoded all-capabilities descriptor from the
  // frontend sub-project until now, so every visitor got the panel shell
  // whatever they could actually do. These two run through the REAL appRoutes —
  // not a hand-built <Route> tree — so a stand-in reinstated there fails them.
  it('gives a reader the reader shell through the real route tree', async () => {
    const { container } = boot('/departments', true, ['view', 'comment', 'export_pdf'])
    await waitFor(() => expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument())
    expect(container.querySelector('[data-shell="panel"]')).not.toBeInTheDocument()
  })

  it('gives an editor the panel shell through the real route tree', async () => {
    const { container } = boot('/departments', true, ['view', 'comment', 'edit'])
    await waitFor(() => expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument())
    expect(container.querySelector('[data-shell="reader"]')).not.toBeInTheDocument()
  })
})
