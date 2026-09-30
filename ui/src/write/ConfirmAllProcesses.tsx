import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, fetchJson } from '../api/client'
import { toFa } from '../lib/format'
import { useToast } from './ToastProvider'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'

/**
 * «تأیید همهٔ فرآیندها» and its undo, «لغو تأیید همهٔ فرآیندها» — owner rulings
 * 2026-09-30: *"admin be able accept all processes in one click … show pop up
 * that show are you sure"*, then *"add undo for accepting process too"*.
 *
 * Each is the single act, repeated one target after another, so nothing about
 * what a confirmation means changes:
 *
 * - **confirm** — `POST /api/confirmations/{target}` at the fingerprint the page
 *   LOADED. A process somebody edited in the meantime answers 409 and is
 *   skipped, never vouched for unseen; each landing is its own
 *   `confirmation.set`.
 * - **revoke** — `DELETE /api/confirmations/{target}`, no fingerprint:
 *   withdrawing says "whatever is there is wrong", whichever version it is.
 *   Each is its own `confirmation.revoked`. It hides the processes from readers
 *   again, so it wears the danger skin the one deletion wears.
 */
export function ConfirmAllProcesses({ mode = 'confirm', code, deptName, targets, onClose }: {
  mode?: 'confirm' | 'revoke'
  code: string
  deptName: string
  targets: { target: string; fingerprint: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const revoke = mode === 'revoke'

  async function run() {
    setBusy(true)
    let done = 0, changed = 0, refused = 0
    // Sequential on purpose: the backend shares one sqlite connection across
    // its workers, and a department's list is a few dozen rows at most.
    for (const { target, fingerprint } of targets) {
      try {
        await fetchJson(`/api/confirmations/${target}`, revoke
          ? { method: 'DELETE' }
          : { method: 'POST', body: JSON.stringify({ fingerprint }) })
        done += 1
      } catch (e) {
        if (!revoke && e instanceof ApiError && e.status === 409) changed += 1
        else refused += 1
      }
    }
    qc.invalidateQueries({ queryKey: ['confirmations', code] })
    qc.invalidateQueries({ queryKey: ['departments'] })
    const parts = [revoke ? `تأیید ${toFa(done)} فرآیند برداشته شد` : `${toFa(done)} فرآیند تأیید شد`]
    if (changed) parts.push(`${toFa(changed)} فرآیند در این فاصله تغییر کرده بود و تأیید نشد`)
    if (refused) parts.push(revoke ? `${toFa(refused)} فرآیند انجام نشد` : `${toFa(refused)} فرآیند تأیید نشد`)
    toast.show(parts.join(' · '))
    onClose()
  }

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      width="xs"
      title={revoke
        ? `لغو تأیید همهٔ فرآیندهای دپارتمان ${deptName}؟`
        : `تأیید همهٔ فرآیندهای دپارتمان ${deptName}؟`}
      footer={
        <div className="flex gap-s5">
          <Button variant={revoke ? 'danger' : 'coral'} onClick={run}
            loading={busy} loadingLabel={revoke ? 'در حال لغو تأیید…' : 'در حال تأیید…'}
            className="flex-1 px-s8 text-fs-menu">{revoke ? 'لغو تأیید همه' : 'تأیید همه'}</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}
            className="flex-1 px-s8 text-fs-menu">انصراف</Button>
        </div>
      }
    >
      <p className="text-fs-sm text-muted leading-loose m-0">
        {revoke
          ? `تأیید ${toFa(targets.length)} فرآیند برداشته می‌شود و این فرآیندها دیگر برای خوانندگان نمایش داده نمی‌شوند؛ ویرایشگران همچنان آن‌ها را می‌بینند.`
          : `${toFa(targets.length)} فرآیند تأییدنشده تأیید می‌شود و برای همهٔ کسانی که به این دپارتمان دسترسی دارند نمایش داده می‌شود.`}
      </p>
    </Dialog>
  )
}
