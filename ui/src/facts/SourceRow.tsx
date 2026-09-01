import { useState } from 'react'
import { SCREEN_LABELS, SOURCE_TYPE_LABELS, label } from '../lib/factsLabels'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import type { FactSource } from '../api/types'
import { isDownloadable, processIdOf, sourceAt, sourceFile } from './sourceText'
import { Filled, Mono, PX } from './cards/parts'

/**
 * One row of «منابع» — `Inja Panel.dc.html:1709-1714` — and **QF-39's
 * download-only rule**.
 *
 * *"Nothing is shown inline: no image or PDF viewer, no transcript excerpt, no
 * cell preview."* Every file-backed row is a press that opens one confirmation
 * popup («فایل منبع دانلود شود؟», with the file name, «دانلود» / «انصراف») and
 * then downloads the file through the one auth- and scope-gated route. A
 * `process` source navigates to the process; a `chat` source is inert, because
 * there is no file behind it.
 *
 * ## Why an `<a download>` and not `fetch`
 *
 * The route answers with the bytes and a `Content-Disposition`; a `fetch` would
 * bring a possibly very large file into the tab's memory to hand it straight
 * back to the browser. A programmatic anchor lets the browser stream it to disk
 * and carries the session cookie exactly as every other request does. It is
 * created, clicked and dropped inside the handler rather than rendered, because
 * a rendered `<a href>` is a link a reader can middle-click, copy and share —
 * and the route is gated per caller, so a shared URL is a 404 with a confusing
 * shape. The press has to be the decision.
 */
export function SourceRow({ source, onOpenProcess }: {
  source: FactSource
  onOpenProcess?: (pid: string) => void
}) {
  const [asking, setAsking] = useState(false)
  const file = sourceFile(source)
  const at = sourceAt(source)
  const pid = source.type === 'process' ? processIdOf(source) : undefined
  const downloadable = isDownloadable(source)

  const body = (
    <div className="flex-1 min-w-0">
      <div className="overflow-hidden">
        <Mono className="block truncate text-fs-xs text-ink">{file}</Mono>
      </div>
      {at !== undefined && (
        <Filled {...at} className="block text-fs-xxs text-faint mt-s1" />
      )}
    </div>
  )

  return (
    <>
      <div style={PX.sourceRow} className="flex items-start gap-s6 border-b border-line-row">
        <span className="flex-none text-fs-xs font-bold text-violet" style={PX.label96}>
          {label(SOURCE_TYPE_LABELS, source.type)}
        </span>
        {downloadable || pid !== undefined ? (
          <button type="button"
            onClick={() => {
              if (pid !== undefined) { onOpenProcess?.(pid); return }
              setAsking(true)
            }}
            className="flex-1 min-w-0 border-0 bg-transparent p-0 text-start cursor-pointer
                       font-sans">
            {body}
          </button>
        ) : body}
      </div>

      {asking && (
        <Dialog
          open
          width="xs"
          onClose={() => setAsking(false)}
          title={label(SCREEN_LABELS, 'download_ask')}
          subtitle={file}
          footer={
            <div className="flex gap-s5">
              {/* Ledger L-36 — coral opens a creation flow, violet commits.
                  Fetching a file is neither destructive nor a creation, so it
                  takes the ordinary commit. */}
              <Button variant="violet" className="flex-1 px-s8 text-fs-menu"
                onClick={() => { download(source.ref ?? ''); setAsking(false) }}>
                {label(SCREEN_LABELS, 'download')}
              </Button>
              <Button variant="ghost" className="flex-1 px-s8 text-fs-menu"
                onClick={() => setAsking(false)}>
                {label(SCREEN_LABELS, 'cancel')}
              </Button>
            </div>
          }
        >
          {null}
        </Dialog>
      )}
    </>
  )
}

/** `GET /api/facts/source?path=…` — the one route QF-39 gives the attachment
 *  roots and the transcript directory, gated per caller. */
function download(path: string) {
  const a = document.createElement('a')
  a.href = `/api/facts/source?path=${encodeURIComponent(path)}`
  a.download = ''
  document.body.appendChild(a)
  a.click()
  // **Removed on the next tick, not on this one.** Chromium starts the transfer
  // from the element and cancels it if the element leaves the document in the
  // same task; measured here, a synchronous `a.remove()` issued no request at
  // all and `e2e/fact-detail.spec.ts`'s download check saw nothing on the wire.
  setTimeout(() => { a.remove() }, 0)
}
