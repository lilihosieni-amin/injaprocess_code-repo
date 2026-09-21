import { useId, useState, type ReactNode } from 'react'
import { useDepartments, useProcess } from '../api/hooks'
import { ApiError } from '../api/client'
import { useCreateComment } from '../api/comments'
import { useSession } from '../auth/useSession'
import { composeContext, pathLine, type ComposeAnchor } from '../lib/comments'
import { TextField } from '../ui/TextField'
import { Icon } from '../ui/Icon'
import { useSurface } from '../ui/surface'
import { useToast } from '../write/ToastProvider'
import { useComments, useEscape } from './state'

/**
 * The fixed 380px pane both the composer and the department drawer are drawn
 * in: Reader L940–941 / L903–904, Panel L2844–2845 / L2877–2878. At ≤760 it is
 * a bottom sheet over the scrim — Reader L76–77 (`data-r-composewrap`,
 * `data-r-composebox`).
 */
export function FixedPane({ title, className, onClose, children }: {
  title: (id: string) => ReactNode
  className: string
  onClose: () => void
  children: ReactNode
}) {
  const id = useId()
  useEscape(onClose)
  return (
    <div data-r-composewrap className={
      'fixed inset-y-0 end-0 w-composer z-drawer flex items-stretch '
      + 'max760:inset-0 max760:w-auto max760:bg-scrim max760:items-end'}>
      <div data-r-composebox role="dialog" aria-modal="true" aria-labelledby={id} className={
        `w-full overflow-auto bg-card border-s border-warm ${className} `
        + 'max760:max-h-[88vh] max760:rounded-t-sheet max760:border-s-0'}>
        {title(id)}
        {children}
      </div>
    </div>
  )
}

/** The design's «×»: 32/9 in the drawers and the Panel composer, 34/10 in the Reader composer, 32/8 on the flow. */
const CLOSE = {
  md: 'w-close h-close rounded-tool text-fs-dialog',
  lg: 'w-tool h-tool rounded-control text-fs-h3',
  flow: 'w-close h-close rounded-reveal text-fs-dialog',
} as const

export function CloseX({ at = 'md', onClick }: { at?: keyof typeof CLOSE; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="بستن" aria-label="بستن"
      className={`flex-none bg-tile-v2 border-0 text-muted cursor-pointer ${CLOSE[at]}`}>×</button>
  )
}

/** The coral «کامنت تازه» — Reader L689 / L914, Panel L2885. Callers gate it (addendum §7.2). */
export function NewButton({ label, onClick, className }: { label: string; onClick: () => void; className: string }) {
  return (
    <button type="button" onClick={onClick} className={
      'w-full inline-flex items-center justify-center gap-s4 p-s6 border-0 rounded-button '
      + `bg-coral text-card font-bold cursor-pointer shadow-coral ${className}`}>
      <Icon d="M12 5v14M5 12h14" px={15} stroke={2.4} />
      {label}
    </button>
  )
}

/**
 * The one composer (addendum §7.9): Reader §1.10, L939–960, drawn in the
 * Panel's own styling on the panel surface (Panel L2843–2862). The path line
 * is `pathLine` (addendum §7.1), not the design's single-admin chain.
 *
 * The textarea is drawn at the design's own metrics (`field`): Reader L952
 * 15.5px / padding 14 / radius 14 / leading 1.95 (→ --lh-loose, ledger L-17);
 * Panel L2855 13.5px / 13 / 12 / 1.9. Edge, ground and coral focus are
 * TextField's, and equal the design's.
 */
const LOOK = {
  reader: {
    pane: 'p-modal shadow-composer', head: 'mb-s8', title: 'text-fs-h3', close: 'lg',
    heading: 'چه چیزی درست نیست؟', box: 'py-s7', label: 'text-fs-lg', ctx: 'text-fs-caption mt-s3',
    placeholder: 'در عمل چطور انجام می‌شود؟ چه چیزی جا افتاده؟', rows: 6,
    field: 'text-fs-compose-reader p-s7 rounded-tile leading-loose',
    chain: 'text-fs-sm text-ink-current py-compose px-s7 bg-value-current rounded-button',
    actions: 'max760:flex-col max760:gap-s4',
    button: 'p-button-x rounded-tile text-fs-lg max760:w-full max760:flex-none',
    send: 'bg-coral shadow-coral', sendLabel: 'فرستادن',
  },
  panel: {
    pane: 'p-empty-x shadow-drawer', head: 'mb-s7', title: 'text-fs-dialog', close: 'md',
    heading: 'کامنت تازه', box: 'py-compose', label: 'text-fs-body', ctx: 'text-fs-xs mt-s2',
    placeholder: 'چه چیزی در این فرآیند با واقعیت نمی‌خواند؟', rows: 5,
    field: 'text-fs-menu p-compose rounded-button leading-loose',
    chain: 'text-fs-caption text-muted',
    actions: '',
    button: 'p-compose rounded-button text-fs-menu',
    send: 'bg-violet shadow-violet', sendLabel: 'ثبت کامنت',
  },
} as const

export function Composer({ anchor }: { anchor: ComposeAnchor }) {
  const look = LOOK[useSurface()]
  const comments = useComments()!
  const session = useSession().data
  const toast = useToast()
  const create = useCreateComment()
  const [text, setText] = useState('')
  const { data: depts } = useDepartments()
  const { data: proc } = useProcess(anchor.id, { enabled: anchor.kind === 'process' })
  const target = anchor.kind === 'node' ? anchor.label
    : anchor.kind === 'department' ? depts?.find((d) => d.code === anchor.id)?.name
      : proc?.name

  function send() {
    const body = text.trim()
    if (!body) { toast.show('چند خط بنویسید تا ثبت شود'); return }
    create.mutate({ anchorKind: anchor.kind, anchorId: anchor.id, text: body }, {
      onSuccess: () => { toast.show('کامنت شما ثبت شد'); comments.closeCompose() },
      onError: (e) => toast.show((e instanceof ApiError && e.detail) || 'کامنت ثبت نشد'),
    })
  }

  return (
    <FixedPane className={look.pane} onClose={comments.closeCompose} title={(id) => (
      <div className={`flex items-start justify-between gap-s6 ${look.head}`}>
        <div id={id} className={`font-extrabold text-ink ${look.title}`}>{look.heading}</div>
        <CloseX at={look.close} onClick={comments.closeCompose} />
      </div>
    )}>
      <div className="text-fs-caption font-bold text-muted mb-s4">دربارهٔ</div>
      <div className={`bg-surface-sub border border-border-current rounded-tile px-button-x ${look.box}`}>
        <div className={`font-bold text-ink leading-snug ${look.label}`}>{target}</div>
        <div className={`text-faint ${look.ctx}`}>{composeContext(anchor)}</div>
      </div>
      <TextField multiline rows={look.rows} label={look.placeholder} placeholder={look.placeholder}
        value={text} onChange={setText} boxClassName={look.field}
        className="mt-s7 [&>label]:sr-only" />
      <div className={`leading-loose mt-s6 [text-wrap:pretty] ${look.chain}`}>{session && pathLine(session)}</div>
      <div data-r-cmtactions className={`flex gap-s5 mt-s9 ${look.actions}`}>
        <button type="button" onClick={send} disabled={create.isPending}
          className={`flex-1 border-0 text-card font-bold cursor-pointer disabled:opacity-60 ${look.button} ${look.send}`}>
          {look.sendLabel}
        </button>
        <button type="button" onClick={comments.closeCompose}
          className={`flex-1 border-hairline border-line bg-card text-violet font-bold cursor-pointer ${look.button}`}>
          انصراف
        </button>
      </div>
    </FixedPane>
  )
}
