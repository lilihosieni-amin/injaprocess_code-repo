import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const OV = {
  department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه', 'کنترل کیفیت'] }],
}

describe('Overview', () => {
  it('renders sub-units, personnel duties and the Jalali update date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview')
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('آشپزخانهٔ گرم')).toBeInTheDocument()
    expect(screen.getByText('سرآشپز')).toBeInTheDocument()
    expect(screen.getByText('کنترل کیفیت')).toBeInTheDocument()
    expect(screen.getByText(/۱۴۰۵\/۰۴\/۱۵/)).toBeInTheDocument()
  })
})
