import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReorderModal } from './ReorderModal'
import { ToastProvider } from './ToastProvider'
import type { Process } from '../api/types'

afterEach(() => vi.restoreAllMocks())

function proc(id: string, name: string, extra: Partial<Process> = {}): Process {
  return { id, department: 'cooking', name, summary: '', nodes: [], edges: [], pending: [],
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '2026-07-25T12:00:00Z', updated_at: '2026-07-25T12:00:00Z',
    ...extra } as Process
}

const PROCS = [
  proc('cooking-003', 'سه'),
  proc('cooking-001', 'یک'),
  proc('cooking-002', 'دو', { tombstoned: true }),
]

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

describe('ReorderModal', () => {
  // ProcessList's scroll container is dir="ltr" (scrollbar placement) and the modals
  // render inside it, so the modal must re-establish its own direction — the same
  // thing ActivityNode does inside the dir="ltr" Canvas.
  it('renders right-to-left even when mounted inside an LTR container', () => {
    wrap(<div dir="ltr"><ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} /></div>)
    const row = screen.getAllByTestId('reorder-row')[0]
    expect(row.closest('[dir]')?.getAttribute('dir')).toBe('rtl')
  })

  it('lists active processes in the given order and excludes tombstones', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    expect(rows.map((r) => r.getAttribute('data-pid'))).toEqual(['cooking-003', 'cooking-001'])
    expect(screen.queryByText('دو')).not.toBeInTheDocument()
  })

  it('has no per-row arrow buttons — rows are reordered by dragging', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'انتقال به بالا' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'انتقال به پایین' })).not.toBeInTheDocument()
  })

  it('marks the gap the row would drop into when dragging upward', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
    fireEvent.dragStart(rows[1])
    fireEvent.dragOver(rows[0])
    // dragging up onto row 0 lands the row above it, so the gap is marked before row 0
    expect(screen.getByTestId('drop-indicator').nextElementSibling).toBe(rows[0])
  })

  it('marks the gap the row would drop into when dragging downward', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[0])
    fireEvent.dragOver(rows[1])
    // dragging down onto row 1 lands the row below it, so the gap is marked after row 1
    expect(screen.getByTestId('drop-indicator').previousElementSibling).toBe(rows[1])
  })

  it('shows no gap marker over the row being dragged, and clears it when the drag ends', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[0])
    fireEvent.dragOver(rows[0])
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
    fireEvent.dragOver(rows[1])
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
    fireEvent.dragEnd(rows[0])
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
  })

  it('reorders by drag and drop', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[1])
    fireEvent.dragOver(rows[0])
    fireEvent.drop(rows[0])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('PUTs the full sequence on save and closes', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-001', 'cooking-003'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[1]); fireEvent.dragOver(rows[0]); fireEvent.drop(rows[0])
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/order',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ order: ['cooking-001', 'cooking-003'] }) }))
  })

  it('discards changes on cancel without any request', () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[1]); fireEvent.dragOver(rows[0]); fireEvent.drop(rows[0])
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(onClose).toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows a busy save button while the request is in flight', async () => {
    // saving on the server takes a noticeable moment; the button must look busy
    // rather than frozen, and must not accept a second click meanwhile
    let release: (r: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((res) => { release = res }))
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const save = screen.getByRole('button', { name: /ذخیره/ })
    fireEvent.click(save)
    const busy = await screen.findByRole('button', { name: /در حال ذخیره/ })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    release(new Response(JSON.stringify({ order: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })

  it('shows the drift notice and closes the modal on a 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-009 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    expect(await screen.findByText(/ترتیب تغییر کرده/)).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('cannot save an empty department', () => {
    // Saving nothing would write `{"order": []}` for a department that ARD §4.6
    // says should stay fileless, and the no-churn guard then keeps it forever.
    const spy = vi.spyOn(globalThis, 'fetch')
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={[]} onClose={() => {}} />)
    const save = screen.getByRole('button', { name: /ذخیره/ })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows a generic failure message and keeps the modal open on a non-409 error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'internal error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    expect(await screen.findByText('ذخیرهٔ ترتیب انجام نشد')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
