import { useDeptComments, type Comment } from '../api/comments'
import { useDepartments } from '../api/hooks'
import { STATUS, ageText, statusLabel } from '../lib/comments'
import { FAB } from '../ui/FAB'
import { EmptyState, ErrorState, LoadingState } from '../ui/states'
import { useSurface } from '../ui/surface'
import { CloseX, FixedPane, NewButton } from './Composer'
import { MiniCard } from './MiniCard'
import { useComments, useMayComment } from './state'

/**
 * The floating button on the process list and the department page: opens the
 * department drawer (design `openFab`). Hidden while a drawer or the composer
 * is open (design `showFab`); draws nothing outside a `CommentsProvider`.
 */
export function DeptFab({ code }: { code: string }) {
  return useComments() && <DeptFabShown code={code} />
}

function DeptFabShown({ code }: { code: string }) {
  const c = useComments()!
  const { data = [] } = useDeptComments(code)
  if (c.drawer || c.compose) return null
  return <FAB label="کامنت‌های این صفحه" count={data.length} onClick={() => c.openDrawer({ kind: 'dept', code })} />
}

/**
 * Reader L902–937 / Panel L2875–2910. The Panel's pasted books table
 * (L2911–2938) is a mistake in the design and is not drawn (addendum §7.9).
 */
const LOOK = {
  reader: {
    title: 'کامنت‌های این اطلاعات', titleCls: 'text-fs-h4', head: 'mb-s3', sub: 'text-fs-caption',
    button: 'text-fs-menu', empty: 'کامنتی روی این اطلاعات نیست',
  },
  panel: {
    title: 'کامنت‌های این خلاصه', titleCls: 'text-fs-h5', head: '', sub: 'text-fs-xs',
    button: 'text-fs-sm', empty: 'کامنتی روی خلاصهٔ این دپارتمان نیست',
  },
} as const

export function DeptDrawer({ code }: { code: string }) {
  const surface = useSurface()
  const look = LOOK[surface]
  const c = useComments()!
  const may = useMayComment(code)
  const { data, error, refetch } = useDeptComments(code)
  const name = useDepartments().data?.find((d) => d.code === code)?.name ?? ''

  return (
    <FixedPane className="p-s10 shadow-composer" onClose={c.closeDrawer} title={(id) => (
      <div className={`flex items-start justify-between gap-s5 ${look.head}`}>
        <div>
          <div id={id} className={`font-extrabold text-ink ${look.titleCls}`}>{look.title}</div>
          <div className={`text-muted mt-s1 ${look.sub}`}>دربارهٔ {name}، نه یک فرآیند خاص</div>
        </div>
        <CloseX onClick={c.closeDrawer} />
      </div>
    )}>
      {may && (
        <NewButton label="کامنت تازه" className={`mt-s8 ${look.button}`}
          onClick={() => c.openCompose({ kind: 'department', id: code }, 'dept')} />
      )}
      {error ? <ErrorState inline message="کامنت‌ها بارگذاری نشد." onRetry={() => { void refetch() }} />
        : !data ? <div className="mt-s7"><LoadingState rows={2} /></div>
          : data.length === 0 ? <EmptyState variant="inline" title={look.empty} />
            : (
              <div className="mt-s7">
                {surface === 'reader'
                  ? newestFirst(data).slice(0, 3).map((x) => <ReaderCard key={x.id} c={x} />)
                  : data.map((x) => <MiniCard key={x.id} c={x} place="panelDept" />)}
              </div>
            )}
    </FixedPane>
  )
}

/** The server lists oldest first; the Reader drawer shows the three newest. */
const newestFirst = (xs: Comment[]) =>
  [...xs].sort((a, b) => Number(b.id.slice(4)) - Number(a.id.slice(4)))

/** Reader L926–933: the simplified card — status, age and the author's text only. Leading 1.95 → --lh-loose (L-17). */
function ReaderCard({ c }: { c: Comment }) {
  const st = STATUS[c.state]
  return (
    <div className="bg-surface-sub border border-border-current rounded-tile p-s7 mb-s5">
      <div className="flex items-center gap-s4 flex-wrap mb-option">
        <span className={`text-fs-xs font-semibold py-hint px-s5 rounded-pill ${st.bg} ${st.fg}`}>{statusLabel(c.state, 'reader')}</span>
        <span className="ms-auto text-fs-xs text-faint">{ageText(c.createdAt)}</span>
      </div>
      <div className="text-fs-body text-ink leading-loose whitespace-pre-line [text-wrap:pretty]">{c.text}</div>
    </div>
  )
}
