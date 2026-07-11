import type { ReactNode } from 'react'

type Kind = 'input' | 'control' | 'output' | 'mech'
const K: Record<Kind, string> = {
  input: 'chip-input', control: 'chip-control', output: 'chip-output', mech: 'chip-mech',
}

export function Chip({ kind, children }: { kind: Kind; children: ReactNode }) {
  return <span className={K[kind]}>{children}</span>
}
