import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useDepartments, useReportNames } from '../api/hooks'
import {
  useActivityComments, useActivityDepartments, useActivityFailures, useActivityPermissions,
  useActivitySummary, useActivityUsers,
  type ActivityUser, type CommentFlow, type DeptReadership, type PermissionChange, type SignInFailure,
} from '../api/activity'
import { refusalStatus, retryQuery } from '../api/client'
import { roleLabel } from '../lib/roles'
import { parseScope, scopeLabel, scopesLabel } from '../lib/scopes'
import { dayOf, daysSinceFa, durationFa, jalaliDay, toFa, whenFa } from '../lib/format'
import { COMMENT_STATE, hopLabel } from '../lib/events'
import { POLICY_LABEL } from './Visibility'
import { DataTable, type TemplatedColumn } from '../ui/DataTable'
import { Dropdown } from '../ui/Dropdown'
import { NavTabTray } from '../ui/NavTabTray'
import { Pager } from '../ui/Pager'
import { StatTile } from '../ui/StatTile'
import { StatusPill } from '../ui/StatusPill'
import { CalendarFilter } from '../ui/JalaliCalendar'
import { ErrorState, LoadingState } from '../ui/states'
import { RefusalScreen } from './Refusal'
import { useHistoryState } from '../shell/historyState'

type TabId = 'user' | 'read' | 'perm' | 'flow' | 'fails'
/** `star`: access and governance events, served to a `*` holder only (D44). */
const TABS: { id: TabId; label: string; star: boolean }[] = [
  { id: 'user', label: 'فعالیت هر کاربر', star: true },
  { id: 'read', label: 'مشاهده دپارتمان', star: false },
  { id: 'perm', label: 'تاریخچهٔ مجوزها', star: true },
  { id: 'flow', label: 'مسیر کامنت‌ها', star: false },
  { id: 'fails', label: 'ورود ناموفق', star: true },
]
/** The design's `auditNote` (Panel L5349–5352); the fifth tab's is the Task 12
 *  proposal the controller lists for the owner. */
const NOTE: Record<TabId, string> = {
  user: 'زمان فعال از ضربان last_seen انباشته می‌شود، پس حضور واقعی است.',
  read: 'یک ردیف برای هر دپارتمان: آیا کارکنانش رویه را خوانده‌اند.',
  perm: 'هر تغییر دسترسی با عامل، سوژه و مقدار قبل و بعد.',
  flow: 'سرپرستی که روی کامنت نشسته، همین‌جا مرئی می‌شود.',
  fails: 'تلاش با شماره‌هایی که حسابی ندارند هم این‌جا دیده می‌شود.',
}
const PER_PAGE = 5
const EMPTY = 'با این فیلترها ردیفی نیست'

/**
 * The activity record's own screen (D83, D84): four headline counts and five
 * reports over `/api/activity`, Panel L2343–2466.
 *
 * **Who sees what is the server's partition, drawn rather than re-decided.**
 * Anyone holding `view_audit` reaches the screen; the department readership and
 * the comment flow are filtered to their departments on the wire. The per-user,
 * permission and failed-sign-in reports name accounts rather than departments,
 * so they answer 404 below `*` — the tabs are therefore not drawn for a scoped
 * caller at all, and each tab is its own component mounted only while it is
 * open, so a request the caller would be refused is never sent (NFR-12).
 *
 * The same holds for the two `*`-only counts: the summary answers `null` for a
 * scoped caller and the tile says «—», never a number that would silently
 * answer a question about accounts outside their scope.
 */
export function Activity() {
  const session = useSession().data
  const mayReach = useCan(session)
  const any = !!session?.capabilities.includes('view_audit')
  const star = mayReach('view_audit', '*')
  const tabs = TABS.filter((t) => star || !t.star)
  const [picked, setTab] = useHistoryState<TabId>('activity:tab', 'user')
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0].id
  const summary = useActivitySummary(any)

  // Hooks first, then the early returns — Users.tsx's order, for its reason.
  if (!session) return <div className="flex-1 bg-ink" />
  if (!any) return <RefusalScreen status={404} />
  const refused = refusalStatus(summary.error)
  if (refused) return <RefusalScreen status={refused} />
  const s = summary.data
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v)
  return (
    <div data-screen="activity"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      {/* The design's own 980px column (L2346), not the 920px list column. */}
      <div data-col className="max-w-audit mx-auto">
        <h1 data-h1 className="text-title font-extrabold text-role-title-on-field">گزارش فعالیت کاربران</h1>
        <p className="mt-s4 max-w-intro text-fs-sm text-role-subtitle-on-field leading-normal [text-wrap:pretty]">
          هر ورود، هر خواندن و هر تغییر دسترسی با نام کنندهٔ آن ثبت می‌شود. این دفتر از هیچ نقشی — از جمله ادیتور — قابل پاک کردن یا تغییر نیست.
        </p>
        {/* L2350 — `[data-r-2col]`, which the design collapses to one column at
            ≤760 (Panel L48) like every other grid that carries it. */}
        <div data-r-2col className="grid grid-cols-4 gap-s6 my-stat-grid max760:grid-cols-1">
          <StatTile skin="compact" tone="violet" value={n(s?.activeUsers)} label="کاربر فعال" />
          <StatTile skin="compact" tone="ink" value={n(s?.views)} label="بازدید نمایش‌ها" />
          <StatTile skin="compact" tone="conflict" value={n(s?.failedSignIns)} label="ورود ناموفق" />
          <StatTile skin="compact" tone="warn" value={n(s?.commentsAwaiting)} label="کامنت در انتظار" />
        </div>
        <NavTabTray wrap tabs={tabs} value={tab} label="گزارش‌های فعالیت" className="mb-s7"
          onChange={(id) => setTab(id as TabId)} />
        {tab === 'user' && <UsersTab />}
        {tab === 'read' && <ReadTab />}
        {tab === 'perm' && <PermTab />}
        {tab === 'flow' && <FlowTab />}
        {tab === 'fails' && <FailsTab />}
        <p className="mt-s7 text-fs-caption text-role-subtitle-on-field leading-loose [text-wrap:pretty]">
          {NOTE[tab]}
        </p>
      </div>
    </div>
  )
}

/**
 * A tab's filters and its page, both on the history entry so they are still
 * there on the way back from a user's page; changing a filter starts again at
 * page one. Rows are filtered and paged here, on the client — every list on this
 * screen is bounded by people, departments or comments, not by events.
 * ponytail: client-side paging; move it to the server if a tab passes a few
 * thousand rows.
 */
function useReport<F extends object>(key: TabId, initial: F) {
  const [f, setF] = useHistoryState<F>(`activity:${key}:f`, initial)
  const [page, setPage] = useHistoryState(`activity:${key}:page`, 1)
  const set = <K extends keyof F>(k: K) => (v: F[K]) => { setF({ ...f, [k]: v }); setPage(1) }
  function paged<T>(rows: T[]) {
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
    const p = Math.min(page, pages)
    const pager = rows.length > PER_PAGE ? (
      <Pager from={(p - 1) * PER_PAGE + 1} to={Math.min(rows.length, p * PER_PAGE)}
        count={rows.length} page={p} pages={pages} onPage={setPage} />
    ) : undefined
    return { shown: rows.slice((p - 1) * PER_PAGE, p * PER_PAGE), pager }
  }
  return { f, set, paged }
}

/**
 * What a tab shows until its report is in. The failure takes `ErrorState`'s
 * card rather than `LoadFailedScreen`: that one is a whole screen, and under the
 * tray it would draw a second gutter and a second scroller inside this column
 * (F34). The retry is offered on `retryQuery`'s terms, as `LoadFailedScreen`'s is.
 */
function pending(q: { data?: unknown; error: unknown; refetch: () => unknown }): ReactNode {
  if (q.error) {
    return <ErrorState message="گزارش بارگذاری نشد."
      onRetry={retryQuery(0, q.error) ? () => { void q.refetch() } : undefined} />
  }
  return q.data === undefined ? <LoadingState /> : null
}

/** One list filter: «همهٔ …» first (the design's own wording, L4416–4419 and
 *  L4591–4600), then the values the tab's rows actually take. */
function Filter({ label, all, value, onChange, values, searchable = false }: {
  label: string; all: string; value: string; onChange: (v: string) => void
  values: [string, string][]; searchable?: boolean
}) {
  return (
    <Dropdown label={label} hideLabel placeholder={all} value={value} onChange={onChange}
      searchable={searchable} noHit="چیزی با این نام نیست"
      options={[{ value: '', label: all }, ...values.map(([v, l]) => ({ value: v, label: l }))]} />
  )
}

/** The row count at the filter bar's far end, gone at ≤760 (L2420). */
const Count = ({ n }: { n: number }) => (
  <span className="ms-auto text-fs-caption font-semibold text-muted max760:hidden">{`${toFa(n)} ردیف`}</span>
)

/** Distinct `[value, label]` pairs, first-seen order. */
const pairs = (xs: [string, string][]): [string, string][] => [...new Map(xs)]
const same = (xs: string[]): [string, string][] => pairs(xs.map((x) => [x, x]))
const useNames = (): Record<string, string> =>
  Object.fromEntries((useDepartments().data ?? []).map((d) => [d.code, d.name]))

// The design's cell type, column by column (L2430–2438): a bold name over a
// faint sub-line first, 13px in the second and third (the third bold), 12.5px in
// the fourth and fifth, 12px muted in the last. A warning swaps the colour only.
const MAIN = 'block truncate text-body font-bold text-ink'
const SUB = 'block truncate mt-s1 text-caption text-faint'
const C13 = 'block truncate text-fs-sm'
const C125 = 'block truncate text-fs-sm2'
const C12 = 'block truncate text-fs-caption'
const LTR = 'inline-block max-w-full truncate font-mono'
const warn = (on: boolean) => (on ? 'text-conflict' : 'text-body-ink')

function UsersTab() {
  const q = useActivityUsers()
  const navigate = useNavigate()
  const names = useNames()
  const reports = useReportNames()
  const { f, set, paged } = useReport('user', { dept: '', role: '' })
  const users = q.data ?? []
  // A department filter keeps everyone who reaches it: `*`, the department, or
  // one report inside it (D10) — the design's «کل سامانه» rows included.
  const reaches = (u: ActivityUser) => u.scopes.some((sc) => {
    const p = parseScope(sc)
    return p.shape === 'every' || ('code' in p && p.code === f.dept)
  })
  const rows = users.filter((u) => (!f.dept || reaches(u)) && (!f.role || u.role === f.role))
  const { shown, pager } = paged(rows)
  const columns: TemplatedColumn<ActivityUser>[] = [
    { key: 'name', head: 'کاربر', grow: true, cell: (u) => (
      <>
        <span className={MAIN}>{u.displayName}</span>
        <span className={SUB}>{`${roleLabel(u.role)} · ${scopesLabel(u.scopes, names, reports)}`}</span>
      </>) },
    { key: 'logins', head: 'ورود', cell: (u) => <span className={`${C13} text-body-ink`}>{toFa(u.logins)}</span> },
    { key: 'fails', head: 'ناموفق', cell: (u) =>
      <span className={`${C13} font-bold ${warn(u.failures > 0)}`}>{toFa(u.failures)}</span> },
    { key: 'sessions', head: 'نشست', cell: (u) => <span className={`${C125} text-body-ink`}>{toFa(u.sessions)}</span> },
    { key: 'active', head: 'زمان فعال', cell: (u) =>
      <span className={`${C125} font-bold text-ink`}>{durationFa(u.activeSeconds)}</span> },
    { key: 'seen', head: 'آخرین حضور', mobile: false, cell: (u) =>
      <span className={`${C12} text-muted`}>{whenFa(u.lastSeen)}</span> },
  ]
  return pending(q) ?? (
    <DataTable label="فعالیت هر کاربر" template="audit" rows={shown} rowKey={(u) => String(u.id)}
      onOpen={(u) => navigate(`/activity/users/${u.id}`)} rowLabel={(u) => u.displayName}
      empty={EMPTY} columns={columns} pager={pager}
      filters={<>
        <Filter label="دپارتمان" all="همهٔ دپارتمان‌ها" value={f.dept} onChange={set('dept')}
          values={Object.entries(names)} />
        <Filter label="نقش" all="همهٔ نقش‌ها" value={f.role} onChange={set('role')}
          values={same(users.map((u) => u.role)).map(([r]) => [r, roleLabel(r)])} />
        <Count n={rows.length} />
      </>} />
  )
}

function ReadTab() {
  const q = useActivityDepartments()
  const { f, set, paged } = useReport('read', { dept: '', seen: '' })
  const all = q.data ?? []
  const rows = all.filter((d) =>
    (!f.dept || d.code === f.dept) && (!f.seen || (f.seen === 'no') === (d.readers === 0)))
  const { shown, pager } = paged(rows)
  const columns: TemplatedColumn<DeptReadership>[] = [
    { key: 'name', head: 'دپارتمان', grow: true, cell: (d) => (
      <>
        <span className={MAIN}>{d.name}</span>
        {d.views === 0 && <span className={SUB}>هیچ‌کس بازش نکرده</span>}
      </>) },
    { key: 'readers', head: 'خوانندگان', cell: (d) =>
      <span className={`${C13} ${warn(d.readers === 0)}`}>{toFa(d.readers)}</span> },
    { key: 'views', head: 'بازدید', cell: (d) => <span className={`${C13} font-bold text-body-ink`}>{toFa(d.views)}</span> },
    { key: 'downloads', head: 'دریافت فایل', cell: (d) =>
      <span className={`${C125} text-body-ink`}>{toFa(d.downloads)}</span> },
    { key: 'top', head: 'بیشترین خوانده‌شده', cell: (d) =>
      <span className={`${C125} text-body-ink`}>{d.topProcess?.name ?? '—'}</span> },
    { key: 'last', head: 'آخرین بازشدن', cell: (d) => <span className={`${C12} text-muted`}>{whenFa(d.lastViewed)}</span> },
  ]
  return pending(q) ?? (
    <DataTable label="مشاهده دپارتمان" template="audit" rows={shown} rowKey={(d) => d.code}
      empty={EMPTY} columns={columns} pager={pager}
      filters={<>
        <Filter label="دپارتمان" all="همهٔ دپارتمان‌ها" value={f.dept} onChange={set('dept')}
          values={pairs(all.map((d) => [d.code, d.name]))} />
        <Filter label="خوانندگان" all="خوانده‌شده و نخوانده" value={f.seen} onChange={set('seen')}
          values={[['yes', 'خوانده‌شده'], ['no', 'اصلاً باز نشده']]} />
        <Count n={rows.length} />
      </>} />
  )
}

/** A policy switch is one decision for every non-editor (D16), not a change to
 *  one account — the design's own framing of it (Panel L4388). */
const EVERY_NON_EDITOR = 'همهٔ غیرادیتورها'
const subjectOf = (r: PermissionChange) =>
  r.action === 'visibility.policy.changed' ? EVERY_NON_EDITOR : r.subject ?? '—'

const FIELD: Record<string, string> = {
  'role.assigned': 'نقش', 'scope.granted': 'دپارتمان', 'scope.revoked': 'دپارتمان',
  'supervisor.changed': 'سرپرست', 'supervisor_flag.changed': 'پرچم سرپرست‌شدن',
  'user.disabled': 'وضعیت', 'user.enabled': 'وضعیت', 'user.created': 'ساخت حساب',
  'password.set_by_admin': 'گذرواژه',
}
function fieldLabel(r: PermissionChange): string {
  if (r.action === 'visibility.policy.changed')
    return `سیاست نمایش · ${POLICY_LABEL[r.subject ?? ''] ?? r.subject ?? ''}`
  return FIELD[r.action] ?? r.action
}
/** One side of «قبل ← بعد», in the words the rest of the panel uses for it. The
 *  server has already turned role and supervisor ids into names. */
function value(r: PermissionChange, v: PermissionChange['before'],
               names: Record<string, string>, reports: Record<string, string>): string {
  if (v === null) return '—'
  switch (r.action) {
    case 'role.assigned': case 'user.created': return roleLabel(String(v))
    case 'scope.granted': case 'scope.revoked': return scopeLabel(String(v), names, reports)
    case 'supervisor_flag.changed': return v ? 'دارد' : 'ندارد'
    case 'user.disabled': case 'user.enabled': return v ? 'غیرفعال' : 'فعال'
    case 'visibility.policy.changed': return v ? 'نمایش' : 'پنهان'
    default: return String(v)
  }
}

function PermTab() {
  const q = useActivityPermissions()
  const names = useNames()
  const reports = useReportNames()
  const { f, set, paged } = useReport('perm',
    { day: null as number | null, actor: '', subject: '', field: '' })
  // Keyed by the server's own order: one edit that grants two scopes writes two
  // events with the same second, actor and subject, so no field of a row is unique.
  const all = (q.data ?? []).map((r, i) => ({ ...r, i }))
  const rows = all.filter((r) =>
    (f.day === null || dayOf(r.at) === f.day) && (!f.actor || r.actor === f.actor)
    && (!f.subject || subjectOf(r) === f.subject) && (!f.field || fieldLabel(r) === f.field))
  const days: Record<string, number> = {}
  for (const r of all) days[dayOf(r.at)] = (days[dayOf(r.at)] ?? 0) + 1
  const { shown, pager } = paged(rows)
  const columns: TemplatedColumn<(typeof all)[number]>[] = [
    { key: 'at', head: 'تاریخ', grow: true, cell: (r) => <span className={MAIN}>{jalaliDay(dayOf(r.at))}</span> },
    { key: 'actor', head: 'کنندهٔ تغییر', cell: (r) => <span className={`${C13} text-body-ink`}>{r.actor}</span> },
    { key: 'subject', head: 'سوژه', cell: (r) => <span className={`${C13} font-bold text-body-ink`}>{subjectOf(r)}</span> },
    { key: 'field', head: 'فیلد', cell: (r) => <span className={`${C125} text-body-ink`}>{fieldLabel(r)}</span> },
    { key: 'change', head: 'قبل ← بعد', cell: (r) => (
      <span className={`${C125} font-bold text-ink`}>
        {`${value(r, r.before, names, reports)} ← ${value(r, r.after, names, reports)}`}
      </span>) },
    { key: 'end', head: '', mobile: false, cell: () => null },
  ]
  return pending(q) ?? (
    <DataTable label="تاریخچهٔ مجوزها" template="audit" rows={shown} rowKey={(r) => String(r.i)}
      empty={EMPTY} columns={columns} pager={pager}
      filters={<>
        <CalendarFilter days={days} value={f.day} onPick={set('day')} />
        <Filter label="کنندهٔ تغییر" all="همهٔ عاملان" value={f.actor} onChange={set('actor')}
          values={same(all.map((r) => r.actor))} />
        <Filter label="سوژه" all="همهٔ سوژه‌ها" value={f.subject} onChange={set('subject')}
          values={same(all.map(subjectOf))} />
        <Filter label="فیلد" all="همهٔ فیلدها" value={f.field} onChange={set('field')}
          values={same(all.map(fieldLabel))} />
        <Count n={rows.length} />
      </>} />
  )
}

/** Whole Iran days a comment has sat where it is — `daysSinceFa`'s number. */
const waited = (at: number) => dayOf(Date.now() / 1000) - dayOf(at)
/** Longest wait first; a comment waiting on nobody (settled) goes last. */
const byWait = (a: CommentFlow, b: CommentFlow) =>
  (a.waitingSince ?? Infinity) - (b.waitingSince ?? Infinity)

function FlowTab() {
  const q = useActivityComments()
  const names = useNames()
  const { f, set, paged } = useReport('flow', { dept: '', st: '' })
  const all = q.data ?? []
  const rows = all.filter((c) => (!f.dept || c.department === f.dept) && (!f.st || c.state === f.st))
    .sort(byWait)
  const { shown, pager } = paged(rows)
  const columns: TemplatedColumn<CommentFlow>[] = [
    { key: 'ref', head: 'کامنت', grow: true, cell: (c) => (
      <>
        <span dir="ltr" className={`${LTR} text-body font-bold text-ink`}>{c.ref}</span>
        <span className={SUB}>{hopLabel(c)}</span>
      </>) },
    { key: 'dept', head: 'دپارتمان', cell: (c) =>
      <span className={`${C13} text-body-ink`}>{names[c.department] ?? c.department}</span> },
    { key: 'author', head: 'نویسنده', cell: (c) => <span className={`${C13} font-bold text-body-ink`}>{c.author}</span> },
    { key: 'state', head: 'وضعیت', cell: (c) => <StatusPill {...COMMENT_STATE[c.state]} /> },
    { key: 'desk', head: 'روی میز', cell: (c) => <span className={`${C125} text-body-ink`}>{hopLabel(c)}</span> },
    { key: 'wait', head: 'انتظار', cell: (c) => {
      const late = c.state === 'awaiting' && c.waitingSince !== null && waited(c.waitingSince) >= 6
      return <span className={`${C12} ${late ? 'text-conflict font-bold' : 'text-muted'}`}>{daysSinceFa(c.waitingSince)}</span>
    } },
  ]
  return pending(q) ?? (
    <DataTable label="مسیر کامنت‌ها" template="audit" rows={shown} rowKey={(c) => c.ref}
      empty={EMPTY} columns={columns} pager={pager}
      filters={<>
        <Filter label="دپارتمان" all="همهٔ دپارتمان‌ها" value={f.dept} onChange={set('dept')}
          values={pairs(all.map((c) => [c.department, names[c.department] ?? c.department]))} />
        <Filter label="وضعیت" all="همهٔ وضعیت‌ها" value={f.st} onChange={set('st')}
          values={Object.entries(COMMENT_STATE).map(([k, v]) => [k, v.label])} />
        <Count n={rows.length} />
      </>} />
  )
}

function FailsTab() {
  const q = useActivityFailures()
  const { f, set, paged } = useReport('fails', { username: '', ip: '' })
  const all = q.data ?? []
  const rows = all.filter((r) => (!f.username || r.username === f.username) && (!f.ip || r.ip === f.ip))
  const { shown, pager } = paged(rows)
  const columns: TemplatedColumn<SignInFailure>[] = [
    { key: 'username', head: 'نام کاربری', grow: true, cell: (r) =>
      <span dir="ltr" className={`${LTR} text-body font-bold text-ink`}>{r.username}</span> },
    { key: 'ip', head: 'IP', cell: (r) => <span dir="ltr" className={`${LTR} text-fs-sm text-body-ink`}>{r.ip}</span> },
    { key: 'attempts', head: 'تلاش', cell: (r) =>
      <span className={`${C13} font-bold ${warn(r.attempts >= 5)}`}>{toFa(r.attempts)}</span> },
    { key: 'first', head: 'نخستین', cell: (r) => <span className={`${C125} text-body-ink`}>{whenFa(r.first)}</span> },
    { key: 'last', head: 'آخرین', cell: (r) => <span className={`${C125} text-body-ink`}>{whenFa(r.last)}</span> },
    { key: 'end', head: '', mobile: false, cell: () => null },
  ]
  return pending(q) ?? (
    <DataTable label="ورود ناموفق" template="audit" rows={shown} rowKey={(r) => `${r.username}|${r.ip}`}
      empty={EMPTY} columns={columns} pager={pager}
      filters={<>
        <Filter label="نام کاربری" all="همهٔ نام‌های کاربری" value={f.username} onChange={set('username')}
          values={same(all.map((r) => r.username))} searchable />
        <Filter label="IP" all="همهٔ IPها" value={f.ip} onChange={set('ip')}
          values={same(all.map((r) => r.ip))} searchable />
        <Count n={rows.length} />
      </>} />
  )
}
