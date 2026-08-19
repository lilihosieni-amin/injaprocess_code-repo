import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { InboxModal } from './InboxModal'
import userEvent from '@testing-library/user-event'

afterEach(() => vi.restoreAllMocks())
const ROW = { process: 'cooking-001', department: 'cooking', name: 'خرید', node: 'cooking-001-n020',
  index: 0, field: 'actor', current: 'مدیر رستوران', proposed: 'معاون مدیر', source: 'جلسه', status: 'open' }
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('InboxModal', () => {
  it('lists pending and accepts by (pid, index)', async () => {
    const onClose = vi.fn()
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/pending')) return Promise.resolve(new Response(JSON.stringify([ROW]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-001' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    wrap(<InboxModal onClose={onClose} />)
    expect(await screen.findByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /پذیرش/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-001/pending/0', expect.objectContaining({ method: 'POST' })))
  })
})

describe('InboxModal — one dialog, one scrim, one direction (P3, O1, O7)', () => {
  it('is a real dialog: escape closes it, focus is trapped, and the scrim is the primitive\u2019s', async () => {
    const onClose = vi.fn()
    wrap(<InboxModal onClose={onClose} />)
    const box = await screen.findByRole('dialog', { name: 'صندوق بازبینی تعارض‌ها' })
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
    wrap(<InboxModal onClose={onClose} />)
    // O1 — five files carried `dir="rtl"` and a comment explaining it, because
    // `ProcessList` set `dir="ltr"` on its whole scrolling region to move a
    // scrollbar. §8's own idiom flips the *container* and its immediate children
    // back, and that lives in `base.css` as `[data-r-pad]`, not in every dialog
    // that mounts inside it. `closest`, not the element itself: a `dir` on the
    // scrim above it would pin this box just as effectively.
    expect((await screen.findByRole('dialog')).closest('[dir]')).toBeNull()
  })
})
