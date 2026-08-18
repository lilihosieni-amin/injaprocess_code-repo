import { useId } from 'react'
import type { FieldGround } from './fieldFrame'
import {
  FIELD_FRAME, FIELD_LABEL, FIELD_PAD, FIELD_PAD_TEXTAREA, FIELD_TYPE,
  FIELD_TYPE_TEXTAREA, fieldEdge, fieldGround, fieldHint,
} from './fieldFrame'

export interface TextFieldProps {
  /** F11 — a bound label, never a placeholder standing in for one. */
  label: string
  value: string
  onChange: (next: string) => void
  /**
   * The rule statement under the control. When `invalid` it becomes the error
   * line — §4.6: "there is no field-level error style in S1; errors are stated
   * in copy: a 11.5px/600 `--conflict` line under the offending control". The design
   * system's own TextField leaves the hint neutral while invalid, which is
   * §9.11's complaint about it; this is the fix, not a deviation.
   */
  hint?: string
  invalid?: boolean
  multiline?: boolean
  rows?: number
  type?: 'text' | 'email' | 'tel' | 'url'
  /** §8 — a latin island: username, process id, IP. Pins LTR and sets mono. */
  ltr?: boolean
  /**
   * §1.2 — the ground the control sits on. Defaults to the card, except for a
   * textarea, which the design always draws on the sub-panel surface. A caller
   * inside a sub-panel (the reader's profile block, a dialog's tinted section)
   * asks for `'sub'` so the field is not a white box on a near-white ground.
   */
  ground?: FieldGround
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  required?: boolean
  name?: string
  id?: string
  className?: string
}

/**
 * One field for the whole product. The app had none, and 25 hand-rolled
 * `<input>`/`<textarea>` elements across 13 files each invented their own.
 *
 * There is no scale prop: what the two surfaces draw differently, roles.css
 * moves under `[data-surface='reader']` (R3, ledger L-41), so a caller writes
 * `<TextField>` and the surface decides. For this component that is the
 * textarea's type and nothing else — padding, radius, border weight, focus
 * colour, the label and the single-line control's own 14px are measurably the
 * same in both deliverables, so they are fixed steps (see FIELD_TYPE).
 */
export function TextField({
  label, value, onChange, hint, invalid = false, multiline = false, rows = 3,
  type = 'text', ltr = false, ground, placeholder, autoComplete, disabled = false,
  required = false, name, id: given, className = '',
}: TextFieldProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const edge = fieldEdge(invalid)
  const bg = fieldGround(ground ?? (multiline ? 'sub' : 'card'))
  // §8 — the latin island is a property of the VALUE, not of the element that
  // holds it: a username typed into a textarea is as latin as one typed into an
  // input. The first cut applied this to the input branch only and silently
  // discarded `ltr` on the other, which is a prop that lies about what it did.
  const island = ltr ? 'font-mono' : ''

  return (
    <div className={className}>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      {multiline ? (
        <textarea
          id={id} name={name} value={value} rows={rows} required={required}
          disabled={disabled} placeholder={placeholder}
          dir={ltr ? 'ltr' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${FIELD_TYPE_TEXTAREA} ${edge} ${FIELD_PAD_TEXTAREA} ${bg} resize-y ${island}`}
        />
      ) : (
        <input
          id={id} name={name} value={value} type={type} required={required}
          disabled={disabled} placeholder={placeholder} autoComplete={autoComplete}
          dir={ltr ? 'ltr' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${FIELD_TYPE} ${edge} ${FIELD_PAD} ${bg} ${island}`}
        />
      )}
      {hint !== undefined && <p id={hintId} className={fieldHint(invalid)}>{hint}</p>}
    </div>
  )
}
