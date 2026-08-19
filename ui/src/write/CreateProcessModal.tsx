import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProcess, useNextId } from '../api/hooks'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { TextField } from '../ui/TextField'

/** §5.2's field label, and the two read-only boxes' shared shape.
 *
 *  `TextField` owns the editable field; the department and the suggested id are
 *  not fields at all — they are values the sender may not change — so they are
 *  drawn as tinted boxes rather than as disabled inputs, which would offer a
 *  caret to something that will never take one. */
const LABEL = 'block text-fs-xxs font-bold text-muted mb-s2'
const READONLY = 'w-full px-s6 py-s5 rounded-input bg-tile-v2 text-fs-sm'

/**
 * §3.3's 460 dialog — a name, and the id the SERVER will allocate.
 *
 * **The id is shown and never sent.** INV-1 puts id allocation in the
 * `allocate-id` CLI, so `/next-id` is a preview of what the POST will be given,
 * not an input to it: `useCreateProcess` posts `{ department, name }` and the
 * backend allocates. A field here would let a caller propose one.
 */
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
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title="ایجاد فرآیند جدید"
      subtitle="شناسه به‌صورت خودکار توسط سامانه تخصیص می‌یابد."
      footer={
        <div className="flex gap-s5">
          {/* S4 — `loading`, not `disabled`: `disabled={create.isPending}` drew
              no visible change at all, so the wait looked like a frozen button.
              `loading` forces `disabled` itself, so nothing is lost. */}
          <Button variant="coral" onClick={doCreate}
            loading={create.isPending} loadingLabel="در حال ساخت…"
            className="flex-1 px-s8 text-fs-menu">ایجاد و ویرایش</Button>
          <Button variant="ghost" onClick={onClose}
            className="flex-1 px-s8 text-fs-menu">انصراف</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-s6">
        <div>
          <span className={LABEL}>دپارتمان</span>
          <div className={`${READONLY} text-muted`}>{departmentName}</div>
        </div>
        <TextField label="نام فرآیند" value={name} onChange={setName}
          placeholder="مثلاً: فرآیند کنترل کیفیت" />
        <div>
          <span className={LABEL}>شناسهٔ پیشنهادی سامانه</span>
          {/* §8 — a mono process id is a genuine latin island, several levels
              down inside an RTL dialog, so this `dir` is the kind the scroll-box
              rule deliberately does not reach. */}
          <div dir="ltr" className={`${READONLY} text-violet font-mono`}>{next?.next_id ?? '…'}</div>
        </div>
      </div>
    </Dialog>
  )
}
