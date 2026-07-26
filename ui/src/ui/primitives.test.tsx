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
  it('Button shows a spinner, swaps the label and disables itself while loading', () => {
    render(<Button variant="green" loading loadingLabel="در حال ذخیره…">ذخیره</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toHaveTextContent('در حال ذخیره…')
    expect(btn).not.toHaveTextContent('ذخیره‌ای')       // the idle label is replaced
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
  })
  it('Button keeps its own children when loading without a loadingLabel', () => {
    render(<Button loading>ذخیره</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('ذخیره')
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
  })
  it('Button is idle by default — no spinner, not disabled, no aria-busy', () => {
    render(<Button>ذخیره</Button>)
    const btn = screen.getByRole('button')
    expect(btn).not.toBeDisabled()
    expect(btn).not.toHaveAttribute('aria-busy')
    expect(screen.queryByTestId('btn-spinner')).not.toBeInTheDocument()
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
