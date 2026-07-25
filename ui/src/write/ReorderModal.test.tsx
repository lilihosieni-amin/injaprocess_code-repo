import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReorderModal } from './ReorderModal'
import { ToastProvider } from './ToastProvider'
import type { Process } from '../api/types'

afterEach(() => vi.restoreAllMocks())

function proc(id: string, name: string, extra: Partial<Process> = {}): Process {
  return { id, department: 'cooking', name, summary: '', nodes: [], edges: [], pending: [],
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '2026-07-25T12:00:00Z', updated_at: '2026-07-25T12:00:00Z',
    ...extra } as Process
}

const PROCS = [
  proc('cooking-003', 'سه'),
  proc('cooking-001', 'یک'),
  proc('cooking-002', 'دو', { tombstoned: true }),
]

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

describe('ReorderModal', () => {
  it('lists active processes in the given order and excludes tombstones', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    expect(rows.map((r) => r.getAttribute('data-pid'))).toEqual(['cooking-003', 'cooking-001'])
    expect(screen.queryByText('دو')).not.toBeInTheDocument()
  })

  it('moves a row up with the up button', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('moves a row down with the down button', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به پایین' })[0])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('does not move the first row up or the last row down', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'انتقال به بالا' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'انتقال به پایین' })[1]).toBeDisabled()
  })

  it('reorders by drag and drop', () => {
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={() => {}} />)
    const rows = screen.getAllByTestId('reorder-row')
    fireEvent.dragStart(rows[1])
    fireEvent.dragOver(rows[0])
    fireEvent.drop(rows[0])
    expect(screen.getAllByTestId('reorder-row').map((r) => r.getAttribute('data-pid')))
      .toEqual(['cooking-001', 'cooking-003'])
  })

  it('PUTs the full sequence on save and closes', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: ['cooking-001', 'cooking-003'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1])
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledWith('/api/departments/cooking/order',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ order: ['cooking-001', 'cooking-003'] }) }))
  })

  it('discards changes on cancel without any request', () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(onClose).toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows the drift notice and closes the modal on a 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'set mismatch: missing=cooking-009 stale=-' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    expect(await screen.findByText(/ترتیب تغییر کرده/)).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a generic failure message and keeps the modal open on a non-409 error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'internal error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }))
    const onClose = vi.fn()
    wrap(<ReorderModal department="cooking" departmentName="پخت" processes={PROCS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /ذخیره/ }))
    expect(await screen.findByText('ذخیرهٔ ترتیب انجام نشد')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
