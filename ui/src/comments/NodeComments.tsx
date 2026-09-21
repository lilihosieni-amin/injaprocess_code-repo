import { useProcessComments } from '../api/comments'
import { toFa } from '../lib/format'
import { Icon } from '../ui/Icon'
import { MiniCard } from './MiniCard'
import { useComments, useMayComment } from './state'

const PLUS = 'M12 5v14M5 12h14'
const BUBBLE = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'

type Step = { pid: string; department: string; processName: string; id: string; label: string }

const open = (c: NonNullable<ReturnType<typeof useComments>>, s: Step) =>
  c.openCompose({ kind: 'node', id: s.id, label: s.label, processName: s.processName }, 'node')

/**
 * The flow detail drawer's comment part — Reader L625–653 (= Panel L921–950):
 * «کامنت روی این گام» (hidden for Editors, addendum §7.2), then the step's
 * comments as flow mini cards.
 */
export function NodeComments(s: Step) {
  return useComments() && <NodeCommentsShown {...s} />
}

function NodeCommentsShown(s: Step) {
  const c = useComments()!
  const may = useMayComment(s.department)
  const { data = [] } = useProcessComments(s.pid)
  const mine = data.filter((x) => x.anchor.kind === 'node' && x.anchor.id === s.id)
  return (
    <>
      {may && (
        <button type="button" onClick={() => open(c, s)} className={
          'w-full mt-s9 inline-flex items-center justify-center gap-s4 p-s6 border-hairline border-border-danger '
          + 'rounded-button bg-tile-c2 text-danger font-bold text-fs-sm cursor-pointer'}>
          <Icon d={PLUS} px={15} stroke={2.4} />
          کامنت روی این گام
        </button>
      )}
      {mine.length > 0 && (
        <div className="mt-drawer-section border-t border-tile-v pt-s8">
          <div className="flex items-center gap-s3 text-fs-xxs font-bold text-violet mb-s5">
            <Icon d={BUBBLE} px={13} stroke={2.2} />
            کامنت‌های این گام ({toFa(mine.length)})
          </div>
          {mine.map((x) => <MiniCard key={x.id} c={x} />)}
        </div>
      )}
    </>
  )
}

/** The expanded step's «کامنت روی این گام» — Reader L482–487 (= Panel L778–781). */
export function StepCommentButton(s: Step) {
  return useComments() && <StepCommentButtonShown {...s} />
}

function StepCommentButtonShown(s: Step) {
  const c = useComments()!
  if (!useMayComment(s.department)) return null
  return (
    <button type="button" onClick={() => open(c, s)} className={
      'self-start inline-flex items-center gap-s4 py-textarea-y px-button-x border-hairline border-border-danger '
      + 'rounded-button bg-tile-c2 text-danger font-bold text-fs-sm cursor-pointer'}>
      <Icon d={PLUS} px={15} stroke={2.4} />
      کامنت روی این گام
    </button>
  )
}
