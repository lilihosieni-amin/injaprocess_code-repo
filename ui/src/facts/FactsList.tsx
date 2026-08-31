import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDepartments, useFactBranches, useFacts } from '../api/hooks'
import { refusalStatus } from '../api/client'
import {
  BADGE_LABELS, CONFIRMATION_LABELS, KIND_LABELS, SCREEN_LABELS, label,
} from '../lib/factsLabels'
import { toFa } from '../lib/format'
import { Card } from '../ui/Card'
import { Dropdown } from '../ui/Dropdown'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { LoadFailedScreen, LoadingState } from '../ui/states'
import { RefusalScreen } from '../screens/Refusal'
import { NO_FILTERS, UNIVERSAL, anyActive, matches, type FactFilters } from './factsFilter'
import type { FactListRow, FactScope } from '../api/types'

/**
 * §14's «داده‌های کمّی» — every quantitative fact the estate has been read for,
 * as one filtered list (`Inja Panel.dc.html:999-1072`).
 *
 * **Gated by the server and by nothing here.** All five facts routes answer the
 * uniform 404 to a caller holding none of the Panel capabilities
 * (`routers/facts.py`'s `panel_session`), so a Reader who types this path is
 * refused by `refusalStatus` below — the same shape `Users` and `Visibility`
 * take, one code milder in their case because those two surfaces can also refuse
 * an in-scope caller 403. There is no client-side predicate above the query
 * because there is nothing for one to read: the facts gate is capability-only
 * with no scope in it, and the shell that draws the only link to this screen is
 * chosen from the same capability list (`auth/session.ts`).
 *
 * **What this screen does NOT draw, and it is not an oversight:**
 *
 * * **No coverage line.** `GET /api/facts` serves `coverage` and §14 put
 *   «{n} از {m} کاربرگ خوانده شده» in this card's header; the owner was shown
 *   exactly that on 2026-08-31 and **refused** it (facts-design-audit §6, C1).
 *   The design computes `factsCoverage` (:4798) and consumes it nowhere, and
 *   that is now the decision rather than the defect. `SCREEN_LABELS.coverage`
 *   stays because Appendix D declares it. Do not re-propose.
 * * **No confirm tick on a row.** The row's six cells are title, id, kind,
 *   scope, the status block and the chevron (:1052-1070). The tick is
 *   `sfCanTick` on the detail screen, and a list that offered one would be
 *   confirming an entry nobody had opened.
 * * **No result count.** `factCount` (:4809) is computed and rendered nowhere,
 *   and nothing in §14 asks for one.
 */
export function FactsList() {
  const { data, error, isPending, refetch } = useFacts()

  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  // Before `data ?? []`, exactly as on `Users`: a failed read leaves `data`
  // undefined and an empty list is indistinguishable from an estate nobody has
  // read a number out of yet. `refusalStatus` maps 403 and 404 only, so a 500
  // would otherwise reach the empty state and tell a reviewer something about
  // the store that this screen does not know.
  if (error) {
    return <LoadFailedScreen message={label(SCREEN_LABELS, 'load_failed')} error={error}
      onRetry={() => { void refetch() }} />
  }

  return (
    // `data-r-pad` is §8's scroll box: `src/styles/base.css` gives it
    // `direction:ltr` with `direction:rtl` back on every child, which puts the
    // scrollbar on the right of an RTL screen without mirroring a single word.
    <div data-screen="facts" data-r-pad
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-summary mx-auto">
        {/* §6.16 / ledger L-01 — `22px/800`, white on the violet field. The
            design's `height:20px` spacer under it is the 22px rung; 20 is not on
            the ladder and this task may not mint one. */}
        <h1 data-h1 className="text-title font-extrabold text-role-title-on-field mb-s10">
          {label(SCREEN_LABELS, 'section')}
        </h1>
        {isPending ? <LoadingState /> : <FactsBody entries={data?.entries ?? []} />}
      </div>
    </div>
  )
}

/**
 * The card — search band, filter band, head, rows.
 *
 * Its own component for the reason `UsersBody` is: `useFactBranches` and
 * `useDepartments` are hooks, hooks run before `FactsList`'s early returns, and
 * a caller the app is about to refuse must ask the server for nothing (NFR-12).
 * Mounted here, both registries are read only once the listing has arrived.
 */
function FactsBody({ entries }: { entries: FactListRow[] }) {
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<FactFilters>(NO_FILTERS)
  const navigate = useNavigate()
  // Conformance note 9 — the design's inline `DEPT_FA` (:4632) and `BRANCH_FA`
  // (:4633) are replaced by the registries, so a department renamed in the
  // manifest is renamed here without a code change.
  const departments = useDepartments().data ?? []
  const branches = useFactBranches().data ?? []
  // Two maps, not one merged lookup: `dept:cooking` and a branch code are
  // separate namespaces, and a single map would answer a branch's code with a
  // department's name the day the estate registers a branch called `cooking` —
  // a wrong Persian word, silently, in the one cell that says where a number
  // applies.
  const deptNames = Object.fromEntries(departments.map((d) => [d.code, d.name]))
  const branchNames = Object.fromEntries(branches.map((b) => [b.code, b.name]))

  const rows = entries.filter((r) => matches(r, q, filters))
  const set = <K extends keyof FactFilters>(k: K, v: FactFilters[K]) =>
    setFilters({ ...filters, [k]: v })
  const clearable = anyActive(filters, q)

  return (
    /*
     * **No `overflow-hidden`, and that is a decision rather than an omission.**
     * The design's `overflow:hidden` (:1005) clips the head fill and the row
     * rules to the 18px radius — but this card also holds four filter menus
     * (`position:absolute`, `max-height:212px`, :1021), and on a short list the
     * card is shorter than an open menu. Clipped, the options below the fold
     * simply cannot be read. Nothing else needs the clip here: the card's first
     * band is the white search band and the `--tile-v4` head sits in the middle,
     * so the only paint that would reach a corner is the last row's rule, which
     * `last:border-b-0` below drops instead.
     */
    <Card data-card radius="doc">
      {/* :1006 — `padding:13px 18px` over a `--border-current` rule. 13px is not
          on the ladder; R8 gives one padding per role and this is the table
          shell's band, which `DataTable` already draws at `--space-7`. */}
      <div className="px-s9 py-s7 border-b border-border-current">
        <SearchField label={label(SCREEN_LABELS, 'search_label')} value={q} onChange={setQ}
          placeholder={label(SCREEN_LABELS, 'search_placeholder')} />
      </div>

      {/* :1016 — `repeat(4,1fr)` at 8px, dropping to two stretched columns at
          12px on a phone. Nothing is hidden there: a filter you cannot reach is
          a row you cannot find. */}
      <div data-r-afilters
        className="grid grid-cols-4 items-center gap-s4 px-s9 py-s7 border-b border-border-current
                   max760:grid-cols-2 max760:items-stretch max760:p-s6">
        <Dropdown label={label(SCREEN_LABELS, 'filter_kind')} hideLabel
          placeholder={label(SCREEN_LABELS, 'filter_kind')}
          value={filters.kind ?? undefined} onChange={(v) => set('kind', v || null)}
          options={blankFirst('filter_kind', Object.keys(KIND_LABELS)
            .map((value) => ({ value, label: label(KIND_LABELS, value) })))} />
        <Dropdown label={label(SCREEN_LABELS, 'filter_scope')} hideLabel
          placeholder={label(SCREEN_LABELS, 'filter_scope')}
          value={filters.dept ?? undefined} onChange={(v) => set('dept', v || null)}
          // «سراسری» LAST, as the design appends it (:4639): it is not a
          // department, it is the absence of one.
          options={blankFirst('filter_scope', [
            ...departments.map((d) => ({ value: d.code, label: d.name })),
            { value: UNIVERSAL, label: label(SCREEN_LABELS, 'filter_scope_universal') },
          ])} />
        <Dropdown label={label(SCREEN_LABELS, 'filter_branch')} hideLabel
          placeholder={label(SCREEN_LABELS, 'filter_branch')}
          value={filters.branch ?? undefined} onChange={(v) => set('branch', v || null)}
          options={blankFirst('filter_branch',
            branches.map((b) => ({ value: b.code, label: b.name })))} />
        <Dropdown label={label(SCREEN_LABELS, 'filter_confirmation')} hideLabel
          placeholder={label(SCREEN_LABELS, 'filter_confirmation')}
          value={filters.confirmation ?? undefined}
          // Narrowed rather than cast: `Dropdown` hands back a `string` and
          // these are the only two values this field has a meaning for — which
          // is `CONF`'s whole key set (:4627), everything else folded to amber.
          onChange={(v) => set('confirmation',
            v === 'confirmed' || v === 'unconfirmed' ? v : null)}
          options={blankFirst('filter_confirmation', Object.keys(CONFIRMATION_LABELS)
            .map((value) => ({ value, label: label(CONFIRMATION_LABELS, value) })))} />

        {/* R5 — absent, not disabled, until there is something to clear.
            **`--violet-mid`, not the `--conflict` the design paints (:1032).**
            Ledger L-06 is the owner's veto point for exactly this control and
            exactly this contradiction: Users drew the link `--violet-mid` and
            User activity drew it `--conflict`, and the ruling settled it on
            semantics —
            *"`--conflict` is declared destructive and conflicts, and clearing a
            filter destroys nothing."* The facts design repeats the variant that
            lost. `--role-link-quiet` is the role name for it (`roles.css:73`);
            `text-violet-mid` is the class `UsersFilters` writes, and one screen
            red beside another violet is the inconsistency L-06 removed. */}
        {clearable && (
          <button type="button" onClick={() => { setFilters(NO_FILTERS); setQ('') }}
            className="col-span-full justify-self-start border-0 bg-transparent p-s1
                       text-fs-sm2 font-bold text-violet-mid underline underline-offset-4
                       cursor-pointer min-h-touch">
            {label(SCREEN_LABELS, 'clear_filters')}
          </button>
        )}
      </div>

      <div role="grid" aria-label={label(SCREEN_LABELS, 'section')}>
        <div data-r-thead role="row" style={TRACKS}
          className={`${LINE} py-s6 bg-tile-v4 border-b border-border-current max760:hidden`}>
          {HEADS.map(({ key, head }) => (
            <span key={key} data-headcol={key} role="columnheader"
              className="min-w-0 text-fs-xs font-bold text-muted">
              {head === null ? '' : label(SCREEN_LABELS, head)}
            </span>
          ))}
        </div>

        {rows.map((r) => (
          <div key={r.id} data-r-trow role="row" tabIndex={0} aria-label={r.title} style={TRACKS}
            // `/facts/{id}` is the detail screen (§14). Rows open it the way the
            // design's `r.open` does — `go({screen:'factdetail', factSel:r.id})`.
            onClick={(e: MouseEvent<HTMLDivElement>) => {
              // A control inside a cell owns its own click; without this a press
              // on one would both work it and open the row behind it.
              const control = (e.target as HTMLElement).closest(INTERACTIVE)
              if (control && e.currentTarget.contains(control)) return
              navigate(`/facts/${r.id}`)
            }}
            onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/facts/${r.id}`) }
            }}
            className={`${LINE} py-table-row-y border-b border-line-row last:border-b-0
                        cursor-pointer hover:bg-surface-sub transition-[background]
                        max760:flex max760:gap-table-row-mobile max760:p-s7`}>
            {/* **The cell that takes the leftover width on a phone.** The design
                writes `[data-r-trow] > div:nth-child(2){flex:1 1 auto}` for the
                users and audit tables, whose second cell is the name; here the
                second cell is the id, which `data-r-tcol3` hides at ≤760 — so
                the rule is a no-op on this table and every cell would size to
                its own content, leaving the chevron floating mid-row.
                `DataTable` already names the growing column rather than counting
                to two, and this is that fix on the cell the design means. */}
            <Cell k="title" className="max760:flex-1">
              <span className="block truncate text-fs-body font-bold text-ink">{r.title}</span>
            </Cell>
            {/* §8 — a mono latin run inside an RTL row keeps the order it was
                stored in. `text-end` is the design's physical alignment read
                logically: the span is `dir="ltr"`, so its end IS the edge the
                design names, and the logical form is the one F10 admits. */}
            <Cell k="id" mobile={false}>
              <span dir="ltr"
                className="block truncate font-mono text-fs-xs text-muted text-end">
                {r.id}
              </span>
            </Cell>
            {/* `factRow` (:4650) writes the kind and NOTHING else here — the
                role/lang suffix is `sfKind` on the detail screen, and the served
                listing carries neither. */}
            <Cell k="kind">
              <span className="block truncate text-fs-sm2 font-semibold text-ink">
                {label(KIND_LABELS, r.kind)}
              </span>
            </Cell>
            <Cell k="scope" mobile={false}>
              <span className="block truncate text-fs-sm2 text-muted">
                {scopeLine(r.scope, deptNames, branchNames)}
              </span>
            </Cell>
            <Cell k="confirmation">
              <span className="flex items-center gap-s3">
                {/* F11 — the state is a word beside the dot, never a colour
                    alone. Two values and two only: `CONF` (:4624) folds red,
                    stub and universal to «تأییدنشده», and the «سه حالت» comment
                    above it is stale prose the code does not implement. */}
                <span aria-hidden className={`w-s4 h-s4 rounded-round flex-none
                  ${r.confirmed ? 'bg-green' : 'bg-junction-or'}`} />
                <span className={`block truncate text-fs-sm2 font-semibold
                  ${r.confirmed ? 'text-green' : 'text-warn-fg'}`}>
                  {label(CONFIRMATION_LABELS, r.confirmed ? 'confirmed' : 'unconfirmed')}
                </span>
              </span>
              {/* Conformance note 1, in the slot the design drew and never wired
                  (`r.hasNote`/`r.noteLine`, :1063-1064): the counts and the
                  badges live BESIDE the chip and never inside it. The type ramp
                  is the slot's own. */}
              {noteLine(r) !== '' && (
                <span className="block truncate text-fs-micro text-faint mt-s1">{noteLine(r)}</span>
              )}
            </Cell>
            <Cell k="open">
              {/* `chevronEnd`: in a right-to-left reading what you are going to
                  lies to the LEFT. */}
              <span aria-hidden className="flex items-center justify-center w-chev h-chev
                                           rounded-round bg-disc-violet text-violet">
                <Icon name="chevronEnd" className="w-s7 h-s7" stroke={2.4} />
              </span>
            </Cell>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <p data-r-empty className="m-0 px-empty-x py-empty-y-inline text-center text-fs-sm text-faint">
          {label(SCREEN_LABELS, 'empty_filtered')}
        </p>
      )}
    </Card>
  )
}

/**
 * The six tracks of :1036 and :1051, written inline because no token holds them.
 *
 * `--grid-users`, `--grid-audit` and `--grid-activity` are the three the theme
 * mints and a `--grid-facts` beside them is on the audit's `UNTOKENISED`
 * candidates list for the owner — this task may not mint one
 * (`guards.test.ts` pins that list at zero additions). `DataTable`'s own
 * `DataColumn.track` is the same escape hatch for the same reason.
 */
const TRACKS = { gridTemplateColumns: '1.7fr .8fr .9fr 1.1fr 1.1fr 34px' }

/** Head and rows on one line, so a column cannot start in two places. */
const LINE = 'grid items-center gap-s6 px-s9'

const INTERACTIVE =
  'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="menuitem"]'

/** The five heads the design labels, and the sixth it leaves empty (:1037-1043). */
const HEADS: { key: string; head: string | null }[] = [
  { key: 'title', head: 'column_title' },
  { key: 'id', head: 'column_id' },
  { key: 'kind', head: 'column_kind' },
  { key: 'scope', head: 'column_scope' },
  { key: 'confirmation', head: 'column_confirmation' },
  { key: 'open', head: null },
]

/** One body cell. `mobile: false` is the design's `[data-r-tcol3]`, gone at ≤760. */
function Cell({ k, mobile = true, className = '', children }: {
  k: string; mobile?: boolean; className?: string; children: ReactNode
}) {
  return (
    <div data-col={k} role="gridcell"
      className={`min-w-0 ${mobile ? '' : 'max760:hidden'} ${className}`}>
      {children}
    </div>
  )
}

/** A menu's blank first option — the design prepends one to every filter, with
 *  the filter's own name as its text (:4805), and it is the only way to unset
 *  one without clearing all four. */
function blankFirst(blank: string, options: { value: string; label: string }[]) {
  return [{ value: '', label: label(SCREEN_LABELS, blank) }, ...options]
}

/**
 * «آشپزخانه · چاله‌باغ», or «کل سامانه» for an entry bound to neither
 * (`scopeLine`, :4634).
 *
 * Departments first, then branches, joined with the design's own separator. A
 * code with no registered name falls back to the code rather than to a blank,
 * for the reason `scopeLabel` gives: a scope rendered as nothing reads as "no
 * scope" beside a title, which is the opposite of what it means here.
 */
function scopeLine(
  scope: FactScope, depts: Record<string, string>, branches: Record<string, string>,
): string {
  const parts = [
    ...(scope.departments ?? []).map((code) => depts[code] ?? code),
    ...(scope.branches ?? []).map((code) => branches[code] ?? code),
  ]
  return parts.length === 0 ? label(SCREEN_LABELS, 'scope_universal') : parts.join(' · ')
}

/**
 * The second line under the chip — conformance note 1, and the only thing that
 * fills the design's dead `r.noteLine` node.
 *
 * Counts before badges, and a count only when there is one: «۰ بی‌پاسخ» on a
 * clean entry is noise on every row in the list. `toFa` because these are
 * Persian-facing counts (QF-42) — the id beside them is the LTR island, not
 * this.
 */
function noteLine(r: FactListRow): string {
  const parts: string[] = []
  const count = (key: string, n: number) => {
    if (n > 0) parts.push(label(BADGE_LABELS, key).replace('{n}', toFa(n)))
  }
  count('unknown_count', r.red_counts.unknown)
  count('disputed_count', r.red_counts.disputed)
  if (r.stub) parts.push(label(BADGE_LABELS, 'stub'))
  if (r.retired) parts.push(label(BADGE_LABELS, 'retired'))
  return parts.join(' · ')
}
