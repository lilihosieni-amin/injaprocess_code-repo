import { describe, it, expect } from 'vitest'
import { geomBlocks, geomBounds, bandSvg } from './geometry'
import type { DiagramGeom } from './geometry'

const G: DiagramGeom = {
  boxes: [
    { id: 'a', x: 0, y: 0, w: 170, h: 60, html: '<div class="n">A</div>' },
    { id: 'b', x: 0, y: 200, w: 170, h: 60, html: '<div class="n">B</div>' },
  ],
  edges: [{ d: 'M10 60 C 10 130, 10 130, 10 200', sx: 10, sy: 60, label: { x: 40, y: 120, w: 60, h: 20, text: 'اگر بله' } }],
}

describe('geomBounds', () => {
  it('covers every box and label', () => {
    expect(geomBounds(G)).toEqual({ minX: 0, minY: 0, maxX: 170, maxY: 260 })
  })
})

describe('geomBlocks', () => {
  it('lists the painted spans — boxes and labels alike', () => {
    expect(geomBlocks(G)).toEqual([[0, 60], [200, 260], [120, 140]])
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

  it('scales the rendered size but not the coordinate space', () => {
    const svg = bandSvg(G, [0, 260], { minX: 0, width: 170 }, 0.5, 'm1')
    expect(svg).toContain('width="85"')
    expect(svg).toContain('height="130"')
    expect(svg).toContain('viewBox="0 0 170 260"')
  })

  it('escapes label text so a stray angle bracket cannot break the svg', () => {
    const g: DiagramGeom = { boxes: [], edges: [{ d: 'M0 0', sx: 0, sy: 0, label: { x: 0, y: 0, w: 10, h: 10, text: '<b>x' } }] }
    expect(bandSvg(g, [0, 10], { minX: 0, width: 10 }, 1, 'm1')).toContain('&lt;b&gt;x')
  })
})
