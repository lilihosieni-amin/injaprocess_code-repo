import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' }],
  edges: [] }

describe('FlowScreen edit mode', () => {
  it('entering edit shows the edit toolbar (add activity/save/cancel)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    fireEvent.click(await screen.findByTestId('enter-edit'))
    expect(screen.getByRole('button', { name: /فعالیت/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ذخیره/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /انصراف/ })).toBeInTheDocument()
    // adding an activity puts a new node on the canvas
    fireEvent.click(screen.getByRole('button', { name: /فعالیت/ }))
    expect(await screen.findByText('فعالیت جدید')).toBeInTheDocument()
  })
})
