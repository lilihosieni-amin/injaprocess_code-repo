import { useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { Icon } from '../ui/Icon'

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

/** The two glyphs beside the heading — a tick when the file is there, the
 *  warning triangle when it is not. Both are the deliverable's own paths
 *  (`Inja Panel.dc.html:3605`), reached through `Icon`'s `d` (§5.1.2). */
const CHECK = 'M20 6L9 17l-5-5'
const WARN = 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3'
  + 'L13.7 3.9a2 2 0 0 0-3.4 0z'
/** The copy glyph — two overlapping sheets. */
const COPY = 'M9 9h11v11H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'
/** …and the open-in-a-new-tab arrow. */
const OPEN = 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3'

/**
 * §3.3's 520 dialog — one export, in whichever of its three states it is in.
 *
 * **The scrim does not dismiss it while the POST is in flight.** Nothing aborts
 * that request (D-abort), so a stray press on the backdrop does not stop the
 * export — it loses the link the export is being made for, and the next attempt
 * is a second write to the same deterministic filename. Escape and the close
 * button work in every state, so this is never a box a person is stuck in.
 */
export function ExportModal({ title, status, url, error, onRetry, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    state === 'ready' ? 'bg-tile-ok text-green'
      : state === 'failed' ? 'bg-tile-c text-conflict'
        : 'bg-tile-v text-violet'
  const heading =
    state === 'ready' ? 'خروجی آماده شد'
      : state === 'failed' ? 'خروجی گرفته نشد'
        : 'در حال آماده‌سازی خروجی…'

  return (
    <Dialog
      open
      onClose={onClose}
      width="md"
      blurScrim
      dismissOnScrim={status !== 'pending'}
      title={heading}
      subtitle={title}
      icon={
        // `text-fs-h3` on the tile is not decoration: `Spinner` is sized in
        // `em` so it tracks the text it sits in, and 1.05em of `--fs-h3` (19px)
        // is the 20px the design draws both of the other two glyphs at. Writing
        // a width on it instead would put the ring's size and the glyphs' size
        // in two places that could drift.
        <span className={`flex items-center justify-center shrink-0 w-iconbtn h-iconbtn rounded-button text-fs-h3 ${tile}`}>
          {state === 'pending'
            ? <Spinner />
            : <Icon d={state === 'ready' ? CHECK : WARN} px={20} stroke={2.5} />}
        </span>
      }
      footer={state === 'pending' ? undefined : (
        <div className="flex gap-s5">
          {state === 'ready' && url ? (
            // O13 — this was `<a class="btn btn-violet">`, the last consumer of
            // `src/index.css`'s compatibility layer. It stays a LINK: a person
            // opening an export wants a middle click, a "copy link address" and
            // a new tab, none of which a button gives them.
            <Button as="a" variant="violet" href={url} target="_blank" rel="noopener"
              className="flex-1 px-s8 text-fs-sm"
              icon={<Icon d={OPEN} px={15} stroke={2.2} />}>باز کردن خروجی</Button>
          ) : (
            <Button variant="violet" onClick={onRetry}
              className="flex-1 px-s8 text-fs-sm">تلاش دوباره</Button>
          )}
          <Button variant="ghost" onClick={onClose}
            className="flex-1 px-s8 text-fs-sm">بستن</Button>
        </div>
      )}
    >
      {state === 'pending' && (
        <p className="text-fs-sm text-muted leading-loose m-0">فایل خروجی در حال ساخته‌شدن است؛ این پنجره به‌محض آماده‌شدن، لینک را نشان می‌دهد.</p>
      )}

      {state === 'failed' && (
        <p className="text-fs-sm text-ink leading-loose m-0">{error || 'دلیل خطا مشخص نیست؛ دوباره تلاش کنید.'}</p>
      )}

      {state === 'ready' && url && (
        <>
          <div className="text-fs-sm2 text-muted mb-s5">لینک فایل PDF خروجی:</div>
          <div className="flex gap-s5 items-center">
            <input value={url} readOnly dir="ltr" aria-label="لینک فایل خروجی"
              className="flex-1 min-w-0 box-border px-s6 py-s6 border-hairline border-line rounded-button font-mono text-fs-caption text-ink bg-card outline-none" />
            <Button variant="ghost" onClick={onCopy}
              className="shrink-0 px-s8 text-fs-sm"
              icon={<Icon d={COPY} px={15} />}>{copied ? 'کپی شد' : 'کپی لینک'}</Button>
          </div>
          {/* Owner ruling — this is a PDF, and the sentence has to be about a
              PDF. The old one («این فایل کاملاً مستقل است و بدون اینترنت هم باز
              می‌شود») was written for the standalone HTML document, whose whole
              point was that it opened offline by double-click; said about a PDF
              it is true of every PDF and tells the reader nothing. What is worth
              saying is that this one is printed and fixed, which is what
              distinguishes it from the interactive document it was printed from. */}
          <p className="text-fs-xs text-faint mt-s6 leading-loose m-0">فایل PDF چاپ‌شده از سند رسمی است؛ برای چاپ و بایگانی آماده است.</p>
          {/* The screen where the admin decides who to hand the link to, so it
              states the gate the recipient will really meet (D25): the shared
              export credential, which is not the panel's own login.

              The recipient is the subject on purpose. The reader of this line
              holds an `inja_session` scoped to `/`, and D29 opens exports to an
              admin session — so the «باز کردن خروجی» button below opens the
              document with no prompt at all. Any sentence claiming the link
              *only* opens with a password is contradicted by the reader's very
              next click; phrased about the recipient it is true for both. */}
          <p className="text-fs-xs text-faint leading-loose m-0">گیرندهٔ این لینک برای باز کردن آن به نام کاربری و گذرواژهٔ مشترک خروجی‌ها نیاز دارد و این لینک با خروجی بعدی جایگزین می‌گردد.</p>
        </>
      )}
    </Dialog>
  )
}
