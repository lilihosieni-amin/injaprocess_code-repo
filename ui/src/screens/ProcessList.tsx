import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfirmations, useDepartments, useProcesses } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { deriveTag, toFa } from '../lib/format'
import { countActivities } from '../lib/counts'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { IconTile } from '../ui/IconTile'
import { SearchField } from '../ui/SearchField'
import { useSurface } from '../ui/surface'
import { isTopDismissible, popDismissible, pushDismissible } from '../ui/dismissibleStack'
import { CreateProcessModal } from '../write/CreateProcessModal'
import { DeleteProcessConfirm } from '../write/DeleteProcessConfirm'
import { ReorderModal } from '../write/ReorderModal'
import { ExportMenu } from '../write/ExportMenu'
import { refusalStatus } from '../api/client'
import { RefusalScreen } from './Refusal'
import type { Process } from '../api/types'

/**
 * §6.2's chip metrics, shared by the three chips the meta row draws.
 *
 * `--fs-tag` exists for exactly this — tokens.css names it "process-row id
 * badge, tag chip" — and the pill radius, the 8px inline padding and the 2px
 * block padding are the design's own `padding:2px 8px; border-radius:999px`.
 *
 * **Not `StatusPill`.** That primitive is §5.2's status pill: `px-3 py-1` at
 * `--fs-caption` behind `--radius-chip`, which is a bigger chip at a bigger
 * radius, and its five tones are `ok | warn | danger | neutral | info` — it has
 * no violet, which is the tone four of this screen's five tags take. Reaching
 * for it here would have meant either repainting a shared primitive for one
 * screen or drawing «مستند» in a colour the design does not give it. Recorded
 * in this task's report as a ledger row rather than settled here.
 */
const CHIP = 'inline-flex items-center gap-s1 text-fs-tag font-semibold px-s4 py-half rounded-pill'

/**
 * The four tags `deriveTag` derives, by the role each one carries (R8). A
 * plain process draws none at all — owner ruling R28, ledger L-12.
 *
 * Token names, never literals: the four hex pairs this map used to hold were
 * `--tile-warn`/`--warn`, `--tile-c`/`--conflict`, `--tile-v`/`--violet` and
 * `--tile-dead`/`--text-muted` written out, which is a second place for four
 * values the theme already keeps.
 */
const TAG_TONE: Record<string, string> = {
  sub: 'bg-tile-warn text-warn',            // --role-awaiting
  conflict: 'bg-tile-c text-conflict',      // --role-danger
  kpi: 'bg-tile-v text-violet',             // --role-primary
  tombstone: 'bg-tile-dead text-muted',     // --role-dead
}

interface Act { key: string; label: string; run: () => void }

/**
 * §6.2 — the `36×36` `⋯` that REPLACES the action bar at ≤760px.
 *
 * Replaces, not supplements: the bar is `display:none` below the breakpoint and
 * this is `display:none` above it, so exactly one of the two is on screen at
 * any width and every act the bar offers has to be in here as well. The reader
 * deliverable's own defect #2 is the other spelling of that — a `⋯` that is
 * `display:none` at every width, so the acts simply stop existing on a phone.
 *
 * `⋯` (U+22EF) is the glyph the deliverable draws, as a character and not an
 * SVG: §5.2's iconography sanctions three non-SVG glyphs and this is one.
 *
 * The drawn box is the design's 36 and F11's 44px target is a transparent
 * `::before` around it (36 + 2×4 = 44) — the plan's one rule for every rung of
 * the 30/32/34/36/40/42 ladder, never inflate the control itself.
 *
 * **Not `<Menu/>`.** That component takes `{ label, items }` and nothing else:
 * no class, no children, no `data-` attribute, its trigger is a 44×44
 * `min-h-touch min-w-touch` box, and it renders `label` as the trigger's own
 * TEXT — so the design's 36px `⋯` would have come out as a 44px box with the
 * words «کارهای بیشتر» printed in it. The dismissal behaviour is not forked,
 * though: this shares `dismissibleStack`, so a `⋯` opened inside a dialog still
 * answers Escape before the dialog does (I7).
 */
function OverflowMenu({ actions }: { actions: Act[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const identity = useRef(Symbol('plist-more')).current

  useEffect(() => {
    if (!open) return
    pushDismissible(identity)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isTopDismissible(identity)) setOpen(false)
    }
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      popDismissible(identity)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, identity])

  return (
    <div ref={box} data-r-plistmore className="hidden max760:inline-flex relative ms-auto flex-none">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="کارهای بیشتر"
        title="کارهای بیشتر"
        onClick={() => setOpen((v) => !v)}
        className={
          'relative before:absolute before:content-[""] before:-inset-[4px] '
          + 'inline-flex items-center justify-center flex-none w-menu-more h-menu-more '
          + 'rounded-control border-hairline border-line bg-tile-v2 text-violet '
          + 'text-fs-h5 font-bold cursor-pointer'
        }
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full end-0 mt-s3 min-w-menu z-dropdown flex flex-col gap-s1 bg-card border border-border-card rounded-doc shadow-pop p-s4"
        >
          {actions.map((a) => (
            <button
              key={a.key}
              role="menuitem"
              type="button"
              onClick={() => { a.run(); setOpen(false) }}
              className="w-full min-h-touch p-s6 rounded-input border-0 bg-transparent cursor-pointer text-start text-fs-menu font-semibold text-ink hover:bg-tile-v2"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One department's process list, on both of R3's surfaces.
 *
 * Three defects closed here, none of them about colour.
 *
 * **The LTR box (O1).** This root used to pin the direction as an ATTRIBUTE —
 * `ltr` on the region, because §8 wants the scrollbar on the right, and `rtl`
 * back on exactly one child. Every dialog that mounts beside that child
 * therefore stayed left-to-right, which is the workaround five files under
 * `src/write/` each carry a comment about. The same intent is now two lines in
 * `base.css` (`[data-r-pad]{direction:ltr}` and `[data-r-pad] > *{direction:
 * rtl}`), where the rule catches all of them. This file pins the direction
 * nowhere, in code OR in a comment, and `ProcessList.test.tsx` scans the source
 * to hold it to that — which is why the attribute is not spelled here either.
 *
 * **The 44px title line.** `ConfirmMark` put a `min-h-touch` `Button` in the
 * row's title line, so a row whose type is 17px was 44px tall. §6.2 gives the
 * row a confirmation *chip* in the meta line and no act; the act lives where
 * the design puts it, on the summary header (§6.3) and the flow bar (§6.5).
 *
 * **The missing ≤760 pass.** The screen had none. §6.16's block rewrites this
 * screen at three places — the pad's gutter, the header stack, and the row,
 * which goes to a column and drops its meta line and position numeral — and
 * §6.2 replaces the whole action bar with a `36×36` `⋯`.
 *
 * The two surfaces differ in composition, not only in scale (R3, and R5):
 * `Inja Reader.dc.html:196` draws a centred title over a centred lead and one
 * centred «اطلاعات دپارتمان» button, with no department tile and no action bar
 * — a reader may not create, reorder, delete or export, so those are ABSENT
 * rather than drawn and inert. Everything that is only a scale difference stays
 * in the theme: `text-role-title` is 22px in the panel and 30px in the reader
 * because `--role-fs-title` says so, so the H1 branches on alignment alone.
 */
export function ProcessList() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const reader = useSurface() === 'reader'
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [delTarget, setDelTarget] = useState<{ pid: string; name: string } | null>(null)
  const { data: procs = [], error } = useProcesses(code)
  const { data: depts = [] } = useDepartments()
  const dept = depts.find((d) => d.code === code)
  // Cosmetic only: PUT/POST/DELETE on this department re-derive `edit` from the
  // session row themselves and refuse regardless of what is drawn here. Asked
  // about THIS department rather than about the person, so a head of another
  // department is not offered controls this one's endpoints would refuse.
  const can = useCan(useSession().data)
  const mayEdit = can('edit', `dept:${code}`)
  // Asked about THIS department for the same reason, and used to gate the query
  // as well as the mark: GET /api/confirmations 403s anyone without `confirm`
  // here, so asking anyway would put a refusal in the console on every load.
  const mayConfirm = can('confirm', `dept:${code}`)
  const { data: marks = [] } = useConfirmations(code, { enabled: mayConfirm })
  // `mark`, not `m`: `m` used to be this department's tile metadata, which
  // `IconTile` now reads for itself.
  const markOf = new Map(marks.map((mark) => [mark.target, mark]))

  const query = q.trim()
  const list = procs.filter((p) => !query || p.name.includes(query) || p.id.includes(query))
  const activityCount = (p: Process) => countActivities(p.nodes)

  // Positions come from the full ordered list, not the filtered one, so searching
  // never renumbers. Tombstones hold no position (ARD §4.6).
  const orderPos = new Map<string, number>()
  procs.filter((p) => !p.tombstoned).forEach((p, i) => orderPos.set(p.id, i + 1))

  // Preserve the list's scroll position across visiting a process and coming back.
  const scrollRef = useRef<HTMLDivElement>(null)
  const restored = useRef(false)
  const scrollKey = `plist-scroll-${code}`
  useEffect(() => {
    const el = scrollRef.current
    if (el && procs.length && !restored.current) {
      el.scrollTop = Number(sessionStorage.getItem(scrollKey) ?? 0)
      restored.current = true
    }
  }, [procs, scrollKey])

  // A department outside this person's scope answers 404 for its process list.
  // Placed after every hook above, so the early return never changes hook order.
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />

  // R5 — the overflow is the action bar, not a superset of it, so both are
  // built from one list. An act a caller may not perform is in neither.
  const actions: Act[] = [
    ...(mayEdit ? [{ key: 'order', label: 'ترتیب فرآیندها', run: () => setReordering(true) }] : []),
    { key: 'overview', label: 'اطلاعات دپارتمان', run: () => nav(`/departments/${code}/overview`) },
    ...(mayEdit ? [{ key: 'new', label: 'فرآیند جدید', run: () => setCreating(true) }] : []),
  ]

  return (
    <div
      data-screen={reader ? 'processListReader' : 'processList'}
      data-r-pad
      ref={scrollRef}
      onScroll={(e) => sessionStorage.setItem(scrollKey, String(e.currentTarget.scrollTop))}
      // §6.16 gives every `[data-r-pad]` the same `18px 14px` at ≤760, so the
      // mobile pair is written once for both surfaces and only the desktop set
      // branches. The variant beats the utilities beside it because Tailwind
      // sorts every variant after every bare utility in the same layer — the
      // class attribute's own order decides nothing.
      // §6.0 — the shell owns the violet field, and this root repaints it
      // because the gate reads `background-color` off THIS element with
      // `getComputedStyle`, which does not inherit: a root that painted nothing
      // would compute `rgba(0, 0, 0, 0)` however violet the shell behind it is.
      className={`flex-1 overflow-auto bg-ink ${reader
        ? 'pt-screen-y px-reader-x pb-reader-bottom'   // 30 / 24 / 60
        : 'py-screen-y px-screen-x'                    // 30 / 40
      } max760:px-s7 max760:py-s9`}
    >
      <div data-col className={`${reader ? 'max-w-reader' : 'max-w-list'} mx-auto`}>
        {reader ? (
          <div className="mb-s8">
            <h1 data-h1 className="font-extrabold text-role-title text-role-title-on-field text-center">
              دپارتمان {dept?.name ?? ''}
            </h1>
            {/* The reader's own lead, not the panel's: the panel's sentence
                offers «کارت خلاصه», and R5 says a screen does not advertise a
                surface its reader cannot reach. */}
            <p data-body className="text-role-dense text-role-subtitle-on-field mt-s5 leading-sub text-center">
              روی هر فرآیند بزنید تا گام‌هایش را ببینید.
            </p>
            <div className="flex justify-center mt-s10">
              <Button variant="ghost" onClick={() => nav(`/departments/${code}/overview`)}
                className="px-s9 text-fs-menu">اطلاعات دپارتمان</Button>
            </div>
          </div>
        ) : (
          <div
            data-r-stack
            className="flex items-end justify-between gap-s8 mb-s10 max760:flex-col max760:items-stretch max760:gap-s6"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-s6">
                <IconTile dept={code} />
                <h1 data-h1 className="font-extrabold text-role-title text-role-title-on-field">
                  دپارتمان {dept?.name ?? ''}
                </h1>
                {/* §6.2 puts the mobile ⋯ in the TITLE row, not in the bar it
                    replaces — the bar is gone at that width. */}
                <OverflowMenu actions={actions} />
              </div>
              <p data-body className="text-role-dense text-role-subtitle-on-field mt-s4 leading-normal">
                {toFa(dept?.count ?? procs.length)} فرآیند مستندشده · برای مشاهدهٔ کارت خلاصه و فلوچارت روی هر فرآیند بزنید.
              </p>
            </div>
            <div data-r-plistactions className="flex items-center gap-s5 flex-none max760:hidden">
              {mayEdit && (
                <Button variant="ghost" onClick={() => setReordering(true)}
                  className="px-s8 py-s6 text-fs-sm">ترتیب فرآیندها</Button>
              )}
              <Button variant="ghost" onClick={() => nav(`/departments/${code}/overview`)}
                className="px-s8 py-s6 text-fs-sm">اطلاعات دپارتمان</Button>
              {mayEdit && (
                <Button variant="coral" onClick={() => setCreating(true)}
                  className="px-s8 py-s6 text-fs-sm">فرآیند جدید</Button>
              )}
              <ExportMenu department={code} />
            </div>
          </div>
        )}

        <div className="mb-s8">
          <SearchField label="جست‌وجوی فرآیند" value={q} onChange={setQ}
            placeholder="جست‌وجو براساس نام یا شناسهٔ فرآیند…" />
        </div>

        <div className="flex flex-col gap-s6">
          {list.length === 0 && (
            // Two states, two sentences (§6.2). The reader deliverable collapses
            // them into one and this app copied it: an empty department was told
            // its search had missed.
            <Card className="py-empty-y px-empty-x text-center text-fs-sm text-faint">
              {query ? 'فرآیندی با این نام پیدا نشد' : 'فرآیندی برای این دپارتمان ثبت نشده است.'}
            </Card>
          )}
          {list.map((p) => {
            const tag = deriveTag(p)
            const tombstoned = !!p.tombstoned
            const mark = markOf.get(p.id)
            return (
              <Card
                key={p.id}
                data-card
                data-r-prow
                hoverLift
                radius="card"
                padding="card"
                className={`flex items-center gap-s8 max760:flex-col max760:items-start max760:gap-s6 max760:p-s7 ${tombstoned ? 'opacity-60' : ''}`}
              >
                <div data-r-pmain className="flex-1 min-w-0 max760:w-full">
                  <div data-testid={`title-${p.id}`} className="flex items-center gap-s5 min-w-0">
                    {orderPos.has(p.id) && (
                      <span data-testid={`pos-${p.id}`}
                        className="font-extrabold text-fs-body text-violet min-w-s9 text-center flex-none max760:hidden">
                        {toFa(orderPos.get(p.id)!)}
                      </span>
                    )}
                    <span className="font-bold text-fs-h4 text-ink truncate">{p.name}</span>
                  </div>
                  <div data-r-pmeta data-testid={`meta-${p.id}`}
                    className="flex items-center gap-s4 flex-wrap mt-s4 ps-s11 max760:hidden">
                    <IdBadge>{p.id}</IdBadge>
                    {tag && <span className={`${CHIP} ${TAG_TONE[tag.kind]}`}>{tag.label}</span>}
                    {mark && (
                      <span className={`${CHIP} ${mark.confirmed ? 'bg-tile-ok text-green' : 'bg-tile-warn text-warn'}`}>
                        {mark.confirmed ? 'تأیید شده' : 'تأیید نشده'}
                      </span>
                    )}
                    {/* Not one of §6.2's three chips: the design has no activity
                        column and no activity chip, and dropping the number
                        outright would take information no other screen carries
                        at a glance. It is drawn on this app's own count-chip
                        recipe — the one `Departments.tsx` already uses — rather
                        than invented a third time. */}
                    <span className="inline-flex items-center gap-s2 text-fs-xs font-semibold text-dialog-ghost bg-tile-v3 px-s5 py-s1 rounded-pill">
                      <span data-testid={`activity-count-${p.id}`}>{toFa(activityCount(p))}</span> فعالیت
                    </span>
                    {tombstoned && (p.superseded_by ?? []).map((h) => (
                      <span key={h} className="text-fs-xs text-muted">
                        جانشین:{' '}
                        {/* R5 — an heir outside this department answers 404 for
                            anyone scoped here, so it is stated, not offered. */}
                        {h.replace(/-[^-]*$/, '') === code
                          ? <Link to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
                          : <span className="font-mono text-violet">{h}</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <div data-r-pactions className="flex items-center gap-s4 flex-none max760:self-stretch max760:w-full">
                  <Button variant="ghost" onClick={() => nav(`/processes/${p.id}`)}
                    className="px-s7 py-s4 text-fs-sm2 max760:flex-1">اطلاعات کلی</Button>
                  <Button variant="violet" onClick={() => nav(`/processes/${p.id}/flow`)}
                    className="px-s7 py-s4 text-fs-sm2 max760:flex-1">فلوچارت</Button>
                  {mayEdit && (
                    // The design's 34px square, with F11's target grown around
                    // it (34 + 2×5 = 44). NOT `<Button variant="danger">`:
                    // `Button`'s own BASE carries `min-h-touch min-w-touch`, and
                    // a min- beats a width whatever the emitted order is, so a
                    // `w-tool h-tool` passed through it paints 44×44 and the
                    // class that says 34 is never drawn.
                    <button
                      type="button"
                      onClick={() => setDelTarget({ pid: p.id, name: p.name })}
                      title={tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند'}
                      aria-label={tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند'}
                      className={
                        'relative before:absolute before:content-[""] before:-inset-[5px] '
                        + 'inline-flex items-center justify-center flex-none w-tool h-tool '
                        + 'rounded-input border-hairline border-border-danger bg-tile-c2 '
                        + 'text-conflict cursor-pointer'
                      }
                    >
                      <Icon name="trash" px={16} />
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
      {creating && <CreateProcessModal department={code} departmentName={dept?.name ?? ''} onClose={() => setCreating(false)} />}
      {reordering && <ReorderModal department={code} departmentName={dept?.name ?? ''} processes={procs} onClose={() => setReordering(false)} />}
      {delTarget && <DeleteProcessConfirm pid={delTarget.pid} name={delTarget.name} onClose={() => setDelTarget(null)} />}
    </div>
  )
}
