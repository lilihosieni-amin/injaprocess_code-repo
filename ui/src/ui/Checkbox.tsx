import { useId } from 'react'
import { useSurface } from './surface'

/**
 * Which rung of the design's tick ladder a site draws.
 *
 * Ledger L-10 catalogued four tick boxes in the design and the build
 * provisionally normalised them down to two, sending 17 and 18 up to 19. Owner
 * ruling **R36** reversed that — "checkbox should be like design. exactly like
 * design" — so all four are kept, and each is named for the SITE that draws it:
 *
 *   `row`     a tick in a list row on the screen itself: the visibility policy
 *             row (panel 1764) and the flow bar's «تأییدشده» toggle (panel 579,
 *             600). 19px at radius 6, with a 13px check at stroke 3.
 *   `field`   a tick that is a whole form field inside a card or a dialog: the
 *             supervisor flag (panel 1344) and «کل سامانه» (panel 1356). 18px
 *             at radius 6, with a 12px check at stroke 3.
 *   `scope`   a tick on a department-scope cell (panel 1369). 17px at radius 6,
 *             with an 11px check at stroke 3.2.
 *   `nested`  a tick inside another option (panel 1386). 16px at radius 5, with
 *             an 11px check at stroke 3.2.
 *
 * The radius is read off the design per rung and is NOT derived from the box:
 * three of the four are drawn at 6 and only the nested one at 5. The design
 * draws one further pairing — 17px at radius 5, the new-user dialog's
 * department dropdown at panel 1897 — which this build has no site for, because
 * it draws that same choice as `ScopePicker`'s cell grid, panel 1369's 17-at-6.
 */
export type TickRung = 'row' | 'field' | 'scope' | 'nested'

/**
 * **`rung` is not a size prop, and F4/F8 is the reason it is spelled this way.**
 *
 * That guard forbids `density`/`size`/`scale`/`variant` on a shared component
 * because DENSITY comes from the shell: one component, one geometry, and the
 * surface decides how tight it is. Nothing here is a density — both shells draw
 * a given site at the identical box, and `Icon`'s `px` is the same refusal made
 * the same way: a pixel box is not a density, so it may be asked for under a
 * name that is not `size`. What a rung selects is WHICH CONTROL the design
 * draws at a site, exactly as `fieldFrame`'s `ground` selects which surface a
 * field sits on — a role, chosen once per call site, off a closed list.
 *
 * The classes live in this table rather than at the call sites for one
 * mechanical reason: Tailwind decides which of two utilities setting `width`
 * wins by its own output order, NOT by the order of the class attribute. A
 * caller appending `w-tick-scope` to a component that already writes `w-tick`
 * gets whichever the sheet happens to emit last. Exactly one rung must reach
 * the element, or the size is a coin toss — which is the reason
 * `src/ui/choices.test.tsx` asserts every rung through compiled CSS.
 */
const TICK_RUNG: Record<TickRung, { box: string; check: string; stroke: number }> = {
  row: {
    box: 'w-tick h-tick rounded-tick',
    check: 'w-tick-glyph h-tick-glyph',
    stroke: 3,
  },
  field: {
    box: 'w-tick-field h-tick-field rounded-tick',
    check: 'w-tick-glyph-field h-tick-glyph-field',
    stroke: 3,
  },
  scope: {
    box: 'w-tick-scope h-tick-scope rounded-tick',
    check: 'w-tick-glyph-nested h-tick-glyph-nested',
    stroke: 3.2,
  },
  nested: {
    box: 'w-tick-nested h-tick-nested rounded-tick-nested',
    check: 'w-tick-glyph-nested h-tick-glyph-nested',
    stroke: 3.2,
  },
}

/**
 * The square tick on its own (§5.2), so the dropdown's multi-select options and
 * the flow bar's «تأییدشده» toggle draw this one rather than a fourth copy.
 *
 * `rung` has no default, on purpose. A tick that quietly took the 19px row when
 * its caller said nothing is exactly how four rungs became two in the first
 * place; the type now makes every site declare which control it is.
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
export function TickBox({ on, rung, className = '' }: {
  on: boolean
  rung: TickRung
  className?: string
}) {
  const { box, check, stroke } = TICK_RUNG[rung]
  return (
    <span
      data-tick
      // `data-testid`, alongside `data-tick`: `Visibility.tsx` (Task 23) is
      // this component's first caller outside its own test file, and its
      // Playwright/vitest coverage measures the drawn square by
      // `getByTestId('tick')` — the id every other sized measurement hook in
      // this app already uses (`state-dot`, `btn-spinner`). Purely additive:
      // no prop changed, `[data-tick]` still resolves for every existing
      // caller and test.
      data-testid="tick"
      // …and the rung it was drawn at, so a browser measurement can say WHICH
      // tick it measured. The user dialog has three rungs open at once, and
      // `getByTestId('tick').nth(3)` is a claim about document order rather
      // than about the design.
      data-rung={rung}
      aria-hidden
      className={`${box} flex-none inline-flex items-center justify-center border-hairline text-card ${on ? 'bg-violet border-violet' : 'bg-card border-border-pick'} ${className}`}
    >
      {on && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" focusable="false"
          className={check}>
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
  /**
   * Which rung the tick in this row is drawn at (owner ruling R36).
   *
   * Defaults to `field`, and that default is a reading of the design rather
   * than a convenience: the ROW this component draws — `gap:11px;
   * padding:13px 14px; border-radius:12px` — appears exactly twice, at the
   * supervisor flag (panel 1344) and «کل سامانه» (panel 1356), and both carry
   * an 18px tick. A caller that puts this row somewhere the design draws a
   * different control says so; `ScopePicker`'s nested view menu is the one
   * that does.
   */
  rung?: TickRung
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
  label, checked, onChange, hint, disabled = false, rung = 'field',
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
      <TickBox on={checked} rung={rung} className="peer-focus-visible:border-coral" />
      <span className="min-w-0">
        <span id={titleId} className={`block font-bold text-ink ${text}`}>{label}</span>
        {hint !== undefined && (
          <span id={hintId} className="block mt-s1 text-fs-xs text-faint leading-normal">{hint}</span>
        )}
      </span>
    </label>
  )
}
