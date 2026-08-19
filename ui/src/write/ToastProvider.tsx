import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastCtx = { show: (message: string) => void }
const Ctx = createContext<ToastCtx>({ show: () => {} })

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMessage(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2600)
  }, [])
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {message && (
        // I4 — this is the toast provider every current call site actually uses
        // (main.tsx mounts it; src/ui/Toast.tsx is mounted alongside it inside
        // AppShell but nothing calls its useToast yet). It had neither role nor
        // aria-live, so every toast today is announced to nobody. This API has
        // no tone/danger variant (every call site is a plain confirmation), so
        // role="status"/aria-live="polite" covers it; add tone-based alert
        // handling here if this provider ever grows one.
        //
        // Ledger L-47 — `z-toast` (`--role-z-toast`, 1090), not the arbitrary
        // 60 it shipped. 60 out-stacked `Overlay`'s old raw `50 + depth * 10` only
        // until two overlays were open, and out-stacks its ladder rungs (1045 /
        // 1055) not at all: this is the live provider every call site uses, so
        // a toast raised over an open dialog would have painted behind its
        // scrim. The toast is the ceiling.
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3 rounded-xl text-[13px] font-semibold shadow-modal z-toast flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7BE0A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          {message}
        </div>
      )}
    </Ctx.Provider>
  )
}
