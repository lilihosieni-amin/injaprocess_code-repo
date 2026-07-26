import { describe, it, expect, vi } from 'vitest'
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

// the *stored* form: overview.json already carries «دپارتمان» inside `name`,
// so a heading that prefixes «واحد» or «دپارتمان» reads doubled on real data
const DEPT = { department: 'dining', name: 'دپارتمان سالن', description: '', sub_units: [], personnel: [], updated_at: '' }

const PAYLOAD = {
  dept: DEPT,
  processes: [{
    id: 'dining-001', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('n1', 'خوشامدگویی')], edges: [], pending: [],
  }],
  generated_at: '',
} as unknown as ExportPayload

/** n2 carries *two* back-edges to the same target, n1 — the case where keying
 *  the back tags by target alone collides. */
const TWIN_BACK_PAYLOAD = {
  dept: DEPT,
  processes: [{
    id: 'dining-004', department: 'dining', name: 'پذیرایی', summary: '',
    source: { type: 'manual', ref: null, run: null }, parent: null,
    created_at: '', updated_at: '',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [act('n1', 'خوشامدگویی'), act('n2', 'انتخاب غذا')],
    edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n1' }, { from: 'n2', to: 'n1' }],
    pending: [],
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

  it('titles the index with the stored department name, with no واحد prefix', () => {
    render(<PrintDoc payload={PAYLOAD} />)
    const index = screen.getByTestId('print-index')
    // getByText, not getByRole — the whole print doc is display:none on screen
    expect(within(index).getByText('راهنمای گام‌به‌گام کار — دپارتمان سالن')).toBeInTheDocument()
    expect(within(index).queryByText(/واحد دپارتمان سالن/)).not.toBeInTheDocument()
  })

  it('keys two back tags on the same target apart', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<PrintDoc payload={TWIN_BACK_PAYLOAD} />)
      expect(screen.getAllByText('برگرد به مرحلهٔ ۱')).toHaveLength(2)
      expect(err.mock.calls.flat().join(' ')).not.toMatch(/same key/i)
    } finally {
      err.mockRestore()
    }
  })
})
