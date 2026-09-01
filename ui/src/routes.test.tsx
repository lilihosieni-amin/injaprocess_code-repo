import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { appRoutes } from './routes'

afterEach(() => vi.restoreAllMocks())

/** A real descriptor, because the shell is now chosen from one. */
function descriptor(capabilities: string[], scopes = ['dept:cooking']) {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes, supervisor: null,
    canSupervise: false, pendingApprovals: 0,
  }
}

const POLICY = {
  fields: {
    process_summary: false, process_idef0: false, process_kpis: false,
    node_description: true, node_actor: true, node_icom: false,
  },
  version: '0123456789abcdef',
}

/** One account, as `GET /api/users/{id}` reports it. */
const ONE_USER = {
  id: 7, username: '09121111111', displayName: 'سحر بیات',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'manage_users'],
  scopes: ['dept:cooking'], supervisor: null,
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

function boot(initial: string, authed: boolean, capabilities = ['view', 'comment', 'edit'], scopes?: string[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return Promise.resolve(new Response(authed ? JSON.stringify(descriptor(capabilities, scopes)) : 'x', { status: authed ? 200 : 401, headers: { 'Content-Type': 'application/json' } }))
    if (url.endsWith('/api/departments')) return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    if (url.endsWith('/api/visibility')) return Promise.resolve(new Response(JSON.stringify(POLICY), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    if (url.endsWith('/api/users/7')) return Promise.resolve(new Response(JSON.stringify(ONE_USER), { status: 200, headers: { 'Content-Type': 'application/json' } }))
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

  // The policy screen is reachable only through the route tree, and the catch-all
  // below it sends every unknown path to /departments — so a missing route entry
  // is not a blank page but a silent redirect, which looks exactly like a working
  // app. `heading`, not `text`: the header's own nav entry carries the same words.
  it('routes /visibility to the policy screen for a global set_visibility holder', async () => {
    boot('/visibility', true, ['view', 'edit', 'set_visibility'], ['*'])
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'سیاست نمایش محتوا' })).toBeInTheDocument())
  })

  // Same trap as the entry above, and the same reason for pinning it in the real
  // route tree: with no `/users` entry the catch-all redirects to /departments,
  // which is a working-looking app whose administration surface simply cannot be
  // reached. `heading`, not `text` — the header's own nav entry carries the same
  // word.
  it('routes /users to the user list for a global manage_users holder', async () => {
    boot('/users', true, ['view', 'edit', 'manage_users'], ['*'])
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'کاربران' })).toBeInTheDocument())
  })

  // The profile screen is the one surface every session reaches, so this runs
  // as a Reader holding nothing but `view` and scoped to one department — the
  // actor `/users` and `/visibility` above both refuse. Without the entry the
  // catch-all sends them to the departments grid, which looks like a working
  // app in which nobody can ever change their password.
  it('routes /profile to the profile screen, for a caller with no administration right at all', async () => {
    boot('/profile', true, ['view'], ['dept:cooking'])
    // By the screen hook, not by the heading's words. Task 22 rebuilt the header
    // and the h1 is now the signed-in person's own name, which is a content
    // decision this routing test has no business pinning: what it means is
    // "/profile resolves to the profile screen", and that is what it now asks.
    await waitFor(() =>
      expect(document.querySelector('[data-screen="profile"]')).toBeInTheDocument())
  })

  // `/profile` sits under RequireAuth's children in `routes.tsx`, same as
  // every other screen — nothing else gates it, which is easy to mistake for
  // "needs no auth wrapper at all" and hoist to a top-level route instead.
  // Moved there, an unauthenticated visit renders `Profile` directly: its own
  // guard is `if (!session) return <div className="flex-1 bg-ink" />`, a blank
  // pane rather than a redirect — a dead end that looks like a working app.
  // `Profile.test.tsx` cannot see this by itself; it mocks `useSession`
  // directly and never goes near `RequireAuth` or the route tree.
  it('redirects an unauthenticated visit to /profile to /login, same as every other screen', async () => {
    boot('/profile', false)
    await waitFor(() => expect(screen.getByLabelText('شمارهٔ موبایل')).toBeInTheDocument())
  })

  /**
   * **Conformance note 10, and the only place it can be pinned.** The note says
   * there is no workbook screen in v1 — the manifest is edited by hand
   * (Appendix B) — and the design still carries six «کاربرگ‌ها» blocks (:265,
   * :407, :1074, :2105, :2683, :2914) with inline `BOOKS`/`FACTS` arrays behind
   * them. Nothing else fails when somebody builds one: a new screen with a new
   * route passes every other test in this repo, including its own.
   *
   * So the app's whole route surface is asserted as an exact list — not just the
   * two that say «fact», because a workbook screen would as likely be spelled
   * `/workbooks`. The facts section is two routes, the list and one entry, and a
   * third screen of any name is a decision the owner takes rather than a file
   * somebody adds.
   */
  it('has no workbook screen — the app’s route surface is this list (note 10)', () => {
    const paths = appRoutes.flatMap((r) => (r.children ?? [r]).map((c) => c.path))
    expect(paths).toEqual([
      '/login',
      '/', '/departments', '/departments/:code', '/departments/:code/overview',
      '/processes/:pid', '/processes/:pid/flow', '/processes/:pid/steps',
      '/facts', '/facts/:fid',
      '/visibility', '/users', '/users/:id', '/profile',
      '*',
    ])
  })

  it('routes /users/:id to one person\'s record', async () => {
    // A separate entry, and a separate assertion: `/users/7` matches no route at
    // all without it and lands on the departments grid, so every row of the list
    // above would be a link into the wrong screen.
    boot('/users/7', true, ['view', 'edit', 'manage_users'], ['*'])
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument())
  })
})
