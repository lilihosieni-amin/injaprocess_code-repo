import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { FlowViewer } from './FlowViewer'
import { createSeededClient } from '../shared/seed'
import type { ExportPayload } from '../shared/payload'
import { JUNCTION_COLOR } from '../../src/flow/nodes/junction-colors'
import type { Pending, ProcNode } from '../../src/api/types'

const act = (id: string, label: string, subprocess: string | null = null): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'مهماندار',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const junc = (id: string): ProcNode => ({
  id, type: 'junction', junctionType: 'XOR', direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

const mk = (id: string, name: string, nodes: ProcNode[], pending: Pending[] = []) => ({
  id, department: 'dining', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes, edges: [], pending,
})

// The payload deliberately carries an OPEN pending conflict: an exported document
// must never offer it for resolution, so the drawer test below is a real guard on
// `conflicts={[]}` rather than a vacuous one.
const CONFLICT: Pending = {
  node: 'dining-001-n002', field: 'actor', current: 'مهماندار', proposed: 'سرمهماندار',
  source: 'جلسه', status: 'open',
}

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [
    mk('dining-001', 'پذیرایی', [
      act('dining-001-n001', 'خوشامدگویی', 'dining-002'),
      act('dining-001-n002', 'تحویل غذا'),
    ], [CONFLICT]),
    mk('dining-002', 'ثبت سفارش', [act('dining-002-n001', 'انتخاب غذا'), junc('dining-002-j1')]),
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
    // the legend is the app's own component, so its swatches read the same
    // colour map as the diamonds — a recolour cannot leave the document stale
    for (const type of ['XOR', 'AND', 'OR'] as const) {
      expect(screen.getByText(type).querySelector('span')).toHaveStyle({ background: JUNCTION_COLOR[type] })
    }
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

  it('opens a read-only, conflict-free drawer for an activity', async () => {
    renderViewer()
    fireEvent.click(await screen.findByText('تحویل غذا'))

    // the drawer's view branch — the description is drawer-only, the node never shows it
    expect(await screen.findByText('شرح تحویل غذا')).toBeInTheDocument()

    // editing={false}: no edit fields, no delete affordance
    expect(screen.queryByLabelText('عنوان')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('مجری فعالیت')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('توضیحات')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /حذف این گره/ })).not.toBeInTheDocument()

    // conflicts=[]: the process HAS an open pending item for this node, and the
    // document still offers no accept/reject — a document resolves nothing
    expect(screen.queryByText(/تعارض‌های این باکس/)).not.toBeInTheDocument()
    expect(screen.queryByText('سرمهماندار')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'پذیرش' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'رد' })).not.toBeInTheDocument()
  })

  // showInternals={false}: a document's reader wants the activity and who performs it.
  // ICOM is the data contract the editing app maintains, and it stays there —
  // DetailDrawer defaults showInternals to true, so this is an export-only opt-out.
  it('shows only the description and the actor — no ICOM block', async () => {
    renderViewer()
    // Node cards already render the actor, so count them before opening the
    // drawer and assert the drawer adds one. A bare presence check would pass on
    // the node cards alone, and a fixed count would break when the fixture grows.
    const onCards = (await screen.findAllByText('مهماندار')).length
    fireEvent.click(await screen.findByText('تحویل غذا'))

    // what a reader keeps
    expect(await screen.findByText('شرح تحویل غذا')).toBeInTheDocument()
    expect(screen.getByText('توضیحات')).toBeInTheDocument()
    expect(screen.getAllByText('مهماندار')).toHaveLength(onCards + 1)

    // what the document drops. `source:` is node provenance — it names the
    // meeting/run that produced the node, which means nothing outside the
    // system and rides on an unauthenticated link; the payload no longer
    // carries it either, so rendering it would print an empty label.
    expect(screen.queryByText(/^source:/)).not.toBeInTheDocument()
    expect(screen.queryByText('اطلاعات ICOM')).not.toBeInTheDocument()
    for (const row of ['ورودی‌ها', 'کنترل‌ها', 'خروجی‌ها', 'مکانیزم‌ها']) {
      expect(screen.queryByText(row)).not.toBeInTheDocument()
    }
  })

  it('opens the drawer on a junction instead of navigating', async () => {
    renderViewer('dining-002')
    await screen.findByText('ثبت سفارش')
    fireEvent.click(screen.getAllByText('XOR')[0])          // the diamond, not the legend
    expect(await screen.findByText('دروازهٔ منطقی XOR')).toBeInTheDocument()
  })

  it('steps to the next process and closes', async () => {
    const onClose = renderViewer()
    fireEvent.click(await screen.findByRole('button', { name: /فرآیند بعدی/ }))
    expect(await screen.findByText('ثبت سفارش')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onClose).toHaveBeenCalled()
  })
})
