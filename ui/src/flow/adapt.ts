import type { Node, Edge } from '@xyflow/react'
import type { Process, ProcNode } from '../api/types'

export type FlowNodeData = { node: ProcNode; conflicts: number; hasSub: boolean }

const REAL_ACTIVITY = /^[a-z]+-[0-9]{3}-n[0-9]{3}$/
const REAL_JUNCTION = /^[a-z]+-[0-9]{3}-j[0-9]+$/

export function isTempId(id: string): boolean {
  if (id === 'start' || id === 'end') return false
  return !REAL_ACTIVITY.test(id) && !REAL_JUNCTION.test(id)
}

export function nextTempId(kind: 'n' | 'j', counter: number): string {
  return `tmp-${kind}-${counter}`
}

const FIELD_FA: Record<string, string> = {
  label: 'عنوان', actor: 'مجری فعالیت', description: 'توضیحات', desc: 'توضیحات',
}
export function fieldFa(field: string): string {
  return FIELD_FA[field] ?? field
}

export function toFlowNodes(proc: Process): Node<FlowNodeData>[] {
  const openByNode = new Map<string, number>()
  for (const p of proc.pending) {
    if (p.status === 'open') openByNode.set(p.node, (openByNode.get(p.node) ?? 0) + 1)
  }
  return proc.nodes
    .filter((n) => !('removed' in n && n.removed))
    .map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        node: n,
        conflicts: openByNode.get(n.id) ?? 0,
        hasSub: n.type === 'activity' && n.subprocess != null,
      },
    }))
}

export function toFlowEdges(proc: Process): Edge[] {
  return proc.edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'labeled',
    data: { label: e.label ?? '' },
  }))
}
