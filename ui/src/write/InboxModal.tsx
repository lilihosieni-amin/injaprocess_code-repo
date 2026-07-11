import { useNavigate } from 'react-router-dom'
import { usePending, useResolveInboxPending } from '../api/hooks'
import { useToast } from './ToastProvider'
import { fieldFa } from '../flow/adapt'
import { IdBadge } from '../ui/IdBadge'

export function InboxModal({ onClose }: { onClose: () => void }) {
  const { data: rows = [] } = usePending()
  const resolve = useResolveInboxPending()
  const toast = useToast()
  const nav = useNavigate()

  function decide(pid: string, index: number, decision: 'accept' | 'reject') {
    resolve.mutate({ pid, index, decision }, { onSuccess: () => toast.show(decision === 'accept' ? 'پیشنهاد پذیرفته شد' : 'پیشنهاد رد شد') })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-50 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-full max-h-[86vh] bg-bg rounded-[20px] flex flex-col overflow-hidden shadow-modal">
        <div className="flex items-center justify-between px-[22px] py-5 bg-white border-b border-warm">
          <div>
            <div className="font-extrabold text-[17px] text-ink">صندوق بازبینی تعارض‌ها</div>
            <div className="text-[12px] text-muted mt-0.5">مقدار فعلی در برابر پیشنهاد — تا تصمیم شما مقدار اصلی دست‌نخورده می‌ماند.</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-tile-v2 rounded-[9px] text-muted text-lg">×</button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {rows.length === 0 ? (
            <div className="text-center py-10 text-faint">
              <div className="text-[13.5px] font-semibold text-muted">تعارض بازی وجود ندارد</div>
              <div className="text-[12px] mt-1">همهٔ پیشنهادها رسیدگی شده‌اند.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {rows.map((c) => (
                <div key={`${c.process}#${c.index}`} className="bg-white border border-warm rounded-[14px] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <IdBadge>{c.node}</IdBadge>
                    <span className="text-[12.5px] font-bold text-ink">{fieldFa(c.field)}</span>
                    <span className="text-[10.5px] text-faint">{c.source}</span>
                    <button onClick={() => { onClose(); nav(`/processes/${c.process}/flow`) }} className="ms-auto text-[11px] font-semibold text-violet border-[1.5px] border-line bg-white rounded-lg px-2.5 py-1.5">مشاهده در فلوچارت</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                    <div className="bg-[#F6F3FB] border border-[#EDE5F5] rounded-[10px] px-3 py-2.5"><div className="text-[10px] text-faint mb-1">مقدار فعلی</div><div className="text-[12.5px] text-[#5a5175] leading-normal">{String(c.current)}</div></div>
                    <div className="bg-[#FFF3F2] border border-[#FDD9D6] rounded-[10px] px-3 py-2.5"><div className="text-[10px] text-conflict mb-1">پیشنهاد جدید</div><div className="text-[12.5px] text-[#8a2b26] font-semibold leading-normal">{String(c.proposed)}</div></div>
                  </div>
                  <div className="flex gap-2.5">
                    <button onClick={() => decide(c.process, c.index, 'accept')} className="flex-1 py-2.5 rounded-[10px] bg-green text-white font-bold text-[12.5px]">پذیرش پیشنهاد</button>
                    <button onClick={() => decide(c.process, c.index, 'reject')} className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-line bg-white text-muted font-semibold text-[12.5px]">رد کردن</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
