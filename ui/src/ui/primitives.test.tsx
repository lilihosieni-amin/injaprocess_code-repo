import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Chip } from './Chip'
import { IdBadge } from './IdBadge'
import { expectTouchTarget } from '../test/a11y'

const Icon = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14" /></svg>

describe('Button', () => {
  it('meets the touch-target minimum', () => {
    render(<Button>ذخیره</Button>)
    expectTouchTarget(screen.getByRole('button'))
  })
  it('shows a spinner, swaps the label and disables itself while loading', () => {
    render(<Button variant="green" loading loadingLabel="در حال ذخیره…">ذخیره</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toHaveTextContent('در حال ذخیره…')
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
  })
  it('keeps its own children when loading without a loadingLabel', () => {
    render(<Button loading>ذخیره</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('ذخیره')
  })
  it('is idle by default', () => {
    render(<Button>ذخیره</Button>)
    const btn = screen.getByRole('button')
    expect(btn).not.toBeDisabled()
    expect(btn).not.toHaveAttribute('aria-busy')
    expect(screen.queryByTestId('btn-spinner')).not.toBeInTheDocument()
  })
})

describe('IconButton', () => {
  it('exposes its label as the accessible name', () => {
    render(<IconButton label="بستن" icon={<Icon />} />)
    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
  })
  it('hides the glyph from assistive technology', () => {
    const { container } = render(<IconButton label="بستن" icon={<Icon />} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden')
  })
  it('meets the touch-target minimum', () => {
    render(<IconButton label="بستن" icon={<Icon />} />)
    expectTouchTarget(screen.getByRole('button'))
  })
  it('fires onClick', async () => {
    let clicked = false
    render(<IconButton label="بستن" icon={<Icon />} onClick={() => { clicked = true }} />)
    await userEvent.click(screen.getByRole('button'))
    expect(clicked).toBe(true)
  })
})

describe('Chip', () => {
  it('renders its text', () => {
    render(<Chip kind="control">بودجه</Chip>)
    expect(screen.getByText('بودجه')).toBeInTheDocument()
  })
})

describe('IdBadge', () => {
  it('renders LTR monospace', () => {
    render(<IdBadge>cooking-001</IdBadge>)
    const el = screen.getByText('cooking-001')
    expect(el).toHaveClass('id-badge')
    expect(el).toHaveAttribute('dir', 'ltr')
  })
})
