import { JUNCTION_COLOR } from './nodes/junction-colors'

/** The XOR/AND/OR key that sits in the corner of the canvas.
 *
 *  One component for the live flow page and the exported flowchart document, so
 *  the two can never drift; the swatches read JUNCTION_COLOR, the same map that
 *  paints the diamonds, so a recolour cannot leave the key stale.
 */
export function JunctionLegend() {
  return (
    <div className="absolute bottom-4 right-4 flex gap-3.5 bg-white border border-warm rounded-xl px-3.5 py-2 text-[11px] text-muted">
      {(['XOR', 'AND', 'OR'] as const).map((type) => (
        <span key={type} className="flex items-center gap-1">
          <span className="w-[11px] h-[11px] rotate-45 inline-block" style={{ background: JUNCTION_COLOR[type] }} />{type}
        </span>
      ))}
    </div>
  )
}
