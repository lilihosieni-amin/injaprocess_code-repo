import { useRef, type KeyboardEvent } from 'react'

export interface NavTab { id: string; label: string }

/**
 * The segmented tray (§5.2) — the most repeated composite in the deliverable.
 *
 * This is a **tablist**, for a real set of alternative views: the comments
 * tabs, the audit tabs, the flow view switch. The top bar's nav tray looks
 * identical and is not one — those entries navigate, so PanelShell composes the
 * same shell around links rather than importing this and lying about the role.
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
            className={`px-s7 py-s4 rounded-tool border-0 cursor-pointer text-fs-sm2 font-bold ${stretch ? 'flex-1' : ''} ${active ? 'bg-violet text-card' : 'bg-transparent text-violet'}`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
