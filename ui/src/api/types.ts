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
  /** Absent for a non-editor: process provenance is D17 never-shown bookkeeping
   *  and nothing in this app renders it. `?` rather than a lie — the server
   *  really does not send it (`visibility.PUBLIC_PROCESS_KEYS` names neither
   *  this nor the two timestamps below), and a reader of this type has to deal
   *  with that. */
  source?: { type: 'voice' | 'manual' | 'chat' | 'auto'; ref: string | null; run: string | null }
  parent: { process: string; node: string } | null
  /** Absent for a non-editor, for the same reason. */
  created_at?: string; updated_at?: string
  idef0: Icom; kpis: Kpi[]; nodes: ProcNode[]; edges: Edge[]; pending: Pending[]
  superseded_by?: string[]
  tombstoned?: boolean
}

/** A process with only the fields a *read-only* view of it needs.
 *
 *  This is exactly what an export ships. The exported file is a standalone
 *  document that travels beyond the panel — behind the shared export credential
 *  (D25), but forwardable as a file once downloaded — so it carries only the
 *  fields a read-only view needs, and this type says so instead of letting
 *  `Process` promise more than the file holds.
 *
 *  **Two different mechanisms sit behind the six names below, and the `Omit` is
 *  the safe reading of both.** `exports.build_payload` now runs the same
 *  `visibility.filtered` every API response does, and that filter *drops*
 *  `source`, `created_at` and `updated_at` (they are not in
 *  `PUBLIC_PROCESS_KEYS`) while it *blanks* `summary`, `idef0` and `kpis` —
 *  present, but emptied, whenever the department's policy has their switch off.
 *  So the last three may be in the JSON carrying `''` / an empty ICOM / `[]`
 *  rather than missing. Omitting them anyway is deliberate: neither exported
 *  document renders them, and a type that promised them would invite a reader
 *  to print a blank the policy chose to withhold.
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
  /** Required, and required for **everyone** — unlike the process's own
   *  timestamps above. `visibility.public_overview` returns the department page
   *  unchanged for both stances (D55): the overview is a different document
   *  from a process, `overview.schema.json` marks all six of its properties
   *  required under `additionalProperties: false`, and a last-updated date says
   *  nothing about what the department does, so it is not the kind of thing
   *  that filter withholds. Mark it optional here and `Overview.tsx` would need
   *  a guard for a case the server cannot produce. */
  updated_at: string
}

/** One confirmable target as `GET /api/confirmations` reports it (D20).
 *
 *  `fingerprint` is the document's **current** one, and confirming echoes it
 *  back: the client never computes a fingerprint, because canonical JSON here
 *  would have to agree with Python's byte for byte and the definition of a
 *  confirmation would live in two languages.
 *
 *  `confirmed` is therefore *not* "a mark exists" — it is "the stored mark is
 *  for these exact bytes". A document edited after being confirmed comes back
 *  `confirmed: false` with a new `fingerprint`, and `confirmed_by`/`confirmed_at`
 *  null, because the person who vouched never saw what is there now.
 *
 *  `confirmed_at` is **unix seconds** (the server writes `int(time.time())`),
 *  not the ISO string every other timestamp in this file is. */
export interface Confirmation {
  target: string
  kind: 'process' | 'department'
  fingerprint: string
  confirmed: boolean
  confirmed_by: string | null
  confirmed_at: number | null
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

/** The six switchable fields (spec D17). A node has no KPIs: `process_kpis` is
 *  `process.kpis[]`, and what a node carries is ICOM. */
export type PolicyField =
  | 'process_summary' | 'process_idef0' | 'process_kpis'
  | 'node_description' | 'node_actor' | 'node_icom'

/** `version` is a digest of the policy, not a counter: it is what D27 keys the
 *  report cache on, so an artifact built under a different one is a different
 *  artifact. */
export interface VisibilityPolicy {
  fields: Record<PolicyField, boolean>
  version: string
}
