import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider, type EdgeProps } from '@xyflow/react'
import { LabeledEdge } from './LabeledEdge'

// Stub EdgeLabelRenderer: in jsdom tests the portal target
// (.react-flow__edgelabel-renderer) does not exist without a full <ReactFlow>
// mount, so EdgeLabelRenderer returns null. Replace it with a passthrough so
// edge label/button children are visible to @testing-library queries.
vi.mock('@xyflow/react', async (importOriginal) => {
  const ReactDOM = await import('react-dom')
  const mod = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...mod,
    EdgeLabelRenderer: ({ children }: { children: import('react').ReactNode }) =>
      ReactDOM.createPortal(children, document.body),
  }
})

function wrap(ui: React.ReactNode) {
  return render(<ReactFlowProvider><svg>{ui}</svg></ReactFlowProvider>)
}
const base = { id: 'a->b', sourceX: 0, sourceY: 0, targetX: 100, targetY: 0,
  sourcePosition: 'right', targetPosition: 'left', source: 'a', target: 'b' } as unknown as EdgeProps

describe('LabeledEdge', () => {
  it('shows a read-only label when not selected', () => {
    wrap(<LabeledEdge {...base} selected={false} data={{ label: 'بله', editing: true, onSetLabel: () => {}, onDelete: () => {} }} />)
    expect(screen.getByText('بله')).toBeInTheDocument()
    expect(screen.queryByTitle('حذف خط')).not.toBeInTheDocument()   // no × when not selected
  })
  it('when selected in edit mode, edits the label and deletes via an offset button', () => {
    const onSetLabel = vi.fn(); const onDelete = vi.fn()
    wrap(<LabeledEdge {...base} selected data={{ label: 'بله', editing: true, onSetLabel, onDelete }} />)
    const input = screen.getByDisplayValue('بله')
    fireEvent.change(input, { target: { value: 'خیر' } })
    expect(onSetLabel).toHaveBeenCalledWith('خیر')
    fireEvent.click(screen.getByTitle('حذف خط'))
    expect(onDelete).toHaveBeenCalled()
  })
})
