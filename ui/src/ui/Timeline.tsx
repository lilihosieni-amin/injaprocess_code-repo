import { toFa } from '../lib/format'

export type TimelineState = 'done' | 'awaiting' | 'rejected' | 'pending'

export interface TimelineNode {
  id: string
  name: string
  role: string
  state: TimelineState
  stateLabel: string
  /** Overrides the Persian ordinal in the rail dot. */
  mark?: string
  note?: string
}

/*
 * §1.2's approval-chain map, named rather than restated: rejected wears the
 * conflict tile over the conflict ink, not-yet-reached the violet tile over
 * the faint ink, awaiting the warn tile over the ICOM control ink, and a
 * finished node the ok tile over the green.
 */
const DOT: Record<TimelineState, string> = {
  done: 'bg-tile-ok text-green',
  awaiting: 'bg-tile-warn text-icom-control',
  rejected: 'bg-tile-c text-conflict',
  pending: 'bg-tile-v2 text-faint',
}
const STATE: Record<TimelineState, string> = {
  done: 'text-green',
  awaiting: 'text-icom-control',
  rejected: 'text-conflict',
  pending: 'text-faint',
}

/** The approval chain (§5.2). An ordered list, because it is one. */
export function Timeline({ nodes, label }: { nodes: TimelineNode[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col list-none m-0 p-0">
      {nodes.map((n, i) => (
        <li key={n.id} className="flex gap-s6">
          <span className="flex flex-col items-center flex-none">
            <span
              data-node-dot
              aria-hidden
              className={`w-s11 h-s11 inline-flex items-center justify-center rounded-round text-fs-xxs font-bold ${DOT[n.state]}`}
            >
              {n.mark ?? toFa(i + 1)}
            </span>
            {/* `min-h-s7` is the R8 row's 14px: the same rung as the body's own
                `pb-s7` below, which is what sets the rhythm. The deliverable
                computes this per node from a prototype layout constant. */}
            <span
              data-node-line
              aria-hidden
              className={`flex-1 w-half min-h-s7 ${i === nodes.length - 1 ? 'bg-transparent' : 'bg-border-current'}`}
            />
          </span>
          <div className="pb-s7 min-w-0">
            <p className="m-0 text-fs-sm font-bold text-ink">
              {n.name} <span className="text-fs-xxs font-normal text-muted">{n.role}</span>
            </p>
            <p className={`m-0 mt-half text-fs-caption font-semibold ${STATE[n.state]}`}>{n.stateLabel}</p>
            {n.note !== undefined && (
              <p className="m-0 mt-s3 px-note-x py-note-y rounded-tool bg-tile-v4 text-fs-caption text-body-ink leading-normal">
                {n.note}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
