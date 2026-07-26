import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { toFlowEdges } from '../../src/flow/adapt'
import { EDGE_STROKE, EDGE_LABEL_CLASS } from '../../src/flow/edges/edge-style'
import { bandSvg, type DiagramGeom } from './geometry'
import type { Process } from '../../src/api/types'

const HERE = dirname(fileURLToPath(import.meta.url))

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
    expect(printedLabel()).toContain(EDGE_LABEL_CLASS)
  })
})

function printedLabel(): string {
  const g: DiagramGeom = {
    boxes: [],
    edges: [{ d: 'M0 0', sx: 0, sy: 0, tx: 0, ty: 100, label: { x: 0, y: 40, w: 60, h: 22, text: 'بله' } }],
  }
  return bandSvg(g, [0, 100], { minX: 0, width: 100 }, 1, 'm1')
}
