import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('token base', () => {
  it('renders an element carrying token classes', () => {
    render(<button className="btn btn-coral">ذخیره</button>)
    const el = screen.getByText('ذخیره')
    expect(el).toHaveClass('btn', 'btn-coral')
  })
})
