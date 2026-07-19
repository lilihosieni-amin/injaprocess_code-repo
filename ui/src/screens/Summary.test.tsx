import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const withKpi = {
  id: 'cooking-002', name: 'پخت غذای روز', summary: 'خلاصه', parent: null,
  idef0: { inputs: ['لیست سفارش'], controls: ['دستور پخت'], outputs: ['غذای آماده'], mechanisms: ['آشپز'] },
  kpis: [{ name: 'زمان آماده‌سازی', definition: 'میانگین زمان', target: 'کمتر از ۱۵ دقیقه' }],
  nodes: [], edges: [], pending: [],
}

function mock(doc: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(doc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('Summary', () => {
  it('renders the A-0 ICOM chips and KPI cards', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    expect(await screen.findAllByText('پخت غذای روز')).toHaveLength(2)
    expect(screen.getByText('لیست سفارش')).toBeInTheDocument()
    expect(screen.getByText('غذای آماده')).toBeInTheDocument()
    expect(screen.getByText('زمان آماده‌سازی')).toBeInTheDocument()
  })

  it('shows the no-fabrication note when there are no KPIs', async () => {
    mock({ ...withKpi, kpis: [] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    expect(await screen.findByText(/سامانه اطلاعات را نمی‌سازد/)).toBeInTheDocument()
  })
})

const TOMB = {
  id: 'cooking-002', department: 'cooking', name: 'فرآیند قدیمی', summary: 's',
  source: { type: 'voice', ref: null, run: null }, parent: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [], edges: [], pending: [],
  tombstoned: true, superseded_by: ['cooking-050'],
}

describe('Summary — tombstoned', () => {
  it('shows a tombstone banner + heir link, hides edit, but keeps the (read-only) flowchart button', async () => {
    mock(TOMB)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    expect(await screen.findAllByText('فرآیند قدیمی')).not.toHaveLength(0)
    expect(screen.getByText(/باطل شده/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cooking-050/ })).toHaveAttribute('href', '/processes/cooking-050')
    expect(screen.queryByRole('button', { name: 'ویرایش اطلاعات' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'مشاهدهٔ فلوچارت' })).toBeInTheDocument()
  })
})
