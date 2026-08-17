import type { HTMLAttributes } from 'react'

/** §4.4 — the radii a card actually takes, by role. */
const RADIUS = {
  card: 'rounded-card',        // 16px — rows, list cards, sub-panels
  feature: 'rounded-feature',  // 20px — the department card, a wide modal
  tile: 'rounded-tile',        // 14px — KPI card, stat card, filter bar
  doc: 'rounded-doc',          // 18px — summary card, the table shell
  control: 'rounded-button',   // 12px — a card inside a drawer
} as const

/** §5.2 — the interiors the design uses. `none` is for a card that is a shell. */
const PADDING = {
  none: '',
  tight: 'p-s8',     // 16px — a sub-card inside a dialog
  card: 'p-s9',      // 18px — the sub-panel
  feature: 'p-s10',  // 22px — the department card
} as const

/**
 * One card recipe: the white --card surface, the 1px --border-card hairline
 * and the two-layer neutral --shadow-card, because the whole app sits on the
 * violet field and that shadow is what reads on it (§4.2, 25 uses; §4.3, 46
 * uses). The token names carry the values; no literal is repeated here.
 *
 * There is no `onDark`. The design system's cream-card-on-a-dark-screen idiom
 * is drawn by neither deliverable, and its two shadows are dead — ledger L-14.
 *
 * The default padding is `none`, so a card used as a shell does not have to
 * unset one; every existing caller passes its own through `className` and is
 * unaffected.
 */
export function Card({
  className = '', radius = 'card', padding = 'none', hoverLift = false, ...props
}: HTMLAttributes<HTMLDivElement> & {
  radius?: keyof typeof RADIUS
  padding?: keyof typeof PADDING
  hoverLift?: boolean
}) {
  // §4.6 — the one hover the design gives a surface: -2px, a deeper shadow and
  // a --border-pick edge, over .16s. Two surfaces use it: the department card and
  // the process row. Nothing scales and nothing bounces.
  const lift = hoverLift
    ? 'transition hover:-translate-y-lift hover:shadow-card-hover hover:border-border-pick'
    : ''
  return (
    <div
      className={`bg-card border border-border-card shadow-card ${RADIUS[radius]} ${PADDING[padding]} ${lift} ${className}`}
      {...props}
    />
  )
}
