import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBuildReport, useReports } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Dialog } from '../ui/Overlay'
import { ExportModal } from './ExportModal'
import type { ReportEntry } from '../api/types'

/** The note under the title — `Inja Panel.dc.html:2822`, verbatim. It is the one
 *  sentence that says what a report is: always current, and confirmed content
 *  only. It says nothing about *why* something is absent (D56). */
const NOTE = 'نمایش، دپارتمان را همان‌طور که همین حالا هست نشان می‌دهد؛'
  + ' فرآیندهای تأییدنشده و باطل‌شده در آن نمی‌آیند.'

/** What the export dialog says when the build ran and printed no PDF — owner
 *  ruling, *"the export button should just create pdf"*. Unchanged from the
 *  menu this dialog replaces. */
const NO_PDF = 'سند ساخته شد ولی فایل PDF آن روی سرور تولید نشد؛'
  + ' دوباره تلاش کنید و اگر تکرار شد به مدیر سامانه بگویید.'

/**
 * **What a caller may do with this department's reports, and the dialog that
 * offers it** — everything about reports except where the trigger is drawn.
 *
 * Split from the screen for the reason its predecessor was: §6.2's ⋯ replaces
 * the action bar below 760 and the reader has a ⋮ of its own, so two different
 * controls open this at two widths on two surfaces. The state lives here and
 * each caller renders `dialog` at its own root — a `position:fixed` dialog
 * inside a `display:none` box is not painted at all.
 */
export function useReportActions(department: string, deptName: string) {
  const [open, setOpen] = useState(false)
  const [building, setBuilding] = useState<ReportEntry | null>(null)
  const nav = useNavigate()
  const build = useBuildReport(department)
  const can = useCan(useSession().data)
  const reports = useReports().data?.reports ?? []

  // Asked per report at the target the routes gate on — a department-wide grant
  // covers every kind, a report-scoped one covers exactly its own. Cosmetic:
  // every route re-derives both from the session row (D48).
  const target = (r: ReportEntry) => `dept:${department}/report:${r.id}`
  const mayRead = (r: ReportEntry) => can('view', target(r))
  const mayDownload = (r: ReportEntry) => can('export_pdf', target(r))
  const cards = reports.filter((r) => mayRead(r) || mayDownload(r))

  // A 2xx with no `pdf_url` is a failure — see NO_PDF.
  const noPdf = build.isSuccess && build.data?.pdf_url === undefined
  const status = build.isPending ? 'pending'
    : build.isError || noPdf ? 'failed'
      : build.isSuccess ? 'ready' : 'pending'

  function download(r: ReportEntry) {
    setOpen(false)
    setBuilding(r)
    build.mutate(r.id)
  }

  return {
    hasAny: cards.length > 0,
    open: () => setOpen(true),
    dialog: (
      <>
        {open && (
          <Dialog open title={`نمایش‌های دپارتمان ${deptName}`} subtitle={NOTE}
            width="md" onClose={() => setOpen(false)}
            footer={<Button variant="ghost" block onClick={() => setOpen(false)}>بستن</Button>}>
            <div className="flex flex-col gap-s6">
              {cards.map((r) => (
                // `padding="tight"` is 16px (`Card.tsx:35`), the design's own
                // card interior; the card's radius, hairline and ground are the
                // component's and are not restated here.
                <Card key={r.id} padding="tight">
                  <div className="text-fs-body font-bold text-ink">{r.name}</div>
                  <div className="text-fs-caption text-muted mt-s3 leading-relaxed">{r.description}</div>
                  <div className="flex gap-s5 mt-s7">
                    {mayRead(r) && (
                      // solid violet, as the design draws the primary act
                      <Button variant="violet" className="flex-1 py-s7 text-fs-caption"
                        onClick={() => { setOpen(false); nav(`/departments/${department}/reports/${r.id}`) }}>
                        مشاهده
                      </Button>
                    )}
                    {mayDownload(r) && (
                      <Button variant="ghost" className="flex-1 py-s7 text-fs-caption"
                        onClick={() => download(r)}>
                        دریافت فایل
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </Dialog>
        )}
        {building && (
          <ExportModal
            title={building.name}
            status={status}
            // The PDF, never a document link: there is no public document any
            // more (D28), and `pdf_url` is the one field the server promises
            // points at a file that exists.
            url={build.data?.pdf_url ? `${window.location.origin}${build.data.pdf_url}` : undefined}
            error={build.error?.message ?? (noPdf ? NO_PDF : undefined)}
            onRetry={() => build.mutate(building.id)}
            // Closing dismisses the dialog only. Resetting a still-pending
            // mutation would re-enable the trigger mid-flight, and nothing
            // aborts the POST.
            onClose={() => { setBuilding(null); if (!build.isPending) build.reset() }}
          />
        )}
      </>
    ),
  }
}
