import { describe, it, expect } from 'vitest'
import { deptFullName } from './payload'
import type { Overview } from '../../src/api/types'

const overview = (name: string) =>
  ({ department: 'dining', name, description: '', sub_units: [], personnel: [], updated_at: '' }) as unknown as Overview

describe('deptFullName', () => {
  // overview.json stores the *complete* label — the real dining department is
  // saved as «دپارتمان سالن», not «سالن». Prefixing again doubles the word.
  it('returns the stored name untouched when it already carries دپارتمان', () => {
    expect(deptFullName(overview('دپارتمان سالن'))).toBe('دپارتمان سالن')
  })

  it('never prefixes anything onto the stored name', () => {
    expect(deptFullName(overview('واحد پخت'))).toBe('واحد پخت')
  })
})
