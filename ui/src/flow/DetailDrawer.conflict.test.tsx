import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode, Pending } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

const n = { id: 'cooking-001-n020', type: 'activity', label: 'تأیید', description: '', actor: 'مدیر',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ActivityNode
const pending: Pending = { node: 'cooking-001-n020', field: 'actor', current: 'مدیر رستوران', proposed: 'معاون مدیر', source: 'جلسه', status: 'open' }

describe('DetailDrawer conflicts', () => {
  it('renders current-vs-proposed and accepts by index', () => {
    const onAccept = vi.fn()
    render(<DetailDrawer node={n} editing={false} conflicts={[{ pending, index: 3 }]} process={{ nodes: [] } as never}
      onClose={() => {}} onEdit={() => {}} onAccept={onAccept} onReject={() => {}} onOpenSub={() => {}}
      onPatch={() => {}} onLinkSub={() => {}} onSetJunction={() => {}} onCreateSub={() => {}} onDeleteNode={() => {}} />)
    expect(screen.getByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'پذیرش' }))
    expect(onAccept).toHaveBeenCalledWith(3)
  })
})
