import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'danger'
interface Toast { id: number; message: string; tone: Tone }

const Ctx = createContext<((message: string, tone?: Tone) => void) | null>(null)

export function useToast() {
  const push = useContext(Ctx)
  if (!push) throw new Error('useToast must be used inside <ToastProvider>')
  return push
}

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
      <div className="fixed start-0 end-0 bottom-6 flex flex-col items-center gap-2 pointer-events-none z-[60]">
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
