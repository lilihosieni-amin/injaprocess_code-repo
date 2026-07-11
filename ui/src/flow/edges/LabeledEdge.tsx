import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

type Data = { label?: string; editing?: boolean; onDelete?: () => void }

export function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const d = (data ?? {}) as Data
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: '#9B86D9', strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        {d.label ? (
          <div style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="bg-white/90 text-ink text-[11px] px-2 py-0.5 rounded-md pointer-events-none">{d.label}</div>
        ) : null}
        {d.editing && (
          <button title="حذف خط" onClick={d.onDelete}
            style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
            className="w-5 h-5 rounded-full bg-white border border-conflict text-conflict text-xs leading-none">×</button>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
