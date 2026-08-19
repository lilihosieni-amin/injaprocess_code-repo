import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** The edit flows below are an editor's; the screen draws none of them without
 *  a session that holds `edit` over this department. */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const OV = { department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  description: 'شرح اولیه',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت'], kpi: ['شاخص اولیه'] }] }

describe('Overview edit', () => {
  it('enters edit, changes a sub-unit name, and PUTs on save', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    const nameInput = screen.getByDisplayValue('آشپزخانهٔ گرم')
    fireEvent.change(nameInput, { target: { value: 'آشپزخانهٔ سرد' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' })))
  })

  it('edits duties as per-task inputs: adds one and PUTs them as an array', async () => {
    let putBody: unknown = null
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') { putBody = JSON.parse(init.body as string); return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } })) }
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    // existing single duty appears as its own input (not a textarea)
    expect(screen.getByDisplayValue('مدیریت')).toBeInTheDocument()
    // add a new task input and fill it
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وظیفه' }))
    const inputs = screen.getAllByPlaceholderText('شرح وظیفه…')
    fireEvent.change(inputs[inputs.length - 1], { target: { value: 'کنترل انبار' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' })))
    expect((putBody as { personnel: { duties: string[] }[] }).personnel[0].duties).toEqual(['مدیریت', 'کنترل انبار'])
  })

  it('removes a duty, which the test above only ever claimed to do', async () => {
    // The test above was named «add one, remove one» and never removed
    // anything: `removeDuty` had no coverage at all, and a control that drops
    // the WRONG row — or every row — would have shipped with the suite green.
    // Two duties, so dropping the first is distinguishable from dropping all.
    const TWO = { ...OV, personnel: [{ role: 'سرآشپز', duties: ['مدیریت', 'کنترل کیفیت'], kpi: ['شاخص اولیه'] }] }
    let putBody: unknown = null
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') putBody = JSON.parse(init.body as string)
      return Promise.resolve(new Response(JSON.stringify(TWO), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    // F11 — the row's own control carries an accessible name, not a `title`
    // alone, and there is one per duty.
    const drops = screen.getAllByRole('button', { name: 'حذف وظیفه' })
    expect(drops).toHaveLength(2)
    fireEvent.click(drops[0])
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(putBody).not.toBeNull())
    expect((putBody as { personnel: { duties: string[] }[] }).personnel[0].duties).toEqual(['کنترل کیفیت'])
  })

  it('reaches every editable value by a bound label, never by a placeholder', async () => {
    // F11 — «a placeholder is not a label»: it disappears the moment a value is
    // typed, and a screen reader meeting eight identical single-line boxes has
    // nothing to tell «وظیفهٔ ۱» from «وظیفهٔ ۲». The read view numbers the
    // duties; so does the edit view.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    expect(screen.getByLabelText('متن شرح')).toHaveValue('شرح اولیه')
    expect(screen.getByLabelText('نام واحد')).toHaveValue('آشپزخانهٔ گرم')
    expect(screen.getByLabelText('شرح واحد')).toHaveValue('غذاهای گرم')
    expect(screen.getByLabelText('عنوان شغلی')).toHaveValue('سرآشپز')
    expect(screen.getByLabelText('وظیفهٔ ۱')).toHaveValue('مدیریت')
    expect(screen.getByLabelText('شاخص ۱')).toHaveValue('شاخص اولیه')
  })

  it('draws none of the edit view for a reader — R5, absent rather than disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview',
      { ...EDITOR, role: 'reader', capabilities: ['view'] })
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    // Not «no ویرایش button»: nothing the edit view owns exists at all — no
    // field, no add affordance, no destructive square, disabled or otherwise.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^افزودن/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^حذف/ })).toBeNull()
  })

  it('appends a whole sub-unit and a whole role, and drops them', async () => {
    // The two SECTION-level add controls, which nothing exercised: they append
    // an empty row to a different array from the two row-level ones, and both
    // used to read «افزودن», so a call site wired to the wrong array was
    // indistinguishable on the screen.
    let putBody: unknown = null
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') putBody = JSON.parse(init.body as string)
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    fireEvent.click(screen.getByRole('button', { name: 'افزودن زیربخش' }))
    fireEvent.change(screen.getAllByLabelText('نام واحد')[1], { target: { value: 'قنادی' } })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن نقش' }))
    fireEvent.change(screen.getAllByLabelText('عنوان شغلی')[1], { target: { value: 'شیرینی‌پز' } })
    // …and the destructive square drops the row it sits on, not the first one.
    fireEvent.click(screen.getAllByRole('button', { name: 'حذف واحد' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(putBody).not.toBeNull())
    const sent = putBody as { sub_units: { name: string }[]; personnel: { role: string }[] }
    expect(sent.sub_units.map((s) => s.name)).toEqual(['قنادی'])
    expect(sent.personnel.map((p) => p.role)).toEqual(['سرآشپز', 'شیرینی‌پز'])
  })

  it('edits KPIs as per-line inputs: add one, and PUTs them as an array', async () => {
    let putBody: unknown = null
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') { putBody = JSON.parse(init.body as string); return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } })) }
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    // the existing KPI appears as its own input
    expect(screen.getByDisplayValue('شاخص اولیه')).toBeInTheDocument()
    // add a new KPI line and fill it
    fireEvent.click(screen.getByRole('button', { name: 'افزودن شاخص' }))
    const inputs = screen.getAllByPlaceholderText('شرح شاخص…')
    fireEvent.change(inputs[inputs.length - 1], { target: { value: 'کاهش خطا به زیر ۲٪' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' })))
    expect((putBody as { personnel: { kpi: string[] }[] }).personnel[0].kpi).toEqual(['شاخص اولیه', 'کاهش خطا به زیر ۲٪'])
  })

  it('edits the department description and PUTs the trimmed value', async () => {
    let putBody: unknown = null
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') { putBody = JSON.parse(init.body as string); return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } })) }
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    const descInput = screen.getByDisplayValue('شرح اولیه')
    fireEvent.change(descInput, { target: { value: '  شرح تازه  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' })))
    expect((putBody as { description: string }).description).toBe('شرح تازه')
  })
})
