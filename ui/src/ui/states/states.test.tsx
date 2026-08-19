import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingState, EmptyState, ErrorState, DeniedState, NotFoundState, LoadFailedScreen } from './index'
import { ApiError } from '../../api/client'

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

  it('ErrorState offers a retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState message="اطلاعات بارگذاری نشد." onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('LoadFailedScreen shows the screen\u2019s own sentence and nothing the server said', () => {
    // This claim used to be «ErrorState … never shows a status code», asserted
    // by looking for three digits in the output of a component that renders its
    // `message` prop and nothing else. It was a property of the fixture string,
    // not of the component: it passed for `() => <p>{message}</p>` and would
    // have passed for a component that rendered nothing at all.
    //
    // A status can only reach a surface where a status is in scope, and there is
    // exactly one: `LoadFailedScreen` takes the raw `error`. So the claim is
    // made here, against an `ApiError` carrying a status, an English framework
    // sentence and a server `detail` — all three of the things F14 says a
    // reader must never be shown — with the screen's own Persian sentence
    // beside them.
    const error = new ApiError(503, 'Service Unavailable', 'upstream refused')
    render(<LoadFailedScreen message="اطلاعات دپارتمان بارگذاری نشد." error={error}
      onRetry={() => {}} />)
    expect(screen.getByText('اطلاعات دپارتمان بارگذاری نشد.')).toBeInTheDocument()
    const shown = document.body.textContent ?? ''
    expect(shown).not.toContain('503')
    expect(shown).not.toContain('\u06F5\u06F0\u06F3')     // ۵۰۳ — Task 8 normalises digits, so ASCII alone would miss it
    expect(shown).not.toContain('Service Unavailable')
    expect(shown).not.toContain('upstream refused')
    // …and the negatives are not passing because nothing rendered.
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
    // A 5xx is worth retrying and the button is offered; a 4xx is not, and
    // `retryQuery` is what decides — the branch that would otherwise be
    // untested on this screen.
    const refused = new ApiError(403, 'Forbidden', null)
    const { container } = render(<LoadFailedScreen message="نشد." error={refused}
      onRetry={() => {}} />)
    expect(within(container).queryByRole('button', { name: 'تلاش دوباره' })).not.toBeInTheDocument()
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
