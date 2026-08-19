import { useDeleteProcess } from '../api/hooks'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { IdBadge } from '../ui/IdBadge'

/**
 * §3.3's 440 dialog — the one deletion this product performs.
 *
 * INV-4 / FR-D8: there is no automatic deletion anywhere in the system, and
 * this is the single user-initiated permanent delete. The copy is therefore
 * about what cannot be undone rather than about what is being tidied away, and
 * the button that does it wears `Button`'s `danger` — §5.2's destructive ghost,
 * `--tile-c2` under `--conflict` behind a `--border-danger` edge — which is a
 * lower-commitment action told apart from the conflict *state* by having a
 * border.
 */
export function DeleteProcessConfirm({ pid, name, onClose }: { pid: string; name: string; onClose: () => void }) {
  const del = useDeleteProcess()
  const toast = useToast()
  function confirm() {
    del.mutate(pid, { onSuccess: () => { toast.show('فرآیند حذف شد'); onClose() } })
  }
  return (
    <Dialog
      open
      onClose={onClose}
      width="xs"
      title={`حذف کامل فرآیند «${name}»؟`}
      footer={
        <div className="flex gap-s5">
          {/* O6 — this pair was hand-rolled because `Button` had no `danger`:
              `rounded-xl` (Tailwind's 12px, not `--radius-md`), `text-sm`
              (14px, not `--fs-body`), `text-white` (not `text-card`) and
              `text-[#6B5CA5]` on its sibling — and none of `Button`'s touch
              floor, focus handling or busy state. O8/P1 — `disabled` alone
              rendered no visible change at all, so the slowest action in the
              product looked frozen. */}
          <Button variant="danger" onClick={confirm}
            loading={del.isPending} loadingLabel="در حال حذف…"
            className="flex-1 px-s8 text-fs-menu">حذف کامل فرآیند</Button>
          <Button variant="ghost" onClick={onClose}
            className="flex-1 px-s8 text-fs-menu">انصراف</Button>
        </div>
      }
    >
      <div className="mb-s5"><IdBadge>{pid}</IdBadge></div>
      <p className="text-fs-sm text-muted leading-loose m-0">
        کل فرآیند همراه با فلوچارت، گره‌ها، KPIها و تعارض‌هایش <b>برای همیشه و بدون امکان بازیابی</b> حذف می‌شود و از فهرست خارج می‌گردد. شناسهٔ این فرآیند نیز دیگر هرگز دوباره استفاده نمی‌شود.
      </p>
    </Dialog>
  )
}
