import { useId } from 'react'
import { useSurface } from './surface'

/**
 * The square tick on its own (§5.2), so the dropdown's multi-select options and
 * the flow bar's «تأییدشده» toggle draw this one rather than a fourth copy.
 *
 * 19×19 at radius 6 — `w-tick h-tick rounded-tick`, ledger L-10. The design
 * draws the same control at 16, 17, 18 and 19px keyed to how deeply nested it
 * is; R8 says the treatment comes from what the element *is*, so L-10 keeps two
 * by role — 19 in a list row, 16 nested inside another option — and normalises
 * 17 and 18 up to 19. The 13×13 check inside it (`w-tick-glyph h-tick-glyph`)
 * is stroke 3, which is what §"Iconography" gives for a check in a 12–13px box
 * and what the design draws inside its own 19px tick.
 *
 * The fill is violet and there is no second colour to ask for. Ledger L-48 is
 * an owner ruling: the design painted five of these violet and one green, and
 * the green one — the visibility-policy row — normalises to violet, because a
 * tick in the "on" state is a CONTROL. Green stays reserved for committed /
 * accepted / approved / confirmed STATE, which is why the flow screen's
 * confirmed mark keeps its green and this box may not borrow it.
 *
 * The unchecked edge is `--border-pick` (ledger L-09), which is the token
 * named for this role. `--line-dashed` holds the same value for the dashed
 * "add" affordances and keeps it — guards.test.ts forbids writing either value
 * here, which is the point: the token is the only place it is spelled.
 */
export function TickBox({ on, className = '' }: {
  on: boolean
  className?: string
}) {
  return (
    <span
      data-tick
      // `data-testid`, alongside `data-tick`: `Visibility.tsx` (Task 23) is
      // this component's first caller outside its own test file, and its
      // Playwright/vitest coverage measures the drawn 19px square by
      // `getByTestId('tick')` — the id every other sized measurement hook in
      // this app already uses (`state-dot`, `btn-spinner`). Purely additive:
      // no prop changed, `[data-tick]` still resolves for every existing
      // caller and test.
      data-testid="tick"
      aria-hidden
      className={`w-tick h-tick flex-none inline-flex items-center justify-center rounded-tick border-hairline text-card ${on ? 'bg-violet border-violet' : 'bg-card border-border-pick'} ${className}`}
    >
      {on && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false"
          className="w-tick-glyph h-tick-glyph">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  )
}

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  /** The explanatory line under the title — `--fs-xs` in `--text-faint` at
      `--lh-normal` (§5.2). */
  hint?: string
  /** Only for a row that is on and locked, like the policy's «نام گام». */
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * A checkbox row (§5.2): `gap:11px; padding:13px 14px; border-radius:12px` with
 * a 1.5px `--line` edge, which is what §4.3 gives "every control, input, ghost
 * button, secondary button". On, the row takes `--tile-v4` behind a
 * `--border-pick` edge.
 */
export function Checkbox({
  label, checked, onChange, hint, disabled = false,
  id: given, className = '',
}: CheckboxProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const titleId = `${id}-title`
  const text = useSurface() === 'reader' ? 'text-fs-lg' : 'text-fs-menu'
  return (
    <label
      htmlFor={id}
      className={`relative flex items-center gap-tick-row px-s7 py-tick-row-y rounded-button border-hairline ${checked ? 'bg-tile-v4 border-border-pick' : 'bg-card border-line'} ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'} ${className}`}
    >
      {/* The native input keeps the role, the state and the keyboard; the span
          beside it is paint. `sr-only` rather than `display:none`, which would
          take it out of the tab order — and `peer`, so the painted square can
          answer focus with the design's one focus idiom (§4.6). */}
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        // The <label> wraps the hint as well as the title, so implicit labelling
        // would put the explanation in the NAME and `aria-describedby` would
        // then read it out a second time as the description. Naming the title
        // explicitly leaves each string with one job.
        aria-labelledby={titleId}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <TickBox on={checked} className="peer-focus-visible:border-coral" />
      <span className="min-w-0">
        <span id={titleId} className={`block font-bold text-ink ${text}`}>{label}</span>
        {hint !== undefined && (
          <span id={hintId} className="block mt-s1 text-fs-xs text-faint leading-normal">{hint}</span>
        )}
      </span>
    </label>
  )
}
