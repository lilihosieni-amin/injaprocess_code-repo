import { useState } from 'react'
import { useBuildReport, useReports } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { ExportModal } from './ExportModal'
import type { ReportEntry } from '../api/types'

/**
 * What the modal says when the build ran and printed no PDF — owner ruling,
 * *"the export button should just create pdf"*.
 *
 * A 2xx with no `pdf_url` is a failure: the PDF **is** the deliverable, so
 * "the build ran and produced no PDF" is said as one. It is a deployment fault
 * (a browser that is missing, crashed or timed out) rather than anything the
 * person pressing the row did, so the sentence points at the operator and still
 * offers «تلاش دوباره», which is the right act if the browser was merely busy.
 */
const NO_PDF = 'سند ساخته شد ولی فایل PDF آن روی سرور تولید نشد؛ دوباره تلاش کنید و اگر تکرار شد به مدیر سامانه بگویید.'

/**
 * **The reports a caller may download from one department, and the dialog that
 * reports one** — everything about a download except where the rows are drawn.
 *
 * Split from the screen for the reason its predecessor `ExportMenu` was: §6.2's
 * ⋯ REPLACES the action bar below 760 and the reader has a ⋮ of its own, so
 * three different controls offer these rows at two widths on two surfaces. The
 * state lives here and the screen renders `modal` at its own root — a
 * `position:fixed` dialog inside a `display:none` box (`[data-r-plistactions]`,
 * below the breakpoint) is not painted at all.
 *
 * **The rows come from the backend registry** (D26, `GET /api/reports`), never
 * from a hand-kept list here. That is the half of P2 that stays: one list,
 * served by the server, so a kind cannot exist on one side and not the other.
 * Their labels are the registry's own `name`, which is why the row wording is
 * changed in `ui-backend/inja_ui_backend/exports.py` and not here.
 */
export function useReportDownloads(department: string) {
  const [building, setBuilding] = useState<ReportEntry | null>(null)
  const build = useBuildReport(department)
  const can = useCan(useSession().data)

  // Cosmetic only: POST /api/departments/{code}/reports/{kind} re-derives
  // `export_pdf` from the session row and refuses regardless of what is drawn.
  // Asked per report, with the same target the route gates on
  // (`dept:{code}/report:{id}`): a department-wide grant covers every kind,
  // while a report-scoped one covers exactly its own, so asking about the bare
  // department instead would hide a steps download from someone the server
  // would happily serve it to. `reader_no_download` holds no `export_pdf` at
  // all and gets nothing — which is the whole purpose of that role, and the one
  // affordance it must never see.
  const reports = (useReports().data?.reports ?? [])
    .filter((r) => can('export_pdf', `dept:${department}/report:${r.id}`))

  // A 2xx with no `pdf_url` is a failure now — see `NO_PDF`. `ExportModal`
  // degrades `ready` with no `url` to `failed` on its own, so this only has to
  // supply the reason.
  const noPdf = build.isSuccess && build.data?.pdf_url === undefined
  const status = build.isPending ? 'pending'
    : build.isError || noPdf ? 'failed'
      : build.isSuccess ? 'ready' : 'pending'

  return {
    reports,
    run: (r: ReportEntry) => { setBuilding(r); build.mutate(r.id) },
    modal: building === null ? null : (
      <ExportModal
        title={building.name}
        status={status}
        // **The PDF, never the document** — owner ruling, and there is no public
        // document any more (D28). Absolute so the copied text is worth pasting,
        // and correct on any host (D16).
        url={build.data?.pdf_url ? `${window.location.origin}${build.data.pdf_url}` : undefined}
        error={build.error?.message ?? (noPdf ? NO_PDF : undefined)}
        onRetry={() => build.mutate(building.id)}
        // Closing only dismisses the modal. Resetting a still-pending mutation
        // would flip isPending to false and re-enable the trigger mid-flight —
        // nothing aborts the POST (D-abort), so a second build would race the
        // first for the same deterministic filename and the older write could
        // land last. The observer is left alone until the request settles; the
        // next `run` replaces its state anyway.
        onClose={() => { setBuilding(null); if (!build.isPending) build.reset() }}
      />
    ),
  }
}
