import type { ReactNode } from 'react'

export function IdBadge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'violet' | 'muted' }) {
  const cls = tone === 'violet' ? 'bg-violet text-white' : 'bg-tile-v2 text-muted'
  return <span dir="ltr" className={`id-badge ${cls}`}>{children}</span>
}
