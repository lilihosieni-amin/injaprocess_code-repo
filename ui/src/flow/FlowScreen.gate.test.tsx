import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** R5 on the flowchart.
 *
 *  Signed in as a reader the complete set of in-app controls this screen draws
 *  is «بازگشت» and React Flow's three zoom buttons; «ویرایش» drawn beside them
 *  is the one thing the app offers a reader here that the app will then refuse
 *  — `PUT /api/processes/{pid}` re-derives `edit` over `dept:{dept_of(pid)}`
 *  and answers 403 (`routers/processes.py:386`). R5 says a person who cannot
 *  reach a thing does not see it: not greyed, not explained, not drawn and then
 *  refused. The typed-URL refusal stays; what goes is the app leading them to
 *  it.
 *
 *  Scoped to the process's own department, like `Summary.tsx:67` and
 *  `ProcessList.tsx:42`, because the endpoint gates on that department and not
 *  on the person — the third case below is the one that tells the two apart,
 *  and an un-scoped `can('edit')` passes the first two.
 */
const READER: SessionDescriptor = {
  username: '09120000002', displayName: 'خواننده', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const EDITOR: SessionDescriptor = { ...READER, username: '09120000001', displayName: 'مدیر', role: 'editor', capabilities: ['view', 'comment', 'export_pdf', 'edit'] }
/** Holds `edit`, but over a department this process is not in. */
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:dining'] }

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{ id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null, position: { x: 250, y: 90 }, layout: 'auto', source: { created_by: 'x', touched_by: [] } }],
  edges: [],
}

function mount(session: SessionDescriptor) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(proc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', session)
}

describe('FlowScreen — the edit control is gated (R5)', () => {
  it('does not offer «ویرایش» to a reader', async () => {
    mount(READER)
    // The graph itself is drawn — this is a control that is absent, not a
    // screen that failed to render.
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.queryByTestId('enter-edit')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ویرایش/ })).not.toBeInTheDocument()
  })

  it('offers «ویرایش» to an editor scoped to the process’s department', async () => {
    mount(EDITOR)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.getByTestId('enter-edit')).toBeInTheDocument()
  })

  it('does not offer it to an editor scoped to a DIFFERENT department', async () => {
    // The scope argument's own test. `can('edit')` with no target answers true
    // for this session, so a gate that drops the target passes both cases above
    // and fails only here — and it is not hypothetical: the department head of
    // `dining` reaching a `cooking` process would be handed a button whose save
    // 403s.
    mount(OTHER_DEPT_EDITOR)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.queryByTestId('enter-edit')).not.toBeInTheDocument()
  })
})
