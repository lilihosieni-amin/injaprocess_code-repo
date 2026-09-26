import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { useReportActions } from './ReportsDialog'
import type { Capability, SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

const REGISTRY = { reports: [
  { id: 'flowchart', name: 'سند فلوچارت دپارتمان', short: 'مستندات کامل',
    description: 'هر فرآیند در یک برگ، به ترتیب سازمان‌یافتهٔ دپارتمان.' },
  { id: 'steps', name: 'راهنمای گام‌به‌گام', short: 'راهنمای گام‌به‌گام',
    description: 'همان فرآیندها، بازنویسی‌شده به گام‌های شماره‌دار.' },
] }

/** One descriptor per test, built from the two axes the dialog cares about:
 *  which capabilities the session holds and which scopes it holds them over. */
function descriptor(capabilities: Capability[], scopes: string[]): SessionDescriptor {
  return {
    username: '09120000001', displayName: 'کاربر', role: 'reader',
    capabilities, scopes,
    supervisor: null, canSupervise: false, pendingApprovals: 0,
  }
}

function Harness({ session }: { session: SessionDescriptor }) {
  const reports = useReportActions('dining', 'سالن')
  return (
    <>
      <button onClick={reports.open}>باز کن</button>
      {reports.dialog}
      <span data-testid="whoami">{session.username}</span>
    </>
  )
}

function renderDialog(session: SessionDescriptor) {
  // Seeded rather than fetched, so no test here needs to stub GET /api/session
  // or GET /api/reports — only the one test that builds a report ever spies on
  // `fetch` at all.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['session'], session)
  client.setQueryData(['reports'], REGISTRY)
  const router = createMemoryRouter(
    [{ path: '/', element: <Harness session={session} /> }],
    { initialEntries: ['/'] },
  )
  const result = render(
    <QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>,
  )
  fireEvent.click(result.getByRole('button', { name: 'باز کن' }))
  return { ...result, router }
}

it('draws one card per report, with the design’s two acts', async () => {
  renderDialog(descriptor(['view', 'export_pdf'], ['dept:dining']))
  expect(await screen.findByText('سند فلوچارت دپارتمان')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'مشاهده' })).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: 'دریافت فایل' })).toHaveLength(2)
})

it('a reader who may not download sees only مشاهده', async () => {
  renderDialog(descriptor(['view'], ['dept:dining']))
  expect(await screen.findAllByRole('button', { name: 'مشاهده' })).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'دریافت فایل' })).toBeNull()
})

it('a report-scoped grant draws only that report', async () => {
  renderDialog(descriptor(['view'], ['dept:dining/report:steps']))
  expect(await screen.findByText('راهنمای گام‌به‌گام')).toBeInTheDocument()
  expect(screen.queryByText('سند فلوچارت دپارتمان')).toBeNull()
})

it('مشاهده navigates to the report screen', async () => {
  const { router } = renderDialog(descriptor(['view'], ['dept:dining']))
  fireEvent.click((await screen.findAllByRole('button', { name: 'مشاهده' }))[1])
  expect(router.state.location.pathname).toBe('/departments/dining/reports/steps')
})

/** What the build really answers (`routers/reports.py`): the download ROUTE, not
 *  a file in a public folder. The fixture said
 *  `/exports/dining/flowchart-{fingerprint}.pdf` — the retired public mount
 *  (D24), a shape the server cannot produce any more — so the one test that
 *  reads a `pdf_url` was asserting against an impossible response. */
const PDF_URL = '/api/departments/dining/reports/flowchart/file.pdf'

it('دریافت فایل posts the build and reports it in the export dialog', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ pdf_url: PDF_URL, generated_at: '2026-07-26T09:00:00Z' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
  renderDialog(descriptor(['export_pdf'], ['dept:dining']))
  fireEvent.click((await screen.findAllByRole('button', { name: 'دریافت فایل' }))[0])
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/api/departments/dining/reports/flowchart', expect.objectContaining({ method: 'POST' })))
  expect(await screen.findByText('خروجی آماده شد')).toBeInTheDocument()
  // …and the link the dialog hands over is the server's own `pdf_url`, absolute.
  // Asserted so the fixture is load-bearing: a shape the endpoint cannot answer
  // would otherwise sit here indefinitely, as the retired one did.
  expect(screen.getByLabelText('لینک فایل خروجی'))
    .toHaveValue(`${window.location.origin}${PDF_URL}`)
})
