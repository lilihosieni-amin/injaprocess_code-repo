import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, fetchJson } from '../api/client'
import { toFa } from '../lib/format'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'

/**
 * «تأیید همهٔ فرآیندها» — owner ruling 2026-09-30: *"admin be able accept all
 * processes in one click … show pop up that show are you sure, then accept all
 * process and it will show to everyone has access."*
 *
 * It is the single confirm, repeated: each target goes to the same
 * `POST /api/confirmations/{target}` at the fingerprint the page LOADED, one
 * after another. So the rule that makes a confirmation mean anything holds for
 * every row — a process somebody edited in the meantime answers 409 and is
 * skipped, never vouched for unseen — and every one is recorded as its own
 * `confirmation.set`, exactly as if it had been clicked by hand.
 */
export function ConfirmAllProcesses({ code, deptName, targets, onClose }: {
  code: string
  deptName: string
  targets: { target: string; fingerprint: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function confirmAll() {
    setBusy(true)
    let done = 0, changed = 0, refused = 0
    // Sequential on purpose: the backend shares one sqlite connection across
    // its workers, and a department's list is a few dozen rows at most.
    for (const { target, fingerprint } of targets) {
      try {
        await fetchJson(`/api/confirmations/${target}`,
          { method: 'POST', body: JSON.stringify({ fingerprint }) })
        done += 1
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) changed += 1
        else refused += 1
      }
    }
    qc.invalidateQueries({ queryKey: ['confirmations', code] })
    qc.invalidateQueries({ queryKey: ['departments'] })
    const parts = [`${toFa(done)} فرآیند تأیید شد`]
    if (changed) parts.push(`${toFa(changed)} فرآیند در این فاصله تغییر کرده بود و تأیید نشد`)
    if (refused) parts.push(`${toFa(refused)} فرآیند تأیید نشد`)
    toast.show(parts.join(' · '))
    onClose()
  }

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      width="xs"
      title={`تأیید همهٔ فرآیندهای دپارتمان ${deptName}؟`}
      footer={
        <div className="flex gap-s5">
          <Button variant="coral" onClick={confirmAll}
            loading={busy} loadingLabel="در حال تأیید…"
            className="flex-1 px-s8 text-fs-menu">تأیید همه</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}
            className="flex-1 px-s8 text-fs-menu">انصراف</Button>
        </div>
      }
    >
      <p className="text-fs-sm text-muted leading-loose m-0">
        {toFa(targets.length)} فرآیند تأییدنشده تأیید می‌شود و برای همهٔ کسانی که به این دپارتمان دسترسی دارند نمایش داده می‌شود.
      </p>
    </Dialog>
  )
}
