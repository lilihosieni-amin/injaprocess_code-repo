import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../ui/Button'

export type ExportModalProps = {
  title: string
  status: 'pending' | 'ready' | 'failed'
  url?: string
  error?: string
  onRetry: () => void
  onClose: () => void
}

/** Clipboard write for non-secure contexts, where navigator.clipboard is
 *  undefined (the app is reachable over plain http locally, and the modal must
 *  still copy there). Returns whether the copy actually happened, so the button
 *  never claims success the browser refused. */
function copyViaTextarea(text: string): boolean {
  const t = document.createElement('textarea')
  t.value = text
  t.style.position = 'fixed'
  t.style.opacity = '0'
  document.body.appendChild(t)
  t.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(t)
  return ok
}

export function ExportModal({ title, status, url, error, onRetry, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function flip() {
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  function onCopy() {
    if (!url) return
    const clipboard = navigator.clipboard
    if (clipboard?.writeText) {
      try {
        // settles after this tick; a rejection (permission, blurred document)
        // still gets the link across through the textarea.
        clipboard.writeText(url).catch(() => { copyViaTextarea(url) })
        flip()
        return
      } catch { /* fall through to the textarea */ }
    }
    if (copyViaTextarea(url)) flip()
  }

  // A ready export with no link is nothing the user can act on, so it degrades
  // to the failure state — a success header over an empty body would lie.
  const state = status === 'ready' && !url ? 'failed' : status
  const tile =
    state === 'ready' ? 'bg-[#E4F6EC] text-green'
      : state === 'failed' ? 'bg-tile-c text-conflict'
        : 'bg-tile-v text-violet'
  const heading =
    state === 'ready' ? 'خروجی آماده شد'
      : state === 'failed' ? 'خروجی گرفته نشد'
        : 'در حال آماده‌سازی خروجی…'

  return (
    // dir is pinned, not inherited: ProcessList's scroll container is dir="ltr"
    // and mounts its modals inside it (same fix as ReorderModal).
    <div
      dir="rtl"
      data-testid="export-modal-backdrop"
      onClick={() => { if (status !== 'pending') onClose() }}
      className="fixed inset-0 bg-[rgba(36,17,82,.45)] backdrop-blur-[3px] flex items-center justify-center z-[74] p-6"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-[520px] max-w-full bg-bg rounded-[20px] overflow-hidden shadow-modal">
        <div className="px-6 py-[22px] bg-white border-b border-warm flex items-center gap-3">
          <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${tile}`}>
            {state === 'pending' ? <Spinner className="w-5 h-5" /> : state === 'ready' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[16px] text-ink">{heading}</div>
            <div className="text-[12px] text-muted mt-0.5">{title}</div>
          </div>
          {/* The only exit while pending — outside click is deliberately suppressed
              there, and Escape alone leaves a touch device with no way out. */}
          <button onClick={onClose} aria-label="بستن پنجره" className="w-8 h-8 shrink-0 bg-tile-v2 rounded-[9px] text-muted text-lg">×</button>
        </div>

        <div className="px-6 py-[22px]">
          {state === 'pending' && (
            <div className="text-[13px] text-muted leading-loose">فایل خروجی در حال ساخته‌شدن است؛ این پنجره به‌محض آماده‌شدن، لینک را نشان می‌دهد.</div>
          )}

          {state === 'failed' && (
            <>
              <div className="text-[13px] text-ink leading-loose">{error || 'دلیل خطا مشخص نیست؛ دوباره تلاش کنید.'}</div>
              <div className="flex gap-2.5 mt-5">
                <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl font-bold text-[14px] text-[#6B5CA5]">بستن</button>
                <button onClick={onRetry} className="btn btn-violet flex-1 py-3 text-[14px]">تلاش دوباره</button>
              </div>
            </>
          )}

          {state === 'ready' && url && (
            <>
              <div className="text-[12.5px] text-muted mb-2.5">لینک فایل HTML خروجی:</div>
              <div className="flex gap-2.5 items-center">
                <input value={url} readOnly dir="ltr"
                  className="flex-1 min-w-0 box-border px-3.5 py-3 border-[1.5px] border-line rounded-xl font-mono text-[12px] text-ink bg-white outline-none" />
                <button onClick={onCopy} className="btn btn-ghost shrink-0 px-[15px] py-3 text-[13px] gap-[7px]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  {copied ? 'کپی شد' : 'کپی لینک'}
                </button>
              </div>
              <div className="text-[11.5px] text-faint mt-3 leading-loose">این فایل کاملاً مستقل است و بدون اینترنت هم باز می‌شود.</div>
              {/* The screen where the admin decides who to hand the link to, so it
                  states the gate the recipient will really meet (D25): the shared
                  export credential, which is not the panel's own login.

                  The recipient is the subject on purpose. The reader of this line
                  holds an `inja_session` scoped to `/`, and D29 opens exports to an
                  admin session — so the «باز کردن خروجی» button below opens the
                  document with no prompt at all. Any sentence claiming the link
                  *only* opens with a password is contradicted by the reader's very
                  next click; phrased about the recipient it is true for both. */}
              <div className="text-[11.5px] text-faint leading-loose">گیرندهٔ این لینک برای باز کردن آن به نام کاربری و گذرواژهٔ مشترک خروجی‌ها نیاز دارد و این لینک با خروجی بعدی جایگزین می‌گردد.</div>
              <div className="flex gap-2.5 mt-5">
                <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl font-bold text-[14px] text-[#6B5CA5]">بستن</button>
                <a href={url} target="_blank" rel="noopener" className="btn btn-violet flex-1 py-3 text-[14px] no-underline">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></svg>
                  باز کردن خروجی
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
