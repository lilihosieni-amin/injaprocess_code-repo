import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const proc = {
  id: 'cooking-002', department: 'cooking', name: 'فرآیند باطل‌شده', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  tombstoned: true, superseded_by: ['cooking-050'],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 40, y: 90 }, layout: 'auto' },
    { id: 'cooking-002-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 250, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
  ],
  edges: [{ from: 'start', to: 'cooking-002-n010', label: '' }],
}

describe('FlowScreen — tombstoned (view-only)', () => {
  it('renders the graph but suppresses the edit (ویرایش) affordance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-002/flow')
    // the process still renders (read-only view of the graph)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByText('فرآیند باطل‌شده')).toBeInTheDocument()
    // no way to enter edit mode
    expect(screen.queryByTestId('enter-edit')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ویرایش/ })).not.toBeInTheDocument()
  })
})
