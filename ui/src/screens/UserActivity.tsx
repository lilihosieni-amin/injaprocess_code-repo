import { useParams } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useDepartments, useReportNames } from '../api/hooks'
import {
  EVENTS_PER_PAGE, useUserActivity,
  type ActivityEvent, type ActivitySession, type EventFilters, type EventKind,
} from '../api/activity'
import { refusalStatus } from '../api/client'
import { roleLabel } from '../lib/roles'
import { reportLabel, scopesLabel } from '../lib/scopes'
import { clockFa, dayOf, durationFa, jalaliDay, toFa, whenFa } from '../lib/format'
import { eventLabel, uaLabel } from '../lib/events'
import { Card } from '../ui/Card'
import { DataTable, type TemplatedColumn } from '../ui/DataTable'
import { Dropdown } from '../ui/Dropdown'
import { Pager } from '../ui/Pager'
import { StatTile } from '../ui/StatTile'
import { StatusPill } from '../ui/StatusPill'
import { CalendarFilter } from '../ui/JalaliCalendar'
import { LoadFailedScreen, ScreenSkeleton } from '../ui/states'
import { RefusalScreen } from './Refusal'
import { useHistoryState } from '../shell/historyState'

/** The design's own filter wording (Panel L4538–4539). */
const KINDS: { value: '' | EventKind; label: string }[] = [
  { value: '', label: 'همهٔ دسته‌ها' }, { value: 'access', label: 'دسترسی' },
  { value: 'content', label: 'محتوا' }, { value: 'governance', label: 'راهبری' },
]
const OUTCOMES = [{ value: '', label: 'موفق و ناموفق' }, { value: 'ok', label: 'موفق' },
                  { value: 'fail', label: 'ناموفق' }]
/** The event's dot (Panel L4551): a failure is red whatever its kind; otherwise
 *  access green, content muted, governance violet. Painted `bg-current` under a
 *  text colour, as ReaderInbox paints its dots — `--text-muted` is a text token
 *  and `bg-muted` is on theme.test.ts's never-painted ledger. */
const DOT: Record<EventKind, string> = { access: 'text-green', content: 'text-muted', governance: 'text-violet' }
/** «منقضی شد» is the design's (Panel L3768); it draws no live or revoked
 *  session, so those two are proposals. `revoked` covers a sign-out and an
 *  administrator's revocation alike, which is why it is not the design's
 *  «پایان با خروج». */
const SESSION_STATE: Record<ActivitySession['state'], string> = {
  active: 'فعال', revoked: 'ابطال‌شده', expired: 'منقضی شد',
}
/** «۱۴۰۵/۰۵/۱۴ · ۲۰:۰۵» — the design's session times (Panel L3767): a session
 *  from last month still needs its hour, which `whenFa` drops past yesterday. */
const stamp = (at: number) => `${jalaliDay(dayOf(at))} · ${clockFa(at)}`

/** What an event names, in the words the rest of the panel uses. A process id
 *  the caller may not see arrives as `null` (the server's `visible_target`) and
 *  reads «—»; a department code reads as its name; anything else — a process
 *  id, a username, a `CMT-n` — is quoted as stored. */
function target(e: ActivityEvent, names: Record<string, string>,
                reports: Record<string, string>): string {
  if (!e.target) return '—'
  const m = /^dept:([a-z]+)\/report:([a-z]+)$/.exec(e.target)
  if (m) return `${names[m[1]] ?? m[1]} · ${reportLabel(m[2], reports) ?? m[2]}`
  return names[e.target] ?? e.target
}

/**
 * One person's activity record (D83), Panel L2468–2602: their four counts, their
 * events a page at a time, and their sessions.
 *
 * **`*` only, decided before anything is asked.** The page names an account, so
 * the server answers it 404 below `*` (D44) — and a scoped caller is drawn that
 * 404 here without the request being sent (NFR-12), exactly as the activity
 * screen withholds its per-user tab.
 *
 * **The events are filtered and paged on the server**, unlike the activity
 * screen's reports: one person's record grows with every page they open, so the
 * day, kind, outcome and page go on the wire and only six rows come back. The
 * filters and the page live on the history entry, so they are still there on
 * the way back from anywhere this page leads.
 */
export function UserActivity() {
  const { id = '' } = useParams()
  const session = useSession().data
  const star = useCan(session)('view_audit', '*')
  const [f, setF] = useHistoryState<EventFilters>(`activity:u${id}:f`, { page: 1 })
  const q = useUserActivity(id, f, !!session && star)
  const names = Object.fromEntries((useDepartments().data ?? []).map((d) => [d.code, d.name]))
  const reports = useReportNames()

  // Hooks first, then the early returns — Users.tsx's order, for its reason.
  if (!session) return <div className="flex-1 bg-ink" />
  if (!star) return <RefusalScreen status={404} />
  const refused = refusalStatus(q.error)
  if (refused) return <RefusalScreen status={refused} />
  // The whole page is this one read, so its failure is the page's — as it is
  // on UserDetail — and not `ErrorState` inside a column that has nothing else.
  if (q.error) {
    return <LoadFailedScreen message="تاریخچهٔ فعالیت بارگذاری نشد." error={q.error}
      onRetry={() => { void q.refetch() }} />
  }
  if (!q.data) return <ScreenSkeleton column="audit" cards={3} />
  const { user, rows, total, days, sessions } = q.data
  const set = (patch: Partial<EventFilters>) => setF({ ...f, ...patch, page: 1 })
  const pages = Math.max(1, Math.ceil(total / EVENTS_PER_PAGE))
  const from = (f.page - 1) * EVENTS_PER_PAGE + 1
  // The design's cell type, column by column (L2551–2562).
  const columns: TemplatedColumn<ActivityEvent>[] = [
    { key: 'at', head: 'تاریخ', cell: (e) => (
      <>
        <span className="block truncate text-fs-sm2 font-semibold text-ink">{jalaliDay(dayOf(e.at))}</span>
        <span className="block truncate mt-s1 text-fs-xxs text-faint">{clockFa(e.at)}</span>
      </>) },
    { key: 'action', head: 'رویداد', grow: true, cell: (e) => (
      // 8px dot (`--space-4`, StatTile's own dot); the design's 9px gap is
      // off the ladder and every 9px token is another component's role, so 8.
      <span className="flex items-center gap-s4 min-w-0">
        <span aria-hidden
          className={`w-s4 h-s4 rounded-round flex-none bg-current ${e.outcome === 'ok' ? DOT[e.kind] : 'text-conflict'}`} />
        <span data-event className="truncate text-fs-sm font-bold text-ink">{eventLabel(e.action)}</span>
      </span>) },
    { key: 'target', head: 'هدف', cell: (e) =>
      <span className="block truncate text-fs-sm2 text-body-ink">{target(e, names, reports)}</span> },
    { key: 'ip', head: 'IP', mobile: false, cell: (e) =>
      <span dir="ltr" className="inline-block max-w-full truncate font-mono text-fs-xs text-body-ink">
        {e.ip ? toFa(e.ip) : '—'}</span> },
    { key: 'ua', head: 'دستگاه', mobile: false, cell: (e) =>
      <span className="block truncate text-fs-caption text-muted">{uaLabel(e.userAgent)}</span> },
    { key: 'out', head: 'نتیجه', cell: (e) =>
      <StatusPill tone={e.outcome === 'ok' ? 'ok' : 'danger'} label={e.outcome === 'ok' ? 'موفق' : 'ناموفق'} /> },
  ]
  const filtered = f.day !== undefined || !!f.kind || !!f.outcome
  return (
    <div data-screen="user-activity"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      {/* The design's own 980px column (L2471), as on the activity screen. */}
      <div data-col className="max-w-audit mx-auto">
        <h1 data-h1 className="text-title font-extrabold text-role-title-on-field">
          {`تاریخچهٔ فعالیت ${user.displayName}`}
        </h1>
        <p className="mt-s4 text-fs-sm text-role-subtitle-on-field leading-normal">
          {`${roleLabel(user.role)} · ${scopesLabel(user.scopes, names, reports)} · آخرین حضور: ${whenFa(user.lastSeen)}`}
        </p>
        {/* L2475 — `[data-r-2col]`, one column at ≤760 (Panel L48). The design
            leaves each tile's text at the start edge; StatTile's compact skin
            centres it, as it does on the activity screen, and is not forked. */}
        <div data-r-2col className="grid grid-cols-4 gap-s6 my-stat-grid max760:grid-cols-1">
          <StatTile skin="compact" tone="violet" value={user.logins} label="ورود موفق" />
          <StatTile skin="compact" tone={user.failures ? 'conflict' : 'muted'} value={user.failures}
            label="ورود ناموفق" />
          <StatTile skin="compact" tone="ink" value={user.sessions} label="نشست" />
          <StatTile skin="compact" tone="ok" value={durationFa(user.activeSeconds)} label="زمان فعال" />
        </div>
        <DataTable label="رویدادهای کاربر" template="activity" headFill rows={rows}
          rowKey={(e) => String(e.id)} empty="رویدادی از این دسته ثبت نشده است" columns={columns}
          pager={total > EVENTS_PER_PAGE ? (
            <Pager from={from} to={Math.min(total, from + rows.length - 1)} count={total}
              page={f.page} pages={pages} onPage={(page) => setF({ ...f, page })} />
          ) : undefined}
          filters={<>
            <CalendarFilter days={days} value={f.day ?? null}
              onPick={(day) => set({ day: day ?? undefined })} />
            <Dropdown label="دسته" hideLabel placeholder="همهٔ دسته‌ها" value={f.kind ?? ''}
              onChange={(v) => set({ kind: (v || undefined) as EventKind | undefined })} options={KINDS} />
            <Dropdown label="نتیجه" hideLabel placeholder="موفق و ناموفق" value={f.outcome ?? ''}
              onChange={(v) => set({ outcome: (v || undefined) as 'ok' | 'fail' | undefined })}
              options={OUTCOMES} />
            {/* R5 — absent until there is something to clear. The design paints
                it `--conflict` (L2531); L-06 ruled that variant out — clearing
                a filter destroys nothing — so it takes UsersFilters' violet. */}
            {filtered && (
              <button type="button" onClick={() => setF({ page: 1 })}
                className="max760:self-start border-0 bg-transparent p-s1 text-fs-sm2 font-bold text-violet-mid underline underline-offset-4 cursor-pointer min-h-touch">
                پاک کردن فیلترها
              </button>
            )}
          </>} />
        {/* L2581–2597: a filled header bar, then one row per session. */}
        <Card radius="doc" className="overflow-hidden mt-s8">
          <div className="px-s9 py-s7 bg-tile-v4 border-b border-border-current text-fs-xs font-bold text-muted">
            نشست‌های این کاربر
          </div>
          {sessions.length === 0 ? (
            <p className="m-0 py-s12 px-empty-x text-center text-fs-sm text-faint">نشستی ثبت نشده است</p>
          ) : sessions.map((s) => (
            <div key={s.session}
              className="flex items-center gap-s7 px-s9 py-table-row-y border-b border-line-row max760:flex-col max760:items-stretch max760:gap-s6">
              <span dir="ltr" className="flex-none text-start font-mono text-fs-xs text-violet">{s.session}</span>
              <div className="flex-1 min-w-0">
                <div className="text-fs-sm2 text-body-ink">{`${stamp(s.issuedAt)} ← ${stamp(s.lastSeen)}`}</div>
                <div className="mt-s1 text-fs-xxs text-faint">{`${uaLabel(s.userAgent)} · ${toFa(s.ip || '—')}`}</div>
              </div>
              <span className="flex-none text-fs-sm font-bold text-green">{durationFa(s.activeSeconds)}</span>
              <span className="flex-none text-fs-xs text-muted">{SESSION_STATE[s.state]}</span>
            </div>
          ))}
        </Card>
        <p className="mt-s7 text-fs-caption text-role-subtitle-on-field leading-loose [text-wrap:pretty]">
          دفتر رویداد فقط زمان، عامل، نشست، رویداد، هدف، IP، دستگاه و نتیجه را نگه می‌دارد؛ چیزی بیش از این ثبت نمی‌شود. زمان فعال هر نشست از ضربان last_seen انباشته می‌شود، نه از فاصلهٔ ورود تا خروج.
        </p>
      </div>
    </div>
  )
}
