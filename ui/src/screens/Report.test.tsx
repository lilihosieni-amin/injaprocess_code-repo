import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { appRoutes } from '../routes'
import type { ReportPayload } from '../api/types'

// jsdom implements no `window.scrollTo`, and the guide calls it from a layout
// effect on every page it shows — the same stub `StepsApp.test.tsx` installs.
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => vi.restoreAllMocks())

const JSON_H = { 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: JSON_H }))

/** A real descriptor, because the shell is chosen from one — `routes.test.tsx`'s
 *  own helper, kept here rather than exported from there: these two files pin
 *  different things and a shared fixture would couple them. */
function descriptor(capabilities: string[], scopes = ['dept:cooking']) {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes, supervisor: null,
    canSupervise: false, pendingApprovals: 0,
  }
}

const proc = (id: string, name: string) => ({
  id, department: 'cooking', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [
    { id: 'n1', type: 'activity', label: 'شستن سبزی', description: 'شرح', actor: 'آشپز',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
      subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
      source: { created_by: 't', touched_by: [] } },
  ], edges: [], pending: [],
})

const PAYLOAD = {
  dept: {
    department: 'cooking', name: 'دپارتمان پخت', description: 'd',
    sub_units: [], personnel: [], updated_at: '2026-09-23T09:00:00Z',
  },
  processes: [proc('cooking-001', 'آماده‌سازی مواد اولیه')],
  generated_at: '2026-09-23T09:00:00Z',
} as unknown as ReportPayload

/** The descriptor the mocked `/api/auth/me` answers with. `renderAt` sets it
 *  before rendering; `server` reads it when the request is actually made. */
let session = descriptor(['view'])

/** The API, for the two reads this route makes. A number is the status the
 *  report endpoint refuses with. Everything else answers an empty 200, so a
 *  navigation away from the report leaves no rejected promise behind. */
function server(answer: ReportPayload | number) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return json(session)
    if (/\/reports\/[a-z]+$/.test(url)) {
      return typeof answer === 'number' ? json({ detail: 'no' }, answer) : json(answer)
    }
    return json([])
  })
}

function renderAt(path: string, d = descriptor(['view'])) {
  session = d
  // `staleTime: Infinity` so the two reads seeded below are *fresh* and not
  // merely present — react-query serves stale cached data and refetches behind
  // it, which would put the shell's own request in the fetch log the last test
  // reads. Nothing here is seeded twice, so no query it does not already know
  // the answer to is affected.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  // Two reads that belong to the session rather than to this route, seeded so
  // the fetch assertion below can say exactly what the SCREEN asks for: the
  // registry, which is one `staleTime: Infinity` read the reports dialog has
  // already made by the time «مشاهده» opens this route, and the department list
  // the shell's own chrome draws on every screen there is.
  qc.setQueryData(['reports'], {
    reports: [{ id: 'steps', name: 'راهنمای گام‌به‌گام کار', short: 'گام‌به‌گام', description: '' }],
  })
  qc.setQueryData(['departments'], [{ code: 'cooking', name: 'دپارتمان پخت', count: 1 }])
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  return {
    router,
    ...render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>),
  }
}

describe('the report screen', () => {
  it('renders the steps document from the payload', async () => {
    server(PAYLOAD)
    renderAt('/departments/cooking/reports/steps', descriptor(['view'], ['dept:cooking']))
    // The guide's own home heading. `heading`, not `text`: the document's top
    // bar carries the same words, and both belong to it.
    expect(await screen.findByRole('heading', { name: 'راهنمای گام‌به‌گام کار' })).toBeInTheDocument()
  })

  it('an empty report says so, and says nothing about why', async () => {
    server({ dept: null, processes: [], generated_at: '2026-09-23T09:00:00Z' })
    renderAt('/departments/cooking/reports/steps', descriptor(['view'], ['dept:cooking']))
    expect(await screen.findByText('هنوز چیزی در این نمایش نیست')).toBeInTheDocument()
    expect(screen.queryByText(/تأیید/)).toBeNull()   // D56: no derived signal
  })

  it('a 404 renders not-found and a 403 renders denied', async () => {
    server(404)
    const { container } = renderAt('/departments/dining/reports/steps',
      descriptor(['view'], ['dept:cooking']))
    await waitFor(() => expect(container.querySelector('[data-screen="refusal"]')).not.toBeNull())
    // F13 — the not-found copy may not imply the resource exists
    expect(screen.queryByText(/دسترسی/)).toBeNull()
  })

  it('the back bar returns to the department', async () => {
    server(PAYLOAD)
    const { router } = renderAt('/departments/cooking/reports/steps', descriptor(['view'], ['dept:cooking']))
    fireEvent.click(await screen.findByRole('button', { name: 'بازگشت' }))
    expect(router.state.location.pathname).toBe('/departments/cooking')
  })

  it('the report reads the report, never the app’s own process list', async () => {
    // The seeded client is what makes this true; a shared client would serve the
    // drawer the API's unfiltered list inside a confirmed-only document.
    const fetchMock = server(PAYLOAD)
    renderAt('/departments/cooking/reports/steps', descriptor(['view'], ['dept:cooking']))
    await screen.findByRole('heading', { name: 'راهنمای گام‌به‌گام کار' })
    expect(fetchMock.mock.calls.map((c) => c[0]))
      .toEqual(['/api/auth/me', '/api/departments/cooking/reports/steps'])
  })
})
