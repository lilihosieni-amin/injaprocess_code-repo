import type { ReactNode } from 'react'

type Kind = 'input' | 'control' | 'output' | 'mech'

const K: Record<Kind, string> = {
  input: 'bg-icom-input text-icom-input',
  control: 'bg-icom-control text-icom-control',
  output: 'bg-icom-output text-icom-output',
  mech: 'bg-icom-mech text-icom-mech',
}

export function Chip({ kind, children }: { kind: Kind; children: ReactNode }) {
  return (
    <span className={`inline-block px-[0.6em] py-[0.25em] rounded-chip text-caption break-words min-w-0 max-w-full ${K[kind]}`}>
      {children}
    </span>
  )
}
