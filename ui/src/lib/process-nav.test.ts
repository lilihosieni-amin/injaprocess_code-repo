import { describe, it, expect } from 'vitest'
import { neighborProcess } from './process-nav'
import type { Process } from '../api/types'

// Minimal Process factory — only the fields neighborProcess reads.
const p = (id: string, tombstoned = false) => ({ id, tombstoned } as Process)

describe('neighborProcess', () => {
  const list = [p('c-001'), p('c-002'), p('c-003')]

  it('returns the next process in list order', () => {
    expect(neighborProcess(list, 'c-001', 1)?.id).toBe('c-002')
  })

  it('returns the previous process in list order', () => {
    expect(neighborProcess(list, 'c-002', -1)?.id).toBe('c-001')
  })

  it('wraps from last to first when going next', () => {
    expect(neighborProcess(list, 'c-003', 1)?.id).toBe('c-001')
  })

  it('wraps from first to last when going previous', () => {
    expect(neighborProcess(list, 'c-001', -1)?.id).toBe('c-003')
  })

  it('skips tombstoned processes when stepping next', () => {
    const l = [p('c-001'), p('c-002', true), p('c-003')]
    expect(neighborProcess(l, 'c-001', 1)?.id).toBe('c-003')
  })

  it('skips tombstoned processes when wrapping', () => {
    const l = [p('c-001', true), p('c-002'), p('c-003')]
    expect(neighborProcess(l, 'c-003', 1)?.id).toBe('c-002')
  })

  it('returns null when no other active process exists', () => {
    const l = [p('c-001'), p('c-002', true)]
    expect(neighborProcess(l, 'c-001', 1)).toBeNull()
    expect(neighborProcess(l, 'c-001', -1)).toBeNull()
  })

  it('returns null for a single-process list', () => {
    expect(neighborProcess([p('c-001')], 'c-001', 1)).toBeNull()
  })

  it('finds the nearest active neighbor when the current process is itself tombstoned', () => {
    const l = [p('c-001'), p('c-002', true), p('c-003')]
    expect(neighborProcess(l, 'c-002', 1)?.id).toBe('c-003')
    expect(neighborProcess(l, 'c-002', -1)?.id).toBe('c-001')
  })

  it('returns null when the current id is not in the list', () => {
    expect(neighborProcess(list, 'missing', 1)).toBeNull()
  })

  it('never returns the current process', () => {
    const l = [p('c-001', true), p('c-002')]
    // c-002 is the only active one; stepping from it must not return itself
    expect(neighborProcess(l, 'c-002', 1)).toBeNull()
  })
})
