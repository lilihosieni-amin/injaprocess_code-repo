import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges, fieldFa, nextTempId, isTempId } from './adapt'
import type { Process } from '../api/types'

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'p', summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' },
    { id: 'cooking-001-n010', type: 'activity', label: 'ثبت', description: '', actor: 'x',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: 'cooking-014',
      position: { x: 10, y: 20 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
    { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split',
      position: { x: 5, y: 5 }, layout: 'auto' },
    { id: 'cooking-001-n020', type: 'activity', label: 'gone', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] }, removed: true },
  ],
  edges: [{ from: 'start', to: 'cooking-001-n010', label: '' }, { from: 'cooking-001-n010', to: 'cooking-001-j1', label: 'بله' }],
  pending: [{ node: 'cooking-001-n010', field: 'actor', current: 'x', proposed: 'y', source: 's', status: 'open' }],
} as unknown as Process

describe('adapt', () => {
  it('maps nodes, skipping removed, with conflict count and hasSub', () => {
    const ns = toFlowNodes(proc)
    expect(ns.map((n) => n.id)).toEqual(['start', 'cooking-001-n010', 'cooking-001-j1']) // removed dropped
    const act = ns.find((n) => n.id === 'cooking-001-n010')!
    expect(act.type).toBe('activity')
    expect(act.position).toEqual({ x: 10, y: 20 })
    expect(act.data.conflicts).toBe(1)
    expect(act.data.hasSub).toBe(true)
  })
  it('maps edges with a stable id and label in data', () => {
    const es = toFlowEdges(proc)
    expect(es[1]).toMatchObject({ id: 'cooking-001-n010->cooking-001-j1', source: 'cooking-001-n010', target: 'cooking-001-j1', type: 'labeled' })
    expect(es[1].data).toEqual({ label: 'بله' })
  })
  it('fieldFa maps known fields', () => {
    expect(fieldFa('actor')).toBe('مجری فعالیت')
    expect(fieldFa('description')).toBe('توضیحات')
    expect(fieldFa('zzz')).toBe('zzz')
  })
  it('temp ids are recognizably new', () => {
    expect(nextTempId('n', 3)).toBe('tmp-n-3')
    expect(isTempId('tmp-n-3')).toBe(true)
    expect(isTempId('cooking-001-n010')).toBe(false)
    expect(isTempId('cooking-001-j1')).toBe(false)
    expect(isTempId('start')).toBe(false)
  })
})
