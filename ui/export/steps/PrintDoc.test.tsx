import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PrintDoc } from './PrintDoc'
import type { ExportPayload } from '../shared/payload'
import type { Edge, ProcNode, Process } from '../../src/api/types'
// the stylesheets as *source text*: jsdom applies no CSS module, so the rules
// that keep the two documents apart can only be asserted by reading them
import printCss from './print.module.css?raw'
import baseCss from './steps-base.css?raw'

const act = (id: string, label: string): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

/** An activity that opens a subprocess — the node the printed note quotes. */
const calls = (id: string, label: string, subprocess: string): ProcNode =>
  ({ ...act(id, label), subprocess } as ProcNode)

/** Soft-deleted: still in the document, must never reach the guide. */
const gone = (n: ProcNode): ProcNode => ({ ...n, removed: true } as ProcNode)

const junc = (id: string, t: 'AND' | 'OR' | 'XOR'): ProcNode => ({
  id, type: 'junction', junctionType: t, direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

const term = (id: 'start' | 'end'): ProcNode => ({
  id, type: id, label: id === 'start' ? 'شروع' : 'پایان',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

function proc(
  id: string, name: string, nodes: ProcNode[], edges: Edge[] = [],
  parent: Process['parent'] = null,
): Process {
  return {
    id, department: 'dining', name, summary: '',
    source: { type: 'manual', ref: null, run: null }, parent,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes, edges, pending: [],
  } as Process
}

// the *stored* form: overview.json already carries «دپارتمان» inside `name`,
// so a heading that prefixes «واحد» or «دپارتمان» reads doubled on real data
const DEPT = { department: 'dining', name: 'دپارتمان سالن', description: '', sub_units: [], personnel: [], updated_at: '' }

const payloadOf = (...processes: Process[]) =>
  ({ dept: DEPT, processes, generated_at: '' } as unknown as ExportPayload)

const PAYLOAD = {
  dept: DEPT,
  processes: [{
    id: 'dining-001', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('n1', 'خوشامدگویی')], edges: [], pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

/** n2 carries *two* back-edges to the same target, n1 — the case where keying
 *  the back tags by target alone collides. */
const TWIN_BACK_PAYLOAD = {
  dept: DEPT,
  processes: [{
    id: 'dining-004', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('n1', 'خوشامدگویی'), act('n2', 'انتخاب غذا')],
    edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n1' }, { from: 'n2', to: 'n1' }],
    pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

/** A branching process: a condition carried onto step 1, an XOR group with a
 *  labelled branch, an unlabelled one and an empty one, and a step that opens a
 *  subprocess — the whole recursive rendering arm in one payload. */
const GROUP_PAYLOAD = payloadOf(
  proc('dining-002', 'سفارش‌گیری', [
    term('start'),
    act('n1', 'گرفتن سفارش'),
    junc('j1', 'XOR'),
    act('n2', 'آوردن نوشیدنی'),
    act('n4', 'گفتن پیشنهاد روز'),
    calls('n3', 'تحویل به آشپزخانه', 'dining-003'),
  ], [
    { from: 'start', to: 'n1', label: 'رستوران باز است' },
    { from: 'n1', to: 'j1' },
    { from: 'j1', to: 'n2', label: 'مشتری نوشیدنی خواست' },
    { from: 'j1', to: 'n4' },
    { from: 'j1', to: 'n3' },
    { from: 'n2', to: 'n3' },
    { from: 'n4', to: 'n3' },
  ]),
  proc('dining-003', 'آماده‌سازی غذا', [act('m1', 'پختن')], [],
    { process: 'dining-002', node: 'n3' }),
)

/** The only activity that called `dining-006` has been soft-deleted. */
const REMOVED_CALLER_PAYLOAD = payloadOf(
  proc('dining-005', 'پذیرایی', [gone(calls('n1', 'ثبت سفارش', 'dining-006'))]),
  proc('dining-006', 'آماده‌سازی', [act('m1', 'پختن')], [],
    { process: 'dining-005', node: 'n1' }),
)

/** Two processes call `dining-012`; `parent` records which one owns it. */
const CALLER_A = proc('dining-010', 'سالن', [calls('a1', 'بردن سفارش', 'dining-012')])
const CALLER_B = proc('dining-011', 'بار', [calls('b1', 'ثبت در صندوق', 'dining-012')])
const shared = (parent: Process['parent']) =>
  proc('dining-012', 'صدور فاکتور', [act('m1', 'چاپ فاکتور')], [], parent)

describe('PrintDoc', () => {
  it('emits an index and one section per process, with every step', () => {
    render(<PrintDoc payload={PAYLOAD} />)
    const index = screen.getByTestId('print-index')
    expect(within(index).getByText('پذیرایی')).toBeInTheDocument()
    expect(within(index).getByText('۱ مرحله')).toBeInTheDocument()

    const section = screen.getByTestId('print-section-dining-001')
    expect(within(section).getByText('خوشامدگویی')).toBeInTheDocument()
    expect(within(section).getByText('شرح خوشامدگویی')).toBeInTheDocument()
    expect(within(section).getByText('مجری: مهماندار')).toBeInTheDocument()
    expect(within(section).getByText('کار تمام شد')).toBeInTheDocument()
  })

  it('titles the index with the stored department name, with no واحد prefix', () => {
    render(<PrintDoc payload={PAYLOAD} />)
    const index = screen.getByTestId('print-index')
    // getByText, not getByRole — the whole print doc is display:none on screen
    expect(within(index).getByText('راهنمای گام‌به‌گام کار — دپارتمان سالن')).toBeInTheDocument()
    expect(within(index).queryByText(/واحد دپارتمان سالن/)).not.toBeInTheDocument()
  })

  it('renders a branch group: title, branch headers, empty branch, tags', () => {
    render(<PrintDoc payload={GROUP_PAYLOAD} />)
    const section = screen.getByTestId('print-section-dining-002')

    // the group container and its title
    expect(within(section).getByText('فقط یکی از این‌ها انجام می‌شود')).toBeInTheDocument()
    // one labelled branch, two unlabelled ones
    expect(within(section).getByText('اگر: مشتری نوشیدنی خواست')).toBeInTheDocument()
    expect(within(section).getByText('حالت ۲')).toBeInTheDocument()
    expect(within(section).getByText('حالت ۳')).toBeInTheDocument()
    // the third branch reaches the merge point straight away
    expect(within(section).getByText('کاری لازم نیست')).toBeInTheDocument()
    // steps inside the branches are rendered and numbered after step 1
    expect(within(section).getByText('آوردن نوشیدنی')).toBeInTheDocument()
    expect(within(section).getByText('گفتن پیشنهاد روز')).toBeInTheDocument()
    expect(within(section).getByText('۴')).toBeInTheDocument()
    // the condition tag carried onto the first step
    expect(within(section).getByText('اگر: رستوران باز است')).toBeInTheDocument()
    // the subprocess tag on the merge step
    expect(within(section).getByText('مراحل این کار: بخش «آماده‌سازی غذا»')).toBeInTheDocument()
    // every step in the group counts towards the index
    expect(within(screen.getByTestId('print-index')).getByText('۴ مرحله')).toBeInTheDocument()
  })

  it('notes what a subprocess section is about, from the activity that calls it', () => {
    render(<PrintDoc payload={GROUP_PAYLOAD} />)
    const section = screen.getByTestId('print-section-dining-003')
    expect(within(section).getByText('این بخش مربوط به چیست؟')).toBeInTheDocument()
    expect(within(section).getByText('شرح تحویل به آشپزخانه')).toBeInTheDocument()
  })

  it('never quotes a soft-deleted activity in the subprocess note', () => {
    render(<PrintDoc payload={REMOVED_CALLER_PAYLOAD} />)
    const section = screen.getByTestId('print-section-dining-006')
    expect(within(section).queryByText('این بخش مربوط به چیست؟')).not.toBeInTheDocument()
    // the dead node's text is nowhere in the document — `linearize` drops it
    // from its own section too, so the screen guide can never show it either
    expect(screen.queryByText('شرح ثبت سفارش')).not.toBeInTheDocument()
  })

  it('quotes the recorded parent when several activities call the same subprocess', () => {
    const sub = shared({ process: 'dining-011', node: 'b1' })
    for (const payload of [payloadOf(CALLER_A, CALLER_B, sub), payloadOf(CALLER_B, CALLER_A, sub)]) {
      const { unmount } = render(<PrintDoc payload={payload} />)
      const section = screen.getByTestId('print-section-dining-012')
      expect(within(section).getByText('شرح ثبت در صندوق')).toBeInTheDocument()
      expect(within(section).queryByText('شرح بردن سفارش')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('picks the same caller whatever order the payload lists them in', () => {
    const sub = shared(null)  // nothing recorded: fall back to a stable order
    for (const payload of [payloadOf(CALLER_A, CALLER_B, sub), payloadOf(CALLER_B, CALLER_A, sub)]) {
      const { unmount } = render(<PrintDoc payload={payload} />)
      const section = screen.getByTestId('print-section-dining-012')
      expect(within(section).getByText('شرح بردن سفارش')).toBeInTheDocument()
      expect(within(section).queryByText('شرح ثبت در صندوق')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('keeps the print document off the screen', () => {
    // jsdom applies no CSS module, so deleting these rules would leave the whole
    // printed document visible under the interactive app with every DOM test
    // still green. Assert the stylesheet source instead.
    const at = printCss.indexOf('@media print{')
    expect(at).toBeGreaterThan(-1)
    // hidden by a rule *outside* the print block — that is what hides it on screen
    expect(printCss.slice(0, at)).toMatch(/\.printdoc\s*\{[^}]*display\s*:\s*none/)
    // and shown again inside it
    expect(printCss.slice(at)).toMatch(/\.printdoc\s*\{[^}]*display\s*:\s*block/)
    // the mirror rule: the interactive tree is the one that goes away on paper
    expect(baseCss).toMatch(/@media print\{\s*\.app-screen\s*\{[^}]*display\s*:\s*none\s*!important/)
  })

  it('keys two back tags on the same target apart', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<PrintDoc payload={TWIN_BACK_PAYLOAD} />)
      expect(screen.getAllByText('برگرد به مرحلهٔ ۱')).toHaveLength(2)
      expect(err.mock.calls.flat().join(' ')).not.toMatch(/same key/i)
    } finally {
      err.mockRestore()
    }
  })
})
