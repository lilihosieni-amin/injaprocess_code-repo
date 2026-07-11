import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

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
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ویرایش/ })).toBeInTheDocument()
  })
})
