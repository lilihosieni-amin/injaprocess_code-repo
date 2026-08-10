import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './IconButton'
// I7 — the dismissible stack Menu.tsx also joins. Kept in its own module
// (rather than defined and exported directly here) so this file's exports stay
// components-only — a named non-component export from a component file trips
// react-refresh/only-export-components, which the same rule already flags on
// the two hooks-beside-a-provider files (Toast.tsx, write/ToastProvider.tsx);
// this file doesn't need to grow a third instance of that warning.
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
)

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// FIX 2 — a module-level stack of open overlays. Escape only acts on the topmost;
// depth (index in the stack) drives z-index so later overlays paint above earlier
// ones. FIX 8 piggybacks on the same stack to lock body scroll only while at least
// one overlay is open, and unlock only once the last one closes. Scoped to Overlay
// instances only — a Menu opening must not lock page scroll or shift another
// Overlay's z-index depth.
let openOverlays: symbol[] = []
let savedBodyOverflow: string | null = null

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
  const identity = useRef(Symbol('overlay')).current
  const titleId = useId()
  const [depth, setDepth] = useState(0)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null

    if (openOverlays.length === 0) {
      savedBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    setDepth(openOverlays.length)
    openOverlays = [...openOverlays, identity]
    pushDismissible(identity)

    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    return () => {
      openOverlays = openOverlays.filter((id) => id !== identity)
      popDismissible(identity)
      if (openOverlays.length === 0) {
        document.body.style.overflow = savedBodyOverflow ?? ''
      }
      // FIX 6 — a delete confirmation's trigger is often the row it just deleted;
      // focusing a detached element is a silent no-op in some browsers but not
      // guaranteed, so check it's still attached before trying.
      if (restoreTo.current && document.contains(restoreTo.current)) {
        restoreTo.current.focus()
      }
    }
  }, [open, identity])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      // FIX 2 / I7 — with dismissibles stacked (Overlay or Menu), only the
      // topmost responds. Checked against the shared stack, not the
      // Overlay-only one, so a Menu opened on top of this Dialog is correctly
      // seen as topmost and this Dialog defers to it.
      if (!isTopDismissible(identity)) return

      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      // F11 — Tab wraps inside the overlay rather than escaping to the page behind it.
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      // FIX 1 — a mousedown on non-focusable chrome (the title, the padding) blurs
      // to <body>, which is neither `first` nor `last`. Without this branch, Tab from
      // there walks into the page behind the scrim even though aria-modal says it's inert.
      if (!box.current.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, identity])

  if (!open) return null

  // F5 — bottom sheet below md, panel or centred dialog above it. Written once so
  // no screen implements its own mobile variant and none can forget to.
  // FIX 5 — only what differs between the two presentations lives here; the shared
  // bottom-sheet shape (full width, top-rounded below md, panel-rounded above it)
  // is on the box below so it can't be mistaken for something that distinguishes them.
  const shape =
    presentation === 'sheet'
      ? 'max-h-[88vh] md:w-[var(--width-drawer)] md:h-full md:max-h-none md:me-auto md:ms-0'
      : 'max-h-[92vh] md:w-auto md:max-w-[560px] md:max-h-[85vh]'

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-scrim md:items-center"
      style={{ zIndex: 50 + depth * 10 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-card shadow-modal overflow-auto p-6 w-full rounded-t-panel md:rounded-panel ${shape}`}
      >
        <div className="flex items-center gap-3 mb-4">
          <h2 id={titleId} className="text-title font-extrabold text-ink m-0 flex-1">{title}</h2>
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
