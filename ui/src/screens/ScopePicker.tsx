import { useState } from 'react'
import { useDepartments } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import {
  EVERY_DEPARTMENT, REPORT_KINDS, REPORT_KIND_LABELS, parseScope, reportLabel, scopeLabel,
} from '../lib/scopes'
import { Checkbox, TickBox } from '../ui/Checkbox'
import { Icon } from '../ui/Icon'

/** What «کل سامانه» actually grants, said in the design's own words (§6.8). A
 *  department list would be wrong: `*` is not "all nine departments today". */
export const EVERY_NOTE = 'همهٔ دپارتمان‌ها، و هر دپارتمانی که بعداً ساخته شود.'

/** Said only when there is one. A scope this form can draw no control for — a
 *  department that has left the registry, a report kind the server knows and
 *  this build does not, a row the grammar refuses — is **kept** and sent back
 *  unchanged; it must not also be invisible, or the form would report less
 *  access than the account holds. */
export const UNDRAWABLE_SCOPES =
  'این دامنه‌ها را این فرم نمی‌تواند نشان دهد و دست‌نخورده باقی می‌مانند:'

/**
 * The first row of «نماها», and the one the grammar spells as the *absence* of a
 * narrowing — owner ruling: *"in نماها we should have 3 option. two of them is
 * report and first is all report option. … we shouldn't have option the both of
 * checkbox (all report and each report) be on."*
 *
 * `dept:{code}` **is** "every report of this department", including kinds added
 * after the grant — that is what `scopes.contains` gives and what a list of
 * today's two kinds would not. It had no control of its own here: the whole
 * grant was expressed by the tile's own tick, so the popover offered two
 * narrowings and no way back to the wide grant without closing it again. Naming
 * it in the popover puts all three mutually exclusive states in one place.
 */
export const ALL_REPORTS = 'همهٔ گزارش‌ها'

/**
 * Which departments an account reaches, drawn as §6.8's tile grid.
 *
 * **This is the whole reason the dialog was 2207px tall.** The grammar has
 * three shapes — `*`, `dept:{code}`, `dept:{code}/report:{kind}` — and the old
 * form gave every one of them a stacked 44px checkbox row: 1 + 9 + 18 = 28
 * rows, roughly 80% of an 850px box. §6.8 expresses the same three shapes in a
 * `repeat(2,1fr)` grid of nine tiles with the report level behind a per-tile
 * «نماها» popover.
 *
 * Nothing about the grammar itself moved: widening still removes `*` and every
 * narrowing of the same department, a narrowing still drops the whole-department
 * grant, a subtraction never widens, and a scope this form can draw no control
 * for is still kept, sent back unchanged, and named out loud.
 *
 * **The views button is on every tile, not only on a tile that is on.** §6.8
 * draws it "when on", and §6.8's screen has no reason to do otherwise — but this
 * product's grammar has a third shape and D11's «Report reader» is a real person
 * in the deployment table. Withheld until the department is ticked, her own
 * grant would be neither visible nor reachable, and the only route to it would
 * be to grant the whole department first: a widening, performed to express a
 * narrowing. The tile therefore states its narrowing in words as well, so the
 * grant is legible without opening anything.
 */
export function ScopePicker({ scopes, onChange }: {
  scopes: string[]
  onChange: (next: string[]) => void
}) {
  const departments = useDepartments()
  const [openViews, setOpenViews] = useState<string | null>(null)
  const every = scopes.includes('*')
  const list = departments.data ?? []
  const names = Object.fromEntries(list.map((d) => [d.code, d.name]))

  /** `*` and a department are mutually exclusive: `*` already covers every one
   *  of them, so a list holding both says the same thing twice and would be
   *  stored as two rows. Turning it off leaves nothing behind rather than
   *  reviving whatever was ticked before it — those boxes were cleared when it
   *  went on, and bringing them back would grant departments nobody re-read. */
  function toggleEverything(on: boolean) {
    // …and the open «نماها» popover closes with it. The grid below is disabled
    // while `*` is on, so a popover left open would be a live control inside an
    // inert region — and the one that reappeared when `*` came back off would be
    // one nobody asked for.
    if (on) setOpenViews(null)
    onChange(on ? ['*'] : [])
  }

  /**
   * The whole department (`dept:{code}`).
   *
   * **Turning it on is the widening act**: it removes `*` (already covered) and
   * every narrowing of this same department, and those report ticks visibly
   * clear under the hand that ticked it. Turning it off removes exactly this one
   * grant and touches nothing else.
   */
  function toggleDepartment(code: string, on: boolean) {
    const whole = `dept:${code}`
    if (!on) { onChange(scopes.filter((s) => s !== whole)); return }
    const narrower = `${whole}/report:`
    onChange([...scopes.filter((s) =>
      s !== '*' && s !== whole && !s.startsWith(narrower)), whole].sort())
  }

  /**
   * The TILE's tick — "does this account reach this department at all".
   *
   * **Owner ruling: it follows the department, not the wide grant.** *"the
   * checkbox near of department name is always on"*, i.e. on whenever anything
   * inside the department is granted. It used to be `checked={whole}`, so a
   * report-scoped department drew an unticked box beside a tinted tile and the
   * word «فقط راهنمای گام‌به‌گام» — an account was shown as reaching the
   * department and not reaching it in the same row.
   *
   * Ticking it grants the whole department, which is `toggleDepartment`'s
   * widening and its clearing of `*` and of every narrowing. Unticking it is the
   * only act here that has to be written fresh: `toggleDepartment(code, false)`
   * removes the wide grant alone, which would leave a report-scoped department
   * ticked, tinted and untouched under the hand that just cleared it. This
   * removes the department in every shape it is held in.
   */
  function toggleHeld(code: string, on: boolean) {
    if (on) { toggleDepartment(code, true); return }
    const whole = `dept:${code}`
    const narrower = `${whole}/report:`
    onChange(scopes.filter((s) => s !== whole && !s.startsWith(narrower)))
  }

  /**
   * One report of one department — the third shape, which every other layer
   * already handles (`scopes.SCOPE_RE`, `may_delegate`, `eligible_supervisors`,
   * `_clean_scopes`).
   *
   * Ticking one drops the whole-department grant, because holding both stores
   * the same reach twice. Ticking a second kind keeps the first: a narrowing is
   * a *set* of reports.
   */
  function toggleReport(code: string, kind: string, on: boolean) {
    const scope = `dept:${code}/report:${kind}`
    if (!on) { onChange(scopes.filter((s) => s !== scope)); return }
    const whole = `dept:${code}`
    onChange([...scopes.filter((s) =>
      s !== '*' && s !== whole && s !== scope), scope].sort())
  }

  // `isPending`, not `data === undefined`: in flight, every department scope is
  // "one this form draws no control for" and the notice would flash on a
  // perfectly ordinary account. A read that *failed* has the same undefined
  // data and the opposite meaning — every scope really is undrawable, and
  // saying nothing tells an administrator the account holds no departments when
  // it holds two.
  const undrawable = departments.isPending ? [] : scopes.filter((s) => {
    const p = parseScope(s)
    if (p.shape === 'every') return false
    if (p.shape === 'refused') return true
    if (!(p.code in names)) return true
    return p.shape === 'report' && reportLabel(p.report) === undefined
  })

  return (
    <div className="flex flex-col gap-s5">
      {/* §6.8's own checkbox row — the 18px tick the design draws at panel 1356
          (owner ruling R36 keeps it at 18 rather than normalising it up to the
          19 of a screen row), a 13.5px/700 title and an 11.5px explanation
          beneath. `Checkbox` already defaults to that rung. */}
      <Checkbox checked={every} onChange={toggleEverything}
        label="کل سامانه" hint={EVERY_NOTE} />

      {/* §6.8 — `grid repeat(2,1fr); gap:8px`, dimmed by opacity when "whole
          system" is on. Dimmed rather than hidden (R5's neighbour): an
          administrator who cannot see the nine departments cannot see what they
          are about to widen past.

          **`pointer-events-none` stops the mouse and not the keyboard**, so
          every tick and every views button in this grid stayed tabbable and
          fully operable while the whole thing read as disabled — R5's shape
          inverted: drawn as refused, isn't. The controls now carry `disabled`,
          which is what takes them out of the tab order, refuses the space bar
          and reaches assistive technology; `aria-disabled` on the group says the
          same thing about the region the opacity dims. The three are one
          statement, and this is *presentation* only — owner ruling R31 (the
          views button on every tile) is untouched, and ticking a department
          still correctly drops `*`. */}
      <div role="group" aria-label="دپارتمان" data-dimmed={every ? 'true' : 'false'}
        aria-disabled={every || undefined}
        className={`grid grid-cols-2 gap-s4 max760:grid-cols-1 ${every ? 'opacity-40 pointer-events-none' : ''}`}>
        {list.map((d) => {
          const whole = scopes.includes(`dept:${d.code}`)
          const narrowed = REPORT_KINDS.filter((k) =>
            scopes.includes(`dept:${d.code}/report:${k}`))
          // Tinted when the account reaches this department AT ALL, ticked only
          // when it reaches the whole of it. A report-scoped department drawn
          // exactly like an ungranted one is the defect this control exists to
          // end; a report-scoped department drawn TICKED would be worse — it
          // would report more reach than the account holds.
          const held = whole || narrowed.length > 0
          return (
            <div key={d.code} className="relative">
              {/* §6.8 tile: `padding:11px 12px; radius 12; border:1.5px
                  {on:--line-dashed | off:--warm}; background:{on:--tile-v4 |
                  off:--card}`. The design's 15×15 department glyph in the
                  department's own fixed accent is NOT drawn: no size token holds
                  15px in that role, and this task may not mint one. Reported. */}
              <label className={`flex flex-wrap items-center gap-tick-row min-h-touch px-s6 py-s5
                                 rounded-button border-hairline cursor-pointer transition
                                 ${held ? 'border-line-dashed bg-tile-v4' : 'border-warm bg-card'}`}>
                <input
                  type="checkbox"
                  checked={held}
                  disabled={every}
                  aria-label={d.name}
                  onChange={(e) => toggleHeld(d.code, e.target.checked)}
                  className="peer sr-only"
                />
                <TickBox on={held} rung="scope" className="peer-focus-visible:border-coral" />
                <span className={`min-w-0 flex-1 truncate text-fs-sm font-semibold ${deptMeta(d.code).accentText}`}>
                  {d.name}
                </span>
                {/* §6.8's views button: `11px/700 --violet` on nothing, with a
                    12×12 chevron at 2.4. `type="button"` and a stopped default,
                    because it lives inside a <label> whose control is the tick:
                    a bare press would toggle the whole department. */}
                <button type="button"
                  disabled={every}
                  aria-label={`نماهای ${d.name}`}
                  aria-expanded={openViews === d.code}
                  onClick={(e) => {
                    e.preventDefault()
                    setOpenViews(openViews === d.code ? null : d.code)
                  }}
                  className="inline-flex items-center gap-s1 border-0 bg-transparent px-s1 py-s1
                             text-fs-xs font-bold text-violet cursor-pointer">
                  نماها
                  <Icon name="chevronDown" stroke={2.4} className="w-s6 h-s6" />
                </button>
                {narrowed.length > 0 && (
                  // The narrowing, in words, so the grant is legible without
                  // opening the popover it lives in.
                  <span className="basis-full text-fs-xs text-violet">
                    فقط {narrowed.map((k) => REPORT_KIND_LABELS[k]).join('، ')}
                  </span>
                )}
              </label>
              {openViews === d.code && !every && (
                // §6.8's nested view menu. One is open at a time, so the two
                // kinds need no department in their accessible names.
                <div className="absolute z-dropdown top-full start-0 end-0 mt-s3 flex flex-col
                                gap-s2 bg-card border border-border-card rounded-card shadow-pop p-popover">
                  {/* First, and it is the wide grant rather than a third kind —
                      see `ALL_REPORTS`. Exclusivity is not enforced here and
                      must not be: `toggleDepartment` already drops every
                      narrowing of this department and `toggleReport` already
                      drops the wide grant, which is the same rule the server's
                      `_clean_scopes` keeps. A second enforcement in the view
                      would be a second reading of the grammar — the copy that
                      comes to disagree. */}
                  <Checkbox
                    rung="nested"
                    checked={whole}
                    onChange={(v) => toggleDepartment(d.code, v)}
                    label={ALL_REPORTS} />
                  {REPORT_KINDS.map((kind) => (
                    <Checkbox key={kind}
                      // Panel 1386 — an option inside the popover that hangs off
                      // the cell above, which is the deepest rung the design
                      // draws and the only place in this app that reaches it.
                      rung="nested"
                      checked={scopes.includes(`dept:${d.code}/report:${kind}`)}
                      onChange={(v) => toggleReport(d.code, kind, v)}
                      label={REPORT_KIND_LABELS[kind]} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {undrawable.length > 0 && (
        <p className="text-fs-xs font-semibold text-warn m-0">
          {UNDRAWABLE_SCOPES} {undrawable.map((s) => scopeLabel(s, names)).join('، ')}
        </p>
      )}
      {/* `*` is «همهٔ دپارتمان‌ها» wherever else the product names it — on the
          record's chips, beside a supervisor's name — and «کل سامانه» here,
          which is §6.8's own word for the CONTROL. Both reach a screen reader,
          so the tick and the chip cannot be read as two different grants. */}
      <span className="sr-only">{EVERY_DEPARTMENT}</span>
    </div>
  )
}
