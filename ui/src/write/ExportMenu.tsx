import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useCreateExport } from '../api/hooks'
import { ExportModal } from './ExportModal'
import type { ExportKind } from '../api/types'

const KINDS: { kind: ExportKind; label: string; hint: string; tile: string; icon: ReactNode }[] = [
  {
    kind: 'flowchart',
    label: 'خروجی مستندات کامل',
    hint: 'سند رسمی با فلوچارت تعاملی',
    tile: 'bg-tile-v text-violet',
    icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" />,
  },
  {
    kind: 'steps',
    label: 'خروجی راهنمای گام‌به‌گام',
    hint: 'فهرست ساده و خوانا برای پرسنل',
    tile: 'bg-[#FBEEDC] text-[#B4690E]',
    icon: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.4" /><circle cx="4.5" cy="12" r="1.4" /><circle cx="4.5" cy="18" r="1.4" /></>,
  },
]

/** The title shown in the modal header — the export being built. */
const TITLE: Record<ExportKind, string> = {
  flowchart: 'خروجی مستندات کامل — سند رسمی',
  steps: 'راهنمای گام‌به‌گام کار — برای پرسنل',
}

export function ExportMenu({ department }: { department: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ExportKind | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const create = useCreateExport(department)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  function run(k: ExportKind) {
    setOpen(false)
    setKind(k)
    create.mutate(k)
  }

  const status = create.isPending ? 'pending' : create.isError ? 'failed' : create.isSuccess ? 'ready' : 'pending'

  return (
    <div dir="rtl" ref={wrap} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={create.isPending}
        title="خروجی‌ها" aria-label="خروجی‌ها" aria-haspopup="menu" aria-expanded={open}
        className="flex items-center justify-center w-[42px] h-[42px] border-[1.5px] border-line bg-white text-violet rounded-xl disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>

      {open && (
        <div role="menu" className="absolute top-[calc(100%+8px)] end-0 w-[288px] bg-white border border-line rounded-[14px] shadow-modal z-40 p-[7px]">
          {KINDS.map((k) => (
            <button key={k.kind} role="menuitem" onClick={() => run(k.kind)}
              className="flex items-start gap-[11px] w-full text-right px-3 py-[11px] rounded-[10px] hover:bg-tile-v2">
              <span className={`w-[34px] h-[34px] shrink-0 rounded-[10px] flex items-center justify-center ${k.tile}`}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{k.icon}</svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[13.5px] text-ink">{k.label}</span>
                <span className="block text-[11.5px] text-muted mt-[3px] leading-relaxed">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {kind && (
        <ExportModal
          title={TITLE[kind]}
          status={status}
          // absolute so the copied text is worth pasting, and correct on any host (D16)
          url={create.data ? `${window.location.origin}${create.data.url}` : undefined}
          error={create.error?.message}
          onRetry={() => create.mutate(kind)}
          // Closing only dismisses the modal. Resetting a still-pending
          // mutation would flip isPending to false and re-enable the trigger
          // mid-flight — nothing aborts the POST (D-abort), so a second export
          // would race the first for the same deterministic filename and the
          // older write could land last. The observer is left alone until the
          // request settles; the next run() replaces its state anyway.
          onClose={() => { setKind(null); if (!create.isPending) create.reset() }}
        />
      )}
    </div>
  )
}
