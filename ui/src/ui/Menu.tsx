import { useEffect, useRef, useState } from 'react'
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'

export interface MenuItem { id: string; label: string; onSelect: () => void; tone?: 'danger' }

/**
 * An anchored menu popover with a TEXT trigger and one-line items.
 *
 * **Three components in this app are a menu popover and none of them is this
 * one**, and Task 25 recorded the divergence rather than closing it, because
 * closing it is a change to a shared primitive and to the three screens that
 * would adopt it. What each of them needs that `{ label, items }` cannot say:
 *
 *   · `src/write/ExportMenu.tsx` — an ICON trigger (a three-dot path inside a
 *     40px drawn box) and two-line tiled items (a coloured icon tile, a bold
 *     label, a muted hint). `label` is rendered as the trigger's own text and
 *     `MenuItem` holds one string, so both would come out as words.
 *   · `src/screens/ProcessList.tsx`'s `OverflowMenu` — the same icon trigger, at
 *     the design's 36px rather than this component's hard-coded 44px box. Its
 *     docstring says so at `ProcessList.tsx:75`.
 *   · `src/shell/PanelShell.tsx`'s admin menu — items that must be `<Link>`s
 *     with a copyable `href` (three tests assert it), each with a second hint
 *     line. Its docstring says so at `PanelShell.tsx:167`.
 *
 * The lift is to give `Menu` an icon trigger, link items and a hint line, and
 * delete all three — not to restyle it from the outside, and not to widen it
 * from inside a task that has to reverify nine screens in a browser afterwards.
 * Until then this component has no production consumer: `src/ui/controls.test.tsx`
 * is the only thing that renders it, and `min-w-menu` reaches the stylesheet
 * through it alone.
 */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const identity = useRef(Symbol('menu')).current

  useEffect(() => {
    if (!open) return
    pushDismissible(identity)
    function onKey(e: KeyboardEvent) {
      // I7 — joins Overlay's dismissible stack so only the topmost of either
      // answers Escape. Previously a bare `document` listener, which meant a
      // Menu opened inside a Dialog closed both on one Escape.
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
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-touch min-w-touch rounded-control bg-transparent text-violet border-0 cursor-pointer hover:bg-tile-v2"
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 mt-s1 min-w-menu bg-card rounded-card shadow-pop border border-line p-s1 z-dropdown">
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              onClick={() => { it.onSelect(); setOpen(false) }}
              className={`w-full min-h-touch px-s6 rounded-control text-start text-body border-0 bg-transparent cursor-pointer hover:bg-tile-v2 ${
                it.tone === 'danger' ? 'text-conflict' : 'text-ink'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
