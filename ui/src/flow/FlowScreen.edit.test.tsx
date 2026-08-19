import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())
/** Entering edit mode is an editor's move: «ویرایش» is gated on `edit` over the
 *  process's own department (R5), and this screen draws none of the edit
 *  toolbar below without it. Seeded through `renderAt` rather than served by
 *  the stub — the stub answers every URL with the process document, GET
 *  /api/auth/me included, and `useCan` cannot read capabilities off a
 *  `Process`.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' }],
  edges: [] }

describe('FlowScreen edit mode', () => {
  it('entering edit shows the edit toolbar (add activity/save/cancel)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', EDITOR)
    fireEvent.click(await screen.findByTestId('enter-edit'))
    expect(screen.getByRole('button', { name: /فعالیت/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ذخیره/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /انصراف/ })).toBeInTheDocument()
    // adding an activity puts a new node on the canvas
    fireEvent.click(screen.getByRole('button', { name: /فعالیت/ }))
    expect(await screen.findByText('فعالیت جدید')).toBeInTheDocument()
  })
})
