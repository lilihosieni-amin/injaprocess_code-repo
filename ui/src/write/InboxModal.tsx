import { useNavigate } from 'react-router-dom'
import { usePending, useResolveInboxPending } from '../api/hooks'
import { useToast } from './ToastProvider'
import { fieldFa } from '../flow/adapt'
import { formatConflictValue } from '../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { IdBadge } from '../ui/IdBadge'

/** §6.13's two value panels — the same box twice, tinted for what it holds.
 *
 *  Colours by name and never as literals: the pair used to write `#F6F3FB`,
 *  `#EDE5F5`, `#5a5175`, `#FFF3F2`, `#FDD9D6` and `#8a2b26` — six hex values
 *  for four roles the theme already holds. */
const PANEL = 'rounded-input px-s6 py-s5 border'
const EYEBROW = 'text-fs-nano mb-s1'
const VALUE = 'text-fs-sm2 leading-normal whitespace-pre-line'

/**
 * §3.3's 640 dialog — the conflict inbox.
 *
 * **Nothing here writes on arrival.** FR-I3: the current value stays untouched
 * until the editor accepts or rejects, which is what the header says and what
 * `useResolveInboxPending` does — one POST per decision, per `(pid, index)`.
 */
export function InboxModal({ onClose }: { onClose: () => void }) {
  const { data: rows = [] } = usePending()
  const resolve = useResolveInboxPending()
  const toast = useToast()
  const nav = useNavigate()

  function decide(pid: string, index: number, decision: 'accept' | 'reject') {
    resolve.mutate({ pid, index, decision }, { onSuccess: () => toast.show(decision === 'accept' ? 'پیشنهاد پذیرفته شد' : 'پیشنهاد رد شد') })
  }

  return (
    // O3 — the close button goes with the hand-rolled scrim. It had no
    // `aria-label`, no `title` and no visually-hidden text, so a screen reader
    // announced "×" or nothing at all; `Overlay`'s carries «بستن».
    <Dialog
      open
      onClose={onClose}
      width="wide"
      title="صندوق بازبینی تعارض‌ها"
      subtitle="مقدار فعلی در برابر پیشنهاد — تا تصمیم شما مقدار اصلی دست‌نخورده می‌ماند."
    >
      {rows.length === 0 ? (
        <div className="text-center py-empty-y">
          <div className="text-fs-sm font-semibold text-muted">تعارض بازی وجود ندارد</div>
          <div className="text-fs-caption text-faint mt-s2">همهٔ پیشنهادها رسیدگی شده‌اند.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-s7">
          {rows.map((c) => (
            <div key={`${c.process}#${c.index}`} className="bg-card border border-border-card rounded-tile p-s8">
              <div className="flex items-center gap-s4 mb-s6">
                <IdBadge>{c.node}</IdBadge>
                <span className="text-fs-sm2 font-bold text-ink">{fieldFa(c.field)}</span>
                <span className="text-fs-xxs text-faint">{c.source}</span>
                <Button variant="ghost" className="ms-auto px-s6 text-fs-xs"
                  onClick={() => { onClose(); nav(`/processes/${c.process}/flow`) }}>
                  مشاهده در فلوچارت
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-s5 mb-s7">
                <div className={`${PANEL} bg-value-current border-border-current`}>
                  <div className={`${EYEBROW} text-faint`}>مقدار فعلی</div>
                  <div className={`${VALUE} text-ink-current`}>{formatConflictValue(c.current)}</div>
                </div>
                <div className={`${PANEL} bg-tile-c2 border-border-danger`}>
                  <div className={`${EYEBROW} text-conflict`}>پیشنهاد جدید</div>
                  <div className={`${VALUE} font-semibold text-ink-proposed`}>{formatConflictValue(c.proposed)}</div>
                </div>
              </div>
              <div className="flex gap-s5">
                <Button variant="green" className="flex-1 px-s8 text-fs-sm2"
                  onClick={() => decide(c.process, c.index, 'accept')}>پذیرش پیشنهاد</Button>
                <Button variant="ghost" className="flex-1 px-s8 text-fs-sm2"
                  onClick={() => decide(c.process, c.index, 'reject')}>رد کردن</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
