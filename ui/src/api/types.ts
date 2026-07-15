export interface Department { code: string; name: string; count: number; subs: number; conflicts: number }

export interface Icom { inputs: string[]; controls: string[]; outputs: string[]; mechanisms: string[] }
export interface Kpi { name: string; definition?: string; target?: string; unit?: string }
export interface Pending {
  node: string; field: string; current: unknown; proposed: unknown
  source: string; status: 'open' | 'accepted' | 'rejected'
}
export interface PendingItem {
  process: string; department: string; name: string
  node: string; index: number; field: string
  current: unknown; proposed: unknown; source: string; status: 'open'
}
export interface Position { x: number; y: number }
export interface NodeSource { created_by: string; touched_by: string[] }

export interface ActivityNode {
  id: string; type: 'activity'; label: string; description: string; actor: string
  icom: Icom; subprocess: string | null; position: Position
  layout: 'auto' | 'manual'; source: NodeSource; removed?: boolean
}
export interface TerminalNode {
  id: 'start' | 'end'; type: 'start' | 'end'; label: string
  position: Position; layout: 'auto' | 'manual'; removed?: boolean
}
export interface JunctionNode {
  id: string; type: 'junction'; junctionType: 'AND' | 'OR' | 'XOR'
  direction: 'split' | 'join'; position: Position; layout: 'auto' | 'manual'; removed?: boolean
}
export type ProcNode = ActivityNode | TerminalNode | JunctionNode
export interface Edge { from: string; to: string; label?: string }

export interface Process {
  id: string; department: string; name: string; summary: string
  source: { type: 'voice' | 'manual' | 'chat' | 'auto'; ref: string | null; run: string | null }
  parent: { process: string; node: string } | null
  created_at: string; updated_at: string
  idef0: Icom; kpis: Kpi[]; nodes: ProcNode[]; edges: Edge[]; pending: Pending[]
  superseded_by?: string[]
  tombstoned?: boolean
}

export interface Overview {
  department: string; name: string
  sub_units: { name: string; description: string }[]
  personnel: { role: string; duties: string[] }[]
  updated_at: string
}

export interface Me { username: string }
