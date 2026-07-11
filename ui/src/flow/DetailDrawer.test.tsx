import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

const n: ActivityNode = { id: 'cooking-001-n010', type: 'activity', label: 'دریافت درخواست', description: 'شرح', actor: 'کارپرداز',
  icom: { inputs: ['درخواست'], controls: ['بودجه'], outputs: ['ثبت'], mechanisms: ['سامانه رزرو'] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'voice', touched_by: [] } } as ActivityNode

describe('DetailDrawer view', () => {
  it('shows label, actor, description, ICOM chips and the id', () => {
    render(<DetailDrawer node={n} editing={false} conflicts={[]} onClose={() => {}} onEdit={vi.fn()} onAccept={vi.fn()} onReject={vi.fn()} onOpenSub={vi.fn()} onPatch={vi.fn()} onLinkSub={vi.fn()} onSetJunction={vi.fn()} process={{ nodes: [] } as never} onCreateSub={vi.fn()} />)
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(screen.getByText('کارپرداز')).toBeInTheDocument()
    expect(screen.getByText('شرح')).toBeInTheDocument()
    expect(screen.getByText('درخواست')).toBeInTheDocument()
    expect(screen.getByText('بودجه')).toBeInTheDocument()
    expect(screen.getByText('سامانه رزرو')).toBeInTheDocument()
  })
})
