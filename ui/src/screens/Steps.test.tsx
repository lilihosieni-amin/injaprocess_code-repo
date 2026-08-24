import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Steps } from './Steps'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

const SOURCE = join(process.cwd(), 'src/screens/Steps.tsx')

const READER: SessionDescriptor = {
  username: '09121111111', displayName: 'سحر بیات', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const NO_ICOM = { inputs: [], controls: [], outputs: [], mechanisms: [] }
const act = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id, type: 'activity', label, description: '', actor: '', icom: NO_ICOM, subprocess: null,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] },
  ...over,
})

/**
 * A process with one of everything the screen draws: a plain step, an XOR with
 * two labelled branches, a step that leads into a child, a step with a body, and
 * a loop back to the first step.
 *
 * Not a contrivance — it is the shape `linearize` was written for, and the one
 * a flowchart of any real restaurant process has.
 */
const PROC = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از میهمان', parent: null,
  summary: '', idef0: NO_ICOM, kpis: [], pending: [],
  nodes: [
    act('n1', 'استقبال', { description: 'میزبان جلوی در می‌ایستد.', actor: 'میزبان' }),
    { id: 'j1', type: 'junction', junctionType: 'XOR', position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] } },
    act('n2', 'گرفتن سفارش'),
    act('n3', 'تسویه', { subprocess: 'dining-004' }),
    act('n4', 'بدرقه'),
  ],
  edges: [
    { from: 'n1', to: 'j1' },
    { from: 'j1', to: 'n2', label: 'میهمان تازه' },
    { from: 'j1', to: 'n3', label: 'میهمان در حال رفتن' },
    { from: 'n2', to: 'n4' },
    { from: 'n3', to: 'n4' },
    { from: 'n4', to: 'n1', label: 'میهمان بعدی' },
  ],
}

function mock(doc: unknown = PROC) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(doc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

function draw(doc: unknown = PROC) {
  mock(doc)
  return renderAt('/processes/:pid/steps', <Steps />, '/processes/dining-003/steps', READER)
}

describe('Steps — «گام‌به‌گام»', () => {
  it('numbers every step once, across branches, in walk order', async () => {
    // The numbering is `linearize`'s and this screen only prints it — but a
    // renderer that numbered per branch, or restarted inside a group, would look
    // right on a linear process and be wrong on every real one. Four steps, four
    // numerals, and the two inside the XOR carry ۲ and ۳ rather than ۱ and ۱.
    draw()
    await screen.findByText('استقبال')
    const numbers = [...document.querySelectorAll('[data-step]')]
      .map((el) => el.getAttribute('data-step'))
    expect(numbers).toEqual(['1', '2', '3', '4'])
  })

  it('draws a junction as a gate over its branches, each named by its edge', async () => {
    draw()
    await screen.findByText('استقبال')
    expect(screen.getByText('فقط یکی از این‌ها انجام می‌شود')).toBeInTheDocument()
    // The branch label is the EDGE's — «اگر: میهمان تازه» — because that is what
    // decides which path a person is on. A branch with no label falls back to
    // «حالت N», which is what stops two unlabelled paths being two identical
    // boxes; this fixture labels both, which is the ordinary case.
    expect(screen.getByText('اگر: میهمان تازه')).toBeInTheDocument()
    expect(screen.getByText('اگر: میهمان در حال رفتن')).toBeInTheDocument()
  })

  it('opens a step’s body on the press and shows who does it', async () => {
    // The screen's own instruction promises this in as many words — «روی هر
    // مرحله بزنید تا توضیح کامل و مسئول آن را ببینید» — so a card that draws the
    // sentence and does not open is the defect this covers.
    draw()
    fireEvent.click(await screen.findByText('استقبال'))
    expect(screen.getByText('میزبان')).toBeInTheDocument()
    expect(screen.getByText('میزبان جلوی در می‌ایستد.')).toBeInTheDocument()
  })

  it('draws no body, and no chevron, for a step that carries neither field', async () => {
    // `visibility` blanks `actor` and `description` per department, so for many
    // readers this is every step. A caption over nothing is a claim of absence
    // made in pictures — owner ruling R43's shape, one screen along — and a
    // control that opens an empty box is worse than no control.
    draw()
    const row = (await screen.findByText('گرفتن سفارش')).closest('button')!
    fireEvent.click(row)
    expect(row).not.toHaveAttribute('aria-expanded')
    expect(screen.queryByText('توضیح کار')).toBeNull()
  })

  it('sends a sub-process step into the child’s own steps, not into a body', async () => {
    draw()
    fireEvent.click(await screen.findByText('تسویه'))
    await waitFor(() => expect(
      vi.mocked(globalThis.fetch).mock.calls
        .map((c) => String(c[0]))
        .some((u) => u.includes('/api/processes/dining-004')),
    ).toBe(true))
  })

  it('states a loop rather than dropping it', async () => {
    // `linearize` breaks the cycle so the list can end, and the edge it broke is
    // real: a guide that silently omits "and then start again with the next
    // guest" describes a different process. Only back-edges that resolve to a
    // NUMBERED step are drawn, so the badge can never name a step that is not
    // on the page.
    draw()
    await screen.findByText('بدرقه')
    expect(screen.getByText(/برگرد به مرحلهٔ ۱/)).toBeInTheDocument()
  })

  it('says so when the flowchart has no activity in it yet', async () => {
    // Not withheld and never can be: a step's label and its order are outside
    // the visibility policy, so this state means «nobody has drawn it», which is
    // a thing that can be said out loud.
    draw({ ...PROC, nodes: [], edges: [] })
    expect(await screen.findByText('هنوز گامی برای این فرآیند ثبت نشده است.')).toBeInTheDocument()
  })

  it('marks the sub-process step apart from every other one', async () => {
    draw()
    const card = (await screen.findByText('تسویه')).closest('[data-step]')!
    expect(card.className).toContain('bg-steps-sub')
    expect(within(card as HTMLElement).getByText('مراحل این کار را ببین')).toBeInTheDocument()
    const plain = (await screen.findByText('بدرقه')).closest('[data-step]')!
    expect(plain.className).toContain('bg-card')
  })

  it('leaves no literal value in the file', () => {
    // F6 in this screen's own suite, because `guards.test.ts` scans the whole of
    // `src/` and a red there names a rule rather than a screen.
    const src = readFileSync(SOURCE, 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src).not.toMatch(/\b[a-z-]+-\[(?![a-z-]+:)/)
    expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
    expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
  })
})
