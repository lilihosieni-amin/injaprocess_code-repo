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

const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: 'd', actor: 'x', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 40, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } }],
  edges: [] }

describe('FlowScreen drawer', () => {
  it('opens the detail drawer with a working close button inside the canvas area', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', EDITOR)
    const dots = await screen.findByTitle('جزئیات')
    fireEvent.click(dots)
    // drawer body rendered: close button is now present inside the canvas container
    const close = await screen.findByTitle('بستن')
    expect(close).toBeInTheDocument()
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByTitle('بستن')).not.toBeInTheDocument())  // drawer closed
  })
})
