import { useRef, type KeyboardEvent } from 'react'

export interface NavTab { id: string; label: string }

/**
 * The segmented tray (§5.2) — the most repeated composite in the deliverable.
 *
 * This is a **tablist**, for a real set of alternative views: the comments
 * tabs, the audit tabs, the flow view switch. The top bar's nav tray looks
 * identical and is not one — those entries navigate, so PanelShell composes the
 * same shell around links rather than importing this and lying about the role.
 *
 * OWNER RULING — the panel tab is padded `9px 10px` (`--role-pad-tab-y`/`-x`). The
 * two trays this replaces draw `padding:8px 6px` (`Inja Panel.dc.html:953`)
 * and `padding:9px 10px` (`:1511`), one instance each, so dominance cannot
 * settle it and it went to the owner. `px-s7` — 14px — was neither, and is a
 * number the design never draws. The larger of the two was ruled, so the drawn
 * height stays closest to F11's floor and the inset below stays small.
 *
 * F11 — the panel tab is 36.75px tall as drawn (9px of padding twice around a
 * 12.5px `--fs-sm2` line box, which inherits the base layer's unitless 1.5),
 * and the floor is 44. The plan's one rule for every control on the design's
 * 30/32/34/36/40/42 ladder decides the rest, and it supersedes any per-task
 * treatment: the PAINTED box stays the design's and a transparent `::before`
 * grows the HIT AREA, so the violet pill never becomes a 44px slab. The
 * retired `Tabs.tsx` did the opposite — `min-h-touch` inflated the drawn tab —
 * which is why replacing it without this left the tray SMALLER than the thing
 * it replaced rather than merely different.
 *
 * 36.75 + 2x4 = 44.75, so the inset is 4px here where Overlay's 32px close
 * control takes 6px and Pager's 34px page button takes 5px. N is the SMALLEST
 * integer that clears the floor: 3 would leave the target at 42.75, and any
 * larger N buys nothing and eats the neighbour. It stays an arbitrary value
 * rather than a token because N is derived arithmetic — whatever brings THIS
 * control's drawn size to 44 — and not a design value: a token would have to
 * be minted per control size and would put the arithmetic in the wrong place.
 * `src/ui/composites.test.tsx` measures the sum, and bounds it above as well
 * as below, which is its home. Nothing about the `::before` paints, which is
 * why the design has no opinion about it.
 *
 * The 4px gap between two tabs is exactly 2x4, so a tab's target reaches its
 * neighbour's drawn edge and stops there. Under the 8px padding this replaced
 * the inset was 5px and lapped 1px over; the owner's ruling removes even that.
 *
 * OWNER RULING — the tray is `display:flex` and every tab is `flex:1`, because
 * that is what BOTH trays draw (panel 953 and 1511) and R1 makes the
 * deliverable the authority. The two halves are one decision, not two: `flex:1`
 * inside an `inline-flex` container distributes the leftover space in a box
 * that shrink-to-fits, which is none of it — so `stretch` on its own was a prop
 * that could not do anything, and `inline-flex` was the reason. The tray spans
 * its container and the tabs divide it. `stretch={false}` is still there for a
 * caller that wants content-sized tabs; nothing in the deliverable asks for
 * one, and the ruling made it the exception rather than the default.
 *
 * `wrap` is the audit tray's OTHER half (panel 1511): `flex-wrap:wrap` on the
 * tray and `min-width:132px` (`min-w-tab`) under every tab. Those two are also
 * one decision — a floor without a wrap overflows, because that tray's six tabs
 * need 6x132 and no tray is that wide — and they are the six-tab tray's and not
 * the three-tab tray's. So it is a prop.
 *
 * `halfOnMobile` is the reader comments tray's own wrap (Reader L71–72): at
 * <=760 the tray wraps and each tab is `flex:1 1 calc(50% - 4px)`, two per row.
 *
 * P4 — padding, type size and both radii are ROLES (roles.css): the values
 * above on the panel, and on the reader the comments tray's `11px 8px`, 13.5px,
 * radius 10 in a radius-13 tray (Reader L731–733). Drawn there the tab is
 * 11x2 + 13.5x1.5 = 42.25px, so the same 4px inset still clears 44.
 */
export function NavTabTray({
  tabs, value, onChange, label, stretch = true, wrap = false, halfOnMobile = false, className = '',
}: {
  tabs: NavTab[]
  value: string
  onChange: (id: string) => void
  label: string
  /**
   * `flex:1` on every tab, which is what both trays draw. Pass `false` for
   * content-sized tabs — a shape the deliverable does not have.
   */
  stretch?: boolean
  /**
   * The audit tray's pair: the tray wraps and every tab gets `min-w-tab`'s
   * 132px floor, so more tabs than fit one row break onto the next instead of
   * squashing to nothing.
   */
  wrap?: boolean
  /** Reader L71–72: at <=760 the tray wraps, two tabs to a row. */
  halfOnMobile?: boolean
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)

  function onKeyDown(e: KeyboardEvent) {
    const rtl = document.documentElement.getAttribute('dir') === 'rtl'
    const at = tabs.findIndex((t) => t.id === value)
    // Arrow keys follow the writing direction, so in RTL the left arrow advances.
    const step =
      e.key === 'ArrowLeft' ? (rtl ? 1 : -1)
      : e.key === 'ArrowRight' ? (rtl ? -1 : 1)
      : 0
    let next = -1
    if (step !== 0) next = Math.min(tabs.length - 1, Math.max(0, at + step))
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0 || next === at) return
    e.preventDefault()
    onChange(tabs[next].id)
    box.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      ref={box}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex gap-s1 p-s1 rounded-role-tray bg-tile-v2 ${wrap ? 'flex-wrap' : ''} ${halfOnMobile ? 'max760:flex-wrap' : ''} ${className}`}
    >
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`relative before:absolute before:content-[""] before:-inset-[4px] px-role-tab-x py-role-tab-y rounded-role-tab border-0 cursor-pointer text-role-tab font-bold ${stretch ? 'flex-1' : ''} ${wrap ? 'min-w-tab' : ''} ${halfOnMobile ? 'max760:basis-tab-half max760:min-w-0' : ''} ${active ? 'bg-violet text-card' : 'bg-transparent text-violet'}`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
