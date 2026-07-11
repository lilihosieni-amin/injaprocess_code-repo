import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())
const P = { id: 'cooking-002', department: 'cooking', name: 'پخت', summary: 's', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: ['x'], controls: [], outputs: [], mechanisms: [] }, kpis: [], nodes: [], edges: [], pending: [] }

describe('Summary edit', () => {
  it('enters edit, changes the name, and PUTs the whole doc on save', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_i: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(init?.method === 'PUT' ? { ...P, name: 'X' } : P), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    fireEvent.click(await screen.findByRole('button', { name: /ویرایش اطلاعات/ }))
    fireEvent.change(screen.getByDisplayValue('پخت'), { target: { value: 'پخت جدید' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('/api/processes/cooking-002', expect.objectContaining({ method: 'PUT' })))
  })
})
