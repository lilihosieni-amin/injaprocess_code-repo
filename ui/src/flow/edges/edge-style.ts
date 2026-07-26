/** The one definition of how a flow edge is painted.
 *
 *  Three readers live off it: `LabeledEdge` draws the edge on screen, `adapt.ts`
 *  asks React Flow for the arrowhead, and `export/print/geometry.ts` re-emits the
 *  same edge as static SVG for the printed document. That last one is the reason
 *  this file exists — the printed diagram is meant to *be* the app's diagram, and
 *  a stroke colour spelled out twice would let a recolour desync the print
 *  silently. Nothing anywhere else may spell these values out again.
 *
 *  (Same rule, same shape as `../nodes/junction-colors.ts`.)
 */
export const EDGE_STROKE = '#9B86D9'
export const EDGE_WIDTH = 2
export const EDGE_WIDTH_SELECTED = 2.6

/** The small white nub at the edge's exit point on the source node. */
export const EDGE_NUB = { r: 4, fill: '#fff', strokeWidth: 1.5 } as const

/** Arrowhead box in `strokeWidth` units — what `adapt.ts` asks React Flow for,
 *  and what the print emitter's own `<marker>` has to repeat. */
export const EDGE_ARROW = { width: 18, height: 18 } as const

/** The read-only edge label's box. Class names rather than values: the print
 *  emitter puts this exact list on the label it draws into its `<foreignObject>`,
 *  so screen and print are literally the same rule in the same stylesheet. */
export const EDGE_LABEL_CLASS = 'bg-white/90 text-ink text-[11px] px-2 py-0.5 rounded-md'
