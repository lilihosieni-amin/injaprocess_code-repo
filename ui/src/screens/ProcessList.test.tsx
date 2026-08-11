import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { ProcessList } from './ProcessList'
import { renderAt } from '../test/utils'
import { ToastProvider } from '../write/ToastProvider'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

// The three descriptors below differ from EDITOR one field at a time, so an
// assertion that separates any two of them can only be separating them on that
// field. READER is EDITOR minus `edit` and nothing else; OTHER_DEPT_EDITOR holds
// `edit` but over a different department, which is the case a check that asked
// "does this person hold edit anywhere?" would get wrong.
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const READER: SessionDescriptor = { ...EDITOR, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'] }
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:cashier'] }

// Curated order deliberately diverges from id order (cooking-014 before cooking-001):
// if ProcessList ever started sorting by id before numbering, the position assertions
// below would flip and fail. See finding A in the Task 11 review.
const PROCS = [
  { id: 'cooking-014', department: 'cooking', name: 'پرداخت هزینه', summary: 's2', parent: { process: 'cooking-001', node: 'n' }, kpis: [], pending: [], nodes: [{ type: 'activity' }] },
  { id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: 's1', parent: null, kpis: [{ name: 'k' }], pending: [], nodes: [{ type: 'activity' }, { type: 'start' }] },
  { id: 'cooking-002', department: 'cooking', name: 'فرآیند قدیمی', summary: 's3', parent: null, kpis: [], pending: [], nodes: [], tombstoned: true, superseded_by: ['cooking-050'] },
]

function mock() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/processes')) return Promise.resolve(new Response(JSON.stringify(PROCS), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 2 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}

describe('ProcessList', () => {
  it('renders cards with derived tags and activity counts', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByText('دارای KPI')).toBeInTheDocument()   // cooking-001
    expect(screen.getByText('زیرفرآیند')).toBeInTheDocument()   // cooking-014
    // cooking-014 has 1 activity node, and its position badge is also ۱ (it's first
    // in curated order) — the same ۱ text appears twice on its card. Disambiguate via
    // the activity-count testid rather than a cosmetic font-size selector.
    expect(screen.getByTestId('activity-count-cooking-014')).toHaveTextContent('۱')
    expect(screen.getByTestId('activity-count-cooking-001')).toHaveTextContent('۱')
  })

  it('filters by id', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-014' } })
    expect(screen.queryByText('خرید و پرداخت')).not.toBeInTheDocument()
    expect(screen.getByText('پرداخت هزینه')).toBeInTheDocument()
  })

  it('shows a tombstoned process labelled باطل‌شده with an heir link and a (read-only) flowchart button', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.getByText('باطل‌شده')).toBeInTheDocument()
    // heir link present, points at the heir process
    const heir = screen.getByRole('link', { name: /cooking-050/ })
    expect(heir).toHaveAttribute('href', '/processes/cooking-050')
    // the tombstoned row still exposes the flowchart button (view is read-only)
    const row = screen.getByText('فرآیند قدیمی').closest('div[class*="rounded-2xl"]') as HTMLElement
    expect(row).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'فلوچارت' })).toBeInTheDocument()
    // permanent delete stays available
    expect(within(row).getByTitle('حذف دائمی فرآیند')).toBeInTheDocument()
  })

  it('numbers active processes in the order the API returned', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByTestId('pos-cooking-014')).toHaveTextContent('۱')
    expect(screen.getByTestId('pos-cooking-001')).toHaveTextContent('۲')
  })

  it('gives a tombstoned process no position number', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.queryByTestId('pos-cooking-002')).not.toBeInTheDocument()
  })

  it('numbering ignores the search filter', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-001' } })
    // cooking-001 keeps position ۲ even though it is now the only visible row — if
    // positions were ever recomputed from the filtered list it would show ۱ instead.
    expect(screen.getByTestId('pos-cooking-001')).toHaveTextContent('۲')
  })

  it('gives an editor of this department the create, reorder and delete controls', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    // wait for the rows, not for a header button: the header renders before the
    // list resolves, and a delete count taken then would be zero for that reason
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'فرآیند جدید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ترتیب فرآیندها' })).toBeInTheDocument()
    // one per row, tombstone included — the permanent-delete affordance
    expect(screen.queryAllByTitle(/حذف/)).toHaveLength(PROCS.length)
  })

  it('draws no create, reorder or delete control for a reader', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
    // The fixture keeps the tombstone a reader would not actually be served, so
    // both delete titles — «حذف فرآیند» and «حذف دائمی فرآیند» — are in play here.
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'فرآیند جدید' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ترتیب فرآیندها' })).not.toBeInTheDocument()
    expect(screen.queryAllByTitle(/حذف/)).toHaveLength(0)
    // and what a reader may do is untouched
    expect(screen.getByRole('button', { name: 'اطلاعات دپارتمان' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'فلوچارت' })).toHaveLength(PROCS.length)
  })

  it('draws no edit control for an editor scoped to a different department', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', OTHER_DEPT_EDITOR)
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'فرآیند جدید' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ترتیب فرآیندها' })).not.toBeInTheDocument()
    expect(screen.queryAllByTitle(/حذف/)).toHaveLength(0)
  })

  // the modal calls useToast, so this one test wraps the screen in ToastProvider
  it('opens the reorder panel from the button', async () => {
    mock()
    renderAt('/departments/:code', <ToastProvider><ProcessList /></ToastProvider>, '/departments/cooking', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ترتیب فرآیندها' }))
    expect(await screen.findByText(/ترتیب فرآیندهای/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-014', 'cooking-001'])
  })
})
