import { useId, useState, type ReactNode } from 'react'

export function Accordion({
  title, children, defaultOpen = false,
}: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <div className="border border-warm rounded-card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-touch px-4 flex items-center justify-between gap-3 bg-tile-v2 border-0 cursor-pointer text-subtitle font-bold text-ink text-start"
      >
        {title}
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div id={panelId} className="p-4">{children}</div>}
    </div>
  )
}
