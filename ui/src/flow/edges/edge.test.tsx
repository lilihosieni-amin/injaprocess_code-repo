import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider, type EdgeProps } from '@xyflow/react'
import { LabeledEdge } from './LabeledEdge'

function wrap(ui: React.ReactNode) {
  return render(<ReactFlowProvider><svg>{ui}</svg></ReactFlowProvider>)
}
const base = { id: 'a->b', sourceX: 0, sourceY: 0, targetX: 100, targetY: 0,
  sourcePosition: 'right', targetPosition: 'left', source: 'a', target: 'b' } as unknown as EdgeProps

describe('LabeledEdge', () => {
  it('renders its label', () => {
    wrap(<LabeledEdge {...base} data={{ label: 'بله', editing: false }} />)
    expect(screen.getByText('بله')).toBeInTheDocument()
  })
  it('shows a delete affordance in edit mode and calls onDelete', () => {
    const onDelete = vi.fn()
    wrap(<LabeledEdge {...base} data={{ label: '', editing: true, onDelete }} />)
    fireEvent.click(screen.getByTitle('حذف خط'))
    expect(onDelete).toHaveBeenCalled()
  })
})
