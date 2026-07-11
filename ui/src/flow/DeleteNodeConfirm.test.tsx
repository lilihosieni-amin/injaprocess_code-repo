import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'

describe('DeleteNodeConfirm', () => {
  it('shows the label and fires confirm', () => {
    const onConfirm = vi.fn()
    render(<DeleteNodeConfirm label="تأیید مدیر" onCancel={() => {}} onConfirm={onConfirm} />)
    expect(screen.getByText(/تأیید مدیر/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /حذف/ }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
