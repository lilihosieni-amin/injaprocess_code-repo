import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('always renders its label as text, never colour alone', () => {
    // F11: status is never carried by colour alone.
    render(<StatusPill tone="warn" label="در انتظار تأیید" />)
    expect(screen.getByText('در انتظار تأیید')).toBeInTheDocument()
  })
  it('distinguishes tones by class so the same label can mean different states', () => {
    const { rerender, container } = render(<StatusPill tone="ok" label="تأییدشده" />)
    const ok = container.firstElementChild!.className
    rerender(<StatusPill tone="danger" label="تأییدشده" />)
    expect(container.firstElementChild!.className).not.toBe(ok)
  })
})
