import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ExportModal } from './ExportModal'

const TITLE = 'خروجی مستندات کامل — سند رسمی'

describe('ExportModal', () => {
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
    Object.assign(navigator, { clipboard: { writeText } })
    const url = 'https://inja.example/exports/dining/steps-0123456789abcdef.html'
    render(<ExportModal title={TITLE} status="ready" url={url} onRetry={() => {}} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /کپی لینک/ }))
    expect(writeText).toHaveBeenCalledWith(url)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1800) })
    expect(screen.getByRole('button', { name: /کپی لینک/ })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows the failure message and retries', () => {
    const onRetry = vi.fn()
    render(<ExportModal title={TITLE} status="failed" error="قالب خروجی یافت نشد" onRetry={onRetry} onClose={() => {}} />)
    expect(screen.getByText('قالب خروجی یافت نشد')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('closes on Escape in every state', () => {
    const onClose = vi.fn()
    render(<ExportModal title={TITLE} status="pending" onRetry={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
