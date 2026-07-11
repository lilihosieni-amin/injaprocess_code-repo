import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 60, y: 90 }, layout: 'auto' }],
  edges: [] }

describe('FlowScreen junction', () => {
  it('clicking a junction in edit mode opens the drawer with the gate selector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    // The junction diamond shows its type label "XOR"; click it (first one, in the node, not the legend).
    const xorElements = screen.getAllByText('XOR')
    fireEvent.click(xorElements[0])
    // Drawer edit branch shows the AND button (from Task 14 junction editor).
    expect(await screen.findByRole('button', { name: 'AND' })).toBeInTheDocument()
  })
})
