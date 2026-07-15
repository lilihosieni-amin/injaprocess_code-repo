import { describe, it, expect } from 'vitest'
import type { Process } from './types'

describe('Process type', () => {
  it('accepts optional tombstone fields', () => {
    const p: Partial<Process> = { id: 'cooking-002', tombstoned: true, superseded_by: ['cooking-050'] }
    expect(p.tombstoned).toBe(true)
    expect(p.superseded_by).toEqual(['cooking-050'])
  })
})
