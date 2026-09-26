import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
    { id: 'n1', type: 'activity', label: 'شستن سبزی', description: 'سبزی را سه بار بشویید', actor: 'آشپز',
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
    reports: [
      { id: 'steps', name: 'راهنمای گام‌به‌گام کار', short: 'گام‌به‌گام', description: '' },
      { id: 'flowchart', name: 'مستند فلوچارت', short: 'فلوچارت', description: '' },
    ],
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

  it('a confirmed introduction with no confirmed process is still the document', async () => {
    // The state D25 is about: the department's introduction is vouched for and
    // none of its processes are. The FILE for this state is a cover and an
    // introduction — so the screen reading it must not be «nothing here», or the
    // two disagree about what an empty report is. `dept: null` above is the
    // genuinely empty one, and it still says so.
    server({ ...PAYLOAD, processes: [] } as ReportPayload)
    renderAt('/departments/cooking/reports/steps', descriptor(['view'], ['dept:cooking']))
    expect(await screen.findByRole('heading', { name: 'راهنمای گام‌به‌گام کار' })).toBeInTheDocument()
    expect(screen.queryByText('هنوز چیزی در این نمایش نیست')).toBeNull()
  })

  it('a 404 renders not-found and a 403 renders denied', async () => {
    // D56's own partition, and the one place in the app where the same route
    // answers both: the department is out of scope (404, and it may not even
    // admit the department exists) or it is in scope and the capability is not
    // (403). One arm passing proves nothing about the other — `refusalStatus`
    // maps them and `RefusalScreen` branches on them.
    async function refusalAt(status: 403 | 404) {
      server(status)
      const { container } = renderAt('/departments/dining/reports/steps',
        descriptor(['view'], ['dept:cooking']))
      await waitFor(() => expect(container.querySelector('[data-screen="refusal"]')).not.toBeNull())
      return within(container.querySelector('[data-screen="refusal"]') as HTMLElement)
    }

    const notFound = await refusalAt(404)
    // F13 — the not-found copy may not imply the resource exists
    expect(notFound.queryByText(/دسترسی/)).toBeNull()
    // …and the pair that actually separates the two surfaces, because
    // `DeniedState`'s copy does not contain «دسترسی» either: the line above is
    // true of both screens and would not notice a 404 rendering the denial.
    expect(notFound.getByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(notFound.queryByText('اجازهٔ این کار را ندارید')).toBeNull()

    cleanup()
    const denied = await refusalAt(403)
    expect(denied.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(denied.queryByText('چیزی اینجا نیست')).toBeNull()
  })

  it('the back bar returns to the department', async () => {
    server(PAYLOAD)
    const { router } = renderAt('/departments/cooking/reports/steps', descriptor(['view'], ['dept:cooking']))
    fireEvent.click(await screen.findByRole('button', { name: 'بازگشت' }))
    expect(router.state.location.pathname).toBe('/departments/cooking')
  })

  /**
   * **The flowchart report, and it has to be that one.** The steps guide issues
   * no queries at all — `StepsApp` and `PrintDoc` import from `src/api/types`
   * as types only and call no hook — so a fetch log taken over the steps
   * document passes just as happily with the `QueryClientProvider` deleted from
   * the screen, which is to say it fences nothing.
   *
   * The one consumer of the app's cache is `DetailDrawer`, which
   * `useProcesses(process.department)` puts on `/api/departments/{code}/processes`
   * — the list that is NOT confirmation-filtered — and it is reached only
   * through `FlowViewer`, inside the flowchart document, once a reader opens a
   * process and taps a node. So the test walks there: table of contents →
   * viewer → node → drawer. Under the seeded client that query is answered from
   * the payload; under the app's client it is a request.
   *
   * `PrintDiagrams` mounts every process a second time in an offscreen
   * measuring host, so each node label is in the DOM twice — `OFFSCREEN` drops
   * the measured copy, exactly as `Document.test.tsx` does.
   */
  const OFFSCREEN = { ignore: '.pf-measure, .pf-measure *' }

  it('the report reads the report, never the app’s own process list', async () => {
    const fetchMock = server(PAYLOAD)
    renderAt('/departments/cooking/reports/flowchart', descriptor(['view'], ['dept:cooking']))

    fireEvent.click(await screen.findByText('آماده‌سازی مواد اولیه', { selector: 'span' }))
    // the node label is in the process sheet as well as on the canvas; the
    // viewer is the last thing `Document` renders, so its copy is the last one
    const onCanvas = await screen.findAllByText('شستن سبزی', OFFSCREEN)
    fireEvent.click(onCanvas[onCanvas.length - 1])
    // the drawer is open — it brings a second «بستن» beside the viewer's own —
    // so `useProcesses` has run, and whichever client answered it is recorded
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'بستن' })).toHaveLength(2))

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toEqual(['/api/auth/me', '/api/departments/cooking/reports/flowchart'])
    expect(urls.filter((u) => u.endsWith('/processes'))).toEqual([])
  })
})
