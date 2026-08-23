import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FlowScreen } from './FlowScreen'
import { SurfaceProvider } from '../ui/surface'
import { renderAt } from '../test/utils'
import { paint, winner } from '../test/paint'
import type { SessionDescriptor } from '../auth/session'
import type { Confirmation, Department } from '../api/types'

afterEach(() => vi.restoreAllMocks())

/**
 * **Owner ruling R48 — the three runs of text R47 measured and would not draw.**
 *
 * R47 minted the names and stopped, because at the design's own ink the three
 * elements measured 3.72:1, 3.86:1 and 1.44:1 on the white flow bar — the last
 * of them below even the app-wide census floor `e2e/_harness.ts` documents as
 * "text the reader cannot see at all". It put the measurement in front of the
 * owner rather than shipping it, and the owner ruled: *"make the text darker so
 * people can read it"*, accepting that the colour will differ from the design
 * file, because staff read this on phones, in a kitchen and on a floor
 * (NFR-15).
 *
 * So all three are drawn here, and each takes an ink that ALREADY has the role
 * it is being asked for rather than a new value picked to clear a number:
 *
 *   · the confirm pill's label «تأییدشده» takes `--ink`, which is what
 *     `Checkbox.tsx` gives every tick's label in this app and what the ⋯ menu's
 *     own «تأییدشده» row has been drawn at since R47;
 *   · the reader flow bar's department crumb and its «/» take `--text-body`,
 *     §9.9's "all secondary body copy".
 *
 * **The ratios are not asserted here and cannot be.** Contrast is paint, and
 * jsdom paints nothing: what this file grades is that the element exists and
 * that the ink it reaches for is the TOKEN chosen, which `toHaveClass` cannot
 * tell from a misspelling and a hex literal cannot express at all. The numbers
 * are measured in Chrome at 1440 / 1080 / 760 on both surfaces by
 * `e2e/flow.spec.ts`'s census, which also asserts it actually SAW these three.
 */
const TABLET = '(max-width: 1080px)'

const CONFIRMER: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'پخت', count: 2, subs: 0 },
  { code: 'dining', name: 'سالن', count: 1, subs: 0 },
]

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: '', parent: null,
  source: { type: 'manual', ref: null, run: null }, created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{
    id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '',
    actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    subprocess: null, position: { x: 250, y: 90 }, layout: 'auto',
    source: { created_by: 'x', touched_by: [] },
  }],
  edges: [],
}
const sibling = { ...proc, id: 'cooking-002', name: 'فرآیند دو' }

const CONFIRMED: Confirmation = {
  target: 'cooking-001', kind: 'process', fingerprint: 'sha256:aaa', confirmed: true,
  confirmed_by: '09120000001', confirmed_at: 1_760_000_000,
}
const UNCONFIRMED: Confirmation = { ...CONFIRMED, confirmed: false }

const reader = (node: ReactElement) => <SurfaceProvider surface="reader">{node}</SurfaceProvider>

async function mount(surface: 'panel' | 'reader', marks: Confirmation[] = [CONFIRMED]) {
  cleanup()
  const json = (body: unknown) => new Response(JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.startsWith('/api/confirmations')) return Promise.resolve(json(marks))
    // The crumb needs the department's NAME, which is the one thing the process
    // document does not carry — `Process.department` is the code. Both shells
    // already read this endpoint, so on a real screen it is a cache hit.
    if (url === '/api/departments') return Promise.resolve(json(DEPARTMENTS))
    if (url.endsWith('/processes')) return Promise.resolve(json([proc, sibling]))
    return Promise.resolve(json(proc))
  })
  const tree = <FlowScreen />
  renderAt('/processes/:pid/flow', surface === 'reader' ? reader(tree) : tree,
    '/processes/cooking-001/flow', CONFIRMER)
  await screen.findByText('ثبت درخواست')
}

/** The two `data-r-hide` children of the reader's flow bar, in DOM order. */
const crumbPair = () =>
  [...document.querySelectorAll('[data-r-flowbar] [data-r-hide]')] as HTMLElement[]

const pill = () => {
  const el = document.querySelector('[data-r-actions] [data-testid="confirm-box"]')
  expect(el, 'the flow bar draws no confirm control').not.toBeNull()
  return el as HTMLElement
}

describe('R48 — the reader flow bar’s department crumb and its separator', () => {
  it('draws both, where reader 317-318 draws them', async () => {
    // `<span data-r-hide>{{ deptName }}</span><span data-r-hide>/</span>`,
    // between «بازگشت» and the next/previous group. R47 reported them as the
    // two `data-r-hide` children this bar would have "whenever they are built".
    await mount('reader')
    const pair = crumbPair()
    expect(pair.map((el) => el.textContent)).toEqual(['پخت', '/'])
  })

  it('gives the crumb an ink chosen for reading, not the design’s 3.72:1', async () => {
    // The design paints `#8a7db0`, which IS a token — `--text-muted`, and the
    // ink the panel's own breadcrumb strip gives an ancestor crumb. On that
    // strip's lavender ground it is graded at the app-wide floor of 2 and
    // passes; on this white bar it measures 3.72:1 against the 4.5:1 this bar
    // is held to. `--text-body` is §9.9's "all secondary body copy" and is what
    // a crumb subordinate to the title beside it is.
    await mount('reader')
    const [crumb] = crumbPair()
    expect(winner(await paint(crumb.className), 'color')).toBe('var(--text-body)')
  })

  it('gives the separator the same ink, not the design’s 1.44:1', async () => {
    // `#DCD3EC` on white is **1.44:1** — below even the floor `_harness.ts`
    // calls "text the reader cannot see at all". Nothing in the token set is
    // both lighter than `--text-body` and above 4.5:1 under a role that is a
    // separator's, so the pair is drawn as one ink rather than a fifth grey
    // being invented for the gap. `--text-crumb-sep` keeps its name and loses
    // its value to this ruling; it is still on `UNPAINTED`, with that reason.
    await mount('reader')
    const [, sep] = crumbPair()
    expect(winner(await paint(sep.className), 'color')).toBe('var(--text-body)')
  })

  it('takes the pair off the bar at ≤1080, where `[data-r-hide]` goes', async () => {
    // `[data-r-topbar] [data-r-hide]{display:none}` — reader 35, panel 35. The
    // HOOK cannot be `data-r-topbar` on this element: `reader-shell.spec.ts`
    // counts it to assert the reader draws no chrome at all on this route, so
    // the rule is written at the two children it governs, which is where this
    // codebase puts the design's attribute rules anyway (R7).
    await mount('reader')
    const pair = crumbPair()
    // …and it really graded two, rather than looping over nothing: a `for` over
    // an empty list passes every assertion inside it.
    expect(pair, 'the crumb pair is not on the bar to be hidden').toHaveLength(2)
    for (const el of pair) {
      const painted = await paint(el.className)
      expect(winner(painted, 'display', '', TABLET)).toBe('none')
    }
  })

  it('is never drawn on the panel, which carries its crumbs in the strip above', async () => {
    // Panel 558-613 has no crumb on this bar; `PanelShell`'s `data-r-crumbs`
    // strip is where the panel's trail lives, and drawing a second one here
    // would be the doubling R41 was raised for.
    await mount('panel')
    expect(document.querySelectorAll('[data-r-flowbar] [data-r-hide]')).toHaveLength(0)
  })
})

describe('R48 — the confirm control is the design’s pill, with a legible label', () => {
  it('is drawn at `padding:7px 12px`, radius 12, behind a 1.5px edge', async () => {
    // Panel 599 / reader 359. `--pad-confirm-y` was minted by R47 FOR this box
    // and left unwritten because its label was not legible; this is the ruling
    // that writes it. The 12 is `--space-6`, exactly as R47's own token comment
    // says, and the radius is `--radius-md`.
    await mount('panel')
    const painted = await paint(pill().className)
    expect(winner(painted, 'padding-top')).toBe('var(--pad-confirm-y)')
    expect(winner(painted, 'padding-bottom')).toBe('var(--pad-confirm-y)')
    expect(winner(painted, 'padding-left')).toBe('var(--space-6)')
    expect(winner(painted, 'padding-right')).toBe('var(--space-6)')
    expect(winner(painted, 'border-radius')).toBe('var(--radius-md)')
    expect(winner(painted, 'border-width')).toBe('var(--border-hairline)')
  })

  it('sets its tick against its label at the design’s own gap', async () => {
    // `gap:9px` (panel 599). Six tokens hold 9px and not one is a control's
    // glyph-to-label distance — `--gap-option`, the nearest by shape, is scoped
    // by its own comment to the dropdown's option row — so R48 mints
    // `--gap-confirm` rather than borrow, for the same reason R47 minted eight.
    await mount('panel')
    expect(winner(await paint(pill().className), 'gap')).toBe('var(--gap-confirm)')
  })

  it('draws the label, in the ink this app already gives a tick’s label', async () => {
    // The word the design puts in this box (panel 605), and the reason R47 left
    // the box out: `#8a7db0` unconfirmed and `#1F8A5B` confirmed measure 3.72:1
    // and 3.86:1 here. `--ink` is what `Checkbox.tsx` gives every tick label in
    // this app and what the ⋯ menu's own «تأییدشده» row has been drawn at since
    // R47 measured it at 14.63:1 on this very bar. One ink for both states: the
    // word is a constant, and the STATE is carried by the tick, the fill and
    // the edge — all three of which still switch.
    await mount('panel')
    const label = screen.getByTestId('confirm-label')
    expect(label).toHaveTextContent('تأییدشده')
    expect(winner(await paint(label.className), 'color')).toBe('var(--ink)')
    expect(winner(await paint(label.className), 'font-size')).toBe('var(--fs-sm2)')
  })

  it('keeps the same label ink when the mark is off', async () => {
    await mount('panel', [UNCONFIRMED])
    const label = screen.getByTestId('confirm-label')
    expect(winner(await paint(label.className), 'color')).toBe('var(--ink)')
  })

  it('takes the confirmed skin from the two tokens the design names', async () => {
    // `background:#E4F6EC; border:1.5px solid #BFE5D0` (panel 3584-3585) —
    // `--tile-ok` and `--border-ok`. `border-border-ok` is the second line R48
    // takes off `UNPAINTED`: R47 kept it there deliberately, because deleting
    // the line of a still-unconsumed utility fails the same guard from the
    // other side.
    await mount('panel', [CONFIRMED])
    const painted = await paint(pill().className)
    expect(winner(painted, 'background-color')).toBe('var(--tile-ok)')
    expect(winner(painted, 'border-color')).toBe('var(--border-ok)')
  })

  it('takes the unconfirmed skin from the two the design names for that state', async () => {
    await mount('panel', [UNCONFIRMED])
    const painted = await paint(pill().className)
    expect(winner(painted, 'background-color')).toBe('var(--card)')
    expect(winner(painted, 'border-color')).toBe('var(--line)')
  })

  it('carries the design’s 19px tick, green when the mark is on', async () => {
    // The same box the ⋯ menu's row draws, and for the same reason it is not
    // `TickBox`: ledger L-48 makes every `TickBox` in this app violet and
    // reserves green for this element by name.
    await mount('panel', [CONFIRMED])
    const painted = await paint(screen.getByTestId('confirm-tick').className)
    expect(winner(painted, 'width')).toBe('var(--size-tick)')
    expect(winner(painted, 'height')).toBe('var(--size-tick)')
    expect(winner(painted, 'border-radius')).toBe('var(--radius-tick)')
    expect(winner(painted, 'background-color')).toBe('var(--green)')
  })

  it('keeps F11’s 44px target around the drawn box, never by inflating it', async () => {
    // The pill is smaller than the touch floor, and the fix is the one the ⋯
    // trigger already uses: a transparent `::before` around the box. Handing it
    // `min-h-touch` instead would repaint the design's control at 44px, which
    // is the defect `write.spec.ts` documents about `w-tool` on `Button`.
    //
    // `--space-2`, the same rung the ⋯ takes, and the rung is measured rather
    // than derived: Chrome's used value for the design's 1.5px hairline is
    // **1px**, so the painted box is 35 and not the deliverable's arithmetic
    // 36 — and 35 + 2×5 clears 44 where 35 + 2×4 lands at 43. jsdom cannot
    // know that, which is why the pixel is asserted in `e2e/flow.spec.ts` and
    // only the token is asserted here.
    await mount('panel')
    expect(winner(await paint(pill().className), 'inset', '::before'))
      .toBe('calc(var(--space-2) * -1)')
  })

  it('still answers to the act in its accessible name, not to the word on it', async () => {
    // The visible word is «تأییدشده» in both states; the ACT is «لغو تأیید»
    // when the mark is on and «تأیید محتوا» when it is off. R47's rule holds —
    // the accessible name is where the state lives — and the shipped specs that
    // press this control by name keep working.
    await mount('panel', [CONFIRMED])
    expect(screen.getByRole('button', { name: 'لغو تأیید' })).toBe(pill())
    await mount('panel', [UNCONFIRMED])
    expect(screen.getByRole('button', { name: 'تأیید محتوا' })).toBe(pill())
  })
})
