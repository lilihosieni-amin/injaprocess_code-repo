import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'danger'
interface Toast { id: number; message: string; tone: Tone }

const Ctx = createContext<((message: string, tone?: Tone) => void) | null>(null)

export function useToast() {
  const push = useContext(Ctx)
  if (!push) throw new Error('useToast must be used inside <ToastProvider>')
  return push
}

// I4 — two toast systems are mounted at once: main.tsx mounts write/ToastProvider
// (every current call site's useToast resolves there) and AppShell mounts this
// one inside it, so nothing calls this provider's useToast yet. Consolidating
// them belongs to the plan that rebuilds src/write/, not here.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: Tone = 'ok') => {
    setItems((xs) => [...xs, { id: Date.now() + Math.random(), message, tone }])
  }, [])

  // FIX 1 — keyed on the head item's id, not the array itself: a later push
  // changes `items` but not `items[0]`, so it must not restart the dwell timer
  // already running for the toast on screen. Depending on the whole array made
  // every push in a stream re-arm the same 2.6s timer, so nothing ever dismissed.
  const headId = items[0]?.id

  useEffect(() => {
    if (headId === undefined) return
    const t = setTimeout(() => setItems((xs) => xs.slice(1)), 2600)
    return () => clearTimeout(t)
  }, [headId])

  return (
    <Ctx.Provider value={push}>
      {children}
      {/* Ledger **L-47** — the toast is the ceiling, `--role-z-toast` (Bootstrap's
          `$zindex-toast`, 1090). M3's inline `zIndex: 100` was a number chosen to
          out-stack `Overlay`'s own raw `50 + depth * 10`, and it stopped being
          one the moment `Overlay` joined the ladder: 100 is below both
          `--role-z-drawer` (1045) and `--role-z-modal` (1055), so a toast raised
          over an open dialog would now paint BEHIND its scrim. A rung, not a
          number, is the whole point of L-42 — and this way the two cannot come to
          disagree about which is on top again. */}
      <div className="fixed start-0 end-0 bottom-6 z-toast flex flex-col items-center gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            // F11 — a success is polite, a failure interrupts. A toast nobody can
            // hear is not feedback.
            role={t.tone === 'danger' ? 'alert' : 'status'}
            aria-live={t.tone === 'danger' ? 'assertive' : 'polite'}
            className={`px-5 py-3 rounded-control text-body font-bold shadow-modal ${
              t.tone === 'danger' ? 'bg-conflict text-card' : 'bg-ink text-card'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
