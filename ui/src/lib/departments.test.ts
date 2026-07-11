import { describe, it, expect } from 'vitest'
import { deptMeta, DEPT_CODES } from './departments'

describe('deptMeta', () => {
  it('covers all nine registry departments', () => {
    expect(DEPT_CODES).toHaveLength(9)
    for (const code of DEPT_CODES) {
      const m = deptMeta(code)
      expect(m.icon.length).toBeGreaterThan(0)
      expect(['violet', 'coral']).toContain(m.accent)
    }
  })
  it('maps a violet department to the violet tile classes', () => {
    expect(deptMeta('management').tileClass).toContain('bg-tile-v')
  })
  it('maps a coral department to the coral tile classes', () => {
    expect(deptMeta('accounting').tileClass).toContain('bg-tile-c')
  })
})
