import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// Stub EdgeLabelRenderer: in jsdom tests the portal target
// (.react-flow__edgelabel-renderer) does not exist without a full <ReactFlow>
// mount, so EdgeLabelRenderer returns null. Replace it with a passthrough so
// edge label/button children are visible to @testing-library queries.
vi.mock('@xyflow/react', async (importOriginal) => {
  const React = await import('react')
  const mod = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...mod,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  }
})

import { installReactFlowMocks } from './reactflow-mock'
installReactFlowMocks()
