import type { Span } from './bands'

export type NodeBox = { id: string; x: number; y: number; w: number; h: number; html: string }
export type EdgeGeom = {
  d: string
  sx: number
  sy: number
  label?: { x: number; y: number; w: number; h: number; text: string }
}
export type DiagramGeom = { boxes: NodeBox[]; edges: EdgeGeom[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Painted spans: node boxes and edge labels. A page break may not fall in one. */
export function geomBlocks(g: DiagramGeom): Span[] {
  return [
    ...g.boxes.map((b) => [b.y, b.y + b.h] as Span),
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
  return { minX, minY, maxX, maxY }
}

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

  // an edge is drawn whenever either end is on this band; the viewBox clips the rest
  const edges = g.edges
    .filter((e) => {
      const ys = [e.sy, e.label ? e.label.y : e.sy]
      return Math.max(...ys) >= y0 - h && Math.min(...ys) <= y1 + h
    })
    .map((e) => {
      let out = `<path d="${e.d}" fill="none" stroke="#9B86D9" stroke-width="2" marker-end="url(#${markerId})"/>`
      // the white exit nub LabeledEdge draws at the source end
      out += `<circle cx="${e.sx}" cy="${e.sy}" r="4" fill="#fff" stroke="#9B86D9" stroke-width="1.5"/>`
      if (e.label) {
        out += `<foreignObject x="${e.label.x}" y="${e.label.y}" width="${e.label.w}" height="${e.label.h}">`
          + `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:11px;color:#2A1D5E;text-align:center;`
          + `font-family:'Vazirmatn Variable',sans-serif;background:rgba(255,255,255,.9);border-radius:6px;padding:2px 8px;display:inline-block">`
          + `${esc(e.label.text)}</div></foreignObject>`
      }
      return out
    })
    .join('')

  return `<div class="pf-band"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${y0} ${box.width} ${h}"`
    + ` width="${Math.round(box.width * scale)}" height="${Math.round(h * scale)}">`
    + `<defs><marker id="${markerId}" markerWidth="18" markerHeight="18" refX="9" refY="4.5" orient="auto">`
    + `<path d="M0 0L9 4.5L0 9z" fill="#9B86D9"/></marker></defs>`
    + edges + boxes + `</svg></div>`
}
