import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { renderAt } from '../test/utils'
import { EDITOR, VIEWER } from '../test/sessions'
import type { SessionDescriptor } from '../auth/session'
import type { Comment } from '../api/comments'
import { SurfaceProvider, type Surface } from '../ui/surface'
import { CommentsProvider } from './CommentsProvider'
import { DeptFab } from './DeptDrawer'
import { ProcessDrawer, ProcessFab } from './ProcessDrawer'
import { FlowScreen } from '../flow/FlowScreen'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

function cmt(n: number, over: Partial<Comment> = {}, anchor: Partial<Comment['anchor']> = {}): Comment {
  return {
    id: `CMT-${n}`,
    anchor: { kind: 'process', id: 'dining-001', processId: 'dining-001', department: 'dining',
      departmentName: 'سالن', processName: 'پذیرش', nodeLabel: null, orphan: false, ...anchor },
    text: `متن نویسنده ${n}`, state: 'awaiting', stage: 'reader', waitingWith: null,
    author: { name: 'سمیرا احمدی', isMe: true, role: 'reader' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    approvals: 0, notes: [{ by: 'حسین', text: 'یادداشت تأییدکننده', at: '' }], rejectReason: null,
    addressed: null, actions: { approve: false, reject: false, edit: true, withdraw: true, address: false },
    ...over,
  }
}

function stub(proc: Comment[] = [], dept: Comment[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.startsWith('/api/comments?process=')) return json(proc)
    if (url.startsWith('/api/comments?department=')) return json(dept)
    if (url === '/api/departments') return json([{ code: 'dining', name: 'سالن', count: 1, subs: 0 }])
    if (url === '/api/processes/dining-001') return json({ id: 'dining-001', name: 'پذیرش', department: 'dining' })
    return json({})
  })
}

const flow = (session: SessionDescriptor, surface: Surface = 'panel') => renderAt('/processes/:pid/flow', (
  <SurfaceProvider surface={surface}><CommentsProvider>
    <ProcessFab pid="dining-001" />
    <ProcessDrawer pid="dining-001" department="dining" />
  </CommentsProvider></SurfaceProvider>
), '/processes/dining-001/flow', session)

const dept = (session: SessionDescriptor, surface: Surface = 'reader') => renderAt('/departments/:code', (
  <SurfaceProvider surface={surface}><CommentsProvider><DeptFab code="dining" /></CommentsProvider></SurfaceProvider>
), '/departments/dining', session)

const fab = () => screen.findByRole('button', { name: /^کامنت‌های این صفحه/ })

describe('process drawer', () => {
  it('lists only process-anchored comments; the FAB counts them; mini cards show the author text', async () => {
    stub([cmt(1), cmt(2, {}, { kind: 'node', id: 'dining-001-n010', nodeLabel: 'گام' }), cmt(3, { state: 'approved' })])
    flow(VIEWER)
    expect((await screen.findByRole('button', { name: 'کامنت‌های این صفحه، ۲ مورد' }))).toBeInTheDocument()
    fireEvent.click(await fab())
    const drawer = screen.getByRole('dialog', { name: 'کامنت‌های این فرآیند' })
    expect(within(drawer).getByText('مربوط به کل فرآیند، نه یک گام خاص')).toBeInTheDocument()
    expect(within(drawer).getByText('متن نویسنده 1')).toBeInTheDocument()
    expect(within(drawer).getByText('متن نویسنده 3')).toBeInTheDocument()
    expect(within(drawer).queryByText('متن نویسنده 2')).toBeNull()
    expect(within(drawer).queryByText('یادداشت تأییدکننده')).toBeNull()
    expect(within(drawer).getByText('CMT-1')).toBeInTheDocument()
    expect(within(drawer).getByText('در انتظار تأیید')).toBeInTheDocument()
    expect(within(drawer).getByText('رسیده به ادیتور')).toBeInTheDocument()
    expect(within(drawer).getAllByText('سمیرا احمدی')).toHaveLength(2)
    expect(within(drawer).getAllByRole('link', { name: 'باز کردن در صندوق کامنت‌ها' })[0])
      .toHaveAttribute('href', '/comments?c=CMT-1')
    // the FAB hides while its drawer is open (design showFab)
    expect(screen.queryByRole('button', { name: /^کامنت‌های این صفحه/ })).toBeNull()
  })

  it('Escape closes it; it is modal; the Reader card draws no author role (Reader L645)', async () => {
    stub([cmt(1)])
    flow(VIEWER, 'reader')
    fireEvent.click(await fab())
    const drawer = screen.getByRole('dialog', { name: 'کامنت‌های این فرآیند' })
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    expect(await within(drawer).findByText('متن نویسنده 1')).toBeInTheDocument()
    expect(within(drawer).queryByText('خواننده')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await fab()).toBeInTheDocument()
  })

  it('shows the design empty state', async () => {
    stub([cmt(2, {}, { kind: 'node' })])
    flow(VIEWER)
    fireEvent.click(await fab())
    expect(await screen.findByText('کامنتی برای این فرآیند نیست')).toBeInTheDocument()
    expect(screen.getByText('کامنت یک گام خاص، در جزئیات همان گام دیده می‌شود.')).toBeInTheDocument()
    // Reader L680: the edge faces the page, not the window's side (the design's
    // drawer renders its border on the inner edge).
    expect(document.querySelector('[data-r-drawer]')).toHaveClass('border-s')
    expect(document.querySelector('[data-r-drawer]')).not.toHaveClass('border-e')
  })

  it('a VIEWER gets «کامنت تازه روی این فرآیند»; closing the composer re-opens the drawer', async () => {
    stub([])
    flow(VIEWER)
    fireEvent.click(await fab())
    fireEvent.click(screen.getByRole('button', { name: 'کامنت تازه روی این فرآیند' }))
    expect(screen.queryByRole('dialog', { name: 'کامنت‌های این فرآیند' })).toBeNull()
    expect(await screen.findByText('پذیرش', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getByText('کل این فرآیند، نه یک گام خاص')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.getByRole('dialog', { name: 'کامنت‌های این فرآیند' })).toBeInTheDocument()
  })

  it('an EDITOR sees the FAB and the drawer but never «کامنت تازه»', async () => {
    stub([cmt(1)])
    flow(EDITOR)
    fireEvent.click(await fab())
    expect(await screen.findByText('متن نویسنده 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /کامنت تازه/ })).toBeNull()
  })

  it('a VIEWER outside the department gets no «کامنت تازه»', async () => {
    stub([])
    flow({ ...VIEWER, scopes: ['dept:cashier'] })
    fireEvent.click(await fab())
    expect(screen.queryByRole('button', { name: /کامنت تازه/ })).toBeNull()
  })
})

describe('department drawer', () => {
  it('Reader: title, subtitle, the three newest simplified cards (no id, no author)', async () => {
    const d = (n: number) => cmt(n, {}, { kind: 'department', id: 'dining', processId: null })
    stub([], [d(1), d(2), d(3), d(4)])
    dept(VIEWER)
    expect(await screen.findByRole('button', { name: 'کامنت‌های این صفحه، ۴ مورد' })).toBeInTheDocument()
    fireEvent.click(await fab())
    const drawer = screen.getByRole('dialog', { name: 'کامنت‌های این اطلاعات' })
    expect(await within(drawer).findByText('دربارهٔ سالن، نه یک فرآیند خاص')).toBeInTheDocument()
    expect(within(drawer).getByText('متن نویسنده 4')).toBeInTheDocument()
    expect(within(drawer).getByText('متن نویسنده 2')).toBeInTheDocument()
    expect(within(drawer).queryByText('متن نویسنده 1')).toBeNull()
    expect(within(drawer).queryByText('CMT-1')).toBeNull()
    expect(within(drawer).queryByText('سمیرا احمدی')).toBeNull()
    expect(within(drawer).getByRole('button', { name: 'کامنت تازه' })).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'بستن' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await fab()).toBeInTheDocument()
  })

  it('Reader empty state', async () => {
    stub([], [])
    dept(VIEWER)
    fireEvent.click(await fab())
    expect(await screen.findByText('کامنتی روی این اطلاعات نیست')).toBeInTheDocument()
    // Reader L904: the pane's edge faces the page.
    expect(document.querySelector('[data-r-composebox]')).toHaveClass('border-s')
    expect(document.querySelector('[data-r-composebox]')).not.toHaveClass('border-e')
  })

  it('Panel: its own title and empty copy; an EDITOR sees no «کامنت تازه»', async () => {
    stub([], [])
    dept(EDITOR, 'panel')
    fireEvent.click(await fab())
    expect(screen.getByRole('dialog', { name: 'کامنت‌های این خلاصه' })).toBeInTheDocument()
    expect(await screen.findByText('کامنتی روی خلاصهٔ این دپارتمان نیست')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'کامنت تازه' })).toBeNull()
  })

  it('Panel cards carry the id, the author and the inbox link', async () => {
    stub([], [cmt(7, { state: 'addressed' }, { kind: 'department', id: 'dining', processId: null })])
    dept(EDITOR, 'panel')
    fireEvent.click(await fab())
    expect(await screen.findByText('CMT-7')).toBeInTheDocument()
    expect(screen.getByText('رسیدگی‌شده')).toBeInTheDocument()
    expect(screen.getByText('سمیرا احمدی')).toBeInTheDocument()
    expect(screen.getByText('خواننده')).toBeInTheDocument() // Panel L2903: « · {authorRole}»
    expect(screen.getByRole('link', { name: 'باز کردن در صندوق کامنت‌ها' })).toHaveAttribute('href', '/comments?c=CMT-7')
  })

  it('Escape closes it; it is modal', async () => {
    stub([], [])
    dept(VIEWER)
    fireEvent.click(await fab())
    expect(screen.getByRole('dialog', { name: 'کامنت‌های این اطلاعات' })).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await fab()).toBeInTheDocument()
  })
})

describe('without a provider', () => {
  it('the FAB and the process drawer render nothing (screen tests stay untouched)', () => {
    const fetch = stub()
    renderAt('/x', <><DeptFab code="dining" /><ProcessFab pid="p" /><ProcessDrawer pid="p" department="dining" /></>, '/x', VIEWER)
    expect(screen.queryByRole('button')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('on the flow screen', () => {
  const node = { id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: 'd', actor: 'x',
    icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
    position: { x: 40, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } }
  const proc = { id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
    source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
    nodes: [node], edges: [] }

  it("opening a step's detail closes the process drawer (Reader L1846–1847); closing the detail does not bring it back", async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/comments?process=')) return json([])
      if (url === '/api/processes/cooking-001') return json(proc)
      return json([])
    })
    renderAt('/processes/:pid/flow', <CommentsProvider><FlowScreen /></CommentsProvider>,
      '/processes/cooking-001/flow', { ...VIEWER, scopes: ['dept:cooking'] })
    fireEvent.click(await fab())
    expect(screen.getByRole('dialog', { name: 'کامنت‌های این فرآیند' })).toBeInTheDocument()
    fireEvent.click(await screen.findByText('ثبت'))
    expect(screen.queryByRole('dialog', { name: 'کامنت‌های این فرآیند' })).toBeNull()
    const closes = screen.getAllByTitle('بستن')
    expect(closes).toHaveLength(1)
    fireEvent.click(closes[0])
    await waitFor(() => expect(screen.queryAllByTitle('بستن')).toHaveLength(0))
    expect(screen.queryByRole('dialog', { name: 'کامنت‌های این فرآیند' })).toBeNull()
  })
})
