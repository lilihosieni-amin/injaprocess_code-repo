import { useId, useState } from 'react'
import { Icon } from './Icon'
import type { FieldGround } from './fieldFrame'
import {
  FIELD_FRAME, FIELD_LABEL, FIELD_PAD_REVEAL, FIELD_TYPE,
  fieldEdge, fieldGround, fieldHint,
} from './fieldFrame'

export interface PasswordFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  hint?: string
  invalid?: boolean
  /**
   * §1.2 — the ground the control sits on. The reader's profile draws its
   * password trio on the sub-panel surface, so this cannot be hard-coded to the
   * card without that screen re-inventing the field.
   */
  ground?: FieldGround
  /**
   * The reader draws eight bullets here; the panel draws Persian copy. The
   * default is the reader's, and a caller that draws the other says so.
   */
  placeholder?: string
  autoComplete?: 'current-password' | 'new-password'
  name?: string
  id?: string
  className?: string
}

/** TextField's frame plus §5.2's reveal affordance. */
/**
 * **Every password box in this app is left-to-right** — owner ruling: *"In the
 * login page, the password input should also be left-to-right (LTR), just like
 * the mobile number field."*
 *
 * No prop, and that is the decision rather than an omission. A password is never
 * Persian prose — it is a latin/digit token, and in an RTL box the caret starts
 * at the right and the bullets grow leftwards, which is wrong on the login form
 * and equally wrong on the three other boxes this component draws (the profile's
 * current/new/repeat trio, the administrator's password reset). One question,
 * one answer, no call site to get it wrong.
 *
 * §8's rule for a latin island is `dir="ltr"` and a monospaced face; only the
 * first half applies here, because bullets have no face and a revealed password
 * is not an identifier being read back to anybody.
 *
 * `src/ui/PasswordField.tsx` is declared in `guards.test.ts`'s ISLANDS for this.
 * Spreading a `{ dir: 'ltr' }` object so the string `dir=` never appears would
 * defeat that scan without changing a pixel of the markup, so the attribute is
 * written literally below — where a reviewer and the guard both see it.
 */
export function PasswordField({
  label, value, onChange, hint, invalid = false, ground = 'card',
  placeholder = '••••••••',
  autoComplete = 'current-password', name, id: given, className = '',
}: PasswordFieldProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const [shown, setShown] = useState(false)
  const edge = fieldEdge(invalid)

  return (
    <div className={className}>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <div className="relative">
        <input
          id={id} name={name} value={value} autoComplete={autoComplete}
          type={shown ? 'text' : 'password'}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className={`${FIELD_FRAME} ${FIELD_TYPE} ${edge} ${FIELD_PAD_REVEAL} ${fieldGround(ground)}`}
        />
        {/* §8 — the button sits at the WRAPPER's inline start, which in this
            RTL app is the right-hand edge, and `FIELD_PAD_REVEAL` reserves its
            46px on the same edge of the input. The design writes the pin as a
            physical `left:8px` and the reserve as `padding-inline-start`, and in
            an RTL app those are opposite edges: taking the physical one
            literally put the eye over the value while the reserved room sat
            empty on the other side. The 46px is 8 + 32 + 6, which can only be
            the button's own edge.

            **The two are on the same edge and named differently, and that is
            not an oversight.** The input is `dir="ltr"` (see this component's
            docstring) and the wrapper is not, so `start` means opposite things
            to the two of them — `start-s4` here and `pe-reveal` there are one
            edge. `fieldFrame.ts` records the pair; changing either alone puts
            the eye back over the value.

            The pin is on this wrapper and not on the button because the button
            needs `relative` for its hit area (below), and `relative` and
            `absolute` are the same CSS property: Tailwind emits `.relative`
            AFTER `.absolute`, so writing both on one element silently unpins
            it, whatever order the class string is in. */}
        <span className="absolute start-s4 top-1/2 -translate-y-1/2 inline-flex">
          {/* F11 — the drawn control stays the design's 32x32 and a transparent
              `::before` grows the HIT AREA to 44 (32 + 2x6), the plan's one rule
              for every rung of the 30/32/34/36/40/42 ladder. It supersedes any
              per-task treatment, and src/ui/Overlay.tsx's close control is the
              same 32px box with the same 6px inset. The input is taller than 44,
              so nothing clips. */}
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            aria-label={shown ? 'پنهان کردن گذرواژه' : 'نمایش گذرواژه'}
            className={
              'relative before:absolute before:content-[""] before:-inset-[6px] ' +
              'w-reveal h-reveal inline-flex items-center justify-center border-0 ' +
              'bg-transparent rounded-reveal text-muted cursor-pointer hover:bg-tile-v2 hover:text-violet'
            }
          >
            {/* The glyph is sized by `--size-reveal-glyph` and NOT by a `px`
                prop: an SVG width attribute beats the stylesheet, and
                fields.test.tsx resolves this box through the cascade. `Icon`'s
                default stroke is the 2 that file asserts.

                `eyeOff` is `eye` struck through, and which of the two is on
                screen is the only thing a SIGHTED user has to tell the two
                states apart — `aria-pressed` and the label carry it for
                everyone else — so swapping them is a defect no accessible-name
                assertion can see. src/ui/icons/index.tsx holds both paths,
                byte-identical to the two constants this replaced. */}
            <Icon
              name={shown ? 'eyeOff' : 'eye'}
              className="w-reveal-glyph h-reveal-glyph"
            />
          </button>
        </span>
      </div>
      {hint !== undefined && <p id={hintId} className={fieldHint(invalid)}>{hint}</p>}
    </div>
  )
}
