import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfirmations, useDepartments, useProcesses } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { deriveTag, toFa } from '../lib/format'
import { hasPublishedDetail } from '../lib/published'
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
import { ExportMenu, useExportActions } from '../write/ExportMenu'
import { refusalStatus } from '../api/client'
import { ScreenSkeleton } from '../ui/states'
import { RefusalScreen } from './Refusal'

/**
 * The row menu's glyph — `Inja Panel.dc.html:356`, three filled dots stacked.
 *
 * A path through `Icon`'s `d` (§5.1.2) rather than three `<circle>`s: `Icon`
 * draws one `<path>` and the design's own r=1.8 dots are what a 3.2-wide round
 * cap on a zero-length segment paints. `ExportMenu` already draws the
 * horizontal spelling of this from the same recipe.
 */
const KEBAB = 'M12 5h.01M12 12h.01M12 19h.01'

/**
 * §6.2's chip metrics, shared by the three chips the meta row draws.
 *
 * `--fs-tag` exists for exactly this — tokens.css names it "process-row id
 * badge, tag chip" — and the pill radius, the 8px inline padding and the 2px
 * block padding are the design's own `padding:2px 8px; border-radius:999px`.
 *
 * **Not `StatusPill`.** That primitive is §5.2's status pill: 12px by 4px at
 * `--fs-caption` behind `--radius-chip`, which is a bigger chip at a bigger
 * radius, and its five tones are `ok | warn | danger | neutral | info` — it has
 * no violet, which is the tone four of this screen's five tags take. Reaching
 * for it here would have meant either repainting a shared primitive for one
 * screen or drawing «مستند» in a colour the design does not give it. Recorded
 * in this task's report as a ledger row rather than settled here.
 */
const CHIP = 'inline-flex items-center gap-s1 text-fs-tag font-semibold px-s4 py-half rounded-pill'

/**
 * The three tags `deriveTag` derives, by the role each one carries (R8). A
 * plain process draws none at all — owner ruling R28, ledger L-12.
 *
 * Token names, never literals: the hex pairs this map used to hold were
 * `--tile-warn`/`--warn`, `--tile-c`/`--conflict`, `--tile-v`/`--violet` and
 * `--tile-dead`/`--text-muted` written out, which is a second place for values
 * the theme already keeps.
 *
 * **`sub` moved from amber to violet, and `kpi` is gone** — one owner ruling,
 * two consequences. The card of a sub-process is now `--tile-warn` itself, so
 * an amber chip on it would be a chip the colour of the thing it sits on; and
 * the same message asks for the confirmation chip to stop sharing the
 * sub-process's colour, which amber was the reason for. Violet is not a
 * substitution of convenience — `Inja Panel.dc.html:389` draws «زیرفرآیند» in
 * exactly `--violet` on `--tile-v` on the summary screen, so this is the row
 * adopting the chip the design already gives that word elsewhere. The pair is
 * free because `kpi`, which held it, is the tag the same ruling deleted.
 *
 * Every one of the five chips this row can draw is now a different pair:
 * violet (sub) · coral (conflict) · grey (tombstone) · green (confirmed) ·
 * solid amber (unconfirmed, below).
 */
const TAG_TONE: Record<string, string> = {
  sub: 'bg-tile-v text-violet',             // --role-primary
  conflict: 'bg-tile-c text-conflict',      // --role-danger
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
function OverflowMenu({ actions, label, className, children, glyph, hook, onOpenChange }: {
  actions: Act[]
  /** The trigger's accessible name — and its `title`. */
  label: string
  /** Where and at what width the trigger is drawn. The two call sites disagree
   *  about both: the header's ⋯ REPLACES the action bar below 760 and is
   *  `display:none` above it, while the row's ⋮ is drawn at every width. */
  className: string
  /** The trigger's own box, so a 36px `⋯` and a 34px `⋮` stay two drawings. */
  glyph: string
  /** §6.16 addresses its mobile rules to `data-r-` attributes, and the two call
   *  sites are two different elements to it. Named rather than spread: React
   *  passes `data-*` through on an intrinsic element and not through a component
   *  prop, and a `Record<string,string>` here would let any attribute in. */
  hook?: 'plistmore' | 'prowmenu'
  /** Told when the popover opens and closes, for a caller whose own box has to
   *  move out of the way — see `menuRow` in `ProcessList`. The state stays here
   *  because dismissal is this component's job (Escape, outside press, the
   *  shared stack); this only reports it. */
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const identity = useRef(Symbol('plist-more')).current

  /**
   * Reported from an effect and not from the press, so the two ways this closes
   * that are NOT a press — Escape and an outside click — are reported too.
   *
   * **On the TRANSITION only.** `onOpenChange` is an inline arrow at the call
   * site, so a bare effect keyed on it re-runs every render — and with one of
   * these per row, every closed menu would then report `false` immediately
   * after the open one reported `true`, wiping it. The ref is what makes the
   * effect fire on a change of `open` and on nothing else.
   */
  const reported = useRef(open)
  useEffect(() => {
    if (reported.current === open) return
    reported.current = open
    onOpenChange?.(open)
  }, [open, onOpenChange])

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
    <div
      ref={box}
      className={className}
      data-r-plistmore={hook === 'plistmore' ? '' : undefined}
      data-r-prowmenu={hook === 'prowmenu' ? '' : undefined}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={glyph}
      >
        {children}
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
  /**
   * Which row has its ⋮ open — and it is here rather than inside `OverflowMenu`
   * because of what the CARD does on hover.
   *
   * §6.2 lifts a row 2px under the pointer (`hoverLift` → `translateY(-2px)`),
   * and a `transform` other than `none` makes an element a **stacking
   * context**. Opening the ⋮ requires the pointer to be on that card, so at the
   * moment the popover appears its own card is a stacking context and the
   * popover's `z-dropdown` is confined inside it — the rows after it, painted
   * later in document order, then cover it. Measured: the menu was clipped by
   * the next card halfway down.
   *
   * No z-index on the popover can escape a stacking context, so the CARD is
   * what has to rise. `relative` because `z-index` does nothing to a static
   * box, and the pair is written only while the menu is open, so nothing about
   * the resting list's paint order changes.
   */
  const [menuRow, setMenuRow] = useState<string | null>(null)
  const { data: procs = [], error, isPending } = useProcesses(code)
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
  /**
   * The exports, for the ⋯ that replaces the bar at ≤760 — owner ruling: *"in
   * process list page, in mobile version we don't have download buttomn in :
   * menu.add it."*
   *
   * `ExportMenu` draws the bar's own trigger and holds a second copy of this
   * hook; the two are deliberate rather than duplicated, because exactly one of
   * them is on screen at any width and a dialog raised from inside
   * `[data-r-plistactions]` — `display:none` below the breakpoint — would not
   * paint at all. See `useExportActions`. */
  const exports = useExportActions(code)
  // `mark`, not `m`: `m` used to be this department's tile metadata, which
  // `IconTile` now reads for itself.
  const markOf = new Map(marks.map((mark) => [mark.target, mark]))

  const query = q.trim()
  const list = procs.filter((p) => !query || p.name.includes(query) || p.id.includes(query))

  // Positions come from the full ordered list, not the filtered one, so searching
  // never renumbers. Tombstones hold no position (ARD §4.6).
  const orderPos = new Map<string, number>()
  procs.filter((p) => !p.tombstoned).forEach((p, i) => orderPos.set(p.id, i + 1))

  /*
   * **This screen's own scroll memory is gone** — the shells restore every
   * screen now (`shell/scroll.ts`), by owner ruling: *"the back button should
   * always and everywhere return to the same scroll position it was at."*
   *
   * What stood here was keyed by DEPARTMENT and stored in `sessionStorage`, so
   * it restored the same offset however you arrived — including on a fresh visit
   * from the department list, which then opened halfway down a list you had not
   * read — and it had no way to tell «back» from any other navigation. The
   * shared one is keyed by the history entry and only restores on POP.
   */

  // A department outside this person's scope answers 404 for its process list.
  // Placed after every hook above, so the early return never changes hook order.
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />

  /**
   * **Owner ruling — the wait says so, instead of lying about the answer.**
   * *"i want to add load status for page that makes time like process list."*
   *
   * This screen was the sharpest case of the six and the only one that did not
   * go blank: it drew its header and, under it, «فرآیندی برای این دپارتمان ثبت
   * نشده است» — the empty state — for as long as the request took. A department
   * with sixteen processes announced, every single time it was opened, that it
   * had none. `isPending` is the difference between "the answer is nothing" and
   * "there is no answer yet", and the empty card below is only ever the first.
   *
   * Placed after every hook and after the refusal, so the early return changes
   * no hook order and a 404 still gets the surface it earned.
   */
  if (isPending) return <ScreenSkeleton column={reader ? 'reader' : 'list'} cards={5} />

  // R5 — the overflow is the action bar, not a superset of it, so both are
  // built from one list. An act a caller may not perform is in neither.
  const actions: Act[] = [
    ...(mayEdit ? [{ key: 'order', label: 'ترتیب فرآیندها', run: () => setReordering(true) }] : []),
    { key: 'overview', label: 'اطلاعات دپارتمان', run: () => nav(`/departments/${code}/overview`) },
    ...(mayEdit ? [{ key: 'new', label: 'فرآیند جدید', run: () => setCreating(true) }] : []),
    // The bar's fourth control. `useExportActions` has already dropped every
    // kind this caller may not take, so `reader_no_download` sees no export row
    // here for the same reason they see no trigger on the bar.
    ...exports.kinds.map((k) => ({ key: `export-${k.kind}`, label: k.label, run: () => exports.run(k.kind) })),
  ]

  return (
    <div
      data-screen={reader ? 'processListReader' : 'processList'}
      data-r-pad
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
                <OverflowMenu
                  actions={actions}
                  hook="plistmore"
                  label="کارهای بیشتر"
                  className="hidden max760:inline-flex relative ms-auto flex-none"
                  glyph={
                    'relative before:absolute before:content-[""] before:-inset-[4px] '
                    + 'inline-flex items-center justify-center flex-none w-menu-more h-menu-more '
                    + 'rounded-control border-hairline border-line bg-tile-v2 text-violet '
                    + 'text-fs-h5 font-bold cursor-pointer'
                  }
                >
                  ⋯
                </OverflowMenu>
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
            // R5 — an act this caller may not perform is not in the menu at
            // all, so `length === 0` is exactly "this row has no menu".
            const rowActions: Act[] = [
              ...(mayEdit || hasPublishedDetail(p)
                ? [{ key: 'summary', label: 'اطلاعات کلی', run: () => nav(`/processes/${p.id}`) }]
                : []),
              ...(mayEdit
                ? [{
                    key: 'delete',
                    label: tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند',
                    run: () => setDelTarget({ pid: p.id, name: p.name }),
                  }]
                : []),
            ]
            return (
              <Card
                key={p.id}
                data-card
                data-r-prow
                hoverLift
                radius="card"
                padding="card"
                // Owner ruling — a sub-process is cream, not white, *"in
                // addition to the sub-process tag"*. `deriveTag`'s own answer
                // decides it, so the tint and the chip can never disagree about
                // which rows are sub-processes.
                ground={tag?.kind === 'sub' ? 'warn' : 'card'}
                className={
                  'flex items-center gap-s8 max760:flex-col max760:items-start max760:gap-s6 max760:p-s7 '
                  + (tombstoned ? 'opacity-60 ' : '')
                  + (menuRow === p.id ? 'relative z-dropdown' : '')
                }
              >
                <div data-r-pmain className="flex-1 min-w-0 max760:w-full">
                  <div data-testid={`title-${p.id}`} className="flex items-center gap-s5 min-w-0">
                    {orderPos.has(p.id) && (
                      <span data-testid={`pos-${p.id}`}
                        className="font-extrabold text-fs-body text-violet min-w-s9 text-center flex-none max760:hidden">
                        {toFa(orderPos.get(p.id)!)}
                      </span>
                    )}
                    {/* **The whole name, at both widths — owner ruling.** *"i
                        want to show process name completely … i think two lines
                        is better for mobile amd in desktop small text is better."*
                        It was `text-fs-h4` (17px) behind `truncate`, so a real
                        process name — «تسویه حساب میهمان و صدور صورتحساب نهایی و
                        دریافت وجه…» — was a fragment ending in an ellipsis, on
                        the one screen whose job is to let somebody find it.

                        Both halves of the ruling, and they are one declaration
                        each. The desktop drops to `--fs-lg` 15px, which is two
                        steps of the panel scale and the size that fits the
                        longest name in the seed on one line at the 920px column.
                        The phone lets it wrap: `truncate` is gone, so the line
                        box grows instead of clipping, and `[text-wrap:pretty]`
                        is what stops a two-line name breaking after one word.

                        `min-w-0` moves off the ROW and onto this span, because
                        the thing that has to be allowed to shrink is now the
                        text and not the row that used to clip it. */}
                    <span className="min-w-0 font-bold text-fs-lg text-ink leading-snug [text-wrap:pretty]">
                      {p.name}
                    </span>
                  </div>
                  {/* **The meta line, and what the owner took out of it.**
                      *"in process list page, it shouldn't have 11 فعالیت
                      tag.remove it."* — and, for the reader, *"we shouldnt show
                      process id and 11 فعالیت in process card. just show
                      زیرفرایند if it is."*

                      The activity chip was never one of §6.2's three; it was
                      this app's own addition, argued for on the grounds that
                      dropping the number would take information no other screen
                      carries. The owner has ruled the other way on both
                      surfaces, and `countActivities` keeps its two remaining
                      callers in the exported documents.

                      **The reader keeps exactly one chip.** The reader
                      deliverable draws no meta line at all
                      (`Inja Reader.dc.html:215-221` is a position tile, a name
                      and two buttons), and the ruling is more generous than
                      that: «زیرفرآیند» stays, because a sub-process a reader
                      cannot tell from a top-level one is the one fact this row
                      has to carry. `deriveTag` answers four kinds and only that
                      one can reach a reader anyway — a tombstone never leaves
                      the server for them, `pending` is emptied by
                      `visibility.filtered`, and «دارای KPI» is an editor's
                      bookkeeping — so the guard below is belt-and-braces, and
                      it is written rather than reasoned about. */}
                  <div data-r-pmeta data-testid={`meta-${p.id}`}
                    className="flex items-center gap-s4 flex-wrap mt-s4 ps-s11 max760:hidden">
                    {!reader && <IdBadge>{p.id}</IdBadge>}
                    {tag && (!reader || tag.kind === 'sub') && (
                      <span className={`${CHIP} ${TAG_TONE[tag.kind]}`}>{tag.label}</span>
                    )}
                    {/* **Solid amber for «تأیید نشده» — owner ruling.** *"I want
                        the 'not approved' tag's color to be different from the
                        sub-process tag's color."* It was `--tile-warn` on
                        `--warn`, the very pair the sub tag wore, so the two most
                        common chips on this screen were the same chip.
                        Inverted rather than re-tinted: a tint of `--tile-warn`
                        is invisible on a sub-process's card, which is now that
                        colour, and an unconfirmed process is hidden from every
                        non-editor — a strong state, and the one chip here that
                        earns a filled skin. «تأیید شده» keeps the green tint. */}
                    {mark && (
                      <span className={`${CHIP} ${mark.confirmed ? 'bg-tile-ok text-green' : 'bg-warn text-card'}`}>
                        {mark.confirmed ? 'تأیید شده' : 'تأیید نشده'}
                      </span>
                    )}
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
                  {/* **«گام‌به‌گام» — owner ruling: *"where is step by step
                      bottumn? i have it in design, but in currebt version no.
                      add it"*.**

                      Both deliverables draw it and neither draws it the same
                      way: `Inja Panel.dc.html:352` gives the panel a white
                      ghost beside a violet «فلوچارت», and
                      `Inja Reader.dc.html:222` gives the reader two violet
                      buttons, because on that surface the steps view is the
                      *primary* way in — `openSteps` is what its lead sentence
                      («روی هر فرآیند بزنید تا گام‌هایش را ببینید») promises.
                      One row, so it branches on `useSurface()` like the header
                      above it.

                      It goes first in the DOM, which in RTL puts it on the
                      right: the design's own order, and the reading order a
                      reader who was told to look for steps expects. */}
                  <Button variant={reader ? 'violet' : 'ghost'}
                    onClick={() => nav(`/processes/${p.id}/steps`)}
                    className="px-s7 py-s4 text-fs-sm2 max760:flex-1">گام‌به‌گام</Button>
                  <Button variant="violet" onClick={() => nav(`/processes/${p.id}/flow`)}
                    className="px-s7 py-s4 text-fs-sm2 max760:flex-1">فلوچارت</Button>
                  {/* **The row menu — owner ruling: *"add ather buttomn in card
                      to : menue"* — and `Inja Panel.dc.html:354-366`.**

                      A 34px kebab holding «اطلاعات کلی» and, for an editor,
                      «حذف فرآیند». Both were loose controls on this row before:
                      the summary as a third ghost button, and the delete as a
                      bare red square that put the most destructive act in the
                      product one mis-tap from «فلوچارت» — on a phone the two
                      were `flex-1` neighbours. The design puts the same two
                      behind one press.

                      **Drawn only when it has something in it**, which is R39
                      one control further in: `rowMenuDisplay: isEditor` at panel
                      3515 says the same thing for a deliverable whose admin
                      sees neither row, and this app's non-editor reaches
                      «اطلاعات کلی» whenever the process has published detail.
                      An empty menu is a control that leads nowhere.

                      **`mayEdit` is the DEPARTMENT's question** (line 195), not
                      the person's — an editor of another department is filtered
                      by `Disclosure` exactly as a reader is, and must lose the
                      delete exactly as a reader does.

                      §6.8's own `<Menu/>` is not used here for the reason
                      `OverflowMenu` above records: it renders its label as the
                      trigger's TEXT and pins a 44×44 box, so the design's 34px
                      glyph would come out as «کارهای بیشتر» in words. */}
                  {rowActions.length > 0 && (
                    <OverflowMenu
                      actions={rowActions}
                      hook="prowmenu"
                      onOpenChange={(open) => setMenuRow(open ? p.id : null)}
                      label={`کارهای «${p.name}»`}
                      className="relative flex-none"
                      glyph={
                        'relative before:absolute before:content-[""] before:-inset-[5px] '
                        + 'inline-flex items-center justify-center flex-none w-tool h-tool '
                        + 'rounded-input border-hairline border-line bg-card text-violet '
                        + 'cursor-pointer'
                      }
                    >
                      <Icon d={KEBAB} px={16} stroke={3.2} />
                    </OverflowMenu>
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
      {/* At the SCREEN root, not inside the ⋯: the menu unmounts on the press
          that starts the export, and `[data-r-plistactions]` — where the bar's
          own copy lives — is `display:none` at the width this one is used at. */}
      {exports.modal}
    </div>
  )
}
