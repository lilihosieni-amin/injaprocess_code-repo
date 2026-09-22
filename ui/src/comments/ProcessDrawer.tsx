import { useId } from 'react'
import { useProcessComments } from '../api/comments'
import { FAB } from '../ui/FAB'
import { EmptyState, ErrorState, LoadingState } from '../ui/states'
import { CloseX, NewButton } from './Composer'
import { MiniCard } from './MiniCard'
import { useComments, useEscape, useMayComment } from './state'

/** Process-anchored comments only: a step's comments live in that step's detail. */
function useProcessOnly(pid: string) {
  const q = useProcessComments(pid)
  return { ...q, data: q.data?.filter((x) => x.anchor.kind === 'process') }
}

/**
 * The flow's floating button: opens the process drawer (design `openFab`),
 * hidden while a drawer, the composer or a step's detail is open (`showFab`).
 */
export function ProcessFab({ pid, hidden = false }: { pid: string; hidden?: boolean }) {
  return useComments() && !hidden && <ProcessFabShown pid={pid} />
}

function ProcessFabShown({ pid }: { pid: string }) {
  const c = useComments()!
  const { data = [] } = useProcessOnly(pid)
  if (c.drawer || c.compose) return null
  return <FAB label="کامنت‌های این صفحه" count={data.length} onClick={() => c.openDrawer({ kind: 'process', pid })} />
}

/**
 * Reader L680–720 (= Panel L954–995): inside the flow canvas, pinned to the
 * inline end, a bottom sheet at ≤760 (Reader L90, `data-r-drawer`). Drawn by
 * the flow screen, open only while the provider says this process's drawer is.
 */
export function ProcessDrawer({ pid, department }: { pid: string; department: string }) {
  const c = useComments()
  if (c?.drawer?.kind !== 'process' || c.drawer.pid !== pid) return null
  return <ProcessDrawerOpen pid={pid} department={department} />
}

function ProcessDrawerOpen({ pid, department }: { pid: string; department: string }) {
  const c = useComments()!
  const id = useId()
  const may = useMayComment(department)
  const { data, error, refetch } = useProcessOnly(pid)
  useEscape(c.closeDrawer)
  return (
    <div data-r-drawer role="dialog" aria-modal="true" aria-labelledby={id} className={
      'absolute inset-y-0 end-0 w-full max-w-drawer bg-card border-s border-warm shadow-drawer '
      + 'flex flex-col z-canvas-overlay '
      + 'max760:inset-x-0 max760:top-auto max760:bottom-0 max760:max-w-none max760:h-[64%] '
      + 'max760:rounded-t-sheet max760:border-s-0 max760:border-t max760:shadow-sheet'}>
      <div className="flex items-center justify-between gap-s5 py-s8 px-s9 border-b border-tile-v flex-none">
        <div className="min-w-0">
          <div id={id} className="font-extrabold text-fs-lg text-ink">کامنت‌های این فرآیند</div>
          <div className="text-fs-xxs text-muted mt-hint">مربوط به کل فرآیند، نه یک گام خاص</div>
        </div>
        <CloseX at="flow" onClick={c.closeDrawer} />
      </div>
      <div className="flex-1 overflow-auto p-s9">
        {may && (
          <NewButton label="کامنت تازه روی این فرآیند" className="mb-s7 text-fs-sm"
            onClick={() => c.openCompose({ kind: 'process', id: pid }, 'proc')} />
        )}
        {error ? <ErrorState inline message="کامنت‌ها بارگذاری نشد." onRetry={() => { void refetch() }} />
          : !data ? <LoadingState rows={2} />
            : data.length === 0
              ? <EmptyState variant="inline" title="کامنتی برای این فرآیند نیست"
                  hint="کامنت یک گام خاص، در جزئیات همان گام دیده می‌شود." />
              : data.map((x) => <MiniCard key={x.id} c={x} />)}
      </div>
    </div>
  )
}
