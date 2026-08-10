import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-card border border-warm rounded-card shadow-card ${className}`} {...props} />
}
