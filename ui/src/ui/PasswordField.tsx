import { useId, useState } from 'react'
import { FIELD_FRAME, FIELD_LABEL, FIELD_PAD_REVEAL, fieldEdge, fieldHint } from './fieldFrame'

// Folded into `Icon` by Task 11. The design names the glyph and its size
// («17x17 eye / eye-off») but ships no path for it, and InjaIcons' 33 keys have
// no eye — ledger L-39 — so these two are drawn to the set's stated
// construction (24x24 box, currentColor stroke, round caps) rather than quoted.
const EYE = <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>
const EYE_OFF = <><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 7.7A17.6 17.6 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="M3 3l18 18" /></>

export interface PasswordFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  hint?: string
  invalid?: boolean
  autoComplete?: 'current-password' | 'new-password'
  name?: string
  id?: string
  className?: string
}

/** TextField's frame plus §5.2's reveal affordance. */
export function PasswordField({
  label, value, onChange, hint, invalid = false,
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
          placeholder="••••••••"
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${edge} ${FIELD_PAD_REVEAL} bg-card`}
        />
        {/* §8 — the design pins this button with a physical `left:8px`, which
            is the inline END in an app whose html is direction:rtl and which
            never runs ltr. Written as `end-s4`, the same way SearchField's
            magnifier keeps the design's edge without keeping its physicality. */}
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={shown ? 'پنهان کردن گذرواژه' : 'نمایش گذرواژه'}
          className="absolute end-s4 top-1/2 -translate-y-1/2 w-reveal h-reveal inline-flex items-center justify-center border-0 bg-transparent rounded-reveal text-muted cursor-pointer hover:bg-tile-v2 hover:text-violet"
        >
          <svg className="w-reveal-glyph h-reveal-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            {shown ? EYE_OFF : EYE}
          </svg>
        </button>
      </div>
      {hint !== undefined && <p id={hintId} className={fieldHint(invalid)}>{hint}</p>}
    </div>
  )
}
