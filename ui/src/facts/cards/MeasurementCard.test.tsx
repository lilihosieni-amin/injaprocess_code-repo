import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MeasurementCard } from './MeasurementCard'
import { bundleOf } from './fixture'

/** F-00023 — the 2×2 grid, plus the method and the exceptions under it. */
const WEIGHING = bundleOf('measurement', {
  quantity: 'mass', unit: 'kg',
  of: { ref: 'F-00001' },
  writes_to: { ref: 'F-00011', field: 'end_stock' },
  when: 'پایان شیفت شب', by: 'مسئول واحد',
  method: 'ترازوی دیجیتال کنار یخچال',
  exceptions: 'شب‌های تعطیل ثبت نمی‌شود',
}, {
  resolved: {
    'F-00001': { kind: 'item', title: 'پنیر پیتزا', code: '##1' },
    'F-00011': { kind: 'record', title: 'مانده شب فرنگی و برگر' },
  },
})

describe('the measurement card', () => {
  it('draws the four panes of the 2×2 grid', () => {
    render(<MeasurementCard bundle={WEIGHING} onOpen={vi.fn()} />)
    expect(screen.getByText('کمیت و واحد')).toBeInTheDocument()
    expect(screen.getByText(/وزن/)).toBeInTheDocument()
    expect(screen.getByText('زمان · توسط')).toBeInTheDocument()
    expect(screen.getByText('پایان شیفت شب · مسئول واحد')).toBeInTheDocument()
  })

  it('renders «ثبت در» as the record’s title and the column, never as `F-00011 end_stock`', () => {
    render(<MeasurementCard bundle={WEIGHING} onOpen={vi.fn()} />)
    // Conformance note 2 — the design binds `sfMeasWrId` + `sfMeasWrField` raw
    // (:5027) and this is the correction.
    expect(screen.getByRole('button', { name: 'مانده شب فرنگی و برگر' })).toBeInTheDocument()
    expect(screen.queryByText('F-00011')).toBeNull()
    // The column key survives as the small mono hint §17 allows beside a title.
    expect(screen.getByText('end_stock')).toBeInTheDocument()
  })

  it('draws the method and the exceptions', () => {
    render(<MeasurementCard bundle={WEIGHING} onOpen={vi.fn()} />)
    expect(screen.getByText('ترازوی دیجیتال کنار یخچال')).toBeInTheDocument()
    expect(screen.getByText('شب‌های تعطیل ثبت نمی‌شود')).toBeInTheDocument()
  })

  it('draws nothing for a kind that is not a measurement', () => {
    const { container } = render(
      <MeasurementCard bundle={bundleOf('note', {})} onOpen={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
