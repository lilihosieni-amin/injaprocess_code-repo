import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequireAuth } from './RequireAuth'
import { useSession } from './useSession'
import { useLogin } from '../api/hooks'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const DESCRIPTOR = {
  username: '09123456789', displayName: 'سحر بیات', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: '09120000000', canSupervise: false, pendingApprovals: 0,
}

function mount(entry = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>محتوا</p>} />
            <Route path="/departments" element={<p>محتوا</p>} />
          </Route>
          <Route path="/login" element={<p>صفحهٔ ورود</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RequireAuth', () => {
  it('sends an unauthenticated visitor to sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    mount()
    expect(await screen.findByText('صفحهٔ ورود')).toBeInTheDocument()
  })

  it('renders the reader shell for a reader descriptor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(DESCRIPTOR), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { container } = mount()
    await waitFor(() =>
      expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument())
    expect(screen.getByText('محتوا')).toBeInTheDocument()
  })

  it('renders the panel shell for a descriptor holding a panel capability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ...DESCRIPTOR, role: 'editor', capabilities: [...DESCRIPTOR.capabilities, 'edit'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { container } = mount()
    await waitFor(() =>
      expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument())
  })

  // --- beyond the brief: the states and the mappings a swapped field survives ---

  it('draws nothing at all while the descriptor is still in flight', async () => {
    // The loading state is not "render the app and hope": with no descriptor
    // there is no shell to choose, so a screen drawn here is a screen drawn for
    // nobody. Neither the routed content nor either shell may appear, and the
    // visitor must not be bounced to sign-in for the crime of a slow network.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { container } = mount()
    await Promise.resolve()
    expect(screen.queryByText('محتوا')).not.toBeInTheDocument()
    expect(container.querySelector('[data-shell]')).not.toBeInTheDocument()
    expect(screen.queryByText('صفحهٔ ورود')).not.toBeInTheDocument()
  })

  it('leaves a signed-in visitor where they are', async () => {
    // The mirror of the 401 case: a redirect that fires unconditionally passes
    // the unauthenticated test and locks everyone else out too.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(DESCRIPTOR), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    mount()
    expect(await screen.findByText('محتوا')).toBeInTheDocument()
    expect(screen.queryByText('صفحهٔ ورود')).not.toBeInTheDocument()
  })

  it('shows the signed-in person by their display name, not their username', async () => {
    // displayName and username are both strings on the descriptor, so a swap
    // type-checks, and only a rendered surface can tell them apart.
    //
    // **The surface moved, and the move is a finding, not a rename.** The panel
    // header used to write the name straight into the bar. Neither deliverable
    // does: the panel's lockup second line is the product tagline
    // (`Inja Panel.dc.html:122`) and the reader's is the caller's ROLE, not
    // their name (`Inja Reader.dc.html:138`), and the design's answer to "who
    // am I" is the profile entry rather than a label. So the only place in the
    // rebuilt chrome that names the signed-in person is the sheet the hamburger
    // opens — which the same design hides above 1080px. Recorded in the Task 12
    // report as an owner question beside the sign-out one; asserted here where
    // it now is, so the swap this test exists to catch is still caught.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ...DESCRIPTOR, role: 'editor', capabilities: [...DESCRIPTOR.capabilities, 'edit'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })))
    mount('/departments')
    await userEvent.click(await screen.findByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('سحر بیات')).toBeInTheDocument()
    expect(within(sheet).queryByText('09123456789')).toBeNull()
  })

  it('carries pendingApprovals through to the reader badge', async () => {
    // `/departments` rather than `/`: as of Task 13 the reader draws its TOP BAR
    // on its root and a back bar on every other screen, and the badge is on the
    // top bar. At `/` — a route the app's own catch-all redirects away from — the
    // reader now gets the back bar, which carries «بازگشت» and «خانه» and no
    // count at all.
    //
    // And «۴», not «4»: audit S4 found the two shells were the only surfaces in
    // the product rendering a latin digit, so a reader saw «۳ فرآیند» on the page
    // and `3` in the header. The digit is the half this test is about, so it is
    // asserted as the reader sees it.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ...DESCRIPTOR, pendingApprovals: 4 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { container } = mount('/departments')
    expect(await screen.findByText('۴')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[0-9]/)
  })
})

function hookWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useSession', () => {
  it('asks the server for the real session', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return new Response(JSON.stringify(DESCRIPTOR),
        { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const { result } = renderHook(() => useSession(), { wrapper: hookWrapper() })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(asked).toEqual(['/api/auth/me'])
  })

  it('reports every field the endpoint sends, unrenamed', async () => {
    // Eight fields, all distinct values, compared whole: a dropped field, a
    // renamed one or two swapped ones all fail here even though the shells
    // between them only ever draw two of the eight.
    const wire = {
      username: '09121112233', displayName: 'مهدی رستمی', role: 'auditor',
      capabilities: ['view', 'view_audit'], scopes: ['dept:kitchen', 'dept:dining/report:daily'],
      supervisor: '09129998877', canSupervise: true, pendingApprovals: 7,
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(wire), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { result } = renderHook(() => useSession(), { wrapper: hookWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(wire)
  })

  it('reports a revoked session as an error rather than as an empty one', async () => {
    // A 401 that resolved to `undefined` instead of rejecting would leave
    // isError false, and a RequireAuth written against isError alone would then
    // wait forever on a session that is never coming.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const { result } = renderHook(() => useSession(), { wrapper: hookWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('is dropped from the cache when someone signs in', async () => {
    // Asserted as GONE, not as invalidated. Invalidation leaves the data in
    // place and refetches behind it, so the previous occupant's descriptor is
    // still what the shell is chosen from until the round-trip lands — which is
    // the very thing this test exists to prevent, and `isInvalidated === true`
    // is satisfied while it happens.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ username: '09123456789' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['session'], DESCRIPTOR)
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(async () => { await result.current.mutateAsync({ username: '09123456789', password: 'hunter22' }) })
    expect(client.getQueryData(['session'])).toBeUndefined()
  })

  it('does not retry, so an unauthenticated visitor is not left staring at nothing', async () => {
    // Every QueryClient in this file sets retry:false as a default, so the line
    // in useSession is invisible to them. The real app's client (main.tsx) is
    // bare — three retries with backoff — and dropping that line would give a
    // signed-out visitor about seven seconds of blank page before the redirect.
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()   // deliberately NOT retry:false
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/" element={<p>محتوا</p>} />
            </Route>
            <Route path="/login" element={<p>صفحهٔ ورود</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('صفحهٔ ورود')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
