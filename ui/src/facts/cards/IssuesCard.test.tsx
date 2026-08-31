import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IssuesCard, FieldStatusCard } from './IssuesCard'
import { bundleOf } from './fixture'

/** F-00013's `scale` issue, which carries all three of note 8's extra fields. */
const SCALED = bundleOf('record', {
  medium: 'sheet', role: 'log', location: {},
}, {
  resolved: { 'F-00016': { kind: 'record', title: 'گزارش مرکزی — پیتزا' } },
}, {
  issues: [{
    kind: 'scale', field: 'data/fields/end_stock', from_date: '1404-09-16',
    description: 'از ۱۶ آذر ۱۴۰۴ مقادیر به گرم ثبت شده‌اند نه کیلوگرم.',
    fix: { op: 'multiply', factor: 1000 },
    affects: [{ ref: 'F-00016' }],
  }],
})

/** F-00025 — two `field_status` lines, and the labels for them in `path_labels`. */
const INFORMAL = bundleOf('measurement', { quantity: 'volume', unit: 'l' }, {
  path_labels: { 'data/method': 'روش', 'data/when': 'زمان' },
}, {
  field_status: { 'data/method': 'informal', 'data/when': 'informal' },
})

describe('the issues card', () => {
  it('shows the defect, its kind, and note 8’s `from_date`, `fix` and `affects`', () => {
    render(<IssuesCard bundle={SCALED} onOpen={vi.fn()} />)
    expect(screen.getByText('نقص: تغییر مقیاس')).toBeInTheDocument()
    expect(screen.getByText(/مقادیر به گرم ثبت شده‌اند/)).toBeInTheDocument()
    // The design computes none of these and draws none of them (:1695-1697).
    expect(screen.getByText('۱۴۰۴-۰۹-۱۶')).toBeInTheDocument()
    expect(screen.getByText(/ضرب در/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'گزارش مرکزی — پیتزا' })).toBeInTheDocument()
  })

  it('is not drawn when the entry has no issues', () => {
    const { container } = render(
      <IssuesCard bundle={bundleOf('note', {})} onOpen={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the field-status card', () => {
  it('draws a marker per `field_status` path, under the path’s Persian label', () => {
    render(<FieldStatusCard bundle={INFORMAL} />)
    expect(screen.getByText('وضعیت فیلدها')).toBeInTheDocument()
    expect(screen.getByText('روش')).toBeInTheDocument()
    expect(screen.getAllByText('عرفی')).toHaveLength(2)
  })

  it('is not drawn when no field is marked', () => {
    const { container } = render(<FieldStatusCard bundle={bundleOf('note', {})} />)
    expect(container).toBeEmptyDOMElement()
  })
})
