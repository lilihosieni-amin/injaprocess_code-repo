import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ExportModal } from './ExportModal'

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
  // ProcessList's scroll container is dir="ltr" (scrollbar placement) and the modals
  // render inside it, so the modal must re-establish its own direction — the same
  // fix ReorderModal needed in 61cb036.
  it('renders right-to-left even when mounted inside an LTR container', () => {
    render(<div dir="ltr"><ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={() => {}} /></div>)
    const heading = screen.getByText('در حال آماده‌سازی خروجی…')
    expect(heading.closest('[dir]')?.getAttribute('dir')).toBe('rtl')
  })

  it('shows a spinner and the building message while pending', () => {
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={() => {}} />)
    expect(screen.getByText('در حال آماده‌سازی خروجی…')).toBeInTheDocument()
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
    expect(screen.getByText(TITLE)).toBeInTheDocument()
  })

  it('ignores an outside click while pending but honours it once ready', () => {
    const onClose = vi.fn()
    const { rerender } = render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('export-modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()

    rerender(<ExportModal title={TITLE} status="ready" url="https://x/exports/a.html" onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('export-modal-backdrop'))
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
    // outside click is suppressed while pending, so without this button Escape
    // is the only way out — unreachable on a touch device.
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'بستن پنجره' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the link, opens it in a new tab, and states the caveats', () => {
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)
    expect(screen.getByText('خروجی آماده شد')).toBeInTheDocument()
    expect(screen.getByDisplayValue(url)).toHaveAttribute('readonly')
    const open = screen.getByRole('link', { name: /باز کردن خروجی/ })
    expect(open).toHaveAttribute('href', url)
    expect(open).toHaveAttribute('target', '_blank')
    expect(screen.getByText('این فایل کاملاً مستقل است و بدون اینترنت هم باز می‌شود.')).toBeInTheDocument()
    expect(screen.getByText('این لینک بدون ورود به سامانه باز می‌شود و با خروجی بعدی جایگزین می‌گردد.')).toBeInTheDocument()
  })

  it('copies the link and flips the button label back after 1.8s', () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(writeText).toHaveBeenCalledWith(url)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1800) })
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeInTheDocument()
  })

  it('copies through execCommand when navigator.clipboard is absent', () => {
    // served over plain http locally, so this is the branch that actually runs
    setClipboard(undefined)
    let copiedText: string | undefined
    const exec = vi.fn(() => { copiedText = document.querySelector('textarea')?.value; return true })
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(exec).toHaveBeenCalledWith('copy')
    expect(copiedText).toBe(url)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeInTheDocument()
    expect(document.querySelector('textarea')).toBeNull()   // scratch node cleaned up
  })

  it('does not claim success when execCommand refuses the copy', () => {
    setClipboard(undefined)
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true, writable: true })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(screen.queryByRole('button', { name: /کپی شد/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeInTheDocument()
  })

  it('shows the failure message and retries', () => {
    const onRetry = vi.fn()
    render(<ExportModal title={TITLE} status="failed" error="قالب خروجی یافت نشد" onRetry={onRetry} onClose={() => {}} />)
    expect(screen.getByText('قالب خروجی یافت نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('does not announce success without a link', () => {
    // ready-with-no-url would otherwise be a success header over an empty body
    const onRetry = vi.fn()
    render(<ExportModal title={TITLE} status="ready" onRetry={onRetry} onClose={() => {}} />)
    expect(screen.queryByText('خروجی آماده شد')).not.toBeInTheDocument()
    expect(screen.getByText('خروجی گرفته نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('explains a failure that arrived without a message', () => {
    render(<ExportModal title={TITLE} status="failed" onRetry={() => {}} onClose={() => {}} />)
    expect(screen.getByText('دلیل خطا مشخص نیست؛ دوباره تلاش کنید.')).toBeInTheDocument()
  })

  it('closes on Escape in every state', () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
