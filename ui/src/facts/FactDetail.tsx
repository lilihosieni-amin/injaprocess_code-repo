import { useNavigate, useParams } from 'react-router-dom'
import { useDepartments, useFact, useFactBranches } from '../api/hooks'
import { refusalStatus } from '../api/client'
import {
  BADGE_LABELS, CONFIRMATION_LABELS, ENVELOPE_FIELD_LABELS, KIND_LABELS,
  KIND_SHAPE_LABELS, MEDIUM_LABELS, PAYLOAD_FIELD_LABELS, SCREEN_LABELS, label,
} from '../lib/factsLabels'
import { jalali } from '../lib/format'
import { LoadFailedScreen, LoadingState } from '../ui/states'
import { RefusalScreen } from '../screens/Refusal'
import { isRestricted, type FactBundle, type FactEntry, type FactProcessLink } from '../api/types'
import { resolvedTitle } from './bundle'
import { FactConfirm } from './FactConfirm'
import { SourceRow } from './SourceRow'
import { DetailCard, Mono, PX, Pill } from './cards/parts'
import { RuleCard, RuleValueCards } from './cards/RuleCard'
import { RecordCard } from './cards/RecordCard'
import { ItemCard } from './cards/ItemCard'
import { MeasurementCard } from './cards/MeasurementCard'
import { LifecycleCard } from './cards/LifecycleCard'
import { AccountsCard } from './cards/AccountsCard'
import { FieldStatusCard, IssuesCard } from './cards/IssuesCard'

/**
 * One entry, in full — `Inja Panel.dc.html:1107-1750`.
 *
 * ## The card order is the design's, and it interleaves
 *
 * The lifecycle card (:1213) sits between the rule's decision table and its
 * «نام تابع» card, so the rule is drawn in two pieces (`RuleValueCards` /
 * `RuleCard`) with the lifecycle card between them. On every other kind that
 * simply means the lifecycle card comes first. Nothing else on the screen is
 * interleaved.
 *
 * ## What this screen does NOT draw, and none of it is an oversight
 *
 * * **No raw-JSON view.** §14 proposed «نمای خام (فقط‌خواندنی)»; the owner was
 *   shown exactly what it was on 2026-08-31 and **refused** it — a developer's
 *   debugging aid with English field names that adds nothing to running the
 *   restaurant (facts-design-audit §6, C2). `SCREEN_LABELS.raw_view` stays
 *   because Appendix D declares it. **Do not re-propose.**
 * * **No coverage line**, here or on the list (C1, same consultation).
 * * **No status dot beside the confirmation chip.** `sfDot` (:4819) is computed
 *   and the detail header's markup has no node for it; only the list row does.
 *
 * ## What the owner added
 *
 * * **«متن اصلی»**, collapsed and closed by default, in the «نام تابع» card
 *   (§6.1) — `RuleCard` draws it.
 * * **`record.medium`**, appended to the line that already carries the kind and
 *   the role, on that line's own «·» (§6.2) — `kindLine` below.
 */
export function FactDetail() {
  const { fid = '' } = useParams()
  const { data, error, isPending, refetch } = useFact(fid)
  const navigate = useNavigate()

  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  if (error) {
    return <LoadFailedScreen message={label(SCREEN_LABELS, 'load_failed')} error={error}
      onRetry={() => { void refetch() }} />
  }

  return (
    // §8's scroll box, as on every screen: `src/styles/base.css` gives
    // `[data-r-pad]` `direction:ltr` with `direction:rtl` back on every child.
    <div data-screen="factDetail" data-r-pad
      className="flex-1 overflow-auto bg-ink pt-s11 px-screen-x pb-screen-x
                 max760:px-s7 max760:py-s9">
      {/* :1109 — an 880px measure. `--width-doc` is 860 and `--width-summary`
          960; neither is this, and this task may not mint a token. */}
      <div data-col style={PX.column} className="mx-auto">
        {isPending || data === undefined
          ? <LoadingState />
          : (
            <Detail
              bundle={data}
              onOpen={(id) => navigate(`/facts/${id}`)}
              // QF-39 — «A `process` source navigates to the process.»
              onOpenProcess={(pid) => navigate(`/processes/${pid}`)}
            />
          )}
      </div>
    </div>
  )
}

function Detail({ bundle, onOpen, onOpenProcess }: {
  bundle: FactBundle; onOpen: (id: string) => void; onOpenProcess: (pid: string) => void
}) {
  const { entry } = bundle
  const departments = useDepartments().data ?? []
  const branches = useFactBranches().data ?? []
  const deptNames = Object.fromEntries(departments.map((d) => [d.code, d.name]))
  const branchNames = Object.fromEntries(branches.map((b) => [b.code, b.name]))
  const port = entry.kind === 'rule' && (entry.data as { port?: unknown }).port === true

  return (
    <>
      <div style={PX.gap9} className="flex items-center flex-wrap">
        {/* :1112 — the kind chip and the confirmation chip, both on the same
            translucent white. Audit §2.1 records the value for the owner. */}
        <span style={PX.chipOnField}
          className="text-fs-xs font-bold py-s1 px-s5 rounded-pill text-role-title-on-field">
          {kindLine(entry)}
        </span>
        <span style={PX.chipOnField}
          className="text-fs-xs font-semibold py-s1 px-s5 rounded-pill text-role-title-on-field">
          {label(CONFIRMATION_LABELS, bundle.confirmation.confirmed ? 'confirmed' : 'unconfirmed')}
        </span>
        <span data-body className="text-fs-caption text-role-subtitle-on-field">
          {scopeLine(entry, deptNames, branchNames)}
        </span>
        {port && <Pill tone="danger">{label(PAYLOAD_FIELD_LABELS, 'port')}</Pill>}
        {entry.retired && <Pill tone="danger">{label(BADGE_LABELS, 'retired')}</Pill>}
      </div>

      {/* :1118 — the title and the tick, which stack at ≤760 (`[data-r-stack]`). */}
      <div data-r-stack className="flex items-start justify-between gap-s9 mt-s6
                                   max760:flex-col max760:items-stretch max760:gap-s6">
        <h1 data-h1 style={PX.titleLh}
          className="m-0 min-w-0 font-extrabold text-fs-display-hand text-role-title-on-field">
          {entry.title}
        </h1>
        <FactConfirm bundle={bundle} />
      </div>

      {/* :1129 — the statement, behind the design's 4px violet edge. */}
      <DetailCard data-card radius="doc" clip={false}
        style={{ ...PX.statement, ...PX.statementEdge }} className="mt-s8">
        <div style={PX.eyebrowGap} className="text-fs-xxs font-bold text-muted">
          {label(SCREEN_LABELS, 'heading_statement')}
        </div>
        <div style={PX.statementLh}
          className="text-fs-h4 text-ink text-justify [text-wrap:pretty]">
          {entry.statement}
        </div>
        {(entry.aliases ?? []).length > 0 && (
          <div style={PX.pt13}
            className="flex items-center gap-s4 flex-wrap mt-s7 border-t border-line-soft">
            <span className="flex-none text-fs-xxs text-faint">
              {label(ENVELOPE_FIELD_LABELS, 'aliases')}
            </span>
            {(entry.aliases ?? []).map((a) => (
              <span key={a}
                className="text-fs-sm2 font-semibold text-violet bg-tile-v2
                           border border-line-filter py-s1 px-s5 rounded-pill">
                {a}
              </span>
            ))}
          </div>
        )}
      </DetailCard>

      <RuleValueCards bundle={bundle} onOpen={onOpen} />
      <LifecycleCard bundle={bundle} onOpen={onOpen} />
      <RuleCard bundle={bundle} onOpen={onOpen} />
      <RecordCard bundle={bundle} onOpen={onOpen} />
      <ItemCard bundle={bundle} />
      <MeasurementCard bundle={bundle} onOpen={onOpen} />
      <AccountsCard bundle={bundle} />
      <FieldStatusCard bundle={bundle} />
      <IssuesCard bundle={bundle} onOpen={onOpen} />

      <SourcesCard bundle={bundle} onOpen={onOpen} onOpenProcess={onOpenProcess} />
    </>
  )
}

/**
 * «جدول · جدول ثبت · فرم کاغذی» — the kind, then what shape of that kind it is,
 * then (for a record) what it physically is.
 *
 * The first two segments are `sfKind` (:4814) read through Appendix D's "shown
 * as, by shape" column; the third is **the owner's approved delta of
 * 2026-08-31** (audit §6.2), placed on this line rather than as a chip or a row
 * in «ساختار و مکان جدول» because this is the line that already answers *what
 * kind of thing is this*.
 */
function kindLine(entry: FactEntry): string {
  const parts = [label(KIND_LABELS, entry.kind)]
  const d = entry.data as { role?: string; medium?: string; lang?: string; inputs?: unknown[] }
  if (entry.kind === 'record') {
    if (d.role !== undefined) parts.push(label(KIND_SHAPE_LABELS, d.role))
    if (d.medium !== undefined) parts.push(label(MEDIUM_LABELS, d.medium))
  }
  if (entry.kind === 'rule') {
    // A rule with no inputs is «مقدار ثابت» whatever its `lang` says (:4814).
    const shape = (d.inputs ?? []).length === 0 ? 'constant' : d.lang
    if (shape !== undefined) parts.push(label(KIND_SHAPE_LABELS, shape))
  }
  return parts.join(' · ')
}

/** «آشپزخانه · چاله‌باغ», or «کل سامانه» for an entry bound to neither
 *  (`scopeLine`, :4634). Departments from the registry, branches from
 *  `GET /api/facts/branches` — conformance note 9. */
function scopeLine(
  entry: FactEntry, depts: Record<string, string>, branches: Record<string, string>,
): string {
  const parts = [
    ...(entry.scope.departments ?? []).map((c) => depts[c] ?? c),
    ...(entry.scope.branches ?? []).map((c) => branches[c] ?? c),
  ]
  return parts.length === 0 ? label(SCREEN_LABELS, 'scope_universal') : parts.join(' · ')
}

/**
 * «منابع», the related processes, the consumers and the footer chip — the one
 * card every kind ends with (:1708-1748).
 *
 * **Conformance note 7 lives here.** The design draws one orphan class, the
 * tombstoned process (`p.tomb`, :1724); Appendix D declares four, and a process
 * link can be any of them:
 *
 * | served | drawn |
 * |---|---|
 * | `title: null` | «ارجاع بی‌مقصد» — the process this cites is not there |
 * | `tombstoned` | «اشاره به فرایند بازنشسته (جایگزین: {heir})» |
 * | `missing_nodes` | «گرهٔ ارجاع‌شده حذف شده» |
 * | `{restricted: true}` | «خارج از دسترسی شما», and no press |
 *
 * «منبع تغییرکرده» is the fourth of Appendix D's classes and belongs to a
 * SOURCE rather than to a process link — a file whose hash no longer matches
 * what was read. The bundle carries no such flag (`FactSource.hash` is what was
 * read, not what is there now, and `merge facts audit` is what compares them),
 * so nothing here can claim it. Recorded rather than guessed at.
 */
function SourcesCard({ bundle, onOpen, onOpenProcess }: {
  bundle: FactBundle; onOpen: (id: string) => void; onOpenProcess: (pid: string) => void
}) {
  const { entry } = bundle
  const sources = entry.source ?? []
  return (
    <DetailCard className="mt-s7">
      <div className="px-s9 py-s7 text-fs-caption font-bold text-ink bg-tile-v4
                      border-b border-border-current">
        {label(SCREEN_LABELS, 'heading_sources')}
      </div>
      {sources.map((s, i) => (
        <SourceRow key={i} source={s} onOpenProcess={onOpenProcess} />
      ))}

      {bundle.processes.length > 0 && (
        <>
          <div className="px-s9 pt-s6 pb-s1 text-fs-xxs font-bold text-muted">
            {label(SCREEN_LABELS, 'heading_processes')}
          </div>
          {bundle.processes.map((p) => (
            <ProcessRow key={p.ref} link={p} onOpenProcess={onOpenProcess} />
          ))}
        </>
      )}

      {bundle.consumers.length > 0 && (
        <>
          <div className="px-s9 pt-s6 pb-s1 text-fs-xxs font-bold text-muted">
            {label(SCREEN_LABELS, 'consumers')}
          </div>
          <div className="flex gap-s4 flex-wrap px-s9 pt-s1 pb-s8">
            {bundle.consumers.map((c) => {
              const masked = isRestricted(c)
              const title = isRestricted(c)
                ? label(SCREEN_LABELS, 'restricted_neighbour')
                : c.title ?? resolvedTitle(bundle, c.id)?.text ?? c.id
              const chip = (
                <>
                  <span className="font-bold">{title}</span>
                  {!masked && <Mono className="text-fs-nano text-faint">{c.id}</Mono>}
                </>
              )
              return masked
                ? (
                  <span key={c.id} style={PX.chip7}
                    className="inline-flex items-center gap-button-icon text-fs-caption
                               text-muted bg-surface-sub border border-border-current
                               rounded-input">
                    {chip}
                  </span>
                )
                : (
                  <button key={c.id} type="button" onClick={() => onOpen(c.id)} style={PX.chip7}
                    className="inline-flex items-center gap-button-icon font-sans text-fs-caption
                               font-semibold text-ink bg-surface-sub border border-border-current
                               rounded-input cursor-pointer hover:border-border-pick
                               hover:bg-tile-v2">
                    {chip}
                  </button>
                )
            })}
          </div>
        </>
      )}

      {/* :1742 — id | key | «آخرین تغییر …». Note 6's home for the spreadsheet
          id: the one place a stored identifier is drawn, on its own, as an
          island, with no Persian word inside the run. */}
      <div data-testid="fact-footer"
        className="flex items-center gap-s7 flex-wrap px-s9 py-s6 bg-surface-sub
                   border-t border-border-current">
        <Mono className="text-fs-xxs text-muted">{entry.id}</Mono>
        <Separator />
        <Mono className="text-fs-xxs text-faint truncate">{entry.key}</Mono>
        {spreadsheetId(entry) !== undefined && (
          <>
            <Separator />
            <Mono className="text-fs-xxs text-faint truncate">{spreadsheetId(entry)}</Mono>
          </>
        )}
        <Separator />
        <span className="text-fs-xxs text-faint">
          {label(ENVELOPE_FIELD_LABELS, 'updated_at')} {jalali(entry.updated_at)}
        </span>
      </div>
    </DetailCard>
  )
}

/**
 * The «|» between the footer's three runs (:1743).
 *
 * **`--text-body`, not the design's own `--text-crumb-sep`** — ledger **L-59**,
 * owner ruling **R48**, about this exact glyph in this exact role: the design's
 * ink measures 1.44:1 and the separator is effectively invisible, so the reader
 * flow bar's «/» was built in `--text-body` instead and measured 7.32:1. L-62
 * records `--text-crumb-sep` as a token that ruling *spent*. The same glyph on
 * this screen takes the same answer rather than reopening it.
 */
const Separator = () => <span aria-hidden className="text-body-ink">|</span>

/** Note 6 — a record's `location.spreadsheetId`, drawn in the footer and
 *  nowhere else. */
function spreadsheetId(entry: FactEntry): string | undefined {
  if (entry.kind !== 'record') return undefined
  const loc = (entry.data as { location?: { spreadsheetId?: string } }).location
  return loc?.spreadsheetId
}

/**
 * One «فرایندهای مرتبط» row, with whichever orphan class applies (note 7) —
 * **and the press the design gives it** (`:1721`: `onClick`, `cursor:pointer`,
 * a `--surface-sub` hover and a dotted underline on the ref).
 *
 * **Drawn as a press only for a HEALTHY link**, which is R5 rather than a
 * shortcut: a masked one is a process the caller may not open at all, and the
 * other three orphan classes are the row saying the destination is not there —
 * a tombstone, a reference to nothing, a node a restructure removed. Offering a
 * press on any of those is offering a navigation the row has just said would
 * fail. So the four inert classes keep the design's markup without its
 * interaction, and the ordinary link keeps both.
 */
function ProcessRow({ link, onOpenProcess }: {
  link: FactProcessLink; onOpenProcess: (pid: string) => void
}) {
  // Narrowed inline, not through a boolean: a masked link carries `ref` and
  // nothing else — no `title`, no `tombstoned`, no `missing_nodes` — and the
  // union is what makes reading one of them a compile error.
  const name = isRestricted(link)
    ? label(SCREEN_LABELS, 'restricted_neighbour')
    : link.title ?? label(SCREEN_LABELS, 'value_none')
  const orphan = isRestricted(link) ? undefined
    : link.tombstoned
      ? label(SCREEN_LABELS, 'tombstoned_process').replace('{heir}', link.heir ?? '')
      : link.title === null ? label(SCREEN_LABELS, 'orphan_reference')
        : link.missing_nodes.length > 0 ? label(SCREEN_LABELS, 'missing_node')
          : undefined
  const openable = !isRestricted(link) && orphan === undefined

  const body = (
    <>
      <Mono className={`flex-none text-fs-xxs text-violet
                        ${openable ? 'underline decoration-dotted underline-offset-4' : ''}`}>
        {link.ref}
      </Mono>
      <span style={PX.procName} className="flex-1 text-fs-sm text-ink text-start">{name}</span>
      {orphan !== undefined && <Pill tone="warn" fs="text-fs-micro">{orphan}</Pill>}
    </>
  )
  const line = 'flex items-center gap-s5 px-s9 py-s5 flex-wrap border-b border-line-row'
  return openable ? (
    <button type="button" onClick={() => onOpenProcess(link.ref)}
      className={`${line} w-full border-0 bg-transparent font-sans cursor-pointer
                  hover:bg-surface-sub`}>
      {body}
    </button>
  ) : <div className={line}>{body}</div>
}
