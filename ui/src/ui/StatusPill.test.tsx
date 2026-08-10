import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('always renders its label as text, never colour alone', () => {
    // F11: status is never carried by colour alone.
    render(<StatusPill tone="warn" label="در انتظار تأیید" />)
    expect(screen.getByText('در انتظار تأیید')).toBeInTheDocument()
  })
  it('maps each tone to its token classes', () => {
    const { rerender } = render(<StatusPill tone="ok" label="وضعیت" />)
    expect(screen.getByText('وضعیت')).toHaveClass('bg-tile-ok', 'text-green')
    rerender(<StatusPill tone="warn" label="وضعیت" />)
    expect(screen.getByText('وضعیت')).toHaveClass('bg-tile-warn', 'text-warn')
    rerender(<StatusPill tone="danger" label="وضعیت" />)
    expect(screen.getByText('وضعیت')).toHaveClass('bg-tile-c', 'text-conflict')
    rerender(<StatusPill tone="neutral" label="وضعیت" />)
    expect(screen.getByText('وضعیت')).toHaveClass('bg-tile-dead', 'text-muted')
    rerender(<StatusPill tone="info" label="وضعیت" />)
    expect(screen.getByText('وضعیت')).toHaveClass('bg-tile-info', 'text-info')
  })
})
