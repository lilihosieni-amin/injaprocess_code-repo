import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type EdgeProps } from '@xyflow/react'
import { getEdgeParams, type Geom } from './floating'

type Data = { label?: string; editing?: boolean; onSetLabel?: (v: string) => void; onDelete?: () => void }

export function LabeledEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  // Floating edges: each end attaches on the side facing the other node (arrowheads
  // show direction), so serpentine/spiral rows route cleanly. Fall back to the
  // handle-based coords when node geometry isn't available (e.g. unmeasured / tests).
  let sx = sourceX, sy = sourceY, tx = targetX, ty = targetY, sPos = sourcePosition, tPos = targetPosition
  if (sourceNode?.measured?.width && sourceNode.measured?.height &&
      targetNode?.measured?.width && targetNode.measured?.height) {
    const p = getEdgeParams(sourceNode as unknown as Geom, targetNode as unknown as Geom)
    sx = p.sx; sy = p.sy; tx = p.tx; ty = p.ty; sPos = p.sourcePos; tPos = p.targetPos
  }
  const [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sPos, targetPosition: tPos })
  const d = (data ?? {}) as Data
  const active = selected && d.editing
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: '#9B86D9', strokeWidth: selected ? 2.6 : 2 }} />
      <EdgeLabelRenderer>
        {active ? (
          <div className="nodrag nopan" style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}>
            <div className="flex items-center gap-1.5">
              <input
                value={d.label ?? ''} onChange={(e) => d.onSetLabel?.(e.target.value)} placeholder="متن روی خط…"
                className="w-[130px] text-[11px] text-ink bg-white border-[1.5px] border-coral rounded-md px-2 py-0.5 outline-none text-center"
              />
              <button title="حذف خط" onClick={d.onDelete} className="w-5 h-5 shrink-0 rounded-full bg-white border border-conflict text-conflict text-xs leading-none">×</button>
            </div>
          </div>
        ) : d.label ? (
          <div style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="bg-white/90 text-ink text-[11px] px-2 py-0.5 rounded-md pointer-events-none">{d.label}</div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
