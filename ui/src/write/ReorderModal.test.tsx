import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReorderModal } from './ReorderModal'
import { ToastProvider } from './ToastProvider'
import type { Process } from '../api/types'
import userEvent from '@testing-library/user-event'

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

/** Three ACTIVE rows, ordered یک · چهار · سه. Two presses of «به بالا» on the
 *  last one have to move it two places, which a two-row fixture cannot show:
 *  with two rows the second press is a no-op, so a component that moved a row
 *  by one and then stopped would pass. */
const THREE = [
  proc('cooking-001', 'یک'),
  proc('cooking-004', 'چهار'),
  proc('cooking-003', 'سه'),
]

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

describe('ReorderModal', () => {
  it('lists active processes in the given order and excludes tombstones', () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    const rows = screen.getAllByTestId('reorder-row')
    expect(rows.map((r) => r.getAttribute('data-pid'))).toEqual(['cooking-003', 'cooking-001'])
    expect(screen.queryByText('دو')).not.toBeInTheDocument()
  })

  it('can be reordered from the keyboard, and the saved sequence is what the list shows (O4)', async () => {
    // The rows were `draggable` with four drag handlers and NOTHING else: a
    // keyboard or screen-reader user could open this box, read the order and
    // save it unchanged. `⣿` is decoration — HTML drag-and-drop has no keyboard
    // equivalent at all, so the affordance did not exist for them.
    //
    // The old test here asserted the ABSENCE of two buttons named «انتقال به
    // بالا» / «انتقال به پایین» — names this component has never used — so it
    // passed whether or not any move buttons existed, and would have gone on
    // passing if the ones added here were deleted again.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={THREE} onClose={onClose} />)
    // The label names the ROW, not the direction: «به بالا» alone is the same
    // accessible name on every row in the list.
    expect(screen.getByRole('button', { name: 'بردن «یک» به بالا' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'بردن «سه» به بالا' }))
    fireEvent.click(screen.getByRole('button', { name: 'بردن «سه» به بالا' }))
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-003', 'cooking-001', 'cooking-004'])
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    // …and what is SAVED is what is on screen. A move that redrew the list from
    // a different array than the one it sends is the defect this half catches.
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)))
      .toEqual({ order: ['cooking-003', 'cooking-001', 'cooking-004'] })
  })

  it('cannot move the last row down', () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={THREE} onClose={onClose} />)
    expect(screen.getByRole('button', { name: 'بردن «سه» به پایین' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'بردن «یک» به پایین' })).toBeEnabled()
  })

  it('marks the gap the row would drop into when dragging upward', () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    const rows = screen.getAllByTestId('reorder-row')
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
    fireEvent.dragStart(rows[1])
    fireEvent.dragOver(rows[0])
    // dragging up onto row 0 lands the row above it, so the gap is marked before row 0
    expect(screen.getByTestId('drop-indicator').nextElementSibling).toBe(rows[0])
  })

  it('marks the gap the row would drop into when dragging downward', () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[0])
    fireEvent.dragOver(rows[1])
    // dragging down onto row 1 lands the row below it, so the gap is marked after row 1
    expect(screen.getByTestId('drop-indicator').previousElementSibling).toBe(rows[1])
  })

  it('shows no gap marker over the row being dragged, and clears it when the drag ends', () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
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
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
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
    const onClose = vi.fn()
    // saving on the server takes a noticeable moment; the button must look busy
    // rather than frozen, and must not accept a second click meanwhile
    let release: (r: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((res) => { release = res }))
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
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
    const onClose = vi.fn()
    // Saving nothing would write `{"order": []}` for a department that ARD §4.6
    // says should stay fileless, and the no-churn guard then keeps it forever.
    const spy = vi.spyOn(globalThis, 'fetch')
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={[]} onClose={onClose} />)
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

describe('ReorderModal — one dialog, one scrim, one direction (P3, O1, O7)', () => {
  it('is a real dialog: escape closes it, focus is trapped, and the scrim is the primitive\u2019s', async () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    const box = await screen.findByRole('dialog', { name: /ترتیب فرآیندهای/ })
    expect(box).toHaveAttribute('aria-modal', 'true')
    // P3/O7 — five dialogs bypassed `Overlay` and hand-picked five different
    // stacking levels of their own against its ladder; three of them could not
    // be closed from the keyboard at all. The rung is asserted on the SCRIM's
    // class rather than on an inline style: `Overlay` writes `z-modal` and only
    // adds `style="z-index: calc(...)"` for a NESTED overlay, so an assertion on
    // an inline z-index is one that a lone dialog — every dialog here — can
    // never satisfy however correct it is.
    expect(box.parentElement).toHaveClass('z-modal')
    expect(document.body.style.overflow).toBe('hidden')
    // …and Escape reaches it. Asserted as `onClose` being CALLED, not as the
    // box disappearing: every one of these five is controlled by its parent —
    // `open` is a literal — so a dialog that answered Escape perfectly would
    // still be on screen at the end of this test.
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not re-pin its own direction', async () => {
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    // O1 — five files carried `dir="rtl"` and a comment explaining it, because
    // `ProcessList` set `dir="ltr"` on its whole scrolling region to move a
    // scrollbar. §8's own idiom flips the *container* and its immediate children
    // back, and that lives in `base.css` as `[data-r-pad]`, not in every dialog
    // that mounts inside it. `closest`, not the element itself: a `dir` on the
    // scrim above it would pin this box just as effectively.
    expect((await screen.findByRole('dialog')).closest('[dir]')).toBeNull()
  })
})
