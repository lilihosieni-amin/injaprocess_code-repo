import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { FlowViewer } from './FlowViewer'
import { createSeededClient } from '../shared/seed'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string, subprocess: string | null = null): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const mk = (id: string, name: string, nodes: ProcNode[]) => ({
  id, department: 'dining', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes, edges: [], pending: [],
})

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [
    mk('dining-001', 'پذیرایی', [act('dining-001-n001', 'خوشامدگویی', 'dining-002')]),
    mk('dining-002', 'ثبت سفارش', [act('dining-002-n001', 'انتخاب غذا')]),
  ],
  generated_at: '',
} as unknown as ExportPayload

function renderViewer(startId = 'dining-001', onClose = vi.fn()) {
  const qc = createSeededClient(PAYLOAD)
  render(
    <QueryClientProvider client={qc}>
      <FlowViewer processes={PAYLOAD.processes} startId={startId} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

describe('FlowViewer', () => {
  it('shows the process name, its id badge and the junction legend', async () => {
    renderViewer()
    expect(await screen.findByText('پذیرایی')).toBeInTheDocument()
    expect(screen.getByText('dining-001')).toBeInTheDocument()
    expect(screen.getByText('XOR')).toBeInTheDocument()
    expect(screen.getByText('AND')).toBeInTheDocument()
    expect(screen.getByText('OR')).toBeInTheDocument()
  })

  it('carries no editing chrome', async () => {
    renderViewer()
    await screen.findByText('پذیرایی')
    for (const label of ['ویرایش', 'ذخیره', 'چیدمان', 'انصراف']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('walks into a subprocess and back through the breadcrumb', async () => {
    renderViewer()
    fireEvent.click(await screen.findByText('خوشامدگویی'))
    expect(await screen.findByText('ثبت سفارش')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'پذیرایی' }))
    expect(await screen.findByText('پذیرایی')).toBeInTheDocument()
  })

  it('steps to the next process and closes', async () => {
    const onClose = renderViewer()
    fireEvent.click(await screen.findByRole('button', { name: /فرآیند بعدی/ }))
    expect(await screen.findByText('ثبت سفارش')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onClose).toHaveBeenCalled()
  })
})
