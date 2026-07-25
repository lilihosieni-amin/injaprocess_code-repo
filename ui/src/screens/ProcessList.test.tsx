import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { ProcessList } from './ProcessList'
import { renderAt } from '../test/utils'
import { ToastProvider } from '../write/ToastProvider'

afterEach(() => vi.restoreAllMocks())

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
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
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
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-014' } })
    expect(screen.queryByText('خرید و پرداخت')).not.toBeInTheDocument()
    expect(screen.getByText('پرداخت هزینه')).toBeInTheDocument()
  })

  it('shows a tombstoned process labelled باطل‌شده with an heir link and a (read-only) flowchart button', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
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
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    expect(await screen.findByTestId('pos-cooking-014')).toHaveTextContent('۱')
    expect(screen.getByTestId('pos-cooking-001')).toHaveTextContent('۲')
  })

  it('gives a tombstoned process no position number', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    expect(await screen.findByText('فرآیند قدیمی')).toBeInTheDocument()
    expect(screen.queryByTestId('pos-cooking-002')).not.toBeInTheDocument()
  })

  it('numbering ignores the search filter', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-001' } })
    // cooking-001 keeps position ۲ even though it is now the only visible row — if
    // positions were ever recomputed from the filtered list it would show ۱ instead.
    expect(screen.getByTestId('pos-cooking-001')).toHaveTextContent('۲')
  })

  // the modal calls useToast, so this one test wraps the screen in ToastProvider
  it('opens the reorder panel from the button', async () => {
    mock()
    renderAt('/departments/:code', <ToastProvider><ProcessList /></ToastProvider>, '/departments/cooking')
    fireEvent.click(await screen.findByRole('button', { name: 'ترتیب فرآیندها' }))
    expect(await screen.findByText(/ترتیب فرآیندهای/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-014', 'cooking-001'])
  })
})
