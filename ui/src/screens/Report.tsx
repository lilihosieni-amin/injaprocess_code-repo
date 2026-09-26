import { lazy, Suspense, useMemo, type ComponentType } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { useReport, useReports } from '../api/hooks'
import { refusalStatus } from '../api/client'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { RefusalScreen } from './Refusal'
import { EmptyState, LoadFailedScreen, ScreenSkeleton } from '../ui/states'
import { Button } from '../ui/Button'
import { createSeededClient } from '../../export/shared/seed'
import type { ExportPayload } from '../../export/shared/payload'
import type { ReportPayload } from '../api/types'

/** The document components, one per registry id, loaded only on this route —
 *  which is what keeps their stylesheets out of every other screen's chunk.
 *  A kind with no renderer here renders the empty state rather than a blank
 *  page: the registry may serve a kind this build cannot draw. */
type Renderer = ComponentType<{ payload: ExportPayload; pdf?: () => Promise<string | null> }>
const RENDERERS: Record<string, Renderer> = {
  flowchart: lazy(() => import('../reports/FlowchartReport')),
  steps: lazy(() => import('../reports/StepsReport')),
}

/** The payload once its department is known to be there — the shape both
 *  documents are written against. `dept: null` is the empty report and never
 *  reaches a renderer, so this narrowing is a fact about the branch it is used
 *  in, not a cast past the type system. */
function documentPayload(p: ReportPayload & { dept: NonNullable<ReportPayload['dept']> }): ExportPayload {
  return { dept: p.dept, processes: p.processes, generated_at: p.generated_at }
}

/** What an empty report says (F12, §10). A fact, not an apology, and not a word
 *  about *why*: «these exist but are unconfirmed» would be a derived signal
 *  about withheld content (D56), and so would a hint promising that content
 *  appears here once it is confirmed. */
const EMPTY = 'هنوز چیزی در این نمایش نیست'

export function Report() {
  const { code = '', kind = '' } = useParams()
  const q = useReport(code, kind)
  const nav = useNavigate()
  const can = useCan(useSession().data)
  const entry = useReports().data?.reports.find((r) => r.id === kind)
  const payload = q.data
  // The report's own cache, seeded with the report's own data — never the app's
  // client. `DetailDrawer` inside the document calls `useProcesses(code)`, and
  // under the shared client that would read the API's list, which is not
  // confirmation-filtered, inside a confirmed-only document.
  const client = useMemo(
    () => (payload?.dept ? createSeededClient(documentPayload({ ...payload, dept: payload.dept })) : null),
    [payload],
  )
  // Memoised because the documents probe it from an effect keyed on its
  // identity: a fresh closure per render would re-ask on every render.
  const pdf = useMemo(() => pdfOf(code, kind, can), [code, kind, can])

  const refusal = refusalStatus(q.error)
  if (refusal) return <RefusalScreen status={refusal} />
  if (q.isPending) return <ScreenSkeleton column="reader" cards={3} />
  if (q.isError) return <LoadFailedScreen message="این نمایش خوانده نشد" error={q.error} onRetry={() => q.refetch()} />

  // `dept` is the whole test, and an empty `processes` is deliberately not part
  // of it (D25). A department whose introduction is confirmed and whose processes
  // are not is a report with a cover and an introduction in it — which is exactly
  // what the downloadable file for that same state renders, «۰ فرآیند» and all,
  // from these same components. Requiring a process here made the app say «nothing
  // here» about a document the file said something about. Nothing confirmed at all
  // arrives as `dept: null`, so the genuinely empty report still lands below.
  const Renderer = RENDERERS[kind]
  const body = payload?.dept && Renderer && client
    ? (
      <QueryClientProvider client={client}>
        <Suspense fallback={<ScreenSkeleton column="reader" cards={3} />}>
          <Renderer payload={documentPayload({ ...payload, dept: payload.dept })} pdf={pdf} />
        </Suspense>
      </QueryClientProvider>
    )
    : <EmptyState title={EMPTY} />

  return (
    <div data-screen="report" className="flex-1 overflow-auto bg-ink">
      <div className="flex items-center gap-s5 px-screen-x py-s6 max760:px-s7">
        <Button variant="ghost" onClick={() => nav(`/departments/${code}`)}>بازگشت</Button>
        <span className="text-role-subtitle-on-field text-fs-sm">
          {/* The clause is rendered only when there IS a department: an empty
              report has none, and the name and its separator would otherwise
              dangle in front of the registry entry.

              No «دپارتمان» in front of it, either. `overview.json` stores the
              COMPLETE label in `name` — the dining department is saved as
              «دپارتمان سالن», not the bare «سالن» that `registry.json` keeps and
              that `ProcessList` prefixes — so a prefix here reads doubled.
              `Document.tsx` records the same rule for its own headings. */}
          {payload?.dept && <>{payload.dept.name} · </>}{entry?.name ?? ''}
        </span>
      </div>
      {body}
    </div>
  )
}

/** The printable PDF, if this caller may have one and it is already built.
 *
 *  A `HEAD` because the answer is one bit and the file is megabytes; the route
 *  answers 404 both when the caller may not download and when nothing has been
 *  built for the current content, and either way the document falls back to
 *  `window.print()` — the path it has always had. */
function pdfOf(code: string, kind: string, can: ReturnType<typeof useCan>) {
  return async () => {
    if (!can('export_pdf', `dept:${code}/report:${kind}`)) return null
    const href = `/api/departments/${code}/reports/${kind}/file.pdf`
    try {
      const res = await fetch(href, { method: 'HEAD', cache: 'no-store' })
      return res.ok ? href : null
    } catch { return null }
  }
}
