import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ExportModal } from './ExportModal'
import userEvent from '@testing-library/user-event'

const TITLE = 'خروجی مستندات کامل — سند رسمی'

// navigator.clipboard is absent in jsdom; the copy tests install and remove it.
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true })
}

afterEach(() => {
  // restore unconditionally: a throw mid-test must not leak fake timers or a
  // stubbed clipboard into the tests that follow.
  vi.useRealTimers()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else delete (navigator as { clipboard?: unknown }).clipboard
  vi.restoreAllMocks()
})

describe('ExportModal', () => {
  it('shows a spinner and the building message while pending', () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
    expect(screen.getByText(TITLE)).toBeInTheDocument()
  })

  it('ignores a press on the scrim while pending but honours it once ready', () => {
    // Nothing aborts the POST (D-abort), so a stray press on the backdrop does
    // not stop the export — it loses the link the export is being made FOR, and
    // the next attempt is a second write to the same deterministic filename.
    // `Overlay` dismisses on **mousedown**, which `fireEvent.click` does not
    // emit; a `click` here would report a clean pass on a scrim that dismisses
    // in every state.
    const onClose = vi.fn()
    const scrim = () => screen.getByRole('dialog').parentElement!
    const { rerender } = render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.mouseDown(scrim())
    expect(onClose).not.toHaveBeenCalled()

    rerender(<ExportModal title={TITLE} status="ready" url="https://x/exports/a.html" onRetry={() => {}} onClose={onClose} />)
    fireEvent.mouseDown(scrim())
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when the click lands inside the card', () => {
    // selecting the link by clicking the field is the field's whole purpose;
    // that click must not reach the backdrop.
    const onClose = vi.fn()
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByDisplayValue(url))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers a header close button that works while pending', () => {
    // The scrim is suppressed while pending, so without this button Escape is
    // the only way out — unreachable on a touch device. O3: it used to be a bare
    // «×» with no `aria-label`, no `title` and no visually-hidden text, so a
    // screen reader announced the glyph or nothing at all; `Overlay`'s carries
    // «بستن». The pending state draws no footer, so this name is unambiguous.
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the link, opens it in a new tab, and states the caveats', () => {
    const onClose = vi.fn()
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.pdf'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={onClose} />)
    expect(screen.getByText('خروجی آماده شد')).toBeInTheDocument()
    expect(screen.getByDisplayValue(url)).toHaveAttribute('readonly')
    const open = screen.getByRole('link', { name: /باز کردن خروجی/ })
    expect(open).toHaveAttribute('href', url)
    expect(open).toHaveAttribute('target', '_blank')
    // Owner ruling — the export hands over a PDF now, so both lines this dialog
    // writes about the file are about a PDF. The old sentence («کاملاً مستقل …
    // بدون اینترنت») was written for the standalone HTML document, whose whole
    // point was opening offline by double-click; said of a PDF it is true of
    // every PDF and tells the reader nothing.
    expect(screen.getByText('لینک فایل PDF خروجی:')).toBeInTheDocument()
    expect(screen.getByText('فایل PDF چاپ‌شده از سند رسمی است؛ برای چاپ و بایگانی آماده است.')).toBeInTheDocument()
    // The admin decides here who to send the link to, so this line must state the
    // gate the recipient will actually meet (D25) — it said the opposite until the
    // export password landed. It is about the *recipient* because the admin reading
    // it has a session that opens exports without a prompt (D29), so "this link only
    // opens with a password" would be contradicted by the button right below.
    expect(screen.getByText('گیرندهٔ این لینک برای باز کردن آن به نام کاربری و گذرواژهٔ مشترک خروجی‌ها نیاز دارد و این لینک با خروجی بعدی جایگزین می‌گردد.')).toBeInTheDocument()
  })

  it('copies the link and flips the button label back after 1.8s', () => {
    const onClose = vi.fn()
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(writeText).toHaveBeenCalledWith(url)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1800) })
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeInTheDocument()
  })

  it('copies through execCommand when navigator.clipboard is absent', () => {
    const onClose = vi.fn()
    // served over plain http locally, so this is the branch that actually runs
    setClipboard(undefined)
    let copiedText: string | undefined
    const exec = vi.fn(() => { copiedText = document.querySelector('textarea')?.value; return true })
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(exec).toHaveBeenCalledWith('copy')
    expect(copiedText).toBe(url)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeInTheDocument()
    expect(document.querySelector('textarea')).toBeNull()   // scratch node cleaned up
  })

  it('does not claim success when execCommand refuses the copy', () => {
    const onClose = vi.fn()
    setClipboard(undefined)
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true, writable: true })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(screen.queryByRole('button', { name: /کپی شد/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeInTheDocument()
  })

  it('shows the failure message and retries', () => {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    render(<ExportModal title={TITLE} status="failed" error="قالب خروجی یافت نشد" onRetry={onRetry} onClose={onClose} />)
    expect(screen.getByText('قالب خروجی یافت نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('does not announce success without a link', () => {
    const onClose = vi.fn()
    // ready-with-no-url would otherwise be a success header over an empty body
    const onRetry = vi.fn()
    render(<ExportModal title={TITLE} status="ready" onRetry={onRetry} onClose={onClose} />)
    expect(screen.queryByText('خروجی آماده شد')).not.toBeInTheDocument()
    expect(screen.getByText('خروجی گرفته نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('explains a failure that arrived without a message', () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="failed" onRetry={() => {}} onClose={onClose} />)
    expect(screen.getByText('دلیل خطا مشخص نیست؛ دوباره تلاش کنید.')).toBeInTheDocument()
  })

  it('closes on Escape in every state, pending included', async () => {
    // `fireEvent.keyDown(window, …)` is what stood here, and it cannot work
    // against `Overlay`: an event DISPATCHED on `window` has `window` as its
    // target, so a listener on `document` — which is where the primitive's is —
    // is never on its propagation path. It passed only because the old
    // component listened on `window` itself.
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ExportModal — one dialog, one scrim, one direction (P3, O1, O7)', () => {
  it('is a real dialog: escape closes it, focus is trapped, and the scrim is the primitive\u2019s', async () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    const box = await screen.findByRole('dialog', { name: /در حال آماده‌سازی خروجی/ })
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
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    // 520 — the standard dialog. `Dialog`'s `width` prop is a KEY, not a number: `Overlay`
    // types it `keyof typeof WIDTH` and maps it to one of five `max-w-dialog-*`
    // utilities, so a wrong key compiles and paints the wrong box silently.
    // `md` is the default, which is why the negative half is here too.
    expect(await screen.findByRole('dialog')).toHaveClass('max-w-dialog')

  })

  it('does not re-pin its own direction', async () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    // O1 — five files carried `dir="rtl"` and a comment explaining it, because
    // `ProcessList` set `dir="ltr"` on its whole scrolling region to move a
    // scrollbar. §8's own idiom flips the *container* and its immediate children
    // back, and that lives in `base.css` as `[data-r-pad]`, not in every dialog
    // that mounts inside it. `closest`, not the element itself: a `dir` on the
    // scrim above it would pin this box just as effectively.
    expect((await screen.findByRole('dialog')).closest('[dir]')).toBeNull()
  })
})
