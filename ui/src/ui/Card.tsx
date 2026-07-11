import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-white border border-warm rounded-2xl shadow-card ${className}`} {...props} />
}
