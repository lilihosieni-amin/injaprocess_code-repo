import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spike } from './Spike'

describe('spike', () => {
  it('mounts a ReactFlow canvas with custom nodes and an edge label', async () => {
    render(<Spike />)
    expect(screen.getByTestId('spike-canvas')).toBeInTheDocument()
    expect(await screen.findByText('فعالیت ۱')).toBeInTheDocument()
    expect(screen.getByText('نمونه')).toBeInTheDocument()
  })
})
