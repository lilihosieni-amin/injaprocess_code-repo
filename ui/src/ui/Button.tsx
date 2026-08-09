import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'coral' | 'violet' | 'green' | 'ghost'

const BASE =
  'inline-flex items-center justify-center gap-2 min-h-touch min-w-touch ' +
  'rounded-button font-bold cursor-pointer border-0 transition-[filter,transform]'

const V: Record<Variant, string> = {
  coral: 'bg-coral text-card shadow-coral hover:brightness-105',
  violet: 'bg-violet text-card shadow-violet hover:brightness-110',
  green: 'bg-green text-card shadow-green hover:brightness-105',
  ghost: 'bg-card text-violet border-hairline border-line hover:bg-tile-v2',
}

/** Inline "work in progress" ring. Sized in em so it tracks the button's text. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg data-testid="btn-spinner" aria-hidden
      className={`animate-spin w-[1.05em] h-[1.05em] shrink-0 ${className}`}
      viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  variant = 'ghost', className = '', loading = false, loadingLabel, children, disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; loading?: boolean; loadingLabel?: ReactNode
}) {
  return (
    // a slow save must look busy, not frozen: the spinner is the feedback and the
    // forced `disabled` is what stops a second submit while the first is in flight
    <button
      className={`${BASE} ${V[variant]} ${loading ? 'cursor-progress' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  )
}
