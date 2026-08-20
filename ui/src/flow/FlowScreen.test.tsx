import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FlowScreen } from './FlowScreen'
import { SurfaceProvider } from '../ui/surface'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** R44 — the reader's surface, which is the one this screen draws a toolbar
 *  back button on. `AppShell` puts the real provider above every route; a bare
 *  mount answers 'panel', so a reader case has to say so. */
const reader = (node: ReactElement) => <SurfaceProvider surface="reader">{node}</SurfaceProvider>

/** «ویرایش» is gated on `edit` over the process's own department (R5), so the
 *  first case below needs a session that holds it — and every case needs *a*
 *  session, seeded rather than served: `renderAt`'s fourth argument puts the
 *  descriptor in the ['session'] key before the screen mounts, which is where
 *  the real app finds it (RequireAuth resolved it first). Without it the
 *  blanket `fetch` stub answers GET /api/auth/me with the process document and
 *  `useCan` reads `capabilities` off a `Process` — so a control's absence would
 *  mean a crashed screen rather than a refused person.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 40, y: 90 }, layout: 'auto' },
    { id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 250, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
  ],
  edges: [{ from: 'start', to: 'cooking-001-n010', label: '' }],
}

describe('FlowScreen (view)', () => {
  it('renders the process nodes and the toolbar with the Edit button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', EDITOR)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ویرایش/ })).toBeInTheDocument()
  })

  it('offers a READER a way OFF the flowchart, at the toolbar’s inline start', async () => {
    // R21 — `Inja Reader.dc.html:312-316`. The design puts «بازگشت» INSIDE this
    // toolbar, as its first child, and draws no bar of its own above it; that is
    // why `ReaderShell` renders no chrome on this route at all. Without this
    // control the screen is a dead end for a reader: signed in as one, the
    // complete set of controls rendered here is «ویرایش» and React Flow's three
    // zoom buttons — no back, no home, no sign-out, no link of any kind.
    //
    // The destination comes from `readerBack`, the one function that answers
    // where back goes, so it is the process summary and not the flowchart's own
    // department or the department LIST — either of which skips a level and both
    // of which compile.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', reader(<FlowScreen />), '/processes/cooking-001/flow', EDITOR)
    await screen.findByText('ثبت درخواست')
    const back = screen.getByRole('link', { name: 'بازگشت' })
    expect(back).toHaveAttribute('href', '/processes/cooking-001')
    // …and it is the FIRST control on the bar, which in RTL is its inline start.
    // The design draws it there (reader 313 is the toolbar's first child) and
    // nothing else in this file would notice it moving to the end.
    expect(back.parentElement!.firstElementChild).toBe(back)
  })

  it('draws no back button in the toolbar on the PANEL, whose strip has one', async () => {
    // **R44** — "in flowchart screen, the back button should be on top menu too.
    // like other page." One component, two deliverables that disagree about
    // this one control, so it is drawn per surface rather than always:
    //
    //   `Inja Panel.dc.html:558-613`  the panel's flow toolbar; first child is
    //                                 `data-r-flownav`, and there is no back
    //                                 button anywhere in it. The crumb strip
    //                                 above carries «بازگشت» on every route but
    //                                 the home screen (`:3451`, `:3454`).
    //   `Inja Reader.dc.html:312-316` the reader's; first child IS «بازگشت»
    //                                 (`data-r-flowback`), above which
    //                                 `showBackBar: screen !== 'flow'` (`:2684`)
    //                                 draws nothing at all.
    //
    // Drawn on both, the panel has two — the defect R41 was raised for. Drawn on
    // neither, the reader is stranded, which is R21 and the case above. So this
    // is the assertion that says the branch exists and points the right way; the
    // count of one on each composed surface, at three widths, is
    // `one «بازگشت» per panel route, and never two` in e2e/panel-shell.spec.ts
    // and its reader twin.
    //
    // No provider, because `useSurface()` outside one answers 'panel'
    // (`src/ui/surface.tsx`) — which is what an export document or a bare mount
    // gets, and neither has a toolbar back button in its deliverable either.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { container } = renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', EDITOR)
    // The graph is drawn — this is a control that is absent, not a screen that
    // failed to render.
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'بازگشت' })).toBeNull()
    expect(container.querySelector('[data-r-flowback]')).toBeNull()
  })
})
