import { useDeleteProcess } from '../api/hooks'
import { useToast } from './ToastProvider'
import { IdBadge } from '../ui/IdBadge'

export function DeleteProcessConfirm({ pid, name, onClose }: { pid: string; name: string; onClose: () => void }) {
  const del = useDeleteProcess()
  const toast = useToast()
  function confirm() {
    del.mutate(pid, { onSuccess: () => { toast.show('فرآیند حذف شد'); onClose() } })
  }
  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-[72] p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal">
        <div className="p-6 pb-5 text-center">
          <div className="font-extrabold text-[17px] text-ink mb-2">حذف کامل فرآیند «{name}»؟</div>
          <div className="mb-2.5"><IdBadge>{pid}</IdBadge></div>
          <div className="text-[13px] text-muted leading-loose">کل فرآیند همراه با فلوچارت، گره‌ها، KPIها و تعارض‌هایش <b>برای همیشه و بدون امکان بازیابی</b> حذف می‌شود و از فهرست خارج می‌گردد. شناسهٔ این فرآیند نیز دیگر هرگز دوباره استفاده نمی‌شود.</div>
        </div>
        <div className="flex gap-2.5 px-[22px] pb-[22px]">
          <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl text-sm font-bold text-[#6B5CA5]">انصراف</button>
          <button onClick={confirm} disabled={del.isPending} className="flex-1 py-3 border-0 bg-conflict rounded-xl text-sm font-bold text-white">حذف کامل فرآیند</button>
        </div>
      </div>
    </div>
  )
}
