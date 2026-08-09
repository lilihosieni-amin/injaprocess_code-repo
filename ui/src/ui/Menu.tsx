import { useEffect, useRef, useState } from 'react'

export interface MenuItem { id: string; label: string; onSelect: () => void; tone?: 'danger' }

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-touch min-w-touch rounded-control bg-transparent text-violet border-0 cursor-pointer hover:bg-tile-v2"
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 mt-1 min-w-menu bg-card rounded-card shadow-pop border border-line p-1 z-40">
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              onClick={() => { it.onSelect(); setOpen(false) }}
              className={`w-full min-h-touch px-3 rounded-control text-start text-body border-0 bg-transparent cursor-pointer hover:bg-tile-v2 ${
                it.tone === 'danger' ? 'text-conflict' : 'text-ink'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
