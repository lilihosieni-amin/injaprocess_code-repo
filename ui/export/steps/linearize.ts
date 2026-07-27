import type { ActivityNode, ProcNode, ReadableProcess } from '../../src/api/types'

export type Junction = 'AND' | 'OR' | 'XOR'
/** One "go back to step N" edge. `num` is absent when the target is not a
 *  numbered step — a junction or a terminal — so a renderer can never pair a
 *  label with someone else's number. Render the badge only when `num` is set.
 *  A removed node never appears here at all: its edges are dropped when the
 *  graph is wired, before back-edges are detected. */
export type BackRef = { to: string; label: string; num?: number }
export type StepBlock = {
  kind: 'step'
  node: ActivityNode
  cond: string
  back: BackRef[]
  num: number
}
export type GroupBlock = {
  kind: 'group'
  type: Junction
  branches: { label: string; blocks: Block[] }[]
}
export type Block = StepBlock | GroupBlock

type IndexedEdge = { from: string; to: string; label: string; i: number }

/** Deterministic graph model: back-edge detection + topological ranking.
 *
 *  Every traversal breaks ties on the node's original index, so the same
 *  process always linearises the same way — the export is a pure transform.
 */
function graphOf(p: ReadableProcess) {
  const nodes = p.nodes.filter((n) => !('removed' in n && n.removed))
  const edges: IndexedEdge[] = p.edges.map((e, i) => ({ from: e.from, to: e.to, label: e.label ?? '', i }))
  const byId = new Map<string, { n: ProcNode; i: number }>()
  nodes.forEach((n, i) => byId.set(n.id, { n, i }))

  const out = new Map<string, IndexedEdge[]>()
  const inn = new Map<string, IndexedEdge[]>()
  nodes.forEach((n) => { out.set(n.id, []); inn.set(n.id, []) })
  edges.forEach((e) => {
    if (byId.has(e.from) && byId.has(e.to)) { out.get(e.from)!.push(e); inn.get(e.to)!.push(e) }
  })
  out.forEach((list) => list.sort((a, b) => a.i - b.i))

  const start = nodes.find((n) => n.type === 'start')
    ?? nodes.find((n) => (inn.get(n.id) ?? []).length === 0)
    ?? nodes[0]

  // back edges via DFS in stable order — an edge to a node still on the stack
  const color = new Map<string, number>()
  const back = new Set<number>()
  const dfs = (id: string) => {
    color.set(id, 1)
    for (const e of out.get(id) ?? []) {
      const c = color.get(e.to)
      if (c === 1) back.add(e.i)
      else if (!c) dfs(e.to)
    }
    color.set(id, 2)
  }
  if (start) dfs(start.id)
  nodes.forEach((n) => { if (!color.get(n.id)) dfs(n.id) })

  const fwdOut = (id: string) => (out.get(id) ?? []).filter((e) => !back.has(e.i))
  const backOut = (id: string) => (out.get(id) ?? []).filter((e) => back.has(e.i))

  // topological rank (Kahn, lowest original index first)
  const indeg = new Map<string, number>()
  nodes.forEach((n) => indeg.set(n.id, 0))
  nodes.forEach((n) => fwdOut(n.id).forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)))
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const rank = new Map<string, number>()
  let r = 0
  while (ready.length) {
    ready.sort((a, b) => byId.get(a)!.i - byId.get(b)!.i)
    const id = ready.shift()!
    rank.set(id, r++)
    fwdOut(id).forEach((e) => {
      const left = (indeg.get(e.to) ?? 0) - 1
      indeg.set(e.to, left)
      if (left === 0) ready.push(e.to)
    })
  }
  nodes.forEach((n) => { if (rank.get(n.id) == null) rank.set(n.id, r++) })

  return { nodes, byId, start, fwdOut, backOut, rank }
}

type Graph = ReturnType<typeof graphOf>

/** First node reachable from every branch — the deterministic merge point. */
function mergePoint(g: Graph, branchEdges: IndexedEdge[]): string | null {
  const sets = branchEdges.map((e) => {
    const seen = new Set<string>()
    const stack = [e.to]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      g.fwdOut(id).forEach((x) => { if (!seen.has(x.to)) stack.push(x.to) })
    }
    return seen
  })
  const common = [...sets[0]].filter((id) => sets.every((s) => s.has(id)))
  if (!common.length) return null
  common.sort((a, b) => (g.rank.get(a)! - g.rank.get(b)!) || (g.byId.get(a)!.i - g.byId.get(b)!.i))
  return common[0]
}

const GROUP_TITLE: Record<Junction, string> = {
  XOR: 'فقط یکی از این‌ها انجام می‌شود',
  AND: 'هر دو با هم انجام می‌شوند',
  OR: 'یک مورد یا چند مورد از این‌ها انجام می‌شود',
}

export function groupTitle(type: Junction, count: number): string {
  if (type === 'AND') return count > 2 ? 'همهٔ این‌ها با هم انجام می‌شوند' : GROUP_TITLE.AND
  return GROUP_TITLE[type]
}

export function countSteps(blocks: Block[]): number {
  let n = 0
  blocks.forEach((b) => {
    if (b.kind === 'step') n++
    else b.branches.forEach((br) => { n += countSteps(br.blocks) })
  })
  return n
}

/** Pure: process JSON -> ordered block tree. */
export function linearize(p: ReadableProcess): Block[] {
  const g = graphOf(p)
  const visited = new Set<string>()

  function walk(fromId: string | null, stopId: string | null, cond: string): Block[] {
    const blocks: Block[] = []
    let cur = fromId
    let pending = cond
    let guard = 0
    while (cur && cur !== stopId && guard++ < g.nodes.length * 4) {
      const entry = g.byId.get(cur)
      if (!entry) break
      const node = entry.n
      if (visited.has(cur) && node.type === 'activity') break
      if (node.type === 'activity') {
        visited.add(cur)
        blocks.push({
          kind: 'step', node, cond: pending,
          back: g.backOut(cur).map((e) => ({ to: e.to, label: e.label })),
          num: 0,
        })
        pending = ''
      }
      const outs = g.fwdOut(cur)
      if (!outs.length) break
      if (outs.length === 1) { pending = outs[0].label || pending; cur = outs[0].to; continue }
      const merge = mergePoint(g, outs)
      const type = (node.type === 'junction' ? node.junctionType : 'XOR') as Junction
      blocks.push({
        kind: 'group', type,
        branches: outs.map((e) => ({ label: e.label, blocks: walk(e.to, merge, '') })),
      })
      if (!merge) break
      cur = merge
      pending = ''
    }
    return blocks
  }

  const blocks = walk(g.start?.id ?? null, null, '')

  // graphs can have disconnected pieces — append them in stable node order
  g.nodes.forEach((n) => {
    if (n.type !== 'activity' || visited.has(n.id)) return
    walk(n.id, null, '').forEach((b) => blocks.push(b))
  })

  // number steps in reading order, then resolve back-references
  let n = 0
  const numOf = new Map<string, number>()
  const num = (bs: Block[]) => bs.forEach((b) => {
    if (b.kind === 'step') { b.num = ++n; numOf.set(b.node.id, b.num) }
    else b.branches.forEach((br) => num(br.blocks))
  })
  num(blocks)
  const resolve = (bs: Block[]) => bs.forEach((b) => {
    if (b.kind === 'step') b.back.forEach((x) => { const n = numOf.get(x.to); if (n) x.num = n })
    else b.branches.forEach((br) => resolve(br.blocks))
  })
  resolve(blocks)
  return blocks
}
