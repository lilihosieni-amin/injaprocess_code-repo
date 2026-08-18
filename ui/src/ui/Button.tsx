import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'coral' | 'violet' | 'green' | 'ghost' | 'danger'

// I5 — still no horizontal padding or type size here. Nineteen call sites set
// their own, and one of them is src/flow/, which F16 freezes permanently: a
// default padding would double up against `px-3 py-[7px]` in a file this plan
// may not touch, and Tailwind's output order, not the class string's, would
// decide which won. Padding and size stay with the caller, and the surface has
// nothing to scale here — the design's button sizes are the same on both.

// The icon-to-label gap is --gap-button-icon, 7px, and NOT Tailwind's own
// `gap-2`, which is 8. The design draws 7 at every button of this shape —
// `Inja Panel.dc.html:1012` and `:1296`, `Inja Reader.dc.html:157`, `:202` and
// `:750`, each `display:inline-flex;align-items:center;gap:7px`. `gap-2` is a
// real class emitting a real rule, so no check could see the one-pixel lie
// until the role had a name of its own; `primitives.design.test.tsx` now
// asserts the compiled value, not the class.
const BASE =
  'inline-flex items-center justify-center gap-button-icon min-h-touch min-w-touch ' +
  'rounded-button font-bold cursor-pointer border-0 transition ' +
  // P1 — "Disabled keeps its surface and fades" (§4.6); a disabled control is
  // never hidden, never a pointer target, and never keeps a coloured glow that
  // says "press me".
  'disabled:cursor-default disabled:shadow-none'

// `enabled:hover:` and not `hover:`: :hover still matches a disabled <button>,
// so the old `hover:brightness-105` lit up buttons that do nothing.
const V: Record<Variant, string> = {
  coral: 'bg-coral text-card shadow-coral enabled:hover:brightness-105 disabled:opacity-60',
  violet: 'bg-violet text-card shadow-violet enabled:hover:brightness-110 disabled:opacity-60',
  green: 'bg-green text-card shadow-green enabled:hover:brightness-105 disabled:opacity-60',
  ghost: 'bg-card text-violet border-hairline border-line enabled:hover:bg-tile-v2 disabled:text-disabled',
  // §5.2 — the destructive ghost: --tile-c2 under --conflict behind a 1.5px
  // --border-danger edge. Colours are named, never repeated as literals. It is an
  // action of lower commitment, told apart from the "conflict" *state* by
  // having a border (see the ledger's "Action versus state"). The design
  // declares no hover for it, so it has none.
  danger: 'bg-tile-c2 text-conflict border-hairline border-border-danger disabled:text-disabled disabled:border-line',
}

/** Inline "work in progress" ring. Sized in em so it tracks the button's text. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg data-testid="btn-spinner" aria-hidden
      className={`animate-spin w-[1.05em] h-[1.05em] shrink-0 ${className}`}
      viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  variant = 'ghost', className = '', loading = false, loadingLabel,
  icon, block = false, children, disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  loadingLabel?: ReactNode
  /** A leading node — an inline SVG today, an <Icon/> from Task 11. */
  icon?: ReactNode
  /** Full width: a dialog footer button, or a stacked action at <=760px. */
  block?: boolean
}) {
  return (
    // a slow save must look busy, not frozen: the spinner is the feedback and the
    // forced `disabled` is what stops a second submit while the first is in flight
    <button
      className={`${BASE} ${V[variant]} ${block ? 'w-full' : ''} ${loading ? 'cursor-progress' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* S4's busy contract: the spinner takes the icon's place, it does not
          join it, so the label never shifts sideways when a save starts. */}
      {loading ? <Spinner /> : icon}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  )
}
