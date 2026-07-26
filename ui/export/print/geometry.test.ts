import { describe, it, expect } from 'vitest'
import { geomBlocks, geomBounds, bandSvg, NODE_OVERHANG } from './geometry'
import type { DiagramGeom } from './geometry'
import { EDGE_STROKE, EDGE_WIDTH, EDGE_NUB, EDGE_ARROW, EDGE_LABEL_CLASS } from '../../src/flow/edges/edge-style'

const G: DiagramGeom = {
  boxes: [
    { id: 'a', x: 0, y: 0, w: 170, h: 60, html: '<div class="n">A</div>' },
    { id: 'b', x: 0, y: 200, w: 170, h: 60, html: '<div class="n">B</div>' },
  ],
  edges: [{ d: 'M10 60 C 10 130, 10 130, 10 200', sx: 10, sy: 60, tx: 10, ty: 200, label: { x: 40, y: 120, w: 60, h: 20, text: 'اگر بله' } }],
}

describe('geomBounds', () => {
  it('covers every box and label', () => {
    expect(geomBounds(G)).toEqual({ minX: 0, minY: 0, maxX: 170, maxY: 260 })
  })

  it('gives an empty diagram a degenerate box, not infinities', () => {
    expect(geomBounds({ boxes: [], edges: [] })).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })
})

describe('geomBlocks', () => {
  // The spans are padded by the paint that escapes the measured box — the exit
  // nub straddling the border and the card shadow below it — because PRINT.GAP,
  // the clearance kept above a cut, is smaller than either.
  it('lists the painted spans — boxes (with their overhang) and labels alike', () => {
    const o = NODE_OVERHANG
    expect(geomBlocks(G)).toEqual([[0 - o, 60 + o], [200 - o, 260 + o], [120, 140]])
  })

  it('keeps enough overhang for the exit nub and the card shadow', () => {
    expect(NODE_OVERHANG).toBeGreaterThanOrEqual(EDGE_NUB.r + EDGE_NUB.strokeWidth / 2)
    expect(NODE_OVERHANG).toBeGreaterThan(6)   // PRINT.GAP
  })
})

describe('bandSvg', () => {
  it('emits only what the band touches, clipped by the viewBox', () => {
    const svg = bandSvg(G, [0, 100], { minX: 0, width: 170 }, 1, 'm1')
    expect(svg).toContain('viewBox="0 0 170 100"')
    expect(svg).toContain('>A<')
    expect(svg).not.toContain('>B<')      // its box starts below the band
  })

  it('draws an edge whenever either end is on the band', () => {
    const svg = bandSvg(G, [150, 260], { minX: 0, width: 170 }, 1, 'm1')
    expect(svg).toContain('M10 60 C')     // starts above, ends inside
    expect(svg).toContain('marker-end="url(#m1)"')
  })

  // A long unlabeled edge: its source is on the first band, its target — and so
  // the arrowhead — several bands below. Filtering on the source y alone drops the
  // whole path from the band that holds the target, and the arrow vanishes from
  // that page.
  it('draws an unlabeled edge on the band that holds its target', () => {
    const g: DiagramGeom = {
      boxes: [
        { id: 'a', x: 0, y: 0, w: 100, h: 40, html: '<i>A</i>' },
        { id: 'b', x: 0, y: 900, w: 100, h: 40, html: '<i>B</i>' },
      ],
      edges: [{ d: 'M50 40 C 50 470, 50 470, 50 900', sx: 50, sy: 40, tx: 50, ty: 900 }],
    }
    const svg = bandSvg(g, [850, 940], { minX: 0, width: 100 }, 1, 'm1')
    expect(svg).toContain('M50 40 C')
    expect(svg).toContain('marker-end="url(#m1)"')
  })

  it('scales the rendered size but not the coordinate space', () => {
    const svg = bandSvg(G, [0, 260], { minX: 0, width: 170 }, 0.5, 'm1')
    expect(svg).toContain('width="85"')
    expect(svg).toContain('height="130"')
    expect(svg).toContain('viewBox="0 0 170 260"')
  })

  it('escapes label text so a stray angle bracket cannot break the svg', () => {
    const g: DiagramGeom = { boxes: [], edges: [{ d: 'M0 0', sx: 0, sy: 0, tx: 0, ty: 0, label: { x: 0, y: 0, w: 10, h: 10, text: '<b>x' } }] }
    expect(bandSvg(g, [0, 10], { minX: 0, width: 10 }, 1, 'm1')).toContain('&lt;b&gt;x')
  })

  // On screen the pill is centred on the bezier's midpoint by a
  // translate(-50%,-50%). A pill that shrinks to its text does not centre itself
  // inside the foreignObject, so the print needs a box that centres it.
  it('centres the label inside its foreignObject rather than leaving it flush left', () => {
    const svg = bandSvg(G, [0, 260], { minX: 0, width: 170 }, 1, 'm1')
    expect(svg).toMatch(/display:flex;align-items:center;justify-content:center/)
    expect(svg).not.toContain('display:inline-block')
  })

  it('paints the edge with the app’s own stroke, nub and label box', () => {
    const svg = bandSvg(G, [0, 260], { minX: 0, width: 170 }, 1, 'm1')
    expect(svg).toContain(`stroke="${EDGE_STROKE}" stroke-width="${EDGE_WIDTH}"`)
    expect(svg).toContain(`r="${EDGE_NUB.r}" fill="${EDGE_NUB.fill}" stroke="${EDGE_STROKE}" stroke-width="${EDGE_NUB.strokeWidth}"`)
    expect(svg).toContain(`class="${EDGE_LABEL_CLASS}"`)
    expect(svg).toContain(`markerWidth="${EDGE_ARROW.width}" markerHeight="${EDGE_ARROW.height}"`)
  })
})
