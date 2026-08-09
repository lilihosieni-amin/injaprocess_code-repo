import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
)

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 'dialog' centres above the breakpoint; 'sheet' anchors to the inline start. */
  presentation?: 'dialog' | 'sheet'
}

function Overlay({ open, onClose, title, children, presentation = 'dialog' }: OverlayProps) {
  const box = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => restoreTo.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      // F11 — Tab wraps inside the overlay rather than escaping to the page behind it.
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // F5 — bottom sheet below md, panel or centred dialog above it. Written once so
  // no screen implements its own mobile variant and none can forget to.
  const shape =
    presentation === 'sheet'
      ? 'w-full max-h-[88vh] rounded-t-panel md:rounded-panel md:w-[var(--width-drawer)] md:h-full md:max-h-none md:me-auto md:ms-0'
      : 'w-full max-h-[92vh] rounded-t-panel md:rounded-panel md:w-auto md:max-w-[560px] md:max-h-[85vh]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim md:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-card shadow-modal overflow-auto p-6 ${shape}`}
      >
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-title font-extrabold text-ink m-0 flex-1">{title}</h2>
          <IconButton label="بستن" icon={<CloseIcon />} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

export function Dialog(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="dialog" />
}

export function Sheet(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="sheet" />
}
