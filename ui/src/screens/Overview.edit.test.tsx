import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'
import { declarations, paint } from '../test/paint'
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

  it('removes the duty whose control was pressed, which the test above only claimed to do', async () => {
    // The test above was named «add one, remove one» and never removed
    // anything: `removeDuty` had no coverage at all, and a control that drops
    // the WRONG row — or every row — would have shipped with the suite green.
    //
    // THREE duties and the MIDDLE one, not two and the first. A survey of this
    // file's own mutants found `k !== j` -> `k !== 0` alive against a
    // two-duty fixture whose first row was the one pressed: the mutant and the
    // component agreed on that one case, so the assertion could not tell them
    // apart. Pressing the middle of three leaves a different survivor for
    // `k !== 0`, for `k !== 2`, and for a filter that drops everything.
    const THREE = {
      ...OV,
      personnel: [{ role: 'سرآشپز', duties: ['مدیریت', 'کنترل کیفیت', 'برنامهٔ روز'], kpi: ['شاخص اولیه'] }],
    }
    let putBody: unknown = null
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') putBody = JSON.parse(init.body as string)
      return Promise.resolve(new Response(JSON.stringify(THREE), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    // F11 — the row's own control carries an accessible name, not a `title`
    // alone, and there is one per duty.
    const drops = screen.getAllByRole('button', { name: 'حذف وظیفه' })
    expect(drops).toHaveLength(3)
    fireEvent.click(drops[1])
    expect(screen.queryByDisplayValue('کنترل کیفیت')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(putBody).not.toBeNull())
    expect((putBody as { personnel: { duties: string[] }[] }).personnel[0].duties)
      .toEqual(['مدیریت', 'برنامهٔ روز'])
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


  it('gives the save cluster §6.16’s share of the row at ≤760', async () => {
    // `[data-r-stack] [data-r-actions]{flex-wrap:wrap}` and
    // `[data-r-stack] [data-r-actions] > button{flex:1 1 45%}` — the second half
    // of the rule the header stack owes. Only the ≤760 slice is asserted here:
    // the desktop set is the same two buttons every other screen draws.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    const R760 = '(max-width: 760px)'
    const cluster = document.querySelector<HTMLElement>('[data-r-actions]')!
    expect([...declarations(await paint(cluster.className), '', R760)]).toEqual(['flex-wrap: wrap'])
    for (const name of ['انصراف', 'ذخیره']) {
      const b = screen.getByRole('button', { name })
      expect(cluster.contains(b), name).toBe(true)
      expect([...declarations(await paint(b.className), '', R760)], name).toEqual(['flex: 1 1 0%'])
    }
  })

  it('paints the two controls the design system draws for a repeating list', async () => {
    // A control asserted only to EXIST is not asserted. Both of these are
    // colour-on-colour boxes with no text of their own inside them, so the
    // browser gate's contrast census — which reads runs of text — cannot see a
    // destructive square repainted the colour of the card it sits on, and
    // nothing else measures them at all.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))

    // `AddButton` from `components/forms/ListEditor.jsx`: `inline-flex;gap:6px;
    // 12.5px/600 --violet;1.5px dashed --line-dashed;radius --radius-control;
    // padding:6px 12px`.
    const add = screen.getByRole('button', { name: 'افزودن وظیفه' })
    expect([...declarations(await paint(add.className))].sort()).toEqual([
      'align-items: center',
      'align-self: flex-start',
      'background-color: transparent',
      'border-color: var(--line-dashed)',
      'border-radius: var(--radius-control)',
      'border-style: dashed',
      'border-width: var(--border-hairline)',
      'color: var(--violet)',
      'cursor: pointer',
      'display: inline-flex',
      'font-size: var(--fs-sm2)',
      'font-weight: var(--fw-semibold)',
      'gap: var(--space-3)',
      'padding-bottom: var(--space-3)',
      'padding-left: var(--space-6)',
      'padding-right: var(--space-6)',
      'padding-top: var(--space-3)',
      'position: relative',
    ])

    // The destructive square: `--tile-c2` under `--conflict` behind a 1.5px
    // `--border-danger` edge — the four `#FADAD8` borders this screen used to
    // carry, which missed the token by three bytes.
    const drop = screen.getAllByRole('button', { name: 'حذف وظیفه' })[0]
    expect([...declarations(await paint(drop.className))].sort()).toEqual([
      'align-items: center',
      'background-color: var(--tile-c2)',
      'border-color: var(--border-danger)',
      'border-radius: var(--radius-input)',
      'border-width: var(--border-hairline)',
      'color: var(--conflict)',
      'cursor: pointer',
      'display: inline-flex',
      'flex: none',
      'height: var(--size-tool)',
      'justify-content: center',
      'position: relative',
      'width: var(--size-tool)',
    ])

    // F11's floor, on both: the design draws each at about 34px and the plan's
    // rule is that a drawn control is never inflated to 44 — a transparent
    // ::before grows the HIT AREA instead. 34 + 2x5 is the 44, and none of it
    // paints. `content: none` is the value that passes a spelling check and
    // generates no box at all, so the content is read, not merely found.
    for (const el of [add, drop]) {
      const before = [...declarations(await paint(el.className), '::before')].sort()
      expect(before).toEqual([
        '--tw-content: ""',
        'content: var(--tw-content)',
        'inset: -5px',
        'position: absolute',
      ])
    }
  })
})
