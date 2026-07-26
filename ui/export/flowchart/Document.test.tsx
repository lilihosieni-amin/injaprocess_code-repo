import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Document } from './Document'
import { createSeededClient } from '../shared/seed'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

// `overview.json` stores the *complete* label in `name` — the dining
// department's is «دپارتمان سالن», not the bare «سالن» that `registry.json`
// keeps. The document therefore renders `dept.name` with nothing in front of
// it (see `deptFullName`), and this fixture has to hold the real stored form
// for the cover assertion below to mean anything.
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

const renderDoc = () => render(
  <QueryClientProvider client={createSeededClient(PAYLOAD)}>
    <Document payload={PAYLOAD} />
  </QueryClientProvider>,
)

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
    fireEvent.click(screen.getByText('راهنمای نمادهای فلوچارت'))
    expect(screen.getByText('فقط یکی از مسیرها انجام می‌شود')).toBeInTheDocument()
    expect(screen.getByText('یک یا چند مسیر انجام می‌شود')).toBeInTheDocument()
    expect(screen.getByText('همهٔ مسیرها انجام می‌شوند')).toBeInTheDocument()
  })

  it('opens the flow viewer from a table-of-contents entry', async () => {
    renderDoc()
    fireEvent.click(screen.getByText('پذیرایی', { selector: 'span' }))
    expect(await screen.findByText('خوشامدگویی')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.getByText('فهرست مطالب')).toBeInTheDocument()
  })
})
