import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' }], edges: [] }

describe('FlowScreen save', () => {
  it('PUTs the edited doc and returns to view mode on success', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ ...proc, name: 'renamed' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    fireEvent.click(screen.getByTestId('save'))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001', expect.objectContaining({ method: 'PUT' })))
    await waitFor(() => expect(screen.getByTestId('enter-edit')).toBeInTheDocument()) // back to view mode
  })
})
