import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlowEditor } from './useFlowEditor'
import type { Process } from '../api/types'

const server = {
  id: 'cooking-001', department: 'cooking', name: 'p', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [
    { id: 'start', type: 'start', label: 'شروع', position: { x: 0, y: 0 }, layout: 'auto' },
    { id: 'cooking-001-n010', type: 'activity', label: 'A', description: '', actor: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 100, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } },
    { id: 'end', type: 'end', label: 'پایان', position: { x: 200, y: 0 }, layout: 'auto' },
  ],
  edges: [{ from: 'start', to: 'cooking-001-n010', label: '' }, { from: 'cooking-001-n010', to: 'end', label: '' }],
} as unknown as Process

describe('useFlowEditor', () => {
  it('moveNode sets position and layout:manual', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.moveNode('cooking-001-n010', { x: 5, y: 6 }) })
    const n = result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')!
    expect(n.position).toEqual({ x: 5, y: 6 })
    expect(n.layout).toBe('manual')
  })
  it('deleteNode removes the node and relinks predecessors to successors', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.deleteNode('cooking-001-n010') })
    expect(result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')).toBeUndefined()
    // start now links directly to end
    expect(result.current.doc.edges).toContainEqual(expect.objectContaining({ from: 'start', to: 'end' }))
    expect(result.current.doc.edges.some((e) => e.to === 'cooking-001-n010' || e.from === 'cooking-001-n010')).toBe(false)
  })
  it('addActivity adds a temp-keyed activity node', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.addActivity() })
    const added = result.current.doc.nodes.find((n) => n.id.startsWith('tmp-n-'))
    expect(added?.type).toBe('activity')
  })
  it('undo/redo round-trips a name change', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.setName('X') })
    expect(result.current.doc.name).toBe('X')
    act(() => result.current.undo())
    expect(result.current.doc.name).toBe('p')
    act(() => result.current.redo())
    expect(result.current.doc.name).toBe('X')
  })
  it('connect adds an edge between two nodes', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.connect('cooking-001-n010', 'start') })
    expect(result.current.doc.edges).toContainEqual(expect.objectContaining({ from: 'cooking-001-n010', to: 'start' }))
  })
  it('resets (exits edit + loads the new doc) when navigating to a different process id', () => {
    const other = { ...server, id: 'cooking-999', name: 'sub' } as Process
    const { result, rerender } = renderHook(({ s }) => useFlowEditor(s), { initialProps: { s: server } })
    act(() => result.current.enter())
    expect(result.current.editing).toBe(true)
    rerender({ s: other })                       // navigate to another process WHILE editing
    expect(result.current.editing).toBe(false)   // edit session reset
    expect(result.current.doc.id).toBe('cooking-999')
  })
  it('cancel resets to the server doc', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => { result.current.enter(); result.current.setName('X'); result.current.cancel() })
    expect(result.current.editing).toBe(false)
    expect(result.current.doc.name).toBe('p')
  })
  it('moveNodes batch-sets positions + manual, is undoable, and does NOT bump revision', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    const r0 = result.current.revision
    act(() => result.current.moveNodes([{ id: 'cooking-001-n010', pos: { x: 7, y: 8 } }]))
    const n = result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')!
    expect(n.position).toEqual({ x: 7, y: 8 })
    expect(n.layout).toBe('manual')
    expect(result.current.revision).toBe(r0)                 // transient commit: no re-seed
    act(() => result.current.undo())
    expect(result.current.doc.nodes.find((x) => x.id === 'cooking-001-n010')!.position).not.toEqual({ x: 7, y: 8 })
  })
  it('a structural action bumps revision', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    const r0 = result.current.revision
    act(() => result.current.addActivity())
    expect(result.current.revision).toBe(r0 + 1)
  })
  it('setEdgeLabel updates the matching edge label without bumping revision', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    const r0 = result.current.revision
    act(() => result.current.setEdgeLabel('start', 'cooking-001-n010', 'برچسب'))
    expect(result.current.doc.edges.find((e) => e.from === 'start' && e.to === 'cooking-001-n010')!.label).toBe('برچسب')
    expect(result.current.revision).toBe(r0)
  })
  it('addActivity places the node at the given position when provided', () => {
    const { result } = renderHook(() => useFlowEditor(server))
    act(() => result.current.enter())
    act(() => result.current.addActivity({ x: 300, y: 400 }))
    const added = result.current.doc.nodes.find((n) => n.id.startsWith('tmp-n-'))!
    expect(added.position).toEqual({ x: 300, y: 400 })
  })
})
