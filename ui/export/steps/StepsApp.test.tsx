import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepsApp } from './StepsApp'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string, extra: Partial<ProcNode> = {}): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'سرپرست سالن',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] }, ...extra,
} as ProcNode)

function makeProc(id: string, name: string, nodes: ProcNode[], edges: { from: string; to: string; label?: string }[]) {
  return {
    id, department: 'dining', name, summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes, edges, pending: [],
  }
}

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: 'd', sub_units: [], personnel: [], updated_at: '2026-07-26T09:00:00Z' },
  processes: [
    makeProc('dining-001', 'پذیرایی از مشتری',
      [act('n1', 'خوشامدگویی'), act('n2', 'راهنمایی به کیوسک', { subprocess: 'dining-002' })],
      [{ from: 'n1', to: 'n2' }]),
    makeProc('dining-002', 'ثبت سفارش در کیوسک', [act('m1', 'انتخاب غذا')], []),
  ],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

describe('StepsApp', () => {
  it('lists every process with its step count', () => {
    render(<StepsApp payload={PAYLOAD} />)
    expect(screen.getByText('پذیرایی از مشتری')).toBeInTheDocument()
    expect(screen.getByText('ثبت سفارش در کیوسک')).toBeInTheDocument()
    expect(screen.getByText('۲ مرحله')).toBeInTheDocument()
  })

  it('opens a process and reveals a step description on click', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    expect(screen.getByText('خوشامدگویی')).toBeInTheDocument()
    expect(screen.getByText('کار تمام شد')).toBeInTheDocument()

    fireEvent.click(screen.getByText('خوشامدگویی'))
    expect(screen.getByText('شرح خوشامدگویی')).toBeVisible()
    expect(screen.getByText('سرپرست سالن')).toBeVisible()
  })

  it('walks into a subprocess and back out through the breadcrumb', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    fireEvent.click(screen.getByText('راهنمایی به کیوسک'))
    expect(screen.getByRole('heading', { name: 'ثبت سفارش در کیوسک' })).toBeInTheDocument()
    expect(screen.getByText('انتخاب غذا')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /بازگشت/ }))
    expect(screen.getByRole('heading', { name: 'پذیرایی از مشتری' })).toBeInTheDocument()
  })

  it('returns to the process list from the home button', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    fireEvent.click(screen.getByRole('button', { name: 'فهرست کارها' }))
    expect(screen.getByText('ثبت سفارش در کیوسک')).toBeInTheDocument()
  })
})
