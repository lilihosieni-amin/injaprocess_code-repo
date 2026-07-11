import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'
import { Chip } from './Chip'
import { IdBadge } from './IdBadge'

describe('primitives', () => {
  it('Button applies the variant class and defaults to ghost', () => {
    render(<Button variant="coral">ذخیره</Button>)
    expect(screen.getByRole('button', { name: 'ذخیره' })).toHaveClass('btn', 'btn-coral')
    render(<Button>خب</Button>)
    expect(screen.getByRole('button', { name: 'خب' })).toHaveClass('btn-ghost')
  })
  it('Chip maps kind to the chip class', () => {
    render(<Chip kind="control">بودجه</Chip>)
    expect(screen.getByText('بودجه')).toHaveClass('chip-control')
  })
  it('IdBadge renders LTR monospace', () => {
    render(<IdBadge>cooking-001</IdBadge>)
    const el = screen.getByText('cooking-001')
    expect(el).toHaveClass('id-badge')
    expect(el).toHaveAttribute('dir', 'ltr')
  })
})
