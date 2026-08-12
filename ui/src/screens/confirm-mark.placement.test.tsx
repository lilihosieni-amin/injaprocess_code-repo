import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Overview } from './Overview'
import { ProcessList } from './ProcessList'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'
import type { Confirmation } from '../api/types'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** The three screens each draw the mark, so the three screens each need pinning:
 *  the component's own tests say the mark is correct, and say nothing at all
 *  about whether it is on the page. CONFIRMER is EDITOR plus `confirm` and
 *  nothing else, so only `confirm` can explain any difference below. */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const CONFIRMER: SessionDescriptor = {
  ...EDITOR, capabilities: [...EDITOR.capabilities, 'confirm'],
}

const OV = {
  department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  description: 'واحد پخت', sub_units: [], personnel: [],
}
const PROC = {
  id: 'cooking-002', department: 'cooking', name: 'پخت غذای روز', summary: 'خلاصه',
  parent: null, idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [], edges: [], pending: [],
}
const PROCS = [PROC]
const DEPTS = [{ code: 'cooking', name: 'پخت', count: 1, subs: 0 }]

/** The department row is unconfirmed and the process row is confirmed, so a
 *  screen that looked the mark up under the wrong key would show the other
 *  one's state rather than nothing — a mistake "some pill appeared" cannot
 *  catch. */
const MARKS: Confirmation[] = [
  { target: 'cooking', kind: 'department', fingerprint: 'b'.repeat(64),
    confirmed: false, confirmed_by: null, confirmed_at: null },
  { target: 'cooking-002', kind: 'process', fingerprint: 'c'.repeat(64),
    confirmed: true, confirmed_by: '09120000001', confirmed_at: 1770000000 },
]

/** Routed by URL, not one body for everything: the confirmations listing is an
 *  array of rows and the document endpoints are single objects, so a single
 *  catch-all response would hand `marks.find` something that is not a list and
 *  pass or fail for reasons that have nothing to do with the mark. */
function mock(marks: Confirmation[] = MARKS) {
  const calls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    // `/api/processes/{pid}` before `…/departments/{code}/processes`: the
    // single document and the department's list both contain "/processes", and
    // answering the Summary screen with a bare array would fail it for a reason
    // that has nothing to do with the mark.
    const body = url.startsWith('/api/confirmations') ? marks
      : url.startsWith('/api/processes/') ? PROC
      : url.includes('/overview') ? OV
      : url.includes('/processes') ? PROCS
      : DEPTS
    return Promise.resolve(new Response(JSON.stringify(body),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
  return calls
}

describe('the mark on the department overview', () => {
  it('draws the department’s own row for a holder of confirm', async () => {
    mock()
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', CONFIRMER)
    expect(await screen.findByText('تأیید نشده')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تأیید محتوا' })).toBeInTheDocument()
  })

  it('keeps the last-updated date, which every reader is still sent', async () => {
    // `visibility.public_overview` returns the overview unchanged for both
    // stances (D55), so this line is not conditional on anything and must not
    // become so. It is the process's own timestamps that are dropped.
    mock()
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', CONFIRMER)
    expect(await screen.findByText(/۱۴۰۵\/۰۴\/۱۵/)).toBeInTheDocument()
  })

  it('draws no mark, and asks for no listing, for an editor without confirm', async () => {
    // Both halves matter. The mark is cosmetic (D48) — but the listing 403s
    // anyone without `confirm`, so an ungated query would put a refusal in the
    // console on every page load of every editor in the building.
    const calls = mock()
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.queryByText('تأیید نشده')).toBeNull()
    expect(screen.queryByText('تأیید شده')).toBeNull()
    expect(calls.some((u) => u.startsWith('/api/confirmations'))).toBe(false)
  })
})

describe('the mark on the process list', () => {
  it('draws each process’s own row for a holder of confirm', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
    expect(await screen.findByText('پخت غذای روز')).toBeInTheDocument()
    // The process is confirmed; the department, whose row is in the same
    // listing, is not. A list keyed on the department code instead of the
    // process id would draw «تأیید نشده» here.
    expect(await screen.findByText('تأیید شده')).toBeInTheDocument()
    expect(screen.queryByText('تأیید نشده')).toBeNull()
  })

  it('asks the listing for this department', async () => {
    const calls = mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
    await screen.findByText('پخت غذای روز')
    await waitFor(() =>
      expect(calls).toContain('/api/confirmations?department=cooking'))
  })

  it('draws no mark for an editor without confirm', async () => {
    const calls = mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
    expect(await screen.findByText('پخت غذای روز')).toBeInTheDocument()
    expect(screen.queryByText('تأیید شده')).toBeNull()
    expect(calls.some((u) => u.startsWith('/api/confirmations'))).toBe(false)
  })
})

describe('the mark on the process summary', () => {
  it('draws the process’s own row for a holder of confirm', async () => {
    mock()
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', CONFIRMER)
    expect(await screen.findByText('تأیید شده')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'لغو تأیید' })).toBeInTheDocument()
  })

  it('reads the department off the id in the URL, before the document arrives', async () => {
    // `proc.department` is only available after the two early returns, so the
    // hook cannot use it without moving them — and the server does not trust
    // the stored field either. `cooking-002` → `cooking`, the same
    // `rsplit("-", 1)[0]` the server's `_target_scope` applies.
    const calls = mock()
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', CONFIRMER)
    await waitFor(() =>
      expect(calls).toContain('/api/confirmations?department=cooking'))
  })

  it('draws no mark for an editor without confirm', async () => {
    const calls = mock()
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    expect(await screen.findAllByText('پخت غذای روز')).toHaveLength(2)
    expect(screen.queryByText('تأیید شده')).toBeNull()
    expect(calls.some((u) => u.startsWith('/api/confirmations'))).toBe(false)
  })
})
