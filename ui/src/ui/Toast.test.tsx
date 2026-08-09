import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'

function Fixture() {
  const toast = useToast()
  return <button onClick={() => toast('ذخیره شد')}>ذخیره</button>
}

describe('Toast', () => {
  it('announces politely so a screen reader hears it without losing focus', async () => {
    render(<ToastProvider><Fixture /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    const live = screen.getByRole('status')
    expect(live).toHaveTextContent('ذخیره شد')
    expect(live).toHaveAttribute('aria-live', 'polite')
  })

  it('announces errors assertively', async () => {
    function ErrFixture() {
      const toast = useToast()
      return <button onClick={() => toast('ذخیره نشد', 'danger')}>خطا</button>
    }
    render(<ToastProvider><ErrFixture /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'خطا' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('ذخیره نشد')
    // FIX 5 — an explicit aria-live overrides role="alert"'s implicit assertive,
    // so a regression to 'polite' would silently downgrade every error announcement.
    expect(alert).toHaveAttribute('aria-live', 'assertive')
  })

  it('throws when used outside a provider', () => {
    function Bare() {
      useToast()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/)
  })

  it('does not let a later push restart an earlier toast\'s dismiss timer', () => {
    // FIX 1 — six toasts pushed 2s apart against a 2.6s dwell must not all still
    // be mounted 12s later. Here: two toasts a second apart; by 2.7s after the
    // first, it must be gone even though the second (pushed at t=1s) is still up.
    vi.useFakeTimers()

    function TwoFixture() {
      const toast = useToast()
      return (
        <>
          <button onClick={() => toast('پیام اول')}>دکمهٔ اول</button>
          <button onClick={() => toast('پیام دوم')}>دکمهٔ دوم</button>
        </>
      )
    }

    render(<ToastProvider><TwoFixture /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'دکمهٔ اول' }))
    act(() => { vi.advanceTimersByTime(1000) })
    fireEvent.click(screen.getByRole('button', { name: 'دکمهٔ دوم' }))
    act(() => { vi.advanceTimersByTime(1700) })

    expect(screen.queryByText('پیام اول')).not.toBeInTheDocument()
    expect(screen.getByText('پیام دوم')).toBeInTheDocument()

    vi.useRealTimers()
  })
})
