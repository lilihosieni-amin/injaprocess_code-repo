import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'coral' | 'violet' | 'green' | 'ghost'
const V: Record<Variant, string> = {
  coral: 'btn-coral', violet: 'btn-violet', green: 'btn-green', ghost: 'btn-ghost',
}

/** Inline "work in progress" ring. Sized in em so it tracks the button's text. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg data-testid="btn-spinner" aria-hidden className={`animate-spin w-[1.05em] h-[1.05em] shrink-0 ${className}`}
      viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button({ variant = 'ghost', className = '', loading = false, loadingLabel, children, disabled, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; loadingLabel?: ReactNode }) {
  return (
    // a slow save must look busy, not frozen: the spinner is the feedback and the
    // forced `disabled` is what stops a second submit while the first is in flight
    <button
      className={`btn ${V[variant]} ${className} ${loading ? 'inline-flex items-center justify-center gap-2 cursor-progress' : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  )
}
