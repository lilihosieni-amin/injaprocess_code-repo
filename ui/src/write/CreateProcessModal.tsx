import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProcess, useNextId } from '../api/hooks'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'

export function CreateProcessModal({ department, departmentName, onClose }: { department: string; departmentName: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const { data: next } = useNextId(department)
  const create = useCreateProcess()
  const toast = useToast()
  const nav = useNavigate()

  function doCreate() {
    create.mutate({ department, name: name || undefined }, {
      onSuccess: (child) => { toast.show('فرآیند ایجاد شد'); onClose(); nav(`/processes/${child.id}/flow`) },
    })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(36,17,82,.45)] flex items-center justify-center z-50 p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] max-w-full bg-bg rounded-3xl overflow-hidden shadow-modal">
        <div className="px-[22px] py-5 bg-white border-b border-warm">
          <div className="font-extrabold text-[17px] text-ink">ایجاد فرآیند جدید</div>
          <div className="text-[12px] text-muted mt-0.5">شناسه به‌صورت خودکار توسط سامانه تخصیص می‌یابد.</div>
        </div>
        <div className="p-[22px]">
          <label className="text-[11px] font-bold text-muted block mb-1.5">دپارتمان</label>
          <div className="w-full px-3 py-2.5 rounded-[10px] bg-tile-v2 text-muted text-[13px] mb-3">{departmentName}</div>
          <label className="text-[11px] font-bold text-muted block mb-1.5">نام فرآیند</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: فرآیند کنترل کیفیت"
            className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-[10px] text-[13px] text-ink outline-none focus:border-coral mb-3" />
          <label className="text-[11px] font-bold text-muted block mb-1.5">شناسهٔ پیشنهادی سامانه</label>
          <div dir="ltr" className="w-full px-3 py-2.5 rounded-[10px] bg-tile-v2 text-violet font-mono text-[13px]">{next?.next_id ?? '…'}</div>
          <div className="flex gap-2.5 mt-[22px]">
            <Button variant="ghost" onClick={onClose} className="flex-1 py-2.5 text-[13px]">انصراف</Button>
            <Button variant="coral" onClick={doCreate} disabled={create.isPending} className="flex-1 py-2.5 text-[13px]">ایجاد و ویرایش</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
