import { Dialog } from '../ui/Overlay'
import { useSurface } from '../ui/surface'

export type Decision = 'approve' | 'note' | 'reject' | 'resolve' | 'withdraw'

/** Reader L962–975 (`cmtAsk`), copy from L2651–2658. */
const COPY: Record<Decision, { title: string; body: string; ok: string; tone: string }> = {
  approve: {
    title: 'این کامنت تأیید شود؟',
    body: 'کامنت یک پله بالاتر می‌رود و از این پس متن اصلی‌اش قابل تغییر نیست.',
    ok: 'تأیید می‌کنم', tone: 'bg-green shadow-green',
  },
  note: {
    title: 'با یادداشت شما تأیید شود؟',
    body: 'کامنت یک پله بالاتر می‌رود و از این پس متن اصلی‌اش قابل تغییر نیست.',
    ok: 'تأیید می‌کنم', tone: 'bg-green shadow-green',
  },
  reject: {
    title: 'این کامنت را قبول نمی‌کنید؟',
    body: 'کامنت با دلیلی که نوشتید به نویسنده برمی‌گردد و بسته می‌شود؛ زنجیره جلوتر نمی‌رود.',
    ok: 'قبول ندارم', tone: 'bg-coral shadow-coral',
  },
  // The Editor's resolve (Panel L4288 asks `cmtAsk: 'resolve'`; the design
  // writes no copy for it). New strings, for lili.
  resolve: {
    title: 'این کامنت رسیدگی‌شده ثبت شود؟',
    body: 'کامنت بسته می‌شود و نتیجه‌اش به همهٔ کسانی که آن را دیده‌اند نشان داده می‌شود.',
    ok: 'ثبت می‌کنم', tone: 'bg-violet shadow-violet',
  },
  // The Reader author's «پس گرفتن» asks first (lili, 2026-09-22).
  withdraw: {
    title: 'این کامنت را پس می‌گیرید؟',
    body: 'کامنت از زنجیره خارج می‌شود و در سابقه می‌ماند.',
    ok: 'پس می‌گیرم', tone: 'bg-coral shadow-coral',
  },
}

/** Reader L962–975 buttons and 14px body; the Panel's (L2949–2952) are 13px/13.5px with «انصراف», body 13.5px. */
const LOOK = {
  reader: { btn: 'flex-1 p-button-x rounded-tile font-bold text-fs-lg cursor-pointer', cancel: 'بی‌خیال', body: 'text-fs-body' },
  panel: { btn: 'flex-1 p-compose rounded-button font-bold text-fs-menu cursor-pointer', cancel: 'انصراف', body: 'text-fs-menu' },
} as const

/**
 * The shared `Dialog` at its 440px confirm-comment width. It keeps the Dialog's
 * own frame (24px radius by ledger L-04, its close control) where the design
 * draws 22px and no close control.
 */
export function DecisionModal({ kind, onConfirm, onClose, pending }: {
  kind: Decision
  onConfirm: () => void
  onClose: () => void
  pending: boolean
}) {
  const c = COPY[kind]
  const look = LOOK[useSurface()]
  return (
    <Dialog open onClose={onClose} width="xs" title={c.title} footer={
      <div data-r-cmtactions className="flex gap-s5 max760:flex-col max760:gap-s4">
        <button type="button" onClick={onConfirm} disabled={pending}
          className={`${look.btn} border-0 text-card disabled:opacity-60 ${c.tone}`}>{c.ok}</button>
        <button type="button" onClick={onClose}
          className={`${look.btn} border-hairline border-line bg-card text-violet`}>{look.cancel}</button>
      </div>
    }>
      <p className={`m-0 ${look.body} text-ink-current leading-loose [text-wrap:pretty]`}>{c.body}</p>
    </Dialog>
  )
}
