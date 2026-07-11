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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3 rounded-xl text-[13px] font-semibold shadow-modal z-[60] flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7BE0A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          {message}
        </div>
      )}
    </Ctx.Provider>
  )
}
