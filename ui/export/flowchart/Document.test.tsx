import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Document } from './Document'
import { createSeededClient } from '../shared/seed'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'
import d from './document.module.css'

const act = (id: string, label: string, removed = false): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
  ...(removed ? { removed: true } : {}),
} as ProcNode)

const jun = (id: string, removed = false): ProcNode => ({
  id, type: 'junction', junctionType: 'XOR', direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
  ...(removed ? { removed: true } : {}),
} as ProcNode)

const term = (id: 'start' | 'end'): ProcNode => ({
  id, type: id, label: id === 'start' ? 'شروع' : 'پایان',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

// `overview.json` stores the *complete* label in `name` — the dining
// department's is «دپارتمان سالن», not the bare «سالن» that `registry.json`
// keeps. The document therefore renders `dept.name` with nothing in front of
// it, and this fixture has to hold the real stored form for the cover
// assertion below to mean anything.
const PAYLOAD = {
  dept: {
    department: 'dining', name: 'دپارتمان سالن',
    description: 'دپارتمان سالن مسئول پذیرایی است.\n\nسالن به چند باکس تقسیم می‌شود.',
    sub_units: [{ name: 'حیاط', description: 'زون بیرونی' }],
    personnel: [{ role: 'سرپرست سالن', duties: ['نظارت بر نظافت'], kpi: ['رضایت مشتری'] }],
    updated_at: '2026-07-26T09:00:00Z',
  },
  processes: [{
    id: 'dining-001', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('dining-001-n001', 'خوشامدگویی')], edges: [], pending: [],
  }],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

const renderDoc = (payload: ExportPayload = PAYLOAD) => render(
  <QueryClientProvider client={createSeededClient(payload)}>
    <Document payload={payload} />
  </QueryClientProvider>,
)

/** The document's own sections, in DOM order. `data-view` names them; the class
 *  list is what the print rule acts on, so both are asserted below. */
const sections = () => [...document.querySelectorAll<HTMLElement>('[data-view]')]
/** Which section is showing on screen — the one carrying the module's `active`. */
const openView = () =>
  sections().find((el) => el.classList.contains(d.active))?.dataset.view

// A miniature of the real shape that made the export disagree with the site.
// `dining-027` holds 24 nodes that are not junctions but only 20 activities the
// site counts — four are soft-deleted — and 7 junction nodes of which 2 are
// removed. Terminal nodes are the latent half of the same bug: no stored
// process has them today, but the app models them and they are not activities.
const SOFT_DELETED = {
  ...PAYLOAD,
  processes: [{
    ...PAYLOAD.processes[0],
    id: 'dining-027', name: 'پذیرش مشتری',
    nodes: [
      term('start'),
      act('dining-027-n001', 'خوشامدگویی'),
      act('dining-027-n002', 'ثبت سفارش'),
      act('dining-027-n019', 'راهنمایی مشتری به سمت صندوق', true),
      jun('dining-027-j1'),
      jun('dining-027-j8', true),
      term('end'),
    ],
  }],
} as unknown as ExportPayload

describe('Document', () => {
  it('opens on a cover and a table of contents', () => {
    renderDoc()
    expect(screen.getByRole('heading', { name: /مستند فرآیندهای/ })).toHaveTextContent('دپارتمان سالن')
    expect(screen.getByText('فهرست مطالب')).toBeInTheDocument()
    // `selector` picks the contents entry: the always-mounted print-only sheet
    // renders the same process name in an <h2>.
    expect(screen.getByText('پذیرایی', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('۱ فرآیند')).toBeInTheDocument()
  })

  it('opens the unit section with its paragraphs, sub-units, roles and KPIs', () => {
    renderDoc()
    fireEvent.click(screen.getByText('معرفی واحد، نقش‌ها و KPIها'))
    expect(openView()).toBe('doc')
    expect(screen.getByText('دپارتمان سالن مسئول پذیرایی است.')).toBeInTheDocument()
    expect(screen.getByText('سالن به چند باکس تقسیم می‌شود.')).toBeInTheDocument()
    expect(screen.getByText('حیاط')).toBeInTheDocument()
    // once as a role card heading, once as a KPI group heading
    expect(screen.getAllByText('سرپرست سالن')).toHaveLength(2)
    expect(screen.getByText('نظارت بر نظافت')).toBeInTheDocument()
    expect(screen.getByText('رضایت مشتری')).toBeInTheDocument()
  })

  it('opens the symbol legend', () => {
    renderDoc()
    // `selector` picks the contents entry: the legend section is always mounted
    // (see the print suite below) and renders the same words in an <h2>.
    fireEvent.click(screen.getByText('راهنمای نمادهای فلوچارت', { selector: 'span' }))
    expect(openView()).toBe('legend')
    expect(screen.getByText('فقط یکی از مسیرها انجام می‌شود')).toBeInTheDocument()
    expect(screen.getByText('یک یا چند مسیر انجام می‌شود')).toBeInTheDocument()
    expect(screen.getByText('همهٔ مسیرها انجام می‌شوند')).toBeInTheDocument()
  })

  // `PrintDiagrams` mounts each process's flow a second time, in the offscreen
  // measuring host, so every node label is now in the DOM twice — once in the
  // viewer, once where nothing is painted. `ignore` drops the measured copy;
  // testing-library matches it against each candidate itself, and
  // `.pf-measure *` matches every descendant of the host.
  const OFFSCREEN = { ignore: '.pf-measure, .pf-measure *' }

  it('opens the flow viewer from a table-of-contents entry', async () => {
    renderDoc()
    fireEvent.click(screen.getByText('پذیرایی', { selector: 'span' }))
    expect(await screen.findByText('خوشامدگویی', OFFSCREEN)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.getByText('فهرست مطالب')).toBeInTheDocument()
  })
})

describe('the counts the document prints', () => {
  // The site's own definition (`ProcessList.activityCount`, `flow/adapt`) is
  // «activity and not removed». A document that prints anything else
  // contradicts the viewer it links to: the reader clicks an entry saying N
  // and the canvas — which goes through `adapt` — draws fewer nodes.
  it('counts activities the way the site does: no junctions, no terminals, no removed nodes', () => {
    renderDoc(SOFT_DELETED)
    const entry = screen.getByText('پذیرش مشتری', { selector: 'span' })
    expect(entry).toHaveTextContent('۲ فعالیت')
    expect(entry).not.toHaveTextContent('۵ فعالیت')
  })

  it('counts junctions the same way, skipping removed ones', () => {
    renderDoc(SOFT_DELETED)
    const sheet = screen.getByTestId('sheet-dining-027')
    expect(sheet).toHaveTextContent('۲ فعالیت')
    expect(sheet).toHaveTextContent('۱ انشعاب')
    expect(sheet).not.toHaveTextContent('۲ انشعاب')
  })

  it('prints the same number on the sheet as in the table of contents', () => {
    renderDoc(SOFT_DELETED)
    const entry = screen.getByText('پذیرش مشتری', { selector: 'span' })
    const sheet = screen.getByTestId('sheet-dining-027')
    const count = (el: HTMLElement) => el.textContent?.match(/([۰-۹]+) فعالیت/)?.[1]
    expect(count(entry)).toBe(count(sheet))
  })
})

// The printed PDF is whatever is in the DOM: `@media print` reveals every
// `.view`, but a section React never rendered cannot be revealed. Rendering the
// sections conditionally lost four of the seven the table of contents lists —
// «معرفی واحد»/«واحدها و زون‌ها», «موجودیت‌ها و نقش‌ها», «اهداف عملکردی (KPI)»
// and «راهنمای نمادهای فلوچارت» — from a PDF printed on the landing view, which
// is the state every reader starts in and the only one carrying the cover.
describe('every document section stays mounted, so the PDF carries them all', () => {
  it('renders the unit, role, KPI and legend sections while the contents is showing', () => {
    renderDoc()
    expect(openView()).toBe('home')
    expect(screen.getByRole('heading', { name: 'فهرست مطالب' })).toBeInTheDocument()
    // `hidden` is the point: `.view{display:none}` keeps these off the screen
    // and out of the accessibility tree, but they are in the DOM, which is all
    // the print rule needs to put them on paper.
    for (const name of ['معرفی دپارتمان سالن', 'موجودیت‌ها و نقش‌ها',
      'اهداف عملکردی (KPI)', 'راهنمای نمادهای فلوچارت']) {
      expect(screen.getByRole('heading', { name, hidden: true })).toBeInTheDocument()
    }
    // the section bodies too, not just their headings
    expect(screen.getByText('واحدها و زون‌ها')).toBeInTheDocument()
    expect(screen.getByText('نظارت بر نظافت')).toBeInTheDocument()
    expect(screen.getByText('رضایت مشتری')).toBeInTheDocument()
    expect(screen.getByText('فقط یکی از مسیرها انجام می‌شود')).toBeInTheDocument()
  })

  it('orders the sections as the table of contents lists them', () => {
    renderDoc()
    expect(sections().map((el) => el.dataset.view)).toEqual(['home', 'doc', 'legend'])
    // …and the print-only process sheets come after all three
    const sheet = screen.getByTestId('sheet-dining-001')
    const legend = sections()[2]
    expect(legend.compareDocumentPosition(sheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // `document.module.css` carries the mockup's `.view{display:none}` /
  // `.view.active{display:block}` and its print rule
  // `.view,.view.print-only{display:block!important}`. That rule is what puts
  // every section on paper, and it only matches elements that carry `view`.
  it('wraps each section in the module’s `view` class, with `active` on the open one', () => {
    renderDoc()
    expect(sections()).toHaveLength(3)
    for (const el of sections()) expect(el.classList.contains(d.view)).toBe(true)
    expect(sections().filter((el) => el.classList.contains(d.active))).toHaveLength(1)

    fireEvent.click(screen.getByText('راهنمای نمادهای فلوچارت', { selector: 'span' }))
    expect(openView()).toBe('legend')
    expect(sections().filter((el) => el.classList.contains(d.active))).toHaveLength(1)
  })
})

describe('the print sheets', () => {
  // Stage 4 styles `.pf-wrap` from a global stylesheet and injects the SVG
  // bands into it as raw HTML. A hashed module class would still render, still
  // pass every other test, and silently swallow the diagram.
  it('gives every process an un-hashed global .pf-wrap diagram slot', () => {
    renderDoc(SOFT_DELETED)
    const sheet = screen.getByTestId('sheet-dining-027')
    const wrap = sheet.querySelector('.pf-wrap')
    expect(wrap).not.toBeNull()
    expect(wrap!.className).toBe('pf-wrap')
    expect(wrap).toHaveAttribute('data-pf', 'dining-027')
  })
})
