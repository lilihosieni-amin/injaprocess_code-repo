import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

const n: ActivityNode = { id: 'cooking-001-n010', type: 'activity', label: 'A', description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ActivityNode

describe('DetailDrawer edit', () => {
  it('edits the label via onPatch', () => {
    const onPatch = vi.fn()
    render(<DetailDrawer node={n} editing conflicts={[]} process={{ department: 'cooking', nodes: [] } as never}
      onClose={() => {}} onEdit={() => {}} onAccept={() => {}} onReject={() => {}} onOpenSub={() => {}}
      onPatch={onPatch} onLinkSub={() => {}} onSetJunction={() => {}} onCreateSub={() => {}} />)
    fireEvent.change(screen.getByLabelText('عنوان'), { target: { value: 'B' } })
    expect(onPatch).toHaveBeenCalledWith({ label: 'B' })
  })
})
