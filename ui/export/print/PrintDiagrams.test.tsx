import { describe, it, expect, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { PrintDiagrams } from './PrintDiagrams'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode, Process } from '../../src/api/types'

const act = (id: string, label: string, x: number, y: number): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x, y }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const mk = (id: string, nodes: ProcNode[], edges: Process['edges'] = []): Process => ({
  id, department: 'dining', name: `فرآیند ${id}`, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes, edges, pending: [],
} as unknown as Process)

const payloadOf = (processes: Process[]) =>
  ({ dept: {}, processes, generated_at: '' } as unknown as ExportPayload)

/** The `[data-pf]` slots `ProcessSheets` prints; `PrintDiagrams` writes into them.
 *  The lookup is scoped to this holder — testing-library's cleanup does not remove
 *  it, and a document-wide query would otherwise find a *previous* test's slot and
 *  pass on its content. */
const holders: HTMLElement[] = []
afterEach(() => { holders.splice(0).forEach((h) => h.remove()) })

function mountSlots(ids: string[]) {
  const holder = document.createElement('div')
  holder.innerHTML = ids.map((id) => `<div data-pf="${id}"></div>`).join('')
  document.body.appendChild(holder)
  holders.push(holder)
  return (id: string) => holder.querySelector<HTMLElement>(`[data-pf="${id}"]`)!
}

const FULL = mk('dining-002', [act('dining-002-n001', 'انتخاب غذا', 0, 0), act('dining-002-n002', 'تحویل غذا', 0, 300)],
  [{ from: 'dining-002-n001', to: 'dining-002-n002' }])

describe('PrintDiagrams', () => {
  it('fills a process’s slot with the bands of its real nodes', async () => {
    const slot = mountSlots(['dining-002'])
    render(<PrintDiagrams payload={payloadOf([FULL])} />)
    await waitFor(() => expect(slot('dining-002').innerHTML).toContain('<svg'))
    // the node's own markup, not a reconstruction
    expect(slot('dining-002').innerHTML).toContain('انتخاب غذا')
    expect(slot('dining-002').innerHTML).toContain('foreignObject')
  })

  // A process whose nodes were all soft-deleted (or that never had any) renders an
  // empty flow, and `nodesInitialized` — seeded `nodes.length > 0` and only ever
  // set inside the store's setNodes — then never turns true. Mounting a flow for
  // it would park the queue there forever and leave EVERY LATER process's slot
  // empty too, not just its own.
  it('skips a process with no rendered nodes and still emits the next one', async () => {
    const slot = mountSlots(['dining-001', 'dining-002'])
    const empty = mk('dining-001', [])
    render(<PrintDiagrams payload={payloadOf([empty, FULL])} />)
    await waitFor(() => expect(slot('dining-002').innerHTML).toContain('<svg'))
    expect(slot('dining-001').innerHTML).toBe('')
  })

  it('skips a process whose every node is soft-deleted', async () => {
    const slot = mountSlots(['dining-001', 'dining-002'])
    const gone = mk('dining-001', [{ ...(act('dining-001-n001', 'حذف‌شده', 0, 0) as object), removed: true } as ProcNode])
    render(<PrintDiagrams payload={payloadOf([gone, FULL])} />)
    await waitFor(() => expect(slot('dining-002').innerHTML).toContain('<svg'))
    expect(slot('dining-001').innerHTML).toBe('')
  })

  it('unmounts the measuring host once the last process is written', async () => {
    const slot = mountSlots(['dining-002'])
    const { container } = render(<PrintDiagrams payload={payloadOf([FULL])} />)
    await waitFor(() => expect(slot('dining-002').innerHTML).toContain('<svg'))
    await waitFor(() => expect(container.querySelector('.pf-measure')).toBeNull())
  })
})
