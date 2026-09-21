import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderAt } from '../test/utils'
import { EDITOR, VIEWER } from '../test/sessions'
import type { SessionDescriptor } from '../auth/session'
import type { Comment } from '../api/comments'
import type { ProcNode } from '../api/types'
import { CommentsProvider } from '../comments/CommentsProvider'
import { FlowScreen } from './FlowScreen'
import { FlowViewer } from '../../export/flowchart/FlowViewer'
import { createSeededClient } from '../../export/shared/seed'
import type { ExportPayload } from '../../export/shared/payload'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const act = (id: string, label: string, x: number) => ({
  id, type: 'activity', label, description: 'd', actor: 'x',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] },
}) as unknown as ProcNode

const PROC = {
  id: 'cooking-001', department: 'cooking', name: 'پخت', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [act('cooking-001-n010', 'ثبت', 40), act('cooking-001-n020', 'تحویل', 300),
    { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 600, y: 90 }, layout: 'auto' } as ProcNode],
  edges: [],
}

function cmt(n: number, nodeId: string | null): Comment {
  return {
    id: `CMT-${n}`,
    anchor: nodeId
      ? { kind: 'node', id: nodeId, processId: 'cooking-001', department: 'cooking', departmentName: 'آشپزخانه', processName: 'پخت', nodeLabel: 'ثبت', orphan: false }
      : { kind: 'process', id: 'cooking-001', processId: 'cooking-001', department: 'cooking', departmentName: 'آشپزخانه', processName: 'پخت', nodeLabel: null, orphan: false },
    text: `متن ${n}`, state: 'awaiting', stage: 'reader', waitingWith: null,
    author: { name: 'سمیرا احمدی', isMe: true, role: 'reader' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    approvals: 0, notes: [], rejectReason: null, addressed: null,
    actions: { approve: false, reject: false, edit: true, withdraw: true, address: false },
  }
}

const COMMENTS = [cmt(1, 'cooking-001-n010'), cmt(2, 'cooking-001-n010'), cmt(3, null), cmt(4, 'cooking-001-j1')]

function flow(session: SessionDescriptor) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.startsWith('/api/comments?process=')) return json(COMMENTS)
    if (url === '/api/processes/cooking-001') return json(PROC)
    return json([])
  })
  renderAt('/processes/:pid/flow', <CommentsProvider><FlowScreen /></CommentsProvider>,
    '/processes/cooking-001/flow', { ...session, scopes: ['dept:cooking'] })
}

const drawer = () => screen.getByTitle('بستن').closest('[data-drawer]') as HTMLElement

describe('step comments on the flowchart', () => {
  it('a node with two visible comments wears the badge «۲»; a node with none wears nothing', async () => {
    flow(VIEWER)
    const badge = await screen.findByTitle('کامنت دارد')
    expect(badge).toHaveTextContent('۲')
    expect(screen.getAllByTitle('کامنت دارد')).toHaveLength(1)
  })

  it("the drawer lists the node's comments under «کامنت‌های این گام (۲)» and offers «کامنت روی این گام»", async () => {
    flow(VIEWER)
    await screen.findByTitle('کامنت دارد')
    fireEvent.click(screen.getByText('ثبت'))
    const d = drawer()
    expect(within(d).getByText('کامنت‌های این گام (۲)')).toBeInTheDocument()
    expect(within(d).getByText('متن 1')).toBeInTheDocument()
    expect(within(d).getByText('متن 2')).toBeInTheDocument()
    expect(within(d).queryByText('متن 3')).toBeNull()
    fireEvent.click(within(d).getByRole('button', { name: 'کامنت روی این گام' }))
    expect(await screen.findByText('گام «ثبت» · پخت')).toBeInTheDocument()
  })

  it('a node with no comments: no section, the button still there', async () => {
    flow(VIEWER)
    await screen.findByTitle('کامنت دارد')
    fireEvent.click(screen.getByText('تحویل'))
    const d = drawer()
    expect(within(d).queryByText(/کامنت‌های این گام/)).toBeNull()
    expect(within(d).getByRole('button', { name: 'کامنت روی این گام' })).toBeInTheDocument()
  })

  it('a junction gets the same button and section (Reader L626, D30), and no badge on the diamond', async () => {
    flow(VIEWER)
    await screen.findByTitle('کامنت دارد')
    expect(screen.getAllByTitle('کامنت دارد')).toHaveLength(1)
    fireEvent.click(screen.getAllByText('XOR')[0])
    const d = drawer()
    expect(within(d).getByText('دروازهٔ منطقی XOR')).toBeInTheDocument()
    expect(within(d).getByText('کامنت‌های این گام (۱)')).toBeInTheDocument()
    expect(within(d).getByText('متن 4')).toBeInTheDocument()
    fireEvent.click(within(d).getByRole('button', { name: 'کامنت روی این گام' }))
    expect(await screen.findByText('گام «دروازهٔ منطقی XOR» · پخت')).toBeInTheDocument()
  })

  it('an Editor sees the list and no button', async () => {
    flow(EDITOR)
    await screen.findByTitle('کامنت دارد')
    fireEvent.click(screen.getByText('ثبت'))
    const d = drawer()
    expect(within(d).getByText('کامنت‌های این گام (۲)')).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: 'کامنت روی این گام' })).toBeNull()
  })
})

describe('the export viewer', () => {
  it('renders no comment UI — no badge, no drawer section, no button', async () => {
    const payload = {
      dept: { department: 'cooking', name: 'آشپزخانه', description: '', sub_units: [], personnel: [], updated_at: '' },
      processes: [PROC], generated_at: '',
    } as unknown as ExportPayload
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(
      <QueryClientProvider client={createSeededClient(payload)}>
        <FlowViewer processes={payload.processes} startId="cooking-001" onClose={vi.fn()} />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByText('ثبت'))
    expect(document.querySelector('[data-drawer]')).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/کامنت/)
    expect(screen.queryByTitle('کامنت دارد')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
