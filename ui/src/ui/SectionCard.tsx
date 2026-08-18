import { useId, type ReactNode } from 'react'

/**
 * The sub-panel (§5.2) — the dominant container inside a form-ish screen, and
 * the role `--surface-sub` was minted for: the tint appears two dozen times
 * across the deliverables and had no name until Task 1 gave it one.
 *
 * Two skins, used side by side on the Access screen: tinted and shadowless
 * (`--surface-sub` over `--border-current`), or white with the card recipe.
 *
 * R8 — 18px of padding (`p-s9`) and a 12px eyebrow margin (`mb-s6`), one rule
 * per role. The deliverable also draws 16px inside a dialog and 14px above a
 * list; those are one screen's local adjustments, and the dialog is already
 * 26px-padded around this box.
 *
 * The eyebrow is the section's accessible name, not decoration: eight of these
 * stack on one screen and a screen reader needs to know where each begins.
 */
export function SectionCard({
  eyebrow, skin = 'tint', children, className = '',
}: {
  eyebrow?: string
  skin?: 'tint' | 'white'
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const shell = skin === 'white'
    ? 'bg-card border-border-card shadow-card'
    : 'bg-surface-sub border-border-current'
  return (
    <section
      aria-labelledby={eyebrow === undefined ? undefined : id}
      className={`border rounded-card p-s9 ${shell} ${className}`}
    >
      {eyebrow !== undefined && (
        <p id={id} className="m-0 mb-s6 text-fs-xxs font-bold text-muted">{eyebrow}</p>
      )}
      {children}
    </section>
  )
}
