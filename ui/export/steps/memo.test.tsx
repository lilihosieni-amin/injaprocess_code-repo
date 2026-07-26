import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

// A counting wrapper around the real `linearize`, so the assertions below are
// about *how often* the model is built, never about what it contains.
const seen = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./linearize', async (importOriginal) => {
  const real = await importOriginal<typeof import('./linearize')>()
  return {
    ...real,
    linearize: (p: Parameters<typeof real.linearize>[0]) => {
      seen.calls += 1
      return real.linearize(p)
    },
  }
})

const { StepsApp } = await import('./StepsApp')
const { PrintDoc } = await import('./PrintDoc')

const act = (id: string, label: string, extra: Partial<ProcNode> = {}): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] }, ...extra,
} as ProcNode)

const proc = (id: string, name: string, nodes: ProcNode[]) => ({
  id, department: 'dining', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes, edges: [], pending: [],
})

const PAYLOAD = {
  dept: { department: 'dining', name: 'دپارتمان سالن', description: 'd', sub_units: [], personnel: [], updated_at: '' },
  processes: [
    proc('dining-001', 'پذیرایی', [act('n1', 'خوشامدگویی'), act('n2', 'راهنمایی')]),
    proc('dining-002', 'ثبت سفارش', [act('m1', 'انتخاب غذا')]),
    proc('dining-003', 'تسویه', [act('k1', 'صدور فاکتور')]),
  ],
  generated_at: '',
} as unknown as ExportPayload

// `linearize` walks every node and edge of a process. Building the model in the
// component body re-ran it for every process on every render — on each step
// tap, each navigation, each back — for a result that only ever depends on the
// payload, which never changes in a standalone export.
describe('the step model is built once per payload, not once per render', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    seen.calls = 0
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => { scrollTo.mockRestore() })

  it('StepsApp keeps it across navigation', () => {
    render(<StepsApp payload={PAYLOAD} />)
    expect(seen.calls).toBe(PAYLOAD.processes.length)

    // open a process, then come back: two full re-renders of StepsApp
    fireEvent.click(screen.getByText('پذیرایی'))
    fireEvent.click(screen.getByText('بازگشت به فهرست کارها'))
    expect(seen.calls).toBe(PAYLOAD.processes.length)
  })

  it('PrintDoc keeps it across re-renders', () => {
    const { rerender } = render(<PrintDoc payload={PAYLOAD} />)
    expect(seen.calls).toBe(PAYLOAD.processes.length)

    rerender(<PrintDoc payload={PAYLOAD} />)
    expect(seen.calls).toBe(PAYLOAD.processes.length)
  })

  it('rebuilds when the payload really is a different one', () => {
    const { rerender } = render(<PrintDoc payload={PAYLOAD} />)
    rerender(<PrintDoc payload={{ ...PAYLOAD }} />)
    expect(seen.calls).toBe(2 * PAYLOAD.processes.length)
  })
})
