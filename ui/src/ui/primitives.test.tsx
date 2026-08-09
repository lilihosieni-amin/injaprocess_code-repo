import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Chip } from './Chip'
import { IdBadge } from './IdBadge'
import { expectTouchTarget } from '../test/a11y'

// A host element, not a component that hardcodes the attribute — otherwise
// IconButton's cloneElement injection could be deleted and the suite would
// still pass.
const Icon = <svg data-testid="icon" viewBox="0 0 24 24"><path d="M12 5v14" /></svg>

describe('Button', () => {
  it('applies the variant class and defaults to ghost', () => {
    render(<Button variant="coral">ذخیره</Button>)
    expect(screen.getByRole('button', { name: 'ذخیره' })).toHaveClass('bg-coral')
    render(<Button>خب</Button>)
    expect(screen.getByRole('button', { name: 'خب' })).toHaveClass('bg-card', 'text-violet')
  })
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
    render(<IconButton label="بستن" icon={Icon} />)
    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
  })
  it('hides the glyph from assistive technology', () => {
    render(<IconButton label="بستن" icon={Icon} />)
    const glyph = screen.getByTestId('icon')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
    expect(glyph).toHaveAttribute('focusable', 'false')
  })
  it('meets the touch-target minimum', () => {
    render(<IconButton label="بستن" icon={Icon} />)
    expectTouchTarget(screen.getByRole('button'))
  })
  it('fires onClick', async () => {
    let clicked = false
    render(<IconButton label="بستن" icon={Icon} onClick={() => { clicked = true }} />)
    await userEvent.click(screen.getByRole('button'))
    expect(clicked).toBe(true)
  })
})

describe('Chip', () => {
  it('renders its text', () => {
    render(<Chip kind="control">بودجه</Chip>)
    expect(screen.getByText('بودجه')).toBeInTheDocument()
  })
  it('maps each kind to its token classes', () => {
    render(<Chip kind="input">ورودی</Chip>)
    expect(screen.getByText('ورودی')).toHaveClass('bg-icom-input', 'text-icom-input')
    render(<Chip kind="control">کنترل</Chip>)
    expect(screen.getByText('کنترل')).toHaveClass('bg-icom-control', 'text-icom-control')
    render(<Chip kind="output">خروجی</Chip>)
    expect(screen.getByText('خروجی')).toHaveClass('bg-icom-output', 'text-icom-output')
    render(<Chip kind="mech">ابزار</Chip>)
    expect(screen.getByText('ابزار')).toHaveClass('bg-icom-mech', 'text-icom-mech')
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
