import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { CreateProcessModal } from './CreateProcessModal'
import userEvent from '@testing-library/user-event'

afterEach(() => vi.restoreAllMocks())
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('CreateProcessModal', () => {
  it('shows the suggested id and POSTs on create', async () => {
    const onClose = vi.fn()
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/next-id')) return Promise.resolve(new Response(JSON.stringify({ next_id: 'cooking-007' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-007' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={onClose} />)
    expect(await screen.findByText('cooking-007')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/فرآیند/), { target: { value: 'فرآیند تست' } })
    fireEvent.click(screen.getByRole('button', { name: /ایجاد/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes', expect.objectContaining({ method: 'POST' })))
  })
})

describe('CreateProcessModal — a slow create looks slow, not frozen', () => {
  it('looks busy rather than unchanged while the create is in flight', async () => {
    // The same O8/P1 defect as the delete: `disabled={create.isPending}` on its
    // own paints nothing, and creating a process is a write to disk.
    const onClose = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}))
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد و ویرایش' }))
    const go = await screen.findByRole('button', { name: /در حال ساخت/ })
    expect(go).toHaveAttribute('aria-busy', 'true')
    expect(go).toBeDisabled()
    expect(within(go).getByTestId('btn-spinner')).toBeInTheDocument()
  })
})

describe('CreateProcessModal — one dialog, one scrim, one direction (P3, O1, O7)', () => {
  it('is a real dialog: escape closes it, focus is trapped, and the scrim is the primitive\u2019s', async () => {
    const onClose = vi.fn()
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={onClose} />)
    const box = await screen.findByRole('dialog', { name: 'ایجاد فرآیند جدید' })
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

  it('takes §3.3\u2019s width for this dialog, and not the default', async () => {
    const onClose = vi.fn()
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={onClose} />)
    // 460 — §3.3’s confirm/create width. `Dialog`'s `width` prop is a KEY, not a number: `Overlay`
    // types it `keyof typeof WIDTH` and maps it to one of five `max-w-dialog-*`
    // utilities, so a wrong key compiles and paints the wrong box silently.
    // `md` is the default, which is why the negative half is here too.
    expect(await screen.findByRole('dialog')).toHaveClass('max-w-dialog-sm')
    expect(screen.getByRole('dialog')).not.toHaveClass('max-w-dialog')
  })

  it('does not re-pin its own direction', async () => {
    const onClose = vi.fn()
    wrap(<CreateProcessModal department="cooking" departmentName="پخت" onClose={onClose} />)
    // O1 — five files carried `dir="rtl"` and a comment explaining it, because
    // `ProcessList` set `dir="ltr"` on its whole scrolling region to move a
    // scrollbar. §8's own idiom flips the *container* and its immediate children
    // back, and that lives in `base.css` as `[data-r-pad]`, not in every dialog
    // that mounts inside it. `closest`, not the element itself: a `dir` on the
    // scrim above it would pin this box just as effectively.
    expect((await screen.findByRole('dialog')).closest('[dir]')).toBeNull()
  })
})
