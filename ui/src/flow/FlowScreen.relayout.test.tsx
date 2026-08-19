import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())
/** «چیدمان» lives inside edit mode, which is gated on `edit` over the process's
 *  own department (R5) — POST .../relayout re-derives the same thing and 403s
 *  a reader. Seeded through `renderAt` rather than served by the stub.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-n010', type: 'activity', label: 'A', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 500, y: 500 }, layout: 'manual', source: { created_by: 'x', touched_by: [] } }],
  edges: [] }

describe('FlowScreen relayout', () => {
  it('POSTs to relayout and adopts the returned positions', async () => {
    const relaid = { ...proc, nodes: [{ ...proc.nodes[0], position: { x: 40, y: 90 }, layout: 'auto' }] }
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/relayout')) return Promise.resolve(new Response(JSON.stringify(relaid), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (url.endsWith('/processes')) return Promise.resolve(new Response(JSON.stringify([proc]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', EDITOR)
    fireEvent.click(await screen.findByTestId('enter-edit'))
    fireEvent.click(screen.getByRole('button', { name: /چیدمان/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/relayout', expect.objectContaining({ method: 'POST' })))
  })
})
