import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './ToastProvider'

function Trigger() {
  const { show } = useToast()
  return <button onClick={() => show('ذخیره شد')}>go</button>
}

describe('ToastProvider', () => {
  it('shows a toast message when show() is called', () => {
    render(<ToastProvider><Trigger /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    expect(screen.getByText('ذخیره شد')).toBeInTheDocument()
  })
  it('useToast is a no-op without a provider (no throw)', () => {
    render(<Trigger />)
    act(() => { screen.getByText('go').click() })
    expect(screen.queryByText('ذخیره شد')).not.toBeInTheDocument()
  })
})
