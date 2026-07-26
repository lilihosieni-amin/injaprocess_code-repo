import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './Canvas'

describe('Canvas without write callbacks', () => {
  it('mounts read-only when no mutation handlers are supplied', async () => {
    render(
      <ReactFlowProvider>
        <Canvas
          docNodes={[{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { node: { id: 'start', type: 'start', label: 'شروع' }, conflicts: 0, hasSub: false } }]}
          docEdges={[]}
          revision={1}
          editing={false}
        />
      </ReactFlowProvider>,
    )
    expect(await screen.findByText('شروع')).toBeInTheDocument()
  })
})
