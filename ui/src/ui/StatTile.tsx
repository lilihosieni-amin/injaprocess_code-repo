import { toFa } from '../lib/format'

export type StatTone = 'violet' | 'ink' | 'conflict' | 'ok' | 'warn'

const TONE: Record<StatTone, string> = {
  violet: 'text-violet',
  ink: 'text-ink',
  conflict: 'text-conflict',
  ok: 'text-green',
  warn: 'text-warn',
}

/**
 * §5.2 — the stat card, in the two shapes the design actually has: the header
 * tile that sits beside the title over the violet field on the departments
 * screen, and the compact tile that lives in a 4-up grid on audit and activity.
 *
 * Unlike the design system's `StatCard`, a numeric `value` is converted here.
 * That component leaves it to the caller and the caller forgot — which is how
 * the app came to render a latin numeral in a Persian header (audit S4). A
 * string is passed straight through, so a caller that has already formatted a
 * range is not converted twice.
 */
export function StatTile({
  value, label, tone = 'violet', dot = false, skin = 'feature', className = '',
}: {
  value: number | string
  label: string
  tone?: StatTone
  /** The open-conflict tile's coral dot, with `--ring-conflict-dot` around it. */
  dot?: boolean
  skin?: 'feature' | 'compact'
  className?: string
}) {
  const feature = skin === 'feature'
  const shell = feature
    ? 'rounded-card px-stat-x py-s7 min-w-stat'
    : 'rounded-tile px-stat-x-grid py-stat-y-grid text-center'
  // R14 / L-29 — 27px and 21px, both off the stat scale. NOT `text-fs-h1`:
  // that is the process summary title, and it is not what a stat numeral is.
  const size = feature ? 'text-fs-stat' : 'text-fs-stat-sm'
  // The two tiles put their label a different distance below the numeral —
  // 5px under the header tile, 7px under the 4-up one — and the theme names
  // both. `--space-stat-label` is the 4-up tile's and is not the header's;
  // mapping by role rather than by the pixel is the whole of R8/R16.
  const gap = feature ? 'mt-s2' : 'mt-stat-label'
  return (
    <div className={`bg-card border border-border-card shadow-card ${shell} ${className}`}>
      {/* `gap-stat-dot` is this gap's own token (R16). Do NOT reach for either
          of the other tokens the theme holds at the same value — one is the
          dropdown popover's inset and one is the 4-up label's margin — because
          a gap behind a name that means something else is the drift this
          rebuild exists to end. */}
      <div className={`flex items-center gap-stat-dot ${feature ? '' : 'justify-center'}`}>
        <span className={`font-extrabold leading-none ${size} ${TONE[tone]}`}>
          {typeof value === 'number' ? toFa(value) : value}
        </span>
        {dot && <span data-dot aria-hidden className="w-s4 h-s4 flex-none rounded-round bg-coral shadow-conflict-dot" />}
      </div>
      <div className={`${gap} text-fs-xs font-semibold text-muted`}>{label}</div>
    </div>
  )
}
