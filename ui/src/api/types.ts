/** `conflicts` is optional because the server sends it only to someone who may
 *  `edit` that department, and sends it **absent rather than zero** for everyone
 *  else: a `0` still answers "how many unresolved proposals are there", and
 *  answers it wrongly. `?: number` is what makes a reader of this type deal with
 *  "I was not told" as its own case instead of collapsing it into "none". */
export interface Department { code: string; name: string; count: number; subs: number; conflicts?: number }

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

/** A process with only the fields a *read-only* view of it needs.
 *
 *  This is exactly what an export ships. The exported file is a standalone
 *  document that travels beyond the panel — behind the shared export credential
 *  (D25), but forwardable as a file once downloaded — so
 *  `inja_ui_backend/exports.py` withholds every process field neither document
 *  renders — `summary`, `source`, `created_at`, `updated_at`, `idef0`, `kpis` —
 *  and this type says so, instead of letting `Process` promise fields that are
 *  not in the file.
 *
 *  `Process` is assignable to it (it has strictly more), so every function typed
 *  against it still takes the editing app's own documents unchanged. Functions
 *  the export and the app share — `toFlowNodes`, `DetailDrawer`, `linearize` —
 *  are typed with this one; anything that genuinely needs a whole process (the
 *  Summary screen, `usePutProcess`) keeps `Process`.
 *
 *  Nodes stay `ProcNode`: the export blanks a node's `icom` and `source` rather
 *  than dropping them, because the app's own node components and drawer
 *  dereference both. */
export type ReadableProcess = Omit<
  Process,
  'summary' | 'source' | 'created_at' | 'updated_at' | 'idef0' | 'kpis'
  | 'superseded_by' | 'tombstoned'
>

export interface Overview {
  department: string; name: string
  description: string
  sub_units: { name: string; description: string }[]
  personnel: { role: string; duties: string[]; kpi: string[] }[]
  updated_at: string
}

/** What POST /api/auth/login answers with — and all it answers with.
 *
 *  Not the signed-in person: that is `SessionDescriptor` in
 *  `src/auth/session.ts`, which `GET /api/auth/me` returns and `useSession`
 *  reads. Login says only which account the new cookie names; the descriptor is
 *  fetched afterwards like any other. */
export interface Me { username: string }

export type DepartmentOrder = { order: string[] }

export type ExportKind = 'flowchart' | 'steps'
export interface ExportResult { url: string; generated_at: string }
