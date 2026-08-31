import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemCard } from './ItemCard'
import { bundleOf } from './fixture'

/** F-00048's ranged factor and F-00001's flat one, on one item so the two forms
 *  are proved together (`sfItemPacks`, :5017). */
const OIL = bundleOf('item', {
  code: '##77', category: 'consumable', unit: 'l', unit_raw: 'لیتر',
  group: 'oil', state: 'raw', grade: 'درجه یک',
  pack: { size: 16, unit: 'l' },
  units: [
    { pack_unit: 'carton', factor_to_base: { min: 0.28, max: 0.32 } },
    { pack_unit: 'pack', factor_to_base: 10 },
    { pack_unit: 'box', factor_to_base: null },
  ],
  tracked: [{ value: true, reason: 'ارزش ریالی بالا' }],
}, { resolved: {} })

const CODELESS = bundleOf('item', {
  code_absent: true, category: 'place', unit: 'pcs', pack: { size: 1, unit: 'pcs' },
})

describe('the item card', () => {
  it('draws the code, the category and the base unit on one line', () => {
    render(<ItemCard bundle={OIL} />)
    const code = screen.getByText('##77')
    expect(code).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('مصرفی')).toBeInTheDocument()
    expect(screen.getByText('واحد پایه')).toBeInTheDocument()
    // The source's own word for the unit rides beside the symbol (:1564).
    expect(screen.getByText(/لیتر/)).toBeInTheDocument()
  })

  it('says «بدون کد» where the estate never gave the item one', () => {
    render(<ItemCard bundle={CODELESS} />)
    expect(screen.getByText('بدون کد')).toBeInTheDocument()
  })

  it('writes a ranged `factor_to_base` as one Latin island, min–max', () => {
    render(<ItemCard bundle={OIL} />)
    const ranged = screen.getByText('0.28–0.32')
    expect(ranged).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('10')).toBeInTheDocument()
    // A `null` factor is a leaf nobody answered, not a missing field.
    expect(screen.getByText('؟')).toBeInTheDocument()
  })

  it('draws the tracked rows in the design’s two inks', () => {
    render(<ItemCard bundle={OIL} />)
    const yes = screen.getByText('ردیابی می‌شود')
    expect(yes.className).toContain('text-green')
    expect(screen.getByText('ارزش ریالی بالا')).toBeInTheDocument()
  })

  it('draws the group, the grade and the state rows the entry carries', () => {
    render(<ItemCard bundle={OIL} />)
    expect(screen.getByText('درجه یک')).toBeInTheDocument()
    expect(screen.getByText('خام')).toBeInTheDocument()
  })

  it('draws nothing for a kind that is not an item', () => {
    const { container } = render(<ItemCard bundle={bundleOf('note', {})} />)
    expect(container).toBeEmptyDOMElement()
  })
})
