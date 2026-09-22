import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderAt } from '../test/utils'
import { EDITOR, VIEWER } from '../test/sessions'
import type { SessionDescriptor } from '../auth/session'
import type { Comment } from '../api/comments'
import { CommentsProvider } from '../comments/CommentsProvider'
import { Steps } from './Steps'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const NO_ICOM = { inputs: [], controls: [], outputs: [], mechanisms: [] }
const act = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id, type: 'activity', label, description: '', actor: '', icom: NO_ICOM, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] }, ...over,
})

/** n1 top level with a body; n2 and n3 inside an XOR's branches; n4 after the merge. */
const PROC = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از میهمان', parent: null,
  summary: '', idef0: NO_ICOM, kpis: [], pending: [],
  nodes: [
    act('n1', 'استقبال', { actor: 'میزبان' }),
    { id: 'j1', type: 'junction', junctionType: 'XOR', position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] } },
    act('n2', 'گرفتن سفارش', { actor: 'گارسون' }),
    act('n3', 'تسویه', { actor: 'صندوق‌دار' }),
    act('n4', 'بدرقه'),
  ],
  edges: [
    { from: 'n1', to: 'j1' }, { from: 'j1', to: 'n2', label: 'الف' }, { from: 'j1', to: 'n3', label: 'ب' },
    { from: 'n2', to: 'n4' }, { from: 'n3', to: 'n4' },
  ],
}

const cmt = (n: number, node: string): Comment => ({
  id: `CMT-${n}`,
  anchor: { kind: 'node', id: node, processId: 'dining-003', department: 'dining', departmentName: 'سالن', processName: PROC.name, nodeLabel: '', orphan: false },
  text: `متن ${n}`, state: 'awaiting', stage: 'reader', waitingWith: null, author: { name: 'x', isMe: true, role: 'reader' },
  createdAt: '', updatedAt: '', approvals: 0, notes: [], rejectReason: null, addressed: null,
  actions: { approve: false, reject: false, edit: true, withdraw: true, address: false },
})

function draw(session: SessionDescriptor, url = '/processes/dining-003/steps') {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.startsWith('/api/comments?process=')) return json([cmt(1, 'n1'), cmt(2, 'n2')])
    if (url === '/api/processes/dining-003') return json(PROC)
    return json([])
  })
  renderAt('/processes/:pid/steps', <CommentsProvider><Steps /></CommentsProvider>, url, session)
}

const card = (label: string) => screen.getByText(label).closest('[data-step]') as HTMLElement

describe('Steps — comments on a step', () => {
  it('shows «۱ کامنت» on the right step, and «کامنت روی این گام» in its expanded body', async () => {
    draw(VIEWER)
    expect(await screen.findByText('۱ کامنت')).toBeInTheDocument()
    expect(screen.getAllByText('۱ کامنت')).toHaveLength(1)
    expect(within(card('استقبال')).getByText('۱ کامنت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'کامنت روی این گام' })).toBeNull()
    fireEvent.click(screen.getByText('استقبال'))
    fireEvent.click(within(card('استقبال')).getByRole('button', { name: 'کامنت روی این گام' }))
    expect(await screen.findByText('گام «استقبال» · پذیرایی از میهمان')).toBeInTheDocument()
  })

  it('keeps the floating button, which opens the process drawer (the design\'s steps view has both)', async () => {
    draw(VIEWER)
    fireEvent.click(await screen.findByRole('button', { name: 'کامنت‌های این صفحه' }))
    expect(await screen.findByRole('dialog', { name: 'کامنت‌های این فرآیند' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /کامنت‌های این صفحه/ })).toBeNull()
  })

  it('a step inside a branch gets neither chip nor button', async () => {
    draw(VIEWER)
    await screen.findByText('۱ کامنت')
    fireEvent.click(screen.getByText('گرفتن سفارش'))
    expect(within(card('گرفتن سفارش')).getByText('گارسون')).toBeInTheDocument()
    expect(within(card('گرفتن سفارش')).queryByText(/کامنت/)).toBeNull()
  })

  it('?step=<node> opens that step and scrolls it into view once (Reader L2715–2716)', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    draw(VIEWER, '/processes/dining-003/steps?step=n1')
    await screen.findByText('۱ کامنت')
    expect(within(card('استقبال')).getByText('میزبان')).toBeInTheDocument()
    expect(within(card('استقبال')).getByRole('button', { expanded: true })).toBeInTheDocument()
    expect(within(card('بدرقه')).getByRole('button')).not.toHaveAttribute('aria-expanded', 'true')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(card('استقبال'))
  })

  it('an Editor sees the chip and no button', async () => {
    draw(EDITOR)
    await screen.findByText('۱ کامنت')
    fireEvent.click(screen.getByText('استقبال'))
    expect(within(card('استقبال')).getByText('میزبان')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'کامنت روی این گام' })).toBeNull()
  })
})
