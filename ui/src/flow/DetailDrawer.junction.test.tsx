import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { JunctionNode } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

const j: JunctionNode = { id: 'cooking-001-j1', type: 'junction', junctionType: 'XOR', direction: 'split', position: { x: 0, y: 0 }, layout: 'auto' } as JunctionNode

describe('DetailDrawer junction edit', () => {
  it('selecting AND calls onSetJunction', () => {
    const onSetJunction = vi.fn()
    render(<DetailDrawer node={j} editing conflicts={[]} process={{ nodes: [] } as never}
      onClose={() => {}} onEdit={() => {}} onAccept={() => {}} onReject={() => {}} onOpenSub={() => {}}
      onPatch={() => {}} onLinkSub={() => {}} onSetJunction={onSetJunction} onCreateSub={() => {}} onDeleteNode={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'AND' }))
    expect(onSetJunction).toHaveBeenCalledWith('AND')
  })
})
