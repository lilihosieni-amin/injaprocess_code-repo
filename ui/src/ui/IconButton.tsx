import type { ButtonHTMLAttributes, ReactElement } from 'react'
import { cloneElement } from 'react'

/**
 * An icon-only control. `label` is required and becomes the accessible name —
 * the mockups rely on `title`, which screen readers treat inconsistently and
 * which never reaches a keyboard user (F11).
 */
export function IconButton({
  label, icon, className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactElement<Record<string, unknown>> }) {
  return (
    <button
      type="button"
      className={
        'inline-flex items-center justify-center min-h-touch min-w-touch ' +
        `rounded-control bg-transparent text-violet border-0 cursor-pointer hover:bg-tile-v2 ${className}`
      }
      {...props}
      aria-label={label}
      title={label}
    >
      {cloneElement(icon, { 'aria-hidden': true, focusable: 'false' })}
    </button>
  )
}
