import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'
import type { Confirmation } from '../api/types'

afterEach(() => vi.restoreAllMocks())

/**
 * **Owner ruling R46 — the process confirmation belongs on the flowchart.**
 *
 * *"the each process accept or reject should be in flowchart page, not in
 * information page. exactly like design."*
 *
 * The deliverables agree with the ruling and are more precise than it. Both flow
 * bars draw the act — `Inja Panel.dc.html:597-608` and `Inja Reader.dc.html:357-368`
 * put it in `data-r-actions`, under `showEditTools`, immediately before «ویرایش»
 * — and the process summary's own action group (`Inja Panel.dc.html:393-396`)
 * draws **only** «ویرایش اطلاعات». So the ACT moves here and the summary keeps
 * nothing but its status pill, which the design does still draw on that screen's
 * badge row (`:389`, under `isEditor`).
 *
 * This file is the twin of `src/screens/confirm-mark.placement.test.tsx`'s three
 * per-screen blocks, for the screen that had none.
 */
const READER: SessionDescriptor = {
  username: '09120000002', displayName: 'خواننده', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
/** Holds `edit` and NOT `confirm` — the case R5 is about. */
const EDITOR: SessionDescriptor = {
  ...READER, username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'],
}
const CONFIRMER: SessionDescriptor = {
  ...EDITOR, capabilities: [...EDITOR.capabilities, 'confirm'],
}
/** Holds `confirm`, but over a department this process is not in. */
const OTHER_DEPT_CONFIRMER: SessionDescriptor = { ...CONFIRMER, scopes: ['dept:dining'] }

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{
    id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '',
    actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    subprocess: null, position: { x: 250, y: 90 }, layout: 'auto',
    source: { created_by: 'x', touched_by: [] },
  }],
  edges: [],
}

/** A mark for THESE bytes — `confirmed: true` is "the stored fingerprint still
 *  matches", not "a mark exists". */
const CONFIRMED: Confirmation = {
  target: 'cooking-001', kind: 'process', fingerprint: 'sha256:aaa', confirmed: true,
  confirmed_by: '09120000001', confirmed_at: 1_760_000_000,
}
/**
 * The same target after the document moved under it — FR-V2 / FR-V3 / AC-18.
 *
 * The server recomputes the fingerprint on read and answers `confirmed: false`
 * when the stored one no longer matches, so *"a confirmation is for a VERSION,
 * not a name"* arrives as this row rather than as a rule the client applies.
 * `confirmed_by` and `confirmed_at` come back null with it, which is why the
 * byline is guarded.
 */
const STALE: Confirmation = {
  target: 'cooking-001', kind: 'process', fingerprint: 'sha256:bbb', confirmed: false,
  confirmed_by: null, confirmed_at: null,
}

/** Every URL this screen reads, routed — `mockResolvedValue` hands the SAME
 *  `Response` to every call and `fetchJson` consumes its body on the first, so a
 *  screen with three reads needs an implementation and not a value. */
function mount(session: SessionDescriptor, marks: Confirmation[] = [CONFIRMED]) {
  const calls: string[] = []
  const json = (body: unknown) => new Response(JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('/api/confirmations')) return Promise.resolve(json(marks))
    if (url.includes('/processes') && url.endsWith('/processes')) return Promise.resolve(json([proc]))
    return Promise.resolve(json(proc))
  })
  renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', session)
  return calls
}

describe('R46 — the process confirmation is drawn on the flowchart', () => {
  it('draws the act on the toolbar for a holder of `confirm`', async () => {
    mount(CONFIRMER)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()

    // The act — a question, not a write (FR-I3). Its NAME is also the state:
    // «لغو تأیید» is only ever offered for a row that is confirmed.
    expect(await screen.findByRole('button', { name: 'لغو تأیید' })).toBeInTheDocument()

    // …in the flow toolbar's own action group, which is where both deliverables
    // draw it — not loose on the canvas.
    const actions = document.querySelector('[data-r-flowbar] [data-r-actions]')
    expect(actions, 'the flow toolbar draws no action group').not.toBeNull()
    expect(actions!.contains(screen.getByTestId('confirm-box'))).toBe(true)

    // **And NOT the mark.** `ConfirmMark`'s byline is
    // `--role-subtitle-on-field`, which is chosen for the violet field; this
    // toolbar is white, and measured in Chrome that ink lands at 1.74:1. The
    // design draws no byline on this bar. The pill keeps its place on the
    // process summary, where the field is behind it.
    expect(screen.queryByTestId('confirm-mark')).not.toBeInTheDocument()
  })

  it('draws NOTHING to an editor who may not confirm, and asks for no marks (R5)', async () => {
    const calls = mount(EDITOR)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    // Not greyed and not explained — absent. A non-editor is only ever served
    // content that IS confirmed (D22), so a mark would say nothing at all.
    expect(screen.queryByTestId('confirm-box')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تأیید/ })).not.toBeInTheDocument()
    // …and the listing is never requested. `GET /api/confirmations` requires
    // `confirm` and 403s everyone else, so an ungated read would put a refusal
    // in the console on every flowchart a non-confirmer opens.
    expect(calls.some((u) => u.startsWith('/api/confirmations'))).toBe(false)
    // The screen is otherwise whole — this is a control that is absent, not a
    // render that failed.
    expect(screen.getByTestId('enter-edit')).toBeInTheDocument()
  })

  it('does not offer it to a confirmer scoped to a DIFFERENT department', async () => {
    // The scope argument's own test: a bare `can('confirm')` answers true for
    // this session, so a gate that drops the target passes the first case and
    // fails only here.
    const calls = mount(OTHER_DEPT_CONFIRMER)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-box')).not.toBeInTheDocument()
    expect(calls.some((u) => u.startsWith('/api/confirmations'))).toBe(false)
  })

  it('reads the mark for THIS process, and follows the version rather than the name (FR-V2/FR-V3)', async () => {
    // AC-18: any change — including moving parts of the flowchart — invalidates
    // the confirmation. The server says so by recomputing the fingerprint, and
    // the screen must report what it was told rather than that a mark exists.
    mount(CONFIRMER, [STALE])
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    // The act offers to CONFIRM, not to withdraw — which is the screen saying
    // the stored mark no longer stands for these bytes.
    expect(await screen.findByRole('button', { name: 'تأیید محتوا' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'لغو تأیید' })).not.toBeInTheDocument()
  })

  it('asks for the marks of the process’s OWN department', async () => {
    const calls = mount(CONFIRMER)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()
    expect(calls).toContain('/api/confirmations?department=cooking')
  })
})
