import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepsApp } from './StepsApp'
import s from './steps.module.css'
import type { ExportPayload } from '../shared/payload'
import type { ProcNode } from '../../src/api/types'

const act = (id: string, label: string, extra: Partial<ProcNode> = {}): ProcNode => ({
  id, type: 'activity', label, description: `شرح ${label}`, actor: 'سرپرست سالن',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] }, ...extra,
} as ProcNode)

const term = (id: 'start' | 'end'): ProcNode => ({
  id, type: id, label: '', position: { x: 0, y: 0 }, layout: 'auto',
} as ProcNode)

const junction = (id: string): ProcNode => ({
  id, type: 'junction', junctionType: 'XOR', direction: 'split',
  position: { x: 0, y: 0 }, layout: 'auto',
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
  // the *stored* form: overview.json already carries «دپارتمان» inside `name`,
  // so a heading that prefixes «واحد» or «دپارتمان» reads doubled on real data
  dept: { department: 'dining', name: 'دپارتمان سالن', description: 'd', sub_units: [], personnel: [], updated_at: '2026-07-26T09:00:00Z' },
  processes: [
    makeProc('dining-001', 'پذیرایی از مشتری',
      [act('n1', 'خوشامدگویی'), act('n2', 'راهنمایی به کیوسک', { subprocess: 'dining-002' })],
      [{ from: 'n1', to: 'n2' }]),
    makeProc('dining-002', 'ثبت سفارش در کیوسک', [act('m1', 'انتخاب غذا')], []),
  ],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

/** n2 carries two back-edges: one to the activity numbered ۱, one to a junction
 *  that owns no number. Only the first may ever render a badge. */
const BACK_PAYLOAD = {
  dept: PAYLOAD.dept,
  processes: [
    makeProc('dining-003', 'پذیرایی از مشتری',
      [term('start'), junction('j1'), act('n1', 'خوشامدگویی'), act('n2', 'انتخاب غذا')],
      [{ from: 'start', to: 'j1' }, { from: 'j1', to: 'n1' }, { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n1' }, { from: 'n2', to: 'j1' }]),
  ],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

/** A subprocess called from two different processes: the case where remembering
 *  a scroll offset by depth alone would hand one parent's offset to the other. */
const SHARED_PAYLOAD = {
  dept: PAYLOAD.dept,
  processes: [
    makeProc('dining-007', 'سالن', [act('a1', 'بردن سفارش', { subprocess: 'dining-009' })], []),
    makeProc('dining-008', 'بار', [act('b1', 'ثبت در صندوق', { subprocess: 'dining-009' })], []),
    makeProc('dining-009', 'صدور فاکتور', [act('m1', 'چاپ فاکتور')], []),
  ],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

const stepCard = (num: number) => document.getElementById(`stp-${num}`)!

describe('StepsApp', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  /** jsdom lays nothing out, so `window.scrollY` never moves on its own: stand
   *  in for the reader's thumb. `configurable` so `afterEach` can put it back. */
  const scrolledTo = (y: number) =>
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })

  beforeEach(() => { scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
  afterEach(() => { scrollTo.mockRestore(); scrolledTo(0) })

  it('lists every process with its step count, and no ids', () => {
    render(<StepsApp payload={PAYLOAD} />)
    expect(screen.getByText('پذیرایی از مشتری')).toBeInTheDocument()
    expect(screen.getByText('ثبت سفارش در کیوسک')).toBeInTheDocument()
    // the count stays on screen — the id replaces it only on paper
    expect(screen.getByText('۲ مرحله')).toBeInTheDocument()
    expect(screen.getByText('۱ مرحله')).toBeInTheDocument()
    expect(screen.queryByText(/dining-00/)).not.toBeInTheDocument()
  })

  it('shows the stored department name as-is, with no واحد prefix', () => {
    render(<StepsApp payload={PAYLOAD} />)
    expect(screen.getByText('دپارتمان سالن — روی نام هر کار بزنید تا مرحله‌به‌مرحله ببینید.')).toBeInTheDocument()
    expect(screen.queryByText(/واحد دپارتمان سالن/)).not.toBeInTheDocument()
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

  it('scrolls to the top going forward, however far down the tap was', () => {
    render(<StepsApp payload={PAYLOAD} />)

    scrolledTo(900)
    scrollTo.mockClear()
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))          // open a process
    expect(scrollTo).toHaveBeenCalledWith(0, 0)

    scrolledTo(1400)
    scrollTo.mockClear()
    fireEvent.click(screen.getByText('راهنمایی به کیوسک'))          // enter a subprocess
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('restores the scroll position when backing out of a subprocess', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))

    scrolledTo(760)                                                // read down the process
    fireEvent.click(screen.getByText('راهنمایی به کیوسک'))          // open the subprocess

    scrolledTo(120)                                                // and down the subprocess
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(scrollTo).toHaveBeenCalledWith(0, 760)
    expect(screen.getByRole('heading', { name: 'پذیرایی از مشتری' })).toBeInTheDocument()
  })

  it('restores the scroll position of a breadcrumb ancestor', () => {
    render(<StepsApp payload={PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    scrolledTo(540)
    fireEvent.click(screen.getByText('راهنمایی به کیوسک'))

    scrollTo.mockClear()
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))          // breadcrumb ancestor
    expect(scrollTo).toHaveBeenCalledWith(0, 540)
  })

  it('restores the scroll position of the process list itself', () => {
    render(<StepsApp payload={PAYLOAD} />)
    scrolledTo(430)                                                // scrolled down the list
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))

    scrolledTo(200)
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'فهرست کارها' }))
    expect(scrollTo).toHaveBeenCalledWith(0, 430)
    expect(screen.getByText('ثبت سفارش در کیوسک')).toBeInTheDocument()

    // and the list is remembered again on the way out a second time
    scrolledTo(880)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /بازگشت/ }))
    expect(scrollTo).toHaveBeenCalledWith(0, 880)
  })

  it('never hands one parent the offset of another parent of the same subprocess', () => {
    render(<StepsApp payload={SHARED_PAYLOAD} />)

    fireEvent.click(screen.getByText('سالن'))
    scrolledTo(700)
    fireEvent.click(screen.getByText('بردن سفارش'))                // dining-007 › dining-009
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    fireEvent.click(screen.getByRole('button', { name: 'فهرست کارها' }))

    fireEvent.click(screen.getByText('بار'))
    scrolledTo(150)
    fireEvent.click(screen.getByText('ثبت در صندوق'))              // dining-008 › dining-009
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    // 150, this path's own offset — not the 700 the other parent left behind
    expect(scrollTo).toHaveBeenCalledWith(0, 150)
    expect(screen.getByRole('heading', { name: 'بار' })).toBeInTheDocument()
  })

  it('renders a back badge only for a back-edge that reached a numbered step', () => {
    render(<StepsApp payload={BACK_PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))

    const badges = screen.getAllByText(/برگرد به مرحلهٔ/)
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('برگرد به مرحلهٔ ۱')
  })

  it('collapses a card on the tap after a back badge opened it', () => {
    render(<StepsApp payload={BACK_PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))

    fireEvent.click(screen.getByText(/برگرد به مرحلهٔ/))
    expect(stepCard(1).classList.contains(s.open)).toBe(true)

    fireEvent.click(screen.getByText('خوشامدگویی'))
    expect(stepCard(1).classList.contains(s.open)).toBe(false)
  })

  it('does not re-open a step from a jump made before the last navigation', () => {
    render(<StepsApp payload={BACK_PAYLOAD} />)
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    fireEvent.click(screen.getByText(/برگرد به مرحلهٔ/))

    fireEvent.click(screen.getByRole('button', { name: 'فهرست کارها' }))
    fireEvent.click(screen.getByText('پذیرایی از مشتری'))
    expect(stepCard(1).classList.contains(s.open)).toBe(false)
  })
})
