import { useEffect, useRef, useState } from 'react'
import { useCreateExport } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { ExportModal } from './ExportModal'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import type { ExportKind } from '../api/types'

const KINDS: { kind: ExportKind; label: string; hint: string; tile: string; icon: string }[] = [
  {
    kind: 'flowchart',
    label: 'خروجی مستندات کامل',
    hint: 'سند رسمی با فلوچارت تعاملی',
    tile: 'bg-tile-v text-violet',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  },
  {
    kind: 'steps',
    label: 'خروجی راهنمای گام‌به‌گام',
    hint: 'فهرست ساده و خوانا برای پرسنل',
    // `--tile-warn` / `--warn` by name: the pair used to be two hex literals
    // written out, which is a second home for two values the theme already
    // keeps and `ProcessList` already reads for its sub-process tag.
    tile: 'bg-tile-warn text-warn',
    icon: 'M9 6h11M9 12h11M9 18h11M3.1 6h.01M3.1 12h.01M3.1 18h.01',
  },
]

/** The `⋯` the trigger draws. §5.2 sanctions the character elsewhere; here the
 *  design draws three filled dots, so it is a path. */
const DOTS = 'M5 12h.01M12 12h.01M19 12h.01'

/**
 * What the dialog says when the department was documented and the PDF was not
 * printed — owner ruling, *"the export button should just create pdf"*.
 *
 * The old arrangement had no such state: the response's one `url` was the HTML
 * and it was always there, so a failed render cost the reader nothing the panel
 * could see. Now the PDF **is** the deliverable, so "the export ran and produced
 * no PDF" is a failure and is said as one. It is a deployment fault (a browser
 * that is missing, crashed or timed out) rather than anything the person
 * pressing the button did, so the sentence points at the operator and still
 * offers «تلاش دوباره», which is the right act if the browser was merely busy.
 */
const NO_PDF = 'سند ساخته شد ولی فایل PDF آن روی سرور تولید نشد؛ دوباره تلاش کنید و اگر تکرار شد به مدیر سامانه بگویید.'

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
  const can = useCan(useSession().data)

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

  // A 2xx with no `pdf_url` is a failure now — see `NO_PDF`. `ExportModal`
  // degrades `ready` with no `url` to `failed` on its own, so this only has to
  // supply the reason; stating it here rather than there keeps that component
  // about the three states and this one about what an export is.
  const noPdf = create.isSuccess && create.data?.pdf_url === undefined
  const status = create.isPending ? 'pending'
    : create.isError || noPdf ? 'failed'
      : create.isSuccess ? 'ready' : 'pending'

  // Cosmetic only: POST /api/departments/{code}/exports/{kind} re-derives
  // `export_pdf` from the session row and refuses regardless of what is drawn.
  // Asked per kind, with the same target the route gates on
  // (`dept:{code}/report:{kind}` — see `_report_target` in routers/exports.py):
  // a department-wide grant covers every kind, while a report-scoped one covers
  // exactly its own, so asking about the bare department instead would hide a
  // steps export from someone the server would happily serve it to.
  // `reader_no_download` holds no `export_pdf` at all and gets no menu — which
  // is the whole purpose of that role, and the one affordance it must never see.
  const kinds = KINDS.filter((k) => can('export_pdf', `dept:${department}/report:${k.kind}`))
  if (kinds.length === 0) return null

  return (
    // O1 — the direction is not pinned here. §8's scroll box flips its own
    // immediate children back in `base.css`; this component used to re-pin the
    // direction itself, because `ProcessList` once set it as an attribute on
    // the scrolling region and flipped back only the one child it remembered.
    <div ref={wrap} className="relative shrink-0">
      {/* O2 — the trigger was an arbitrary 42px square, which is neither a
          token nor the design's own number: `--size-iconbtn` is the panel's icon
          button at 40. `IconButton` owns the 44px hit target and the accessible
          name; the drawn box is the 40 inside it, and it carries the fill and
          the edge because `IconButton`'s own `bg-transparent`/`border-0` would
          beat them on the button element whatever order the class string is in
          (the same trap `Overlay`'s CloseButton documents). */}
      <IconButton
        label="خروجی‌ها"
        onClick={() => setOpen((v) => !v)}
        disabled={create.isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className="disabled:opacity-60"
        icon={
          <span className="flex items-center justify-center w-iconbtn h-iconbtn border-hairline border-line bg-card text-violet rounded-button">
            <Icon d={DOTS} px={18} stroke={3.2} />
          </span>
        }
      />

      {open && (
        <div role="menu" className="absolute top-full mt-s4 end-0 min-w-menu bg-card border border-line rounded-tile shadow-pop z-dropdown p-popover">
          {kinds.map((k) => (
            // O5 — `text-start`, and not the physical alignment this row used
            // to carry. It happened to look correct only because two physical
            // offsets cancelled; in an LTR locale the label would align to the
            // far side of a tile that had not moved with it.
            <button key={k.kind} role="menuitem" type="button" onClick={() => run(k.kind)}
              className="flex items-start gap-option w-full text-start px-s6 py-option-y rounded-control border-0 bg-transparent cursor-pointer hover:bg-tile-v2">
              <span className={`w-tool h-tool shrink-0 rounded-control flex items-center justify-center ${k.tile}`}>
                <Icon d={k.icon} px={17} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-fs-menu text-ink">{k.label}</span>
                <span className="block text-fs-xs text-muted mt-hint leading-relaxed">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {kind && (
        <ExportModal
          title={TITLE[kind]}
          status={status}
          // **The PDF, never the document** — owner ruling. Absolute so the
          // copied text is worth pasting, and correct on any host (D16).
          url={create.data?.pdf_url ? `${window.location.origin}${create.data.pdf_url}` : undefined}
          error={create.error?.message ?? (noPdf ? NO_PDF : undefined)}
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
