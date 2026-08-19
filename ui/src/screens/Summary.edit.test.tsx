import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** The edit flow below is an editor's; the screen draws none of it without a
 *  session that holds `edit` over the process's own department. */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const P = { id: 'cooking-002', department: 'cooking', name: 'پخت', summary: 's', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: ['x'], controls: [], outputs: [], mechanisms: [] }, kpis: [], nodes: [], edges: [], pending: [] }

describe('Summary edit', () => {
  it('enters edit, changes the name, and PUTs the whole doc on save', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_i: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(init?.method === 'PUT' ? { ...P, name: 'X' } : P), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: /ویرایش اطلاعات/ }))
    fireEvent.change(screen.getByDisplayValue('پخت'), { target: { value: 'پخت جدید' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'PUT' })))
  })
})

describe('the rebuilt edit branch', () => {
  /** Serves P for every read and echoes the PUT body back, so a test can read
   *  what was sent as well as assert that it was. */
  function serve() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((_i: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(new Response(
        JSON.stringify(init?.method === 'PUT' ? JSON.parse(String(init.body)) : P),
        { status: 200, headers: { 'Content-Type': 'application/json' } })))
  }

  it('names every field and every destructive control, and uses no character as one', async () => {
    // F11 — six hand-rolled inputs used to carry a placeholder and no label,
    // and six «×» buttons carried no accessible name at all. Both halves are
    // asserted here because either alone passes on the old markup: the labels
    // without the buttons, or `queryAllByText('×')` on a screen with no fields.
    serve()
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: /ویرایش اطلاعات/ }))
    expect(screen.getByLabelText('نام فرآیند')).toHaveValue('پخت')
    expect(screen.getByLabelText('خلاصهٔ فرآیند')).toHaveValue('s')
    // `idef0.inputs` is `['x']` — one row, labelled and removable by name.
    expect(screen.getByLabelText('ورودی ۱')).toHaveValue('x')
    expect(screen.getByRole('button', { name: 'حذف ورودی ۱' })).toBeInTheDocument()
    expect(screen.queryAllByText('×')).toHaveLength(0)
  })

  it('adds and removes an ICOM term through the named controls', async () => {
    serve()
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: /ویرایش اطلاعات/ }))
    // «کنترل‌ها» starts empty, so the second row can only come from the add.
    fireEvent.click(screen.getAllByRole('button', { name: 'افزودن' })[1])
    fireEvent.change(screen.getByLabelText('کنترل ۱'), { target: { value: 'دستور پخت' } })
    expect(screen.getByLabelText('کنترل ۱')).toHaveValue('دستور پخت')
    fireEvent.click(screen.getByRole('button', { name: 'حذف کنترل ۱' }))
    expect(screen.queryByLabelText('کنترل ۱')).not.toBeInTheDocument()
  })

  it('PUTs a KPI added through the rebuilt KPI editor', async () => {
    // The KPI editor was three unlabelled inputs and a «×»; this is the whole
    // round trip through its replacement, read off the request body rather
    // than off the screen.
    const spy = serve()
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: /ویرایش اطلاعات/ }))
    fireEvent.click(screen.getByRole('button', { name: 'افزودن شاخص' }))
    fireEvent.change(screen.getByLabelText('نام شاخص ۱'), { target: { value: 'زمان چرخه' } })
    fireEvent.change(screen.getByLabelText('مقدار هدف ۱'), { target: { value: 'کمتر از ۱۵ دقیقه' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002',
      expect.objectContaining({ method: 'PUT' })))
    // The PUT call, found by method: the mutation's own refetch lands after it
    // and carries no body, so `.at(-1)` reads `undefined` and this line was
    // written that way once.
    const put = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')!
    const body = JSON.parse(String((put[1] as RequestInit).body))
    expect(body.kpis).toEqual([{ name: 'زمان چرخه', target: 'کمتر از ۱۵ دقیقه' }])
  })
})
