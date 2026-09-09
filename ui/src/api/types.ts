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
/**
 * What `POST /api/departments/{code}/exports/{kind}` answers.
 *
 * `url` is the document; `pdf_url` is the printed PDF **and it is absent when
 * one was not printed** — an unconfigured `CHROMIUM_PATH`, a browser that
 * crashed, a render that timed out. Optional in the type for exactly that
 * reason: the panel hands over the PDF (owner ruling, *"the export button should
 * just create pdf. not html"*) and has to be able to tell "there is one" from
 * "there is not" rather than build a `.pdf` href by swapping an extension and
 * hoping. Two fields, because the document is still what `/exports` serves to a
 * reader and what the export's own «چاپ / PDF» button is a sibling of.
 */
export interface ExportResult { url: string; pdf_url?: string; generated_at: string }

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

// ─────────────────────────── quantitative facts (spec §6/§7, §14) ───────────

/** The five kinds an entry can be (§7). */
export type FactKind = 'item' | 'record' | 'measurement' | 'rule' | 'note'

/** Epistemic status of a field, and of the entry as a whole (QF-6).
 *  **Not** the confirmation tick, which is one boolean (QF-25). */
export type FactStatus = 'confirmed' | 'inferred' | 'informal' | 'disputed' | 'unknown'

/** Which departments and branches an entry binds. **Both arrays are optional**:
 *  the schema's `scope` requires neither, an entry that names no department is
 *  universal, and the list route serves `entry.get("scope") or {}` — so an
 *  entry with no scope object at all reaches the client as `{}`. */
export interface FactScope { departments?: string[]; branches?: string[] }

/** A `{ref}` edge (§6). `field` and `row` narrow it to one cell. */
export interface FactRef { ref: string; field?: string; row?: string }

/**
 * One provenance row (`source[]`), and the shape an account's `source` takes.
 *
 * `ref` is `string | null` in the schema — a `chat` source has no file — and
 * the seven locators are each optional because which of them applies is decided
 * by `type`: a sheet has `sheet`/`cell`, a script has `lines`/`function`, a PDF
 * has `page`, a process has `node`.
 */
export interface FactSource {
  type: 'sheet' | 'script' | 'comment' | 'validation' | 'cf' | 'photo' | 'pdf'
      | 'docx' | 'voice' | 'process' | 'chat'
  ref: string | null
  sheet?: string; cell?: string; lines?: string; page?: number
  function?: string; node?: string; quote?: string
  hash?: string | null; run?: string
}

/**
 * One of two or more competing readings of a field (§6, QF-39).
 *
 * `source` is **optional** and that is not defensive typing: with the
 * `fact_sources` switch off, `visibility._public_fact` strips `source` from the
 * envelope and from every account while leaving the rest of the account intact,
 * because the dispute is still readable without its provenance.
 *
 * `value` is `unknown`: an account's value is whatever the source said — a
 * number, a string, a range object — and the schema leaves it untyped.
 */
export interface FactAccount {
  id: string
  field: string
  statement: string
  status: 'open' | 'chosen' | 'rejected'
  value?: unknown
  unit?: string
  speaker_role?: string | null
  source?: FactSource
}

/** A known defect in the data (§6). `affects` is required by the schema; `fix`
 *  carries `factor` only for `multiply`/`divide`. */
export interface FactIssue {
  kind: 'scale' | 'unit_kind' | 'column_shift' | 'junk' | 'bug' | 'cross_record' | 'code_collision'
    | 'hand_maintained_index' | 'no_rule_applies' | 'broken_formula' | 'cached_error'
    | 'leading_offset' | 'unused_mirror' | 'unknown_source' | 'column_offset'
    | 'per_cell_mirror' | 'ambiguous_row_header' | 'binding_gone'
  description: string
  affects: FactRef[]
  /** The `instances[].key` this defect is about, when it is about one copy of
   *  a template rather than the template — the card draws it with that
   *  instance instead of in the issues list. */
  instance?: string
  field?: string
  from_date?: string
  to_date?: string
  fix?: { op: 'multiply' | 'divide' | 'shift_columns' | 'ignore'; factor?: number }
}

/** `item.data` (§7). `category` and `unit` are the schema's two required keys. */
export interface ItemData {
  category: 'ingredient' | 'product' | 'packaging' | 'consumable' | 'place' | 'other'
  unit: string
  unit_raw?: string
  code?: string
  code_absent?: boolean
  group?: string
  state?: 'raw' | 'cooked' | 'frozen' | 'prepared'
  grade?: string
  pack?: { size: number; unit: string }
  units?: { pack_unit: string; factor_to_base: number | null | { min: number; max: number } }[]
  tracked?: { record?: FactRef; value: boolean; reason?: string }[]
  stub?: boolean
}

/** One column of a `record` (§7). */
export interface RecordField {
  key: string
  title: string
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'date'
  /** Present and `null` is «بی‌پاسخ»; **absent is "not applicable"** and is not
   *  red — conformance note 3, which is where the design got this wrong. */
  unit?: string | null
  unit_raw?: string
  description?: string
  filled_by?: string
  group?: { key?: string; title?: string }
  derived?: FactRef
  /** `{instance key: column letter}` — the same column sits at a different
   *  letter in each copy of the template (QF-47). */
  columns?: Record<string, string>
  refItems?: { namespace?: string }
  constraints?: {
    enum?: string[]; readOnly?: boolean; required?: boolean
    minimum?: number; maximum?: number
  }
}

/** One place a record template actually sits — QF-47's `instances[]`. A tab
 *  that repeats across workbooks is one entry with several of these, and the
 *  branch scope is derived from them. */
export interface RecordInstance {
  key: string
  spreadsheetId: string
  sheetId?: number | string | null
  sheet: string
  branch?: string | null
  hidden?: boolean
  imports?: RecordImport[]
}

/** One table pulled in from elsewhere — QF-48's edge, which replaced the mirror
 *  record. `source` is a `{ref}` once the source record exists in the store and
 *  the locator until then, and every reader accepts both (spec §10). */
export interface RecordImport {
  key: string
  source: FactRef | { spreadsheetId: string; sheet: string }
  range?: string | null
  named_range?: string | null
}

/**
 * `record.data` (§7). `medium`, `role` and `location` are required.
 *
 * A row is `{ key, … }` plus one property per column, so it cannot be typed
 * more tightly than `Record<string, unknown>` without freezing the store —
 * the same reason the schema leaves `data` an open object.
 *
 * `location` is the exception, as of the 2026-09-07 addendum §3.3: it is an
 * `if/then` on `medium` in the schema, and the four shapes below are that
 * `if/then`. The discriminant sits on the parent, so a reader narrows on
 * `medium` and not on the location object.
 */
/** The schema leaves this an open object; these are the keys the store writes. */
export interface IdentifierScheme {
  authority?: string; format?: string; example?: string
}
/** `medium: 'sheet'` — engine-written, and the only shape with a locator. */
export interface SheetLocation {
  path?: string; spreadsheetId?: string; sheet?: string
  sheetId?: number | string | null
  hidden?: boolean
}
/** `medium: 'paper'` — where the blank and filled forms are kept, who holds them. */
export interface PaperLocation { kept_at: string; holder: string }
/** `medium: 'external'` — the outside system, and where inside it. */
export interface ExternalLocation {
  system: string; kept_at: string; identifier_scheme?: IdentifierScheme
}
/** `medium: 'native'` — a table the estate keeps itself. */
export interface NativeLocation { kept_at?: string; identifier_scheme?: IdentifierScheme }
export type RecordLocation =
  SheetLocation | PaperLocation | ExternalLocation | NativeLocation

export interface RecordData {
  medium: 'sheet' | 'paper' | 'external' | 'native'
  role: 'log' | 'reference' | 'report' | 'config'
  location: RecordLocation
  instances?: RecordInstance[]
  fields?: RecordField[]
  rows?: (Record<string, unknown> & { key?: string; title?: string; retired?: boolean })[]
  header_fields?: { key: string; title?: string }[]
  sections?: { key: string; title: string; doc_number_field?: string }[]
  signatures?: { role: string; row_range?: string }[]
  primaryKey?: string[]
  foreignKeys?: { fields: string[]; reference: FactRef; reference_fields?: string[]; transform?: string }[]
  reconciled_against?: { cell: { row?: string; field?: string }; against: FactRef }[]
  movement?: { from?: FactRef; to?: FactRef; reason?: string }
  grain?: string
  cadence?: 'nightly' | 'shift' | 'daily' | 'weekly' | 'monthly' | 'ad_hoc'
  day_boundary?: string | null
  approved_by?: string
  blank_master?: boolean
  stub?: boolean
}

/** `measurement.data` (§7). `quantity` and `unit` are required. */
export interface MeasurementData {
  quantity: 'mass' | 'count' | 'volume' | 'duration' | 'money' | 'ratio' | 'other'
  unit: string
  of?: FactRef
  writes_to?: FactRef
  when?: string
  by?: string
  method?: string
  exceptions?: string
  stub?: boolean
}

/** One value a rule reads. `from` is a `{ref}`, a `{param}` naming a value that
 *  differs per binding (QF-47), or one of two string literals — `operator`,
 *  `calendar` — which is why it is a union and not a `FactRef`. */
export interface RuleInput {
  key: string
  title?: string
  unit?: string | null
  from?: FactRef | { param: string } | 'operator' | 'calendar' | null
  via?: FactRef
}

/** One value a rule produces. `value: null` is «بی‌پاسخ»; `range` is the
 *  two-ended form and either end may be `null` — open, as
 *  `facts.schema.json` allows; `share` is a fraction of the input. */
export interface RuleOutput {
  key: string
  title?: string
  unit?: string | null
  value?: unknown
  range?: { min: number | null; max: number | null }
  nature?: 'standard' | 'target' | 'observed' | 'limit'
  per?: string
  share?: number
  of?: FactRef
  writes_to?: FactRef
}

/** One (record instance, column, row range) a rule runs on — QF-47. A rule with
 *  sixty bindings is one entry, and the per-binding numbers live in `params`. */
export interface RuleBinding {
  key: string
  record: FactRef
  variant?: number | string | null
  range?: string | null
  params?: Record<string, unknown>
  rows?: { key: string; row?: number | null; label?: string | null; item?: string | null }[]
}

/** `rule.data` (§7). `inputs` and `outputs` are required — a constant is a rule
 *  with `inputs: []`, which is what the header chip calls «مقدار ثابت». */
export interface RuleData {
  inputs: RuleInput[]
  outputs: RuleOutput[]
  applies_to?: RuleBinding[]
  lang?: 'feel' | 'table' | 'text' | 'sheets' | 'gs'
  expr?: string | null
  identifier?: string
  original?: string
  original_ref?: string
  port?: boolean
  calls?: FactRef[]
  template_of?: FactRef
  divergence?: 'none' | 'intentional' | 'drift' | 'unknown'
  edge_cases?: { input?: string; expected?: string; why?: string }[]
  table?: {
    inputs?: string[]; outputs?: string[]
    /** A row is `{when, then}` in the design (:4855) and flat `{key: value}`
     *  from the engine's units — `facts.schema.json` types `table` as a bare
     *  object, and the card reads both. */
    rows?: Record<string, unknown>[]
    hit?: 'first' | 'unique' | 'collect'
    aggregate?: 'sum' | 'product' | 'min' | 'max'
    default?: Record<string, unknown>
  }
  stub?: boolean
}

/**
 * One entry, as `GET /api/facts/{fid}` serves it inside `bundle.entry`.
 *
 * `data` is `Record<string, unknown>` on the envelope and narrowed per kind by
 * the four guards below, because the schema types `data` as an open object and
 * a discriminated union on `kind` would be a promise about the part of the
 * payload no schema constrains.
 *
 * `source` is **optional**: with `fact_sources` off it is stripped whole
 * (`visibility._public_fact`), which is a different body from one carrying an
 * empty array, and the type says so.
 */
export interface FactEntry {
  id: string
  kind: FactKind
  key: string
  title: string
  statement: string
  scope: FactScope
  status: FactStatus
  retired: boolean
  updated_at: string
  data: Record<string, unknown>
  source?: FactSource[]
  aliases?: string[]
  field_status?: Record<string, 'inferred' | 'informal'>
  accounts?: FactAccount[]
  valid_from?: string | null
  valid_to?: string | null
  supersedes?: FactRef | null
  superseded_by?: FactRef | null
  issues?: FactIssue[]
  processes?: { ref: string }[]
}

export const isItem = (e: FactEntry): e is FactEntry & { data: ItemData } => e.kind === 'item'
export const isRecordFact = (e: FactEntry): e is FactEntry & { data: RecordData } => e.kind === 'record'
export const isMeasurement = (e: FactEntry): e is FactEntry & { data: MeasurementData } => e.kind === 'measurement'
export const isRule = (e: FactEntry): e is FactEntry & { data: RuleData } => e.kind === 'rule'

/**
 * One row of `GET /api/facts` (§14).
 *
 * `fingerprint` is the entry's **current** print and `confirmed` is whether the
 * stored mark equals it — the pair `routers/confirmations._row` reports for a
 * process, and for the same reason: a tick drawn from this listing has to be
 * pressable, and QF-24 forbids the client computing a print.
 *
 * `red_counts` is what the row's second line renders — «{n} بی‌پاسخ ·
 * {n} متعارض» — and is served rather than derived, because the client never
 * holds the entry those counts are over.
 */
export interface FactListRow {
  id: string
  kind: FactKind
  key: string
  title: string
  aliases: string[]
  scope: FactScope
  status: FactStatus
  retired: boolean
  stub: boolean
  red_counts: { unknown: number; disputed: number }
  fingerprint: string
  confirmed: boolean
  updated_at: string
}

/** How much of the estate has been read — `merge facts check`'s own count,
 *  rendered as «{n} از {m} کاربرگ خوانده شده». */
export interface FactsCoverage { read: number; total: number }

export interface FactsListResponse { entries: FactListRow[]; coverage: FactsCoverage }

/** A registered branch, from the manifest and from nowhere else (QF-4). */
export interface Branch { code: string; name: string }

/**
 * **A neighbour the caller may not open.** The owner's ruling of 2026-08-31 is
 * *keep the row, hide the name*: the entry stays in `resolved`, `row_titles`,
 * `path_labels`, `consumers` and `processes` so a count stays honest, carrying
 * its id and this flag and nothing else — no title, no `code`, no `kind`, and
 * for a process no `tombstoned`, `heir` or `missing_nodes`.
 *
 * A union rather than "title is optional and hope": every reader has to narrow
 * before reading a name it may not have been given, and `restricted` being
 * **absent** on an unmasked row — never `false` — is what makes that narrowing
 * total.
 */
export interface Restricted { restricted: true }

export const isRestricted = (v: unknown): v is Restricted =>
  typeof v === 'object' && v !== null && (v as { restricted?: unknown }).restricted === true

/** `resolved` — every id, item key and process id the entry references, → a
 *  Persian label. `code` is the estate code rendered beside an item's title;
 *  `fields` is a **record's** columns, `{key: title}`, which is what lets a
 *  `{ref, field}` edge name the column it reads and not only the record. */
export interface FactLabel {
  kind: string; title: string; code?: string; fields?: Record<string, string>
}

/** One entry the reverse index says uses this one (QF-39). */
export type FactConsumer = { id: string; title: string | null } | ({ id: string } & Restricted)

/**
 * One process link, resolved against `departments/**` as it stands now (QF-8).
 *
 * `title: null` is «the process this cites is no longer there»; `missing_nodes`
 * is conformance note 7's «گرهٔ ارجاع‌شده حذف شده», recomputed server-side
 * because a node a later restructure removed is invisible to everything
 * downstream.
 */
export type FactProcessLink =
  | { ref: string; title: string | null; tombstoned: boolean; heir: string | null; missing_nodes: string[] }
  | ({ ref: string } & Restricted)

/**
 * The body of `GET /api/facts/{fid}` — and what `POST …/resolve` answers with,
 * so a screen that settled a dispute is handed the document it would get by
 * asking for it again.
 *
 * `can_confirm` is what the tick may do, not what it says: `confirm` at every
 * department the entry names (QF-27), **and** not a red entry, because red wins
 * over green (QF-25) and `POST /api/confirmations/{fid}` answers 409 for one.
 */
export interface FactBundle {
  entry: FactEntry
  confirmation: { confirmed: boolean; can_confirm: boolean; fingerprint: string }
  red_paths: { unknown: string[]; disputed: string[] }
  resolved: Record<string, FactLabel | Restricted>
  row_titles: Record<string, string | Restricted>
  path_labels: Record<string, string | Restricted>
  /** `{spreadsheetId: title}` — the manifest's file name without its
   *  extension, which is the only name the estate has for a workbook. */
  workbook_titles: Record<string, string>
  /** `{symbol: Persian title}` — the units record's own `unit_title` per open
   *  row, beside the entry because the entry is what QF-24 fingerprints and
   *  `ruleOutput` admits no `unit_title` (`facts.schema.json`). A card draws
   *  the title where the record names one and the symbol as an island where
   *  it does not. */
  unit_titles: Record<string, string>
  /** Where a record instance or a rule binding sits, keyed by its own key. The
   *  entry cannot carry it: a rule's binding names a column of another entry,
   *  and the workbook's title is the manifest's. */
  binding_labels: Record<string, { workbook: string; sheet: string; branch: string | null }>
  consumers: FactConsumer[]
  processes: FactProcessLink[]
  /**
   * «متن اصلی» — the verbatim body `data.original_ref` names, read out of
   * `facts/originals/` by the route (QF-31 moves it there, so an entry carries
   * the path and never the text).
   *
   * Beside the entry and not inside it: `entry` is what QF-24 fingerprints, and
   * a field arriving from a second file would change the print of every rule in
   * the store at once. `null` for an entry with no original, and for a `ref`
   * that names no readable file — the screen draws the path either way.
   */
  original: string | null
}
