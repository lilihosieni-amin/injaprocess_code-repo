import { useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

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
        {/* The last unicode glyph in src/ui/ (audit P7). «no icon font, no PNG
            icons, no emoji, no unicode-glyph icons» — and a `−`/`+` in a span
            is a character standing in for a drawing, not a drawing. Sized by
            `--size-chevron`, the name the theme already gives a chevron glyph,
            rather than by a number this legacy file would then own. The span
            was aria-hidden and `Icon` is too, so the header's accessible name
            — which src/ui/controls.test.tsx finds it by — does not move. */}
        <Icon
          name={open ? 'chevronUp' : 'chevronDown'}
          stroke={2.4}
          className="w-chevron h-chevron flex-none"
        />
      </button>
      {open && <div id={panelId} className="p-4">{children}</div>}
    </div>
  )
}
