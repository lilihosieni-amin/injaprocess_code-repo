import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const OV = { department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت'] }] }

describe('Overview edit', () => {
  it('enters edit, changes a sub-unit name, and PUTs on save', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview')
    fireEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    const nameInput = screen.getByDisplayValue('آشپزخانهٔ گرم')
    fireEvent.change(nameInput, { target: { value: 'آشپزخانهٔ سرد' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/departments/cooking/overview', expect.objectContaining({ method: 'PUT' })))
  })
})
