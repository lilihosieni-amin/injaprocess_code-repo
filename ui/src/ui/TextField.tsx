import { useId } from 'react'
import { FIELD_FRAME, FIELD_LABEL, FIELD_PAD, FIELD_PAD_TEXTAREA, fieldEdge, fieldHint } from './fieldFrame'

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
 * There is no scale prop: the panel and the reader differ only in type size,
 * which roles.css moves under `[data-surface='reader']` (R3, ledger L-41), so
 * a caller writes `<TextField>` and the surface decides. Everything else the
 * two surfaces draw — padding, radius, border weight, focus colour, the label
 * — is measurably the same in both deliverables.
 */
export function TextField({
  label, value, onChange, hint, invalid = false, multiline = false, rows = 3,
  type = 'text', ltr = false, placeholder, autoComplete, disabled = false,
  required = false, name, id: given, className = '',
}: TextFieldProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const edge = fieldEdge(invalid)

  return (
    <div className={className}>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      {multiline ? (
        <textarea
          id={id} name={name} value={value} rows={rows} required={required}
          disabled={disabled} placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${edge} ${FIELD_PAD_TEXTAREA} bg-surface-sub resize-y`}
        />
      ) : (
        <input
          id={id} name={name} value={value} type={type} required={required}
          disabled={disabled} placeholder={placeholder} autoComplete={autoComplete}
          dir={ltr ? 'ltr' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${edge} ${FIELD_PAD} bg-card ${ltr ? 'font-mono' : ''}`}
        />
      )}
      {hint !== undefined && <p id={hintId} className={fieldHint(invalid)}>{hint}</p>}
    </div>
  )
}
