import { describe, it, expect, beforeEach } from 'vitest'
import { diagramsComplete } from './complete'
import type { ExportPayload } from '../shared/payload'

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [{
    id: 'dining-001', department: 'dining', name: 'p', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
    nodes: [
      { id: 'n1', type: 'activity', label: 'a', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 't', touched_by: [] } },
      { id: 'n2', type: 'activity', label: 'b', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 't', touched_by: [] } },
    ],
    edges: [], pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

beforeEach(() => { document.body.innerHTML = '' })

describe('diagramsComplete', () => {
  it('is false when a slot is empty', () => {
    document.body.innerHTML = '<div data-pf="dining-001"></div>'
    expect(diagramsComplete(PAYLOAD)).toBe(false)
  })

  it('is false when a node is missing from every band', () => {
    document.body.innerHTML = '<div data-pf="dining-001"><svg><g data-id="n1"></g></svg></div>'
    expect(diagramsComplete(PAYLOAD)).toBe(false)
  })

  it('is true when every node appears somewhere', () => {
    document.body.innerHTML = '<div data-pf="dining-001"><svg><g data-id="n1"></g></svg><svg><g data-id="n2"></g></svg></div>'
    expect(diagramsComplete(PAYLOAD)).toBe(true)
  })

  // `flow/adapt` drops soft-deleted nodes before the flow is mounted, so one can
  // never reach a band. Demanding it would hold this at false forever on the four
  // stored processes that have deleted a node — cashier-002/003, dining-027/029 —
  // and the retry loop would fire its four attempts on every load of those
  // departments while telling us nothing.
  it('does not demand a soft-deleted node, which no band can ever carry', () => {
    const gone = {
      ...PAYLOAD,
      processes: [{
        ...PAYLOAD.processes[0],
        nodes: [PAYLOAD.processes[0].nodes[0], { ...PAYLOAD.processes[0].nodes[1], removed: true }],
      }],
    } as unknown as ExportPayload
    document.body.innerHTML = '<div data-pf="dining-001"><svg><g data-id="n1"></g></svg></div>'
    expect(diagramsComplete(gone)).toBe(true)
  })
})
