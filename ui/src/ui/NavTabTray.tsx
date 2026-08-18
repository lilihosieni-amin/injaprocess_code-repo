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
 * F11 — the tab is 34.75px tall as drawn (`py-s4` 8px twice around a 12.5px
 * `--fs-sm2` line box, which inherits the base layer's unitless 1.5), and the
 * floor is 44. The plan's one rule for every control on the design's
 * 30/32/34/36/40/42 ladder decides the rest, and it supersedes any per-task
 * treatment: the PAINTED box stays the design's and a transparent `::before`
 * grows the HIT AREA, so the violet pill never becomes a 44px slab. The
 * retired `Tabs.tsx` did the opposite — `min-h-touch` inflated the drawn tab —
 * which is why replacing it without this left the tray SMALLER than the thing
 * it replaced rather than merely different.
 *
 * 34.75 + 2x5 = 44.75, so the inset is 5px here where Overlay's 32px close
 * control takes 6px and Pager's 34px page button takes 5px. It stays an
 * arbitrary value rather than a token because N is derived arithmetic — whatever
 * brings THIS control's drawn size to 44 — and not a design value: a token would
 * have to be minted per control size and would put the arithmetic in the wrong
 * place. `src/ui/composites.test.tsx` measures the sum instead, which is its
 * home. Nothing about the `::before` paints, which is why the design has no
 * opinion about it.
 *
 * The 4px gap between two tabs is narrower than 2x5, so a tab's target laps 1px
 * over its neighbour's drawn edge. That is the whole cost of the rule on a
 * segmented control and it is the smaller error: the alternative is a tray no
 * thumb can hit.
 */
export function NavTabTray({
  tabs, value, onChange, label, stretch = false, className = '',
}: {
  tabs: NavTab[]
  value: string
  onChange: (id: string) => void
  label: string
  /** `flex:1` on every tab, for a tray that spans its container. */
  stretch?: boolean
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
      className={`inline-flex gap-s1 p-s1 rounded-button bg-tile-v2 ${className}`}
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
            className={`relative before:absolute before:content-[""] before:-inset-[5px] px-s7 py-s4 rounded-tool border-0 cursor-pointer text-fs-sm2 font-bold ${stretch ? 'flex-1' : ''} ${active ? 'bg-violet text-card' : 'bg-transparent text-violet'}`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
