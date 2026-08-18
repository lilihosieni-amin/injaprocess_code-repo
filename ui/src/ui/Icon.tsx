import { ICONS, type IconName } from './icons'

/**
 * One inline SVG for every glyph in the product.
 *
 * `px` rather than `size`: guards.test.ts's F4/F8 guard forbids a size prop on
 * a shared component, and this is a pixel BOX rather than a density anyway — a
 * 12px file chip and a 26px department glyph are two different drawings, not
 * two densities of one.
 *
 * **`px` has no default, and that is load-bearing.** Half the call sites in
 * this codebase size their glyph with a class off the token scale
 * (`w-chevron h-chevron`, `w-reveal-glyph h-reveal-glyph`, `w-glyph h-glyph`)
 * and half with a width/height attribute (the FAB's 22, the dropdown's tick).
 * A width ATTRIBUTE beats a stylesheet width unconditionally, so a default `px`
 * would silently unpin every class-sized glyph in the product — and
 * src/ui/choices.test.tsx asserts, twice, that the trigger chevron and the
 * popover magnifier carry no `width` attribute at all, for exactly that reason.
 * Omitting `px` writes no attribute; the caller then has to say how big it is,
 * in one of the two ways, which is the point.
 *
 * **It writes no class of its own either.** `block flex-none` looks harmless
 * and is not: three shipped assertions compare an SVG's FULL emitted
 * declaration set (src/ui/choices.test.tsx's `styles()`), so a class this
 * component adds unasked changes what four already-reviewed files paint. The
 * class attribute is exactly what the caller passed, and absent when the caller
 * passed nothing.
 *
 * `d` wins over `name` (§5.1.2), which is how the nine department paths — which
 * live in src/lib/departments.ts beside their fixed accents — reach the
 * component without being copied into the icon set.
 */
export function Icon({
  name, d, px, stroke = 2, className,
}: {
  name?: IconName
  d?: string
  px?: number
  stroke?: number
  className?: string
}) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {d !== undefined ? <path d={d} /> : name !== undefined ? ICONS[name] : null}
    </svg>
  )
}
