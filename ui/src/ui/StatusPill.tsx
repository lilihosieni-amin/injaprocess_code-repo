type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

const T: Record<Tone, string> = {
  ok: 'bg-tile-ok text-green',
  warn: 'bg-tile-warn text-warn',
  danger: 'bg-tile-c text-conflict',
  neutral: 'bg-tile-dead text-muted',
  info: 'bg-tile-info text-info',
}

/** Status always carries text. Colour is reinforcement, never the message (F11). */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-chip text-caption font-bold ${T[tone]}`}>
      {label}
    </span>
  )
}
