import { describe, it, expect } from 'vitest'
import { countActivities, countJunctions, isLiveActivity, isLiveJunction } from './counts'
import type { ProcNode } from '../api/types'

const act = (id: string, removed = false) => ({
  id, type: 'activity', label: id, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
  ...(removed ? { removed: true } : {}),
}) as unknown as ProcNode

const jun = (id: string, removed = false) => ({
  id, type: 'junction', junctionType: 'XOR', direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
  ...(removed ? { removed: true } : {}),
}) as unknown as ProcNode

const term = (id: 'start' | 'end') => ({
  id, type: id, label: id, position: { x: 0, y: 0 }, layout: 'auto',
}) as unknown as ProcNode

// The shape of the real `dining-027`, in miniature: soft-deleted nodes of both
// kinds, plus the terminals the schema allows.
const NODES = [term('start'), act('a1'), act('a2'), act('a3', true), jun('j1'), jun('j2', true), term('end')]

describe('the counts every view of a process shares', () => {
  it('counts only live activities', () => {
    expect(countActivities(NODES)).toBe(2)
  })

  it('counts only live junctions', () => {
    expect(countJunctions(NODES)).toBe(1)
  })

  it('never counts a soft-deleted node', () => {
    expect(isLiveActivity(act('x', true))).toBe(false)
    expect(isLiveJunction(jun('x', true))).toBe(false)
  })

  it('never counts a terminal node as an activity', () => {
    expect(isLiveActivity(term('start'))).toBe(false)
    expect(isLiveActivity(term('end'))).toBe(false)
  })

  it('is empty-safe', () => {
    expect(countActivities([])).toBe(0)
    expect(countJunctions([])).toBe(0)
  })
})
