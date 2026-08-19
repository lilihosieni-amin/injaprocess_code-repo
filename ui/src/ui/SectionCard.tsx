import { useId, type ReactNode } from 'react'

/**
 * The sub-panel (§5.2) — the dominant container inside a form-ish screen, and
 * the role `--surface-sub` was minted for: the tint appears two dozen times
 * across the deliverables and had no name until Task 1 gave it one.
 *
 * R8 — 18px of padding (`p-s9`) and a 12px eyebrow margin (`mb-s6`), one rule
 * per role. The deliverable also draws 16px inside a dialog and 14px above a
 * list; those are one screen's local adjustments, and the dialog is already
 * 26px-padded around this box.
 *
 * The eyebrow is the section's accessible name, not decoration: eight of these
 * stack on one screen and a screen reader needs to know where each begins.
 *
 * ## What Task 25 added, and why it was three copies before
 *
 * This component destructured `{ eyebrow, skin, children, className }` and
 * forwarded nothing else, so nothing could hang a `data-card` measurement hook,
 * an `aria-label` or a `role` on it. Three screens hit that independently and
 * each hand-rolled the box rather than reach for this one —
 * `src/screens/UserDetail.tsx`'s `Panel`, `src/screens/Profile.tsx`'s raw
 * `<div>`, and `src/screens/UserFields.tsx`'s `Section` — and all three left a
 * comment saying the three copies "reconcile in one commit by whoever owns all
 * three". This is that commit for two of them.
 *
 *   · `label` — the accessible name when it is not the eyebrow's own text, and
 *     the switch between the two ROLES this box has. With a label it is a
 *     `group`: a grouping of related controls, which is what four of these on
 *     one record are. Without one it is a `<section aria-labelledby>`, which is
 *     a landmark `region` — right for the three that structure a document, and
 *     wrong for the four that structure a form, because a screen reader
 *     announcing four landmarks on one record is announcing furniture. That
 *     distinction is the reason the copies existed and it is kept, not erased.
 *   · `card` — carries `[data-card]`, the e2e harness's hook. The harness takes
 *     the FIRST match in document order, so a screen passes it once; a second
 *     would be measured by nothing and would silently claim to be measured.
 *   · `actions` — the trailing control two of §6.8's panels put on the eyebrow
 *     line, which no `className` could have added.
 *   · two more skins. `tint` and `white` were the only two, and §6.8 draws
 *     neither on its first two panels: they are `--card` over `--border-current`
 *     with **no** shadow, which is `plain`. `danger` is panel 4's boundary.
 *
 * `src/screens/UserFields.tsx` is deliberately NOT migrated, and the reason is
 * a value rather than an API: §6.14 draws its dialog sub-panels at 16px against
 * the 18px R8 fixes here, and the paragraph above says why this component
 * declines the dialog's number. A `pad` prop would settle it by giving this box
 * a density knob, which is the one thing F4/F8 says a shared component may not
 * have. Left as one screen's local adjustment, with its docstring corrected.
 */
export function SectionCard({
  eyebrow, label, skin = 'tint', actions, card = false, children, className = '',
}: {
  eyebrow?: string
  /** The accessible name, when the eyebrow is not it — and the switch from a
   *  landmark `region` to a `group`. §6.8's panel 4 has no eyebrow at all. */
  label?: string
  skin?: 'tint' | 'white' | 'plain' | 'danger'
  actions?: ReactNode
  /** Carries `[data-card]`. Once per screen — see the docstring. */
  card?: boolean
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const named = label !== undefined
  return (
    <section
      role={named ? 'group' : undefined}
      aria-label={label}
      aria-labelledby={named || eyebrow === undefined ? undefined : id}
      data-card={card ? '' : undefined}
      className={`border rounded-card p-s9 ${SKIN[skin]} ${className}`}
    >
      {eyebrow !== undefined && (
        <p id={named ? undefined : id} className="m-0 mb-s6 text-fs-xxs font-bold text-muted">
          {eyebrow}
        </p>
      )}
      {actions === undefined || actions === false ? children : (
        <div className="flex items-center justify-between gap-s6
                        max760:flex-col max760:items-stretch">
          <div className="min-w-0">{children}</div>
          <div className="flex-none max760:self-start">{actions}</div>
        </div>
      )}
    </section>
  )
}

const SKIN: Record<'tint' | 'white' | 'plain' | 'danger', string> = {
  // §5.2's sub-panel, tinted and shadowless.
  tint: 'bg-surface-sub border-border-current',
  // The card recipe proper, shadow included — §6.8's panel 3.
  white: 'bg-card border-border-card shadow-card',
  // §6.8's panels 1 and 2: white on the sub-panel edge, and FLAT. Not `tint`;
  // the deliverable writes `background-color: var(--card)` on both.
  plain: 'bg-card border-border-current',
  // §6.8's panel 4 — the boundary.
  danger: 'bg-card border-border-danger',
}
