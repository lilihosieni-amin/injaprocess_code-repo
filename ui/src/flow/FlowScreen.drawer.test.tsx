import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())
/** The drawer opens in view mode and needs no capability, but the screen now
 *  asks the session what to draw, so the test must answer with a session:
 *  otherwise the blanket stub answers GET /api/auth/me with the process
 *  document and `useCan` reads `capabilities` off a `Process`. Seeded through
 *  `renderAt`, which is where the real app finds it.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const READER: SessionDescriptor = {
  ...EDITOR, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'],
}

const node = (over: Record<string, unknown> = {}) => ({
  id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: 'd', actor: 'x',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 40, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] },
  ...over,
})

const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [node()],
  edges: [] }

/** The same process, with its one activity pointing at a child. */
const withSub = { ...proc, nodes: [node({ subprocess: 'cooking-002' })] }

function mount(doc: unknown, session: SessionDescriptor) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(doc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  return renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', session)
}

describe('FlowScreen drawer', () => {
  it('opens the detail drawer with a working close button inside the canvas area', async () => {
    mount(proc, EDITOR)
    const dots = await screen.findByTitle('جزئیات')
    fireEvent.click(dots)
    // drawer body rendered: close button is now present inside the canvas container
    const close = await screen.findByTitle('بستن')
    expect(close).toBeInTheDocument()
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByTitle('بستن')).not.toBeInTheDocument())  // drawer closed
  })

  /**
   * **Owner ruling: *"when we have not in editor, when i click on each node, we
   * should show the details pop up(if node not link to subprocess)."***
   *
   * The whole node was already a click target and did nothing for the commonest
   * case. Before this, the only way in was the 17px `⋯` in the box's corner —
   * under half F11's 44px floor, and the least likely thing on the canvas to be
   * hit on a phone.
   */
  it('opens the drawer when a viewer presses the node itself', async () => {
    mount(proc, READER)
    // The label inside the node, not the `⋯`: the point of the ruling is that
    // the BOX is the control.
    fireEvent.click(await screen.findByText('ثبت'))
    expect(await screen.findByTitle('بستن')).toBeInTheDocument()
  })

  it('lets a sub-process link win over the drawer', async () => {
    // The parenthesis in the ruling, and the reason the arms are ordered as they
    // are: the node carries a green «برای ورود کلیک کنید» pill, which is a
    // promise a drawer would break.
    mount(withSub, READER)
    fireEvent.click(await screen.findByText('ثبت'))
    // The route moved, read where a `MemoryRouter` can show it: the screen asks
    // for the CHILD document. `window.location` never moves under that router,
    // so asserting a pathname there would pass on a handler that did nothing.
    await waitFor(() => expect(
      vi.mocked(globalThis.fetch).mock.calls
        .map((c) => String(c[0]))
        .some((u) => u.includes('/api/processes/cooking-002')),
    ).toBe(true))
    expect(screen.queryByTitle('بستن')).toBeNull()
  })

  it('leaves the canvas alone while it is being edited', async () => {
    // In edit mode a press SELECTS. A drawer opening on every press would cover
    // the diagram being dragged; the editor's route to the same panel is the `⋯`
    // the first test uses.
    mount(proc, EDITOR)
    const canvas = await screen.findByText('ثبت')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    fireEvent.click(canvas)
    expect(screen.queryByTitle('بستن')).toBeNull()
  })
})
