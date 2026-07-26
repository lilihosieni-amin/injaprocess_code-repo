import type { Span } from './bands'
import {
  EDGE_STROKE, EDGE_WIDTH, EDGE_NUB, EDGE_ARROW, EDGE_LABEL_CLASS,
} from '../../src/flow/edges/edge-style'

export type NodeBox = { id: string; x: number; y: number; w: number; h: number; html: string }
export type EdgeGeom = {
  d: string
  /** the edge's exit point on the source node — where the nub is drawn */
  sx: number
  sy: number
  /** the edge's entry point on the target node — where the arrowhead lands */
  tx: number
  ty: number
  label?: { x: number; y: number; w: number; h: number; text: string }
}
export type DiagramGeom = { boxes: NodeBox[]; edges: EdgeGeom[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Paint that escapes a node's *measured* box, and so has to be kept clear of a
 *  page break just as the box itself is.
 *
 *  Two sources: the edge's exit nub is a circle centred on the node border, so it
 *  reaches its radius plus half its stroke beyond; and `shadow-card`
 *  (`0 3px 14px -8px`) reaches roughly offset+blur+spread below the box.
 *  `PRINT.GAP`, the clearance kept above a cut, is only 6 — so without this a cut
 *  lands close enough to shave either. */
const NUB_REACH = EDGE_NUB.r + EDGE_NUB.strokeWidth / 2
const SHADOW_REACH = 3 + 14 - 8
export const NODE_OVERHANG = Math.max(NUB_REACH, SHADOW_REACH)

/** Painted spans: node boxes (with their overhang) and edge labels. A page break
 *  may not fall in one. */
export function geomBlocks(g: DiagramGeom): Span[] {
  return [
    ...g.boxes.map((b) => [b.y - NODE_OVERHANG, b.y + b.h + NODE_OVERHANG] as Span),
    ...g.edges.filter((e) => e.label).map((e) => [e.label!.y, e.label!.y + e.label!.h] as Span),
  ]
}

export function geomBounds(g: DiagramGeom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  g.boxes.forEach((b) => {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h)
  })
  g.edges.forEach((e) => {
    if (!e.label) return
    minX = Math.min(minX, e.label.x); minY = Math.min(minY, e.label.y)
    maxX = Math.max(maxX, e.label.x + e.label.w); maxY = Math.max(maxY, e.label.y + e.label.h)
  })
  // nothing painted: a degenerate box, never infinities — every caller pads and
  // divides by these, and an infinite width poisons the scale and the band split
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

/** React Flow's own `ArrowClosed` arrowhead, transcribed.
 *
 *  `adapt.ts` asks for `MarkerType.ArrowClosed`, so this is the head drawn on
 *  screen and the print has to draw the same one. React Flow exports neither the
 *  symbol nor its `<marker>` frame (`ArrowClosedSymbol` / `Marker`, both module
 *  private), so the numbers are copied — and `edge-parity.test.tsx` renders a
 *  real flow and asserts these are still exactly what it puts in the DOM. */
export const ARROW_SPEC = { viewBox: '-10 -10 20 20', points: '-5,-4 0,0 -5,4 -5,-4', strokeWidth: 1, orient: 'auto-start-reverse' }

/** One band as a single atomic `<svg>`.
 *
 *  An `<svg>` is indivisible to the printer: Chrome will never drop its children
 *  the way it drops absolutely-positioned HTML that lands in an overflowing page
 *  fragment. Node boxes ride in `<foreignObject>` carrying their real markup, so
 *  the printed node is the drawn node.
 */
export function bandSvg(g: DiagramGeom, band: Span, box: { minX: number; width: number }, scale: number, markerId: string): string {
  const [y0, y1] = band
  const h = y1 - y0

  const boxes = g.boxes
    .filter((b) => !(b.y >= y1 || b.y + b.h <= y0))
    .map((b) =>
      `<foreignObject x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" style="overflow:visible">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${b.w}px;height:${b.h}px">${b.html}</div>`
      + `</foreignObject>`)
    .join('')

  // An edge is drawn whenever any part of it can reach this band: either end, or
  // its label. Both ends matter — an unlabelled edge whose source is pages above
  // still lands its arrowhead here. The extra band of slack covers a bezier that
  // bows outside its own endpoints. This is only an optimisation; the viewBox is
  // what actually clips, so being generous costs nothing but bytes.
  const edges = g.edges
    .filter((e) => {
      const ys = [e.sy, e.ty]
      if (e.label) ys.push(e.label.y, e.label.y + e.label.h)
      return Math.max(...ys) >= y0 - h && Math.min(...ys) <= y1 + h
    })
    .map((e) => {
      let out = `<path d="${e.d}" fill="none" stroke="${EDGE_STROKE}" stroke-width="${EDGE_WIDTH}" marker-end="url(#${markerId})"/>`
      // the white exit nub LabeledEdge draws at the source end
      out += `<circle cx="${e.sx}" cy="${e.sy}" r="${EDGE_NUB.r}" fill="${EDGE_NUB.fill}" stroke="${EDGE_STROKE}" stroke-width="${EDGE_NUB.strokeWidth}"/>`
      if (e.label) {
        // The label's box is centred on the bezier's midpoint, and the pill has to
        // sit in the middle of it — on screen `LabeledEdge` centres exactly, with a
        // translate(-50%,-50%). A pill that shrinks to its text does not centre
        // itself, so the foreignObject carries a flex box that centres it.
        out += `<foreignObject x="${e.label.x}" y="${e.label.y}" width="${e.label.w}" height="${e.label.h}">`
          + `<div xmlns="http://www.w3.org/1999/xhtml"`
          + ` style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">`
          + `<div class="${EDGE_LABEL_CLASS}">${esc(e.label.text)}</div></div></foreignObject>`
      }
      return out
    })
    .join('')

  return `<div class="pf-band"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${y0} ${box.width} ${h}"`
    + ` width="${Math.round(box.width * scale)}" height="${Math.round(h * scale)}">`
    + `<defs><marker id="${markerId}" markerWidth="${EDGE_ARROW.width}" markerHeight="${EDGE_ARROW.height}"`
    + ` viewBox="${ARROW_SPEC.viewBox}" markerUnits="strokeWidth" orient="${ARROW_SPEC.orient}" refX="0" refY="0">`
    + `<polyline points="${ARROW_SPEC.points}" stroke="${EDGE_STROKE}" fill="${EDGE_STROKE}"`
    + ` stroke-width="${ARROW_SPEC.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`
    + edges + boxes + `</svg></div>`
}
