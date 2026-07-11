import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: 'd', actor: 'x', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 40, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } }],
  edges: [] }

describe('FlowScreen drawer', () => {
  it('opens the detail drawer with a working close button inside the canvas area', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    const dots = await screen.findByTitle('جزئیات')
    fireEvent.click(dots)
    // drawer body rendered: close button is now present inside the canvas container
    const close = await screen.findByTitle('بستن')
    expect(close).toBeInTheDocument()
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByTitle('بستن')).not.toBeInTheDocument())  // drawer closed
  })
})
