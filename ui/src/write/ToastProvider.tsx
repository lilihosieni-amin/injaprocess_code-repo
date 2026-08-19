import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'

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
        //
        // O5 — `start-1/2` with a LOGICAL translate, not `left-1/2
        // -translate-x-1/2`. The two physical offsets cancelled, so the toast
        // happened to centre correctly; in an LTR locale `start` becomes `left`
        // and the pair would still cancel, which is what makes this a fix rather
        // than a rename. The old form was a mirror bug waiting for the day one
        // of the two was touched.
        //
        // `text-fs-sm` (`--fs-sm` 13px) rather than the `text-[13px]` this line
        // carried: the design draws the toast at `font-size:13px`
        // (`Inja Panel.dc.html:2113`) and the scale has the rung.
        <div role="status" aria-live="polite" className="fixed bottom-s11 start-1/2 rtl:translate-x-1/2 ltr:-translate-x-1/2 bg-ink text-card px-5 py-s6 rounded-button text-fs-sm font-semibold shadow-modal z-toast flex items-center gap-s5">
          <Icon d="M20 6L9 17l-5-5" px={16} stroke={2.4} className="text-toast-check" />
          {message}
        </div>
      )}
    </Ctx.Provider>
  )
}
