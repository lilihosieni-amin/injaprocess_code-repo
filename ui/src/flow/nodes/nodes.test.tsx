import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  it('ActivityNode with a subprocess uses the lavender card and a green (not red) sub badge', () => {
    const { container } = wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub: true }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    const card = container.querySelector('div[dir="rtl"]') as HTMLElement
    expect(card.className).toContain('bg-[#F3EEFC]')
    expect(card.className).not.toContain('bg-white')
    const badge = screen.getByText(/زیرفرآیند/)
    expect(badge.className).toContain('text-green')
    expect(badge.className).not.toContain('text-conflict')
  })
  it('ActivityNode without a subprocess uses a white card and shows no sub badge', () => {
    const { container } = wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub: false }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    const card = container.querySelector('div[dir="rtl"]') as HTMLElement
    expect(card.className).toContain('bg-white')
    expect(card.className).not.toContain('bg-[#F3EEFC]')
    expect(screen.queryByText(/زیرفرآیند/)).toBeNull()
  })
  it('clicking the conflict badge opens the detail drawer', () => {
    const onOpenDetail = vi.fn()
    wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 2, hasSub: false, onOpenDetail }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    fireEvent.click(screen.getByTitle('تعارض‌ها'))
    expect(onOpenDetail).toHaveBeenCalledWith('cooking-001-n010')
  })
  it('ActivityNode shows a highlight ring when data.highlighted is set (edge selected)', () => {
    const { container, rerender } = wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub: false }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    expect(container.querySelector('.ring-violet')).toBeNull()
    rerender(<ReactFlowProvider><ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub: false, highlighted: true }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /></ReactFlowProvider> as never)
    expect(container.querySelector('.ring-violet')).not.toBeNull()
  })
  it('JunctionNode shows its type label', () => {
    const j: ProcNode = { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 0, y: 0 }, layout: 'auto' } as ProcNode
    wrap(<JunctionNode id="cooking-001-j1" data={{ node: j, conflicts: 0, hasSub: false }} selected={false} type="junction" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    expect(screen.getByText('XOR')).toBeInTheDocument()
  })
})
