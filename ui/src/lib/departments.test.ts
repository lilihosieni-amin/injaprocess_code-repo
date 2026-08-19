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

// Task 14 — the accent decides FOUR classes, not two. `Departments.tsx:59`
// hard-coded the two ghosted numerals as hex literals and `:74` the two CTA
// discs, so the screen that happened to draw them held half the accent. A
// second screen drawing a department would have had to remember them.
describe('deptMeta carries every class the accent decides', () => {
  it('answers for a coral department', () => {
    const coral = deptMeta('cooking')          // t:'c' in the prototype's DEPTS
    expect(coral.accent).toBe('coral')
    expect(coral.tileClass).toBe('bg-tile-c text-conflict')
    expect(coral.numeralClass).toBe('text-dept-numeral-coral')
    expect(coral.accentText).toBe('text-conflict')
    expect(coral.ctaDiscClass).toBe('bg-disc-coral')
  })

  it('answers for a violet department', () => {
    const violet = deptMeta('cashier')         // t:'v'
    expect(violet.accent).toBe('violet')
    expect(violet.tileClass).toBe('bg-tile-v text-violet')
    expect(violet.numeralClass).toBe('text-dept-numeral-violet')
    expect(violet.accentText).toBe('text-violet')
    expect(violet.ctaDiscClass).toBe('bg-disc-violet')
  })

  it('answers for a code it has never heard of', () => {
    // The route is `/departments/:code`; anything can be typed into it, and a
    // thrown TypeError here is a white screen rather than the 404 the API sends.
    const m = deptMeta('not-a-department')
    expect(m.accent).toBe('violet')
    expect(m.icon).toBe('')
    expect(m.ctaDiscClass).toBe('bg-disc-violet')
    expect(m.accentText).toBe('text-violet')
  })

  it('gives the two accents four different classes each — no shared string', () => {
    // The same-value swap: two keys that happen to hold one string paint alike
    // and only a name check notices. Every pair below must differ.
    const c = deptMeta('cooking')
    const v = deptMeta('cashier')
    for (const k of ['tileClass', 'numeralClass', 'accentText', 'ctaDiscClass'] as const) {
      expect(c[k], `both accents share \`${k}\``).not.toBe(v[k])
    }
  })
})
