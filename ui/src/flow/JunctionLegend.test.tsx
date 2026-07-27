import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { JunctionLegend } from './JunctionLegend'
import { JunctionNode } from './nodes/JunctionNode'
import { JUNCTION_COLOR } from './nodes/junction-colors'
import type { ProcNode } from '../api/types'

const TYPES = ['XOR', 'AND', 'OR'] as const

/** The swatch is the empty span that sits before the label inside each entry. */
function swatchFor(type: string) {
  return screen.getByText(type).querySelector('span') as HTMLElement
}

function diamondFor(type: (typeof TYPES)[number]) {
  const j = { id: 'cooking-001-j1', type: 'junction', junctionType: type, direction: 'split', position: { x: 0, y: 0 }, layout: 'auto' } as ProcNode
  const { container } = render(
    <ReactFlowProvider>
      <JunctionNode id="cooking-001-j1" data={{ node: j, conflicts: 0, hasSub: false }} selected={false} type="junction" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable />
    </ReactFlowProvider> as never,
  )
  return container.querySelector('.rotate-45') as HTMLElement
}

describe('JunctionLegend', () => {
  it('names every junction kind', () => {
    render(<JunctionLegend />)
    for (const type of TYPES) expect(screen.getByText(type)).toBeInTheDocument()
  })

  // The point of the shared component: recolouring a junction must move the
  // legend with it. Asserting the swatches against JUNCTION_COLOR means a
  // hard-coded copy of the palette fails here instead of shipping stale.
  it('paints each swatch from JUNCTION_COLOR', () => {
    render(<JunctionLegend />)
    for (const type of TYPES) {
      expect(swatchFor(type)).toHaveStyle({ background: JUNCTION_COLOR[type] })
    }
  })

  it('paints the diamonds from the same map, so legend and node cannot diverge', () => {
    for (const type of TYPES) {
      expect(diamondFor(type)).toHaveStyle({ background: JUNCTION_COLOR[type] })
    }
  })
})
