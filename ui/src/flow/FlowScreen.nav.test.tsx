import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const base = {
  department: 'cooking', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' }], edges: [],
}
const p1 = { ...base, id: 'cooking-001', name: 'فرآیند یک' }
const p2 = { ...base, id: 'cooking-002', name: 'فرآیند دو' }
const list = [p1, p2]

function mock() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.endsWith('/processes')
      ? list
      : url.endsWith('cooking-002') ? p2 : p1
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}

describe('FlowScreen prev/next navigation', () => {
  it('shows next/prev buttons in view mode and navigates to the sibling process', async () => {
    mock()
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    // header shows the current process name
    expect(await screen.findByText('فرآیند یک')).toBeInTheDocument()
    const next = screen.getByRole('button', { name: /فرآیند بعدی/ })
    expect(next).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /فرآیند قبلی/ })).toBeInTheDocument()
    // clicking next lands on the sibling — its name now appears in the header
    fireEvent.click(next)
    await waitFor(() => expect(screen.getByText('فرآیند دو')).toBeInTheDocument())
  })

  it('hides the buttons when the department has only one active process', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.endsWith('/processes') ? [p1] : p1
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow')
    expect(await screen.findByText('فرآیند یک')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /فرآیند بعدی/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /فرآیند قبلی/ })).not.toBeInTheDocument()
  })
})
