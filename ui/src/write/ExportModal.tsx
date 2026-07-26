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

/** Clipboard write with a fallback for non-secure contexts, where
 *  navigator.clipboard is undefined (the app is reachable over plain http
 *  locally, and the modal must still copy there). */
async function copy(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  } catch { /* fall through to the textarea */ }
  const t = document.createElement('textarea')
  t.value = text
  t.style.position = 'fixed'
  t.style.opacity = '0'
  document.body.appendChild(t)
  t.select()
  document.execCommand('copy')
  document.body.removeChild(t)
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

  function onCopy() {
    if (!url) return
    void copy(url)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  const tile =
    status === 'ready' ? 'bg-[#E4F6EC] text-green'
      : status === 'failed' ? 'bg-tile-c text-conflict'
        : 'bg-tile-v text-violet'
  const heading =
    status === 'ready' ? 'خروجی آماده شد'
      : status === 'failed' ? 'خروجی گرفته نشد'
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
            {status === 'pending' ? <Spinner className="w-5 h-5" /> : status === 'ready' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[16px] text-ink">{heading}</div>
            <div className="text-[12px] text-muted mt-0.5">{title}</div>
          </div>
        </div>

        <div className="px-6 py-[22px]">
          {status === 'pending' && (
            <div className="text-[13px] text-muted leading-loose">فایل خروجی در حال ساخته‌شدن است؛ این پنجره به‌محض آماده‌شدن، لینک را نشان می‌دهد.</div>
          )}

          {status === 'failed' && (
            <>
              <div className="text-[13px] text-ink leading-loose">{error}</div>
              <div className="flex gap-2.5 mt-5">
                <button onClick={onClose} className="flex-1 py-3 border-[1.5px] border-line bg-white rounded-xl font-bold text-[14px] text-[#6B5CA5]">بستن</button>
                <button onClick={onRetry} className="btn btn-violet flex-1 py-3 text-[14px]">تلاش دوباره</button>
              </div>
            </>
          )}

          {status === 'ready' && url && (
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
              <div className="text-[11.5px] text-faint leading-loose">این لینک بدون ورود به سامانه باز می‌شود و با خروجی بعدی جایگزین می‌گردد.</div>
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
