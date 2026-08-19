import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'
import type { ActivityNode, Pending, ReadableProcess } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))
afterEach(() => vi.restoreAllMocks())

/** R5 inside the drawer.
 *
 *  «پذیرش»/«رد» sit in the drawer's VIEW branch, outside every `editing` guard,
 *  and they call `POST /api/processes/{pid}/pending/{index}` — which is
 *  `requires("edit", _pid_target)`, i.e. `edit` over `dept:{dept_of(pid)}`
 *  (`routers/processes.py:414`). Ungated, the drawer offered them to whoever it
 *  was handed a conflict for. That is the worse half of the shape «ویرایش» had
 *  before `6bf9a69`: there the refusal arrives *before* the click, because the
 *  control leads to a screen; here it arrives after, because the control is the
 *  request.
 *
 *  The cards themselves are not gated and these cases say so twice. They are the
 *  node's state rather than an offer to act, the same reader is already shown the
 *  conflict count on the node itself (`nodes/ActivityNode.tsx:16`, a button whose
 *  entire action is to open this drawer), and every "absent" assertion below
 *  needs a drawer that demonstrably rendered — «مقدار فعلی» is what tells a
 *  missing button from a missing screen.
 *
 *  Seeded through `renderAt`'s fourth argument rather than routed in a fetch
 *  stub, which is `test/utils.tsx:31-40`'s rule and `6bf9a69`'s lesson: the
 *  descriptor is in cache before the drawer mounts, so "the button is absent"
 *  can never pass while GET /api/auth/me is still in flight.
 */
const READER: SessionDescriptor = {
  username: '09120000002', displayName: 'خواننده', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const EDITOR: SessionDescriptor = {
  ...READER, username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'],
}
/** Holds `edit`, over a department this process is not in. */
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:dining'] }

const node = {
  id: 'cooking-001-n020', type: 'activity', label: 'تأیید', description: '', actor: 'مدیر',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] },
} as ActivityNode
const pending: Pending = {
  node: 'cooking-001-n020', field: 'actor', current: 'مدیر رستوران',
  proposed: 'معاون مدیر', source: 'جلسه', status: 'open',
}
const process = { id: 'cooking-001', department: 'cooking', name: 'p', parent: null, nodes: [], edges: [], pending: [] } as unknown as ReadableProcess

function mount(session: SessionDescriptor, onAccept = vi.fn(), onReject = vi.fn()) {
  renderAt('/', (
    <DetailDrawer node={node} editing={false} conflicts={[{ pending, index: 3 }]} process={process}
      onClose={vi.fn()} onEdit={vi.fn()} onAccept={onAccept} onReject={onReject} onOpenSub={vi.fn()}
      onPatch={vi.fn()} onLinkSub={vi.fn()} onSetJunction={vi.fn()} onCreateSub={vi.fn()} onDeleteNode={vi.fn()} />
  ), '/', session)
  return { onAccept, onReject }
}

describe('DetailDrawer — resolving a conflict is gated (R5)', () => {
  it('does not offer «پذیرش»/«رد» to a reader, and still tells them of the conflict', () => {
    mount(READER)
    expect(screen.getByText('مقدار فعلی')).toBeInTheDocument()
    expect(screen.getByText('مدیر رستوران')).toBeInTheDocument()
    expect(screen.getByText('معاون مدیر')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'پذیرش' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'رد' })).not.toBeInTheDocument()
  })

  it('offers both to an editor scoped to the process’s department', () => {
    const { onAccept, onReject } = mount(EDITOR)
    expect(screen.getByText('مقدار فعلی')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'پذیرش' }))
    expect(onAccept).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: 'رد' }))
    expect(onReject).toHaveBeenCalledWith(3)
  })

  it('does not offer them to an editor scoped to a DIFFERENT department', () => {
    // The scope argument's own test, and the only one of the three that has it.
    // `can('edit')` with no target answers true for this session, so a gate that
    // drops the target passes both cases above and fails only here — which is
    // what tells `auth/can.ts`'s `useCan` from `session.ts`'s bare
    // `can(descriptor, capability)`, a function with no target parameter at all.
    // The target asked for is the one `_pid_target` builds for the endpoint, so
    // the two questions are the same question.
    mount(OTHER_DEPT_EDITOR)
    expect(screen.getByText('مقدار فعلی')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'پذیرش' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'رد' })).not.toBeInTheDocument()
  })
})
