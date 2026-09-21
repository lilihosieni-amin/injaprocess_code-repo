import { Dialog } from '../ui/Overlay'

export type Decision = 'approve' | 'note' | 'reject'

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
}

const BTN = 'flex-1 p-button-x rounded-tile font-bold text-fs-lg cursor-pointer'

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
  return (
    <Dialog open onClose={onClose} width="xs" title={c.title} footer={
      <div data-r-cmtactions className="flex gap-s5 max760:flex-col max760:gap-s4">
        <button type="button" onClick={onConfirm} disabled={pending}
          className={`${BTN} border-0 text-card disabled:opacity-60 ${c.tone}`}>{c.ok}</button>
        <button type="button" onClick={onClose}
          className={`${BTN} border-hairline border-line bg-card text-violet`}>بی‌خیال</button>
      </div>
    }>
      <p className="m-0 text-fs-body text-ink-current leading-loose [text-wrap:pretty]">{c.body}</p>
    </Dialog>
  )
}
