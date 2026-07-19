import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const OV = {
  department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  description: 'واحد پخت غذاهای گرم رستوران است.',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه', 'کنترل کیفیت'], kpi: ['کاهش ضایعات به زیر ۵٪'] }],
}

describe('Overview', () => {
  it('renders sub-units and the Jalali update date; personnel duties are collapsed until expanded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview')
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('واحد پخت غذاهای گرم رستوران است.')).toBeInTheDocument()
    expect(screen.getByText('آشپزخانهٔ گرم')).toBeInTheDocument()
    expect(screen.getByText('سرآشپز')).toBeInTheDocument()
    expect(screen.getByText(/۱۴۰۵\/۰۴\/۱۵/)).toBeInTheDocument()
    // collapsed by default: duty chips hidden, count shown
    expect(screen.queryByText('کنترل کیفیت')).not.toBeInTheDocument()
    expect(screen.getByText(/۲ وظیفه/)).toBeInTheDocument()
    // expand the category → duties appear
    fireEvent.click(screen.getByText('سرآشپز'))
    expect(screen.getByText('کنترل کیفیت')).toBeInTheDocument()
    // KPIs render below the duties once expanded
    expect(screen.getByText('کاهش ضایعات به زیر ۵٪')).toBeInTheDocument()
    // close from the bottom control
    fireEvent.click(screen.getByRole('button', { name: /بستن/ }))
    expect(screen.queryByText('کنترل کیفیت')).not.toBeInTheDocument()
  })
})
