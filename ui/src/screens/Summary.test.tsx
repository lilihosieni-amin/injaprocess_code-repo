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
