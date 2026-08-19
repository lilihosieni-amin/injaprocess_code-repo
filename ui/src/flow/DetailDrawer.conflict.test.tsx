import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'
import type { ActivityNode, Pending, ReadableProcess } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

/** Resolving a conflict is `edit` over the process's own department (R5, and
 *  `DetailDrawer.gate.test.tsx` for the three people it tells apart), so the one
 *  case here that clicks «پذیرش» needs a session that holds it. Seeded through
 *  `renderAt`'s fourth argument, which is where the real app's drawer finds the
 *  descriptor — RequireAuth resolved it before any screen mounted — and not
 *  routed in a fetch stub, so nothing here can be asserted while GET
 *  /api/auth/me is still in flight (`test/utils.tsx`).
 *
 *  `process` now carries a department for the same reason: it is the target the
 *  gate asks about, and `{ nodes: [] }` named none.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const n = { id: 'cooking-001-n020', type: 'activity', label: 'تأیید', description: '', actor: 'مدیر',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } } as ActivityNode
const pending: Pending = { node: 'cooking-001-n020', field: 'actor', current: 'مدیر رستوران', proposed: 'معاون مدیر', source: 'جلسه', status: 'open' }
const process = { id: 'cooking-001', department: 'cooking', name: 'p', parent: null, nodes: [], edges: [], pending: [] } as unknown as ReadableProcess

describe('DetailDrawer conflicts', () => {
  it('renders current-vs-proposed and accepts by index', () => {
    const onAccept = vi.fn()
    renderAt('/', (
      <DetailDrawer node={n} editing={false} conflicts={[{ pending, index: 3 }]} process={process}
        onClose={() => {}} onEdit={() => {}} onAccept={onAccept} onReject={() => {}} onOpenSub={() => {}}
        onPatch={() => {}} onLinkSub={() => {}} onSetJunction={() => {}} onCreateSub={() => {}} onDeleteNode={() => {}} />
    ), '/', EDITOR)
    expect(screen.getByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'پذیرش' }))
    expect(onAccept).toHaveBeenCalledWith(3)
  })
})
