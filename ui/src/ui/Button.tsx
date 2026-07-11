import type { ButtonHTMLAttributes } from 'react'

type Variant = 'coral' | 'violet' | 'green' | 'ghost'
const V: Record<Variant, string> = {
  coral: 'btn-coral', violet: 'btn-violet', green: 'btn-green', ghost: 'btn-ghost',
}

export function Button({ variant = 'ghost', className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`btn ${V[variant]} ${className}`} {...props} />
}
