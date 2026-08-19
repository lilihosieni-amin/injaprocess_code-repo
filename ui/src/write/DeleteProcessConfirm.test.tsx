import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { DeleteProcessConfirm } from './DeleteProcessConfirm'
import userEvent from '@testing-library/user-event'

afterEach(() => vi.restoreAllMocks())
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('DeleteProcessConfirm', () => {
  it('DELETEs and closes on confirm', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ deleted: 'cooking-002' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    expect(screen.getByText(/پخت/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /حذف کامل فرآیند/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'DELETE' })))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('spells out that deletion is permanent and the id is never reused', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ deleted: 'cooking-002' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={vi.fn()} />)
    expect(screen.getByText(/برای همیشه و بدون امکان بازیابی/)).toBeInTheDocument()
    expect(screen.getByText(/شناسه.*دوباره.*استفاده نمی‌شود/)).toBeInTheDocument()
  })
})

describe('DeleteProcessConfirm — the one irreversible act looks like one', () => {
  it('draws it with the danger variant', () => {
    const onClose = vi.fn()
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    const go = screen.getByRole('button', { name: 'حذف کامل فرآیند' })
    // O6 — it was hand-rolled because `Button` had no `danger`: `rounded-xl`
    // (Tailwind's 12px, not `--radius-md`), `text-sm` (14px, not `--fs-body`),
    // `text-white` (not `text-card`) — and none of `Button`'s touch floor, focus
    // handling or busy state. §5.2's destructive ghost is `--tile-c2` under
    // `--conflict` behind a `--border-danger` edge, which is what `danger` is.
    expect(go).toHaveClass('bg-tile-c2', 'text-conflict', 'border-border-danger')
    expect(go).toHaveClass('min-h-touch')
    // …and NOT the filled coral primary it used to wear. INV-4 / FR-D8 make this
    // the only deletion in the product; the design does not spend its
    // new-affordance colour on it.
    expect(go).not.toHaveClass('bg-coral')
  })

  it('looks busy rather than unchanged while the delete is in flight', async () => {
    // O8/P1 — `disabled={del.isPending}` rendered no visible change at all, so
    // the slowest action in the product looked frozen. S4: "a busy button swaps
    // its icon for a spinner, forces itself disabled, and says so".
    const onClose = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}))
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف کامل فرآیند' }))
    const go = await screen.findByRole('button', { name: /در حال حذف/ })
    expect(go).toHaveAttribute('aria-busy', 'true')
    expect(go).toBeDisabled()
    expect(within(go).getByTestId('btn-spinner')).toBeInTheDocument()
  })
})

describe('DeleteProcessConfirm — one dialog, one scrim, one direction (P3, O1, O7)', () => {
  it('is a real dialog: escape closes it, focus is trapped, and the scrim is the primitive\u2019s', async () => {
    const onClose = vi.fn()
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    const box = await screen.findByRole('dialog', { name: /حذف کامل فرآیند/ })
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
    wrap(<DeleteProcessConfirm pid="cooking-002" name="پخت" onClose={onClose} />)
    // O1 — five files carried `dir="rtl"` and a comment explaining it, because
    // `ProcessList` set `dir="ltr"` on its whole scrolling region to move a
    // scrollbar. §8's own idiom flips the *container* and its immediate children
    // back, and that lives in `base.css` as `[data-r-pad]`, not in every dialog
    // that mounts inside it. `closest`, not the element itself: a `dir` on the
    // scrim above it would pin this box just as effectively.
    expect((await screen.findByRole('dialog')).closest('[dir]')).toBeNull()
  })
})
