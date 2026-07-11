import { describe, it, expect } from 'vitest'
import { toFa, jalali, deriveTag } from './format'

describe('toFa', () => {
  it('maps Latin digits to Persian', () => {
    expect(toFa(2026)).toBe('۲۰۲۶')
    expect(toFa('id-007')).toBe('id-۰۰۷')
  })
})

describe('jalali', () => {
  it('formats an ISO date as a Jalali date in Persian digits', () => {
    // 2026-07-06 (Gregorian) = 1405/04/15 (Jalali)
    expect(jalali('2026-07-06T10:00:00Z')).toBe('۱۴۰۵/۰۴/۱۵')
  })
})

describe('deriveTag', () => {
  const base = { parent: null, pending: [], kpis: [] }
  it('flags a sub-process', () => {
    expect(deriveTag({ ...base, parent: { process: 'x', node: 'y' } } as never))
      .toEqual({ label: 'زیرفرآیند', kind: 'sub' })
  })
  it('flags conflicts with a Persian count', () => {
    expect(deriveTag({ ...base, pending: [{}, {}] } as never))
      .toEqual({ label: '۲ تعارض', kind: 'conflict' })
  })
  it('flags has-KPI', () => {
    expect(deriveTag({ ...base, kpis: [{ name: 'k' }] } as never))
      .toEqual({ label: 'دارای KPI', kind: 'kpi' })
  })
  it('falls back to documented', () => {
    expect(deriveTag(base as never)).toEqual({ label: 'مستند', kind: 'plain' })
  })
})
