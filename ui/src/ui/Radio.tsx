import { useId } from 'react'
import { useSurface } from './surface'

export interface RadioProps {
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  label: string
  /** The scope line under the name — 11.5px #8a7db0 lh 1.7 (§5.2). */
  note?: string
  id?: string
  className?: string
}

/**
 * The round pick (§5.2), used by the change-supervisor dialog and nothing else.
 *
 * `gap:12px; padding:14px 15px; border-radius:14px` with a 1.5px edge — `--warm`
 * at rest, `--violet` over `--tile-v2` when picked — and a 19px ring holding an
 * 8px white pip, pushed 2px down so it sits against the first line rather than
 * the middle of a three-line option.
 *
 * There is deliberately no way to render an option the caller may not offer,
 * and no red line explaining one. The design draws a blocked candidate at
 * reduced opacity with an explanation beneath it; R5 is explicit that where a
 * control's availability depends on the target rather than the caller — "this
 * account holds more than you do" — the option is **absent**, not explained.
 * The caller filters; this cannot render a choice that would be refused.
 */
export function Radio({
  name, value, checked, onChange, label, note, id: given, className = '',
}: RadioProps) {
  const auto = useId()
  const id = given ?? auto
  const text = useSurface() === 'reader' ? 'text-fs-lg' : 'text-fs-menu'
  return (
    <label
      htmlFor={id}
      className={`relative flex items-start gap-s6 px-radio-x py-s7 rounded-tile border-hairline cursor-pointer ${checked ? 'bg-tile-v2 border-violet' : 'bg-card border-warm'} ${className}`}
    >
      <input
        id={id} type="radio" name={name} value={value} checked={checked}
        onChange={() => onChange(value)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`w-tick h-tick mt-half flex-none inline-flex items-center justify-center rounded-round border-hairline peer-focus-visible:border-coral ${checked ? 'bg-violet border-violet' : 'bg-card border-border-pick'}`}
      >
        {checked && <span className="w-s4 h-s4 rounded-round bg-card" />}
      </span>
      <span className="min-w-0">
        <span className={`block font-bold text-ink ${text}`}>{label}</span>
        {note !== undefined && (
          <span className="block mt-s2 text-fs-xs text-muted leading-normal">{note}</span>
        )}
      </span>
    </label>
  )
}
