import { useState } from 'react'
import { useSaveOrder } from '../api/hooks'
import { ApiError } from '../api/client'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { IdBadge } from '../ui/IdBadge'
import { toFa } from '../lib/format'
import type { Process } from '../api/types'

const ARROW_CLS = 'w-6 h-6 shrink-0 flex items-center justify-center rounded-lg border border-line text-violet disabled:opacity-30 disabled:cursor-default'

export function ReorderModal({ department, departmentName, processes, onClose }: {
  department: string
  departmentName: string
  processes: Process[]
  onClose: () => void
}) {
  // `processes` arrives already ordered from the backend; tombstones hold no position.
  const [seq, setSeq] = useState<Process[]>(() => processes.filter((p) => !p.tombstoned))
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const save = useSaveOrder(department)
  const toast = useToast()

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= seq.length) return
    const next = [...seq]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    setSeq(next)
  }

  function doSave() {
    save.mutate({ order: seq.map((p) => p.id) }, {
      onSuccess: () => { toast.show('ترتیب فرآیندها ذخیره شد'); onClose() },
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          toast.show('ترتیب تغییر کرده است؛ فهرست به‌روزرسانی شد. پنجرهٔ ترتیب‌دهی را دوباره باز کنید.')
          onClose()
        } else {
          toast.show('ذخیرهٔ ترتیب انجام نشد')
        }
      },
    })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-50 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[560px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal flex flex-col max-h-[82vh]">
        <div className="px-[22px] py-5 bg-white border-b border-warm shrink-0">
          <div className="font-extrabold text-[17px] text-ink">ترتیب فرآیندهای {departmentName}</div>
          <div className="text-[12px] text-muted mt-0.5">{toFa(seq.length)} فرآیند · ردیف‌ها را بکشید و رها کنید یا از فلش‌ها استفاده کنید.</div>
        </div>

        <div className="p-[22px] overflow-auto flex-1">
          {seq.length === 0 && (
            <div className="text-center py-10 text-faint text-[13px]">فرآیندی برای ترتیب‌دادن وجود ندارد</div>
          )}
          <div className="flex flex-col gap-1.5">
            {seq.map((p, i) => (
              <div
                key={p.id}
                data-testid="reorder-row"
                data-pid={p.id}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null) }}
                onDragEnd={() => setDragFrom(null)}
                className={`bg-white border border-warm rounded-xl px-3 py-2 flex items-center gap-2.5 cursor-grab ${dragFrom === i ? 'border-coral shadow-coral' : ''}`}
              >
                <span className="text-faint text-[15px] leading-none select-none" aria-hidden>⣿</span>
                <span className="font-extrabold text-[12px] text-violet min-w-[20px] text-center">{toFa(i + 1)}</span>
                <IdBadge>{p.id}</IdBadge>
                <span className="font-bold text-[12.5px] text-ink flex-1 min-w-0 truncate">{p.name}</span>
                {p.parent && <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold text-[#B4690E] bg-[#FBEEDC] shrink-0">زیرفرآیند</span>}
                <button aria-label="انتقال به بالا" disabled={i === 0} onClick={() => moveTo(i, i - 1)} className={ARROW_CLS}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                </button>
                <button aria-label="انتقال به پایین" disabled={i === seq.length - 1} onClick={() => moveTo(i, i + 1)} className={ARROW_CLS}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-[22px] py-4 bg-white border-t border-warm flex gap-2.5 shrink-0">
          <Button variant="coral" onClick={doSave} disabled={save.isPending} className="flex-1 py-2.5 text-[13px]">ذخیرهٔ ترتیب</Button>
          <Button variant="ghost" onClick={onClose} className="flex-1 py-2.5 text-[13px]">انصراف</Button>
        </div>
      </div>
    </div>
  )
}
