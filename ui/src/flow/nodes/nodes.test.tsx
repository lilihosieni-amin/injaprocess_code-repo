import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { ActivityNode } from './ActivityNode'
import { JunctionNode } from './JunctionNode'
import type { ProcNode } from '../../api/types'

function wrap(ui: React.ReactNode) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>)
}
const act: ProcNode = { id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: 'cooking-014',
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ProcNode

describe('custom nodes', () => {
  it('ActivityNode shows id, label, actor, conflict badge and sub affordance', () => {
    wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 2, hasSub: true }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    expect(screen.getByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByText('کارپرداز')).toBeInTheDocument()
    expect(screen.getByText('cooking-001-n010')).toBeInTheDocument()
    expect(screen.getByText('۲')).toBeInTheDocument()            // conflict count, Persian
    expect(screen.getByText(/زیرفرآیند/)).toBeInTheDocument()
  })
  it('JunctionNode shows its type label', () => {
    const j: ProcNode = { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 0, y: 0 }, layout: 'auto' } as ProcNode
    wrap(<JunctionNode id="cooking-001-j1" data={{ node: j, conflicts: 0, hasSub: false }} selected={false} type="junction" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    expect(screen.getByText('XOR')).toBeInTheDocument()
  })
})
