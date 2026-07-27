import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ReactFlow, ReactFlowProvider, type EdgeProps } from '@xyflow/react'
import { toFlowEdges } from '../../src/flow/adapt'
import { EDGE_STROKE, EDGE_LABEL_CLASS } from '../../src/flow/edges/edge-style'
import { LabeledEdge } from '../../src/flow/edges/LabeledEdge'
import { bandSvg, type DiagramGeom } from './geometry'
import type { Process } from '../../src/api/types'

// `EdgeLabelRenderer` portals into `.react-flow__edgelabel-renderer`, which only
// exists inside a mounted `<ReactFlow>`; rendering `LabeledEdge` on its own gets
// null back. A passthrough portal makes the drawn label queryable. It replaces
// nothing React Flow uses internally, so `liveMarker()` below still gets the real
// component's real `<marker>`.
vi.mock('@xyflow/react', async (importOriginal) => {
  const ReactDOM = await import('react-dom')
  const mod = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...mod,
    EdgeLabelRenderer: ({ children }: { children: import('react').ReactNode }) =>
      ReactDOM.createPortal(children, document.body),
  }
})

const HERE = dirname(fileURLToPath(import.meta.url))
const PRINT_CSS = readFileSync(join(HERE, 'print.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const PRINT_BLOCK = PRINT_CSS.slice(PRINT_CSS.indexOf('@media print'))
const SCREEN_BLOCK = PRINT_CSS.slice(0, PRINT_CSS.indexOf('@media print'))
const TAILWIND = readFileSync(join(HERE, '../../tailwind.config.js'), 'utf8')

const PROC = { edges: [{ from: 'a', to: 'b' }] } as unknown as Process

const G: DiagramGeom = {
  boxes: [],
  edges: [{ d: 'M0 0 C 0 50, 0 50, 0 100', sx: 0, sy: 0, tx: 0, ty: 100 }],
}

/** jsdom serialises an inline `style` colour as `rgb(...)`; an attribute keeps the
 *  hex it was given. Compare them on one footing. */
function rgb(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color.trim()
  const n = parseInt(m[1], 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** The `<marker>` React Flow itself renders for the edges `adapt.ts` builds. */
function liveMarker(): SVGMarkerElement {
  const { container } = render(
    <ReactFlowProvider>
      <ReactFlow
        defaultNodes={[
          { id: 'a', position: { x: 0, y: 0 }, data: {} },
          { id: 'b', position: { x: 0, y: 200 }, data: {} },
        ]}
        defaultEdges={toFlowEdges(PROC)}
        proOptions={{ hideAttribution: true }}
      />
    </ReactFlowProvider>,
  )
  const marker = container.querySelector<SVGMarkerElement>('marker')
  expect(marker).not.toBeNull()
  return marker!
}

/** The `<marker>` the print emitter writes into a band. */
function printedMarker(): SVGMarkerElement {
  const holder = document.createElement('div')
  holder.innerHTML = bandSvg(G, [0, 100], { minX: 0, width: 100 }, 1, 'm1')
  return holder.querySelector('marker') as unknown as SVGMarkerElement
}

// The arrowhead is the one piece of the edge the print cannot reuse — React Flow
// exports neither the marker frame nor the ArrowClosed symbol, so `geometry.ts`
// redraws it. This binds that redraw to what the app actually puts in the DOM: a
// React Flow upgrade that reshapes the head fails here instead of printing a
// different arrow from the one on screen.
describe('the printed arrowhead is the app’s arrowhead', () => {
  it('repeats the marker frame attribute for attribute', () => {
    const live = liveMarker()
    const printed = printedMarker()
    // not a vacuous comparison of two nulls
    expect(live.getAttribute('viewBox')).toBeTruthy()
    expect(live.getAttribute('markerWidth')).toBeTruthy()
    for (const a of ['viewBox', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'refX', 'refY']) {
      expect(`${a}=${printed.getAttribute(a)}`).toBe(`${a}=${live.getAttribute(a)}`)
    }
  })

  it('repeats the head’s shape, weight and colour', () => {
    const live = liveMarker().querySelector('polyline')!
    const printed = printedMarker().querySelector('polyline')!
    expect(live.getAttribute('points')).toBeTruthy()
    expect(live.style.stroke).toBeTruthy()
    expect(printed.getAttribute('points')).toBe(live.getAttribute('points'))
    expect(printed.getAttribute('stroke-linecap')).toBe(live.getAttribute('stroke-linecap'))
    expect(printed.getAttribute('stroke-linejoin')).toBe(live.getAttribute('stroke-linejoin'))
    expect(printed.getAttribute('stroke-width')).toBe(live.style.strokeWidth)
    expect(rgb(printed.getAttribute('stroke')!)).toBe(rgb(live.style.stroke))
    expect(rgb(printed.getAttribute('fill')!)).toBe(rgb(live.style.fill))
  })
})

// Everything else about an edge's appearance is shared outright rather than
// copied. The scan is the binding: re-spelling a value in either reader is what
// would let a palette change move the screen without moving the print.
describe('the edge palette is spelled in exactly one place', () => {
  const readers = [
    join(HERE, '../../src/flow/edges/LabeledEdge.tsx'),
    join(HERE, '../../src/flow/adapt.ts'),
    join(HERE, 'geometry.ts'),
  ]

  it('has every reader import it and none restate it', () => {
    for (const file of readers) {
      const src = readFileSync(file, 'utf8')
      expect(`${file}: ${src.includes(EDGE_STROKE)}`).toBe(`${file}: false`)
      expect(src).toMatch(/from '[^']*edge-style'/)
    }
  })

  it('gives the printed label the same class list the drawn one wears', () => {
    for (const file of readers) {
      const src = readFileSync(file, 'utf8')
      expect(`${file}: ${src.includes(EDGE_LABEL_CLASS)}`).toBe(`${file}: false`)
    }
    // The markup binding is total and stays total: the printed pill wears the
    // app's whole class list, from the app's own constant. Exactly one property
    // of it is then overridden under print media — the background — and the next
    // describe pins the edges of that exemption. Nothing else about an edge is
    // exempt: the stroke, its weight and the arrowhead are bound above.
    expect(printedLabel()).toContain(EDGE_LABEL_CLASS)
  })
})

/** Every declaration a selector makes, from the first rule that names it exactly. */
function ruleFor(css: string, selector: string): Record<string, string> | undefined {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue
    const out: Record<string, string> = {}
    for (const d of m[2].split(';')) {
      const [k, ...v] = d.split(':')
      if (k.trim()) out[k.trim().toLowerCase()] = v.join(':').trim()
    }
    return out
  }
  return undefined
}

// The one sanctioned way the printed edge may differ from the drawn one. On
// screen the label sits on `bg-white/90`, which at the scales the band planner
// prints at is indistinguishable from the paper — so the condition on a connector
// is repainted onto the app's own tile. The exemption is deliberately narrow:
// one property, on one selector, inside `@media print`. This is where its edges
// are pinned, so a colour change cannot widen into a size change, and a print
// rule cannot leak onto the screen the way the last one leaked onto the wrong
// element.
describe('the printed edge label’s background is the only exemption', () => {
  it('repaints it with the app’s own tile token, and changes nothing else', () => {
    const rule = ruleFor(PRINT_BLOCK, '.pf-band [data-edge-label]')
    expect(rule, 'print.css repaints the printed edge label').toBeDefined()
    const tile = TAILWIND.match(/'tile-v2':\s*'(#[0-9A-Fa-f]{6})'/)
    expect(tile, 'tailwind defines the tile-v2 token').not.toBeNull()
    expect(rule!.background?.toUpperCase()).toBe(tile![1].toUpperCase())
    // Background *only*. The label's rectangle is one of the blocks `geomBlocks`
    // hands the page-break planner, and it is fixed in `PrintDiagrams` from the
    // text length before any of this applies — padding, a border or a font here
    // would paint a pill wider than the box the planner routed the cut around.
    expect(Object.keys(rule!)).toEqual(['background'])
  })

  it('reaches the pill through a hook, without disturbing its box', () => {
    const svg = printedLabel()
    expect(svg).toContain(`<div data-edge-label="" class="${EDGE_LABEL_CLASS}">`)
    // the same geometry the planner was given, emitted unchanged
    expect(svg).toContain('<foreignObject x="0" y="40" width="60" height="22">')
  })

  it('leaves the on-screen label white, in the app and in the export’s viewer', () => {
    // the shared class list is what both media start from, and it still says white
    expect(EDGE_LABEL_CLASS.split(/\s+/)).toContain('bg-white/90')
    // ...and the repaint is declared only inside `@media print`, so it can reach
    // neither the app's canvas nor the exported document's interactive viewer,
    // both of which draw their edges with `LabeledEdge`
    expect(SCREEN_BLOCK).not.toContain('data-edge-label')
    // the label the app actually draws
    const label = drawnLabel()
    expect(label.textContent).toBe('بله')
    expect(label.className.split(/\s+/)).toContain('bg-white/90')
    expect(label.getAttribute('style') ?? '').not.toMatch(/background/)
  })

  it('exempts nothing else: print declares no stroke, weight, head or ink', () => {
    for (const prop of ['stroke', 'stroke-width', 'fill', 'marker-end', 'color']) {
      const declared = new RegExp(`(?:^|[;{\\s])${prop}\\s*:`).test(PRINT_CSS)
      expect(`${prop} declared in print.css: ${declared}`).toBe(`${prop} declared in print.css: false`)
    }
  })
})

function printedLabel(): string {
  const g: DiagramGeom = {
    boxes: [],
    edges: [{ d: 'M0 0', sx: 0, sy: 0, tx: 0, ty: 100, label: { x: 0, y: 40, w: 60, h: 22, text: 'بله' } }],
  }
  return bandSvg(g, [0, 100], { minX: 0, width: 100 }, 1, 'm1')
}

/** The read-only label `LabeledEdge` draws on screen. */
function drawnLabel(): HTMLElement {
  const props = {
    id: 'a->b', sourceX: 0, sourceY: 0, targetX: 100, targetY: 0,
    sourcePosition: 'right', targetPosition: 'left', source: 'a', target: 'b',
  } as unknown as EdgeProps
  render(
    <ReactFlowProvider>
      <svg><LabeledEdge {...props} selected={false} data={{ label: 'بله' }} /></svg>
    </ReactFlowProvider>,
  )
  const el = [...document.body.querySelectorAll('div')].find((d) => d.textContent === 'بله')
  expect(el, 'LabeledEdge draws a read-only label').toBeDefined()
  return el!
}
