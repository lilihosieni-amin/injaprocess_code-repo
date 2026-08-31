import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LifecycleCard } from './LifecycleCard'
import { bundleOf } from './fixture'

const CLOSED = bundleOf('rule', { inputs: [], outputs: [] }, {
  resolved: { 'F-00043': { kind: 'rule', title: 'وزن بستهٔ پارمسان (نو)' } },
}, {
  valid_from: '1404-01-01', valid_to: '1405-05-26',
  superseded_by: { ref: 'F-00043' },
})

describe('the lifecycle card', () => {
  it('draws the dates as Persian-facing dates and marks a closed entry', () => {
    render(<LifecycleCard bundle={CLOSED} onOpen={vi.fn()} />)
    expect(screen.getByText('اعتبار زمانی')).toBeInTheDocument()
    expect(screen.getByText('۱۴۰۴-۰۱-۰۱')).toBeInTheDocument()
    const to = screen.getByText('۱۴۰۵-۰۵-۲۶')
    expect(to.className).toContain('text-conflict')
    expect(screen.getByText('بسته‌شده')).toBeInTheDocument()
  })

  it('names the heir and opens it', () => {
    const onOpen = vi.fn()
    render(<LifecycleCard bundle={CLOSED} onOpen={onOpen} />)
    expect(screen.getByText('جایگزین‌شده با')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'وزن بستهٔ پارمسان (نو)' })).toBeInTheDocument()
  })

  it('is not drawn for an entry with no dates and no succession', () => {
    const { container } = render(
      <LifecycleCard bundle={bundleOf('note', {})} onOpen={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
