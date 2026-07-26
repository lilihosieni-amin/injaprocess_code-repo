import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PrintDoc } from './PrintDoc'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [{
    id: 'dining-001', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('n1', 'خوشامدگویی')], edges: [], pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

describe('PrintDoc', () => {
  it('emits an index and one section per process, with every step', () => {
    render(<PrintDoc payload={PAYLOAD} />)
    const index = screen.getByTestId('print-index')
    expect(within(index).getByText('پذیرایی')).toBeInTheDocument()
    expect(within(index).getByText('۱ مرحله')).toBeInTheDocument()

    const section = screen.getByTestId('print-section-dining-001')
    expect(within(section).getByText('خوشامدگویی')).toBeInTheDocument()
    expect(within(section).getByText('شرح خوشامدگویی')).toBeInTheDocument()
    expect(within(section).getByText('مجری: مهماندار')).toBeInTheDocument()
    expect(within(section).getByText('کار تمام شد')).toBeInTheDocument()
  })
})
