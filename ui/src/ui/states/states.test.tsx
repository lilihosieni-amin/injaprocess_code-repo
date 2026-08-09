import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingState, EmptyState, ErrorState, DeniedState, NotFoundState } from './index'

describe('states', () => {
  it('LoadingState announces itself and renders skeleton rows', () => {
    // FIX 6 — 5, not the default of 3, so a hardcoded `{ length: 3 }` can't pass.
    render(<LoadingState rows={5} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5)
  })

  it('EmptyState states what is not there', () => {
    render(<EmptyState title="فرآیندی ثبت نشده است" hint="با پردازش یک جلسه، فرآیندها اینجا می‌آیند." />)
    expect(screen.getByText('فرآیندی ثبت نشده است')).toBeInTheDocument()
    expect(screen.getByText('با پردازش یک جلسه، فرآیندها اینجا می‌آیند.')).toBeInTheDocument()
  })

  it('ErrorState offers a retry and never shows a status code', async () => {
    const onRetry = vi.fn()
    render(<ErrorState message="اطلاعات بارگذاری نشد." onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalledOnce()
    // FIX 3 — ASCII-only would pass «کد ۵۰۳», in an app whose whole Task 8 was
    // Persian digit normalisation. Match either digit set.
    expect(screen.queryByText(/[0-9۰-۹]{3}/)).not.toBeInTheDocument()
  })

  it('DeniedState names the action refused', () => {
    render(<DeniedState />)
    expect(screen.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
  })

  it('NotFoundState says nothing about what might exist', () => {
    // F13 — the not-found path must not hint that a resource is being withheld,
    // which is the whole reason D56 answers 404 instead of 403.
    render(<NotFoundState />)
    expect(screen.getByText('چیزی اینجا نیست')).toBeInTheDocument()
    // FIX 4 — widened past the original four words: the reviewer's mutation
    // «شاید این مورد وجود داشته باشد ولی برای شما قابل مشاهده نیست» passed the
    // old list untouched. Checked against the whole rendered text.
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/دسترسی|مدیر|اجازه|محدود|وجود|قابل مشاهده|سرپرست/)
  })
})
