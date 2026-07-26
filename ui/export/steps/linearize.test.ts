import { describe, it, expect } from 'vitest'
import { linearize, countSteps, groupTitle } from './linearize'
import type { Block, GroupBlock, StepBlock } from './linearize'
import type { Process, ProcNode } from '../../src/api/types'

const act = (id: string, label = id): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const junc = (id: string, t: 'AND' | 'OR' | 'XOR'): ProcNode => ({
  id, type: 'junction', junctionType: t, direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

const term = (id: 'start' | 'end'): ProcNode => ({
  id, type: id, label: id === 'start' ? 'شروع' : 'پایان',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

/** Soft-deleted: still in the document, must never reach the guide. */
const gone = (n: ProcNode): ProcNode => ({ ...n, removed: true })

function proc(nodes: ProcNode[], edges: { from: string; to: string; label?: string }[]): Process {
  return {
    id: 'dining-001', department: 'dining', name: 'p', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes, edges, pending: [],
  } as Process
}

const steps = (bs: Block[]) => bs.filter((b): b is StepBlock => b.kind === 'step')
const groups = (bs: Block[]) => bs.filter((b): b is GroupBlock => b.kind === 'group')

describe('linearize', () => {
  it('numbers a straight chain in reading order', () => {
    const p = proc(
      [term('start'), act('a'), act('b'), term('end')],
      [{ from: 'start', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'end' }],
    )
    const bs = linearize(p)
    expect(steps(bs).map((s) => [s.num, s.node.id])).toEqual([[1, 'a'], [2, 'b']])
    expect(countSteps(bs)).toBe(2)
  })

  it('turns an XOR split into a group and continues at the merge point', () => {
    const p = proc(
      [term('start'), act('a'), junc('j1', 'XOR'), act('b'), act('c'), act('d'), term('end')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'j1' },
        { from: 'j1', to: 'b', label: 'حالت اول' }, { from: 'j1', to: 'c', label: 'حالت دوم' },
        { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'd', to: 'end' },
      ],
    )
    const bs = linearize(p)
    const g = groups(bs)[0]
    expect(g.type).toBe('XOR')
    expect(g.branches.map((br) => br.label)).toEqual(['حالت اول', 'حالت دوم'])
    expect(g.branches.map((br) => steps(br.blocks).map((s) => s.node.id))).toEqual([['b'], ['c']])
    // `d` is the merge point: it belongs to the trunk, not to either branch
    expect(steps(bs).map((s) => s.node.id)).toEqual(['a', 'd'])
    expect(countSteps(bs)).toBe(4)
  })

  it('carries an AND junction through with all its branches', () => {
    const p = proc(
      [term('start'), junc('j1', 'AND'), act('a'), act('b'), act('c'), act('z'), term('end')],
      [
        { from: 'start', to: 'j1' },
        { from: 'j1', to: 'a' }, { from: 'j1', to: 'b' }, { from: 'j1', to: 'c' },
        { from: 'a', to: 'z' }, { from: 'b', to: 'z' }, { from: 'c', to: 'z' }, { from: 'z', to: 'end' },
      ],
    )
    const g = groups(linearize(p))[0]
    expect(g.type).toBe('AND')
    expect(g.branches).toHaveLength(3)
  })

  it('nests a group inside a branch', () => {
    const p = proc(
      [term('start'), junc('j1', 'XOR'), act('a'), junc('j2', 'XOR'), act('b'), act('c'), act('z'), term('end')],
      [
        { from: 'start', to: 'j1' },
        { from: 'j1', to: 'a' }, { from: 'j1', to: 'j2' },
        { from: 'j2', to: 'b' }, { from: 'j2', to: 'c' },
        { from: 'a', to: 'z' }, { from: 'b', to: 'z' }, { from: 'c', to: 'z' }, { from: 'z', to: 'end' },
      ],
    )
    const outer = groups(linearize(p))[0]
    const nested = groups(outer.branches[1].blocks)
    expect(nested).toHaveLength(1)
    expect(steps(nested[0].branches[0].blocks).map((s) => s.node.id)).toEqual(['b'])
  })

  it('records a loop as a back-reference to the target step number', () => {
    const p = proc(
      [term('start'), act('a'), act('b'), term('end')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'b' },
        { from: 'b', to: 'a', label: 'اگر تأیید نشد' },
        { from: 'b', to: 'end' },
      ],
    )
    const bs = linearize(p)
    const b = steps(bs).find((s) => s.node.id === 'b')!
    // back to step 1, which is `a` — number and label travel together
    expect(b.back).toEqual([{ to: 'a', label: 'اگر تأیید نشد', num: 1 }])
  })

  it('keeps every back-reference label attached to its own number', () => {
    // `b` loops twice: once to a junction (never numbered) and once to an
    // activity. A renderer must not pair «دوباره» with `a`'s number.
    const p = proc(
      [term('start'), act('a'), junc('j1', 'XOR'), act('b'), act('c')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'j1' },
        { from: 'j1', to: 'b' }, { from: 'j1', to: 'c' },
        { from: 'b', to: 'j1', label: 'دوباره' },
        { from: 'b', to: 'a', label: 'از اول' },
      ],
    )
    const g = groups(linearize(p))[0]
    const b = steps(g.branches[0].blocks)[0]
    expect(b.node.id).toBe('b')
    expect(b.back).toEqual([
      { to: 'j1', label: 'دوباره' },                 // unnumbered: no `num`
      { to: 'a', label: 'از اول', num: 1 },
    ])
  })

  it('renders a branch with no merge point without losing its steps', () => {
    const p = proc(
      [term('start'), junc('j1', 'XOR'), act('a'), act('b')],
      [{ from: 'start', to: 'j1' }, { from: 'j1', to: 'a' }, { from: 'j1', to: 'b' }],
    )
    const g = groups(linearize(p))[0]
    expect(g.branches.map((br) => steps(br.blocks).map((s) => s.node.id))).toEqual([['a'], ['b']])
  })

  it('appends disconnected activities in stable node order', () => {
    const p = proc(
      [term('start'), act('a'), act('orphan'), term('end')],
      [{ from: 'start', to: 'a' }, { from: 'a', to: 'end' }],
    )
    expect(steps(linearize(p)).map((s) => s.node.id)).toEqual(['a', 'orphan'])
  })

  it('enters at the first node with no in-edges when no start node exists', () => {
    // nodes deliberately out of flow order: the walk must follow the edges,
    // not the array
    const p = proc([act('b'), act('a')], [{ from: 'a', to: 'b' }])
    expect(steps(linearize(p)).map((s) => [s.num, s.node.id])).toEqual([[1, 'a'], [2, 'b']])
  })

  it('enters past a removed start node instead of walking from mid-chain', () => {
    const p = proc(
      [gone(term('start')), act('b'), act('a')],
      [{ from: 'start', to: 'a' }, { from: 'a', to: 'b' }],
    )
    expect(steps(linearize(p)).map((s) => [s.num, s.node.id])).toEqual([[1, 'a'], [2, 'b']])
  })

  it('never lists a removed activity as a step', () => {
    const p = proc(
      [term('start'), act('a'), gone(act('حذف‌شده')), act('b'), term('end')],
      [
        { from: 'start', to: 'a' }, { from: 'a', to: 'حذف‌شده' },
        { from: 'حذف‌شده', to: 'b' }, { from: 'b', to: 'end' },
      ],
    )
    const bs = linearize(p)
    expect(steps(bs).map((s) => s.node.id)).toEqual(['a', 'b'])
    expect(countSteps(bs)).toBe(2)
  })

  it('never resolves a removed node as a back-reference target', () => {
    const p = proc(
      [term('start'), gone(act('حذف‌شده')), act('a'), act('b')],
      [
        { from: 'start', to: 'حذف‌شده' }, { from: 'حذف‌شده', to: 'a' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'حذف‌شده', label: 'برگرد' },
      ],
    )
    const bs = linearize(p)
    expect(steps(bs).map((s) => s.node.id)).toEqual(['a', 'b'])
    expect(steps(bs).find((s) => s.node.id === 'b')!.back).toEqual([])
  })

  it('is deterministic — same graph, different insertion order, identical output', () => {
    const edges = [
      { from: 'start', to: 'a' }, { from: 'a', to: 'j1' },
      { from: 'j1', to: 'b' }, { from: 'j1', to: 'c' },
      { from: 'b', to: 'z' }, { from: 'c', to: 'z' },
      { from: 'z', to: 'a', label: 'تکرار' },
    ]
    const one = proc(
      [term('start'), act('a'), junc('j1', 'OR'), act('b'), act('c'), act('z')],
      edges,
    )
    // same logical graph; nodes reversed, edges rotated (a junction's own
    // out-edges keep their relative order — that order *is* the branch order)
    const other = proc(
      [act('z'), act('c'), act('b'), junc('j1', 'OR'), act('a'), term('start')],
      [...edges.slice(4), ...edges.slice(0, 4)],
    )
    expect(JSON.stringify(linearize(other))).toBe(JSON.stringify(linearize(one)))
    // and the output being compared is not trivially empty
    expect(countSteps(linearize(one))).toBe(4)
    expect(groups(linearize(one))[0].branches.map((br) => br.blocks.length)).toEqual([1, 1])
  })
})

describe('groupTitle', () => {
  it('names each junction kind, and says «همه» for a wide AND', () => {
    expect(groupTitle('XOR', 2)).toBe('فقط یکی از این‌ها انجام می‌شود')
    expect(groupTitle('OR', 2)).toBe('یک مورد یا چند مورد از این‌ها انجام می‌شود')
    expect(groupTitle('AND', 2)).toBe('هر دو با هم انجام می‌شوند')
    expect(groupTitle('AND', 3)).toBe('همهٔ این‌ها با هم انجام می‌شوند')
  })
})
