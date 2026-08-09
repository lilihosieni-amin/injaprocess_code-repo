import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('alert')).toHaveTextContent('ذخیره نشد')
  })
})
