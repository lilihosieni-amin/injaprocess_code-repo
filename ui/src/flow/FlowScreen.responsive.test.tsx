import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FlowScreen } from './FlowScreen'
import { SurfaceProvider } from '../ui/surface'
import { renderAt } from '../test/utils'
import { paint, winner } from '../test/paint'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/**
 * **Owner ruling R46 — *"in mobile version it doesn't responsive now"*.**
 *
 * It was not an exaggeration and it was not a preference: at this task's merge
 * base `FlowScreen.tsx` contained **zero** `max760:` or `max1080:` variants, in
 * a file every other rebuilt screen matches. `src/flow/` was frozen throughout
 * the 25-task rebuild (F16), so this is the one screen that never got a
 * responsive pass at all, and NFR-15 is explicit that staff read this product
 * on phones.
 *
 * **Why compiled CSS and not `toHaveClass`.** jsdom applies no stylesheet, so a
 * class-string assertion proves a string was written and cannot tell a real
 * utility from a misspelt one — an invented name emits no rule and the build
 * still exits 0. It also cannot say which of two utilities setting `display`
 * wins, because that is decided by Tailwind's output order and not by the order
 * of the class attribute. `paint()` runs the element's OWN rendered class string
 * through the real `tailwind.config.js`; `winner()` reports the value the
 * cascade lands on. The pixels themselves are measured in Chrome at 1440 / 1080
 * / 760 by `e2e/flow.spec.ts`.
 */
const MOBILE = '(max-width: 760px)'

const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

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
/** A second process in the department, so the next/previous group is drawn at
 *  all — it is the thing that collapses first. */
/**
 * The department list, answered so `useDepartments` gets an ARRAY.
 *
 * `FlowScreen` reads it on the reader surface for R48's department crumb —
 * `Process.department` is the code and the crumb the design draws is the name —
 * and every mock in this file used to answer any unmatched URL with a process
 * document, which made `departments.find` a call on an object. A stub that
 * answers the wrong SHAPE is worse than one that answers nothing: it fails
 * inside the component instead of at the boundary.
 */
const DEPARTMENTS = [
  { code: 'cooking', name: 'پخت', count: 2, subs: 0 },
  { code: 'dining', name: 'سالن', count: 1, subs: 0 },
]

const sibling = { ...proc, id: 'cooking-002', name: 'فرآیند دو' }

const reader = (node: ReactElement) => <SurfaceProvider surface="reader">{node}</SurfaceProvider>

async function mount(surface: 'panel' | 'reader') {
  // A test that measures BOTH surfaces mounts twice, and `document.querySelector`
  // below would answer with the first render's bar — which is the panel's, so the
  // reader half of the R3 check would silently grade the panel a second time.
  // Testing Library only cleans up in `afterEach`, so the second mount asks.
  cleanup()
  const json = (body: unknown) => new Response(JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url === '/api/departments') return Promise.resolve(json(DEPARTMENTS))
    if (url.endsWith('/processes')) return Promise.resolve(json([proc, sibling]))
    return Promise.resolve(json(proc))
  })
  const tree = <FlowScreen />
  renderAt('/processes/:pid/flow', surface === 'reader' ? reader(tree) : tree,
    '/processes/cooking-001/flow', EDITOR)
  await screen.findByText('ثبت درخواست')
  const at = (sel: string) => {
    const el = document.querySelector(sel)
    expect(el, `the flow toolbar draws no ${sel}`).not.toBeNull()
    return el as HTMLElement
  }
  return {
    bar: at('[data-r-flowbar]'),
    nav: at('[data-r-flownav]'),
    title: at('[data-r-flowtitle]'),
    name: at('[data-r-pname]'),
  }
}

describe('R46 — the flow toolbar at ≤760', () => {
  it('wraps, so a narrow bar becomes rows instead of overflowing', async () => {
    // Both deliverables say so on the element itself: `flex-wrap:wrap` at
    // `Inja Panel.dc.html:558`, and `Inja Reader.dc.html:99` turns the reader's
    // own `nowrap` into `wrap` inside the ≤760 block. Without it every control
    // stays on one line and the last ones are simply pushed off the screen,
    // which is what the owner was looking at.
    const { bar } = await mount('panel')
    expect(winner(await paint(bar.className), 'flex-wrap')).toBe('wrap')
  })

  it('hides the next/previous group on a phone, on both surfaces', async () => {
    // `[data-r-flowbar] [data-r-flownav]{display:none !important}` — panel 99,
    // reader 115. It is the first thing to go on both, and it is the one
    // control on this bar whose job the browser's own back gesture already does.
    for (const surface of ['panel', 'reader'] as const) {
      const { nav } = await mount(surface)
      const painted = await paint(nav.className)
      expect(winner(painted, 'display'), `${surface}: the group is not drawn at all`).toBe('flex')
      expect(winner(painted, 'display', '', MOBILE), `${surface}: the group survives ≤760`).toBe('none')
    }
  })

  it('gives the process name the first row, and lets it shrink', async () => {
    // `[data-r-flowtitle]{order:-1; flex:1 1 auto; min-width:0}` — panel 94/103,
    // reader 110/119, where the later `flex:1 1 auto` is what the cascade lands
    // on. `order-first` is Tailwind's reachable spelling of a negative order;
    // against the default 0 it orders identically.
    const { title } = await mount('panel')
    const painted = await paint(title.className)
    expect(winner(painted, 'order', '', MOBILE)).toBe('-9999')
    expect(winner(painted, 'flex', '', MOBILE)).toBe('1 1 auto')
    // `min-width:0` is the load-bearing half: a flex item's default `min-width`
    // is `auto`, so without it the name refuses to shrink below its own text and
    // the ellipsis below never fires.
    expect(winner(painted, 'min-width', '', MOBILE)).toBe('0px')
  })

  it('ellipsises a long process name rather than pushing the bar wider', async () => {
    // `[data-r-flowbar] [data-r-flowtitle] [data-r-pname]{overflow:hidden;
    // text-overflow:ellipsis; white-space:nowrap; min-width:0}` — panel 95,
    // reader 111. Both deliverables put this rule INSIDE the ≤760 block, so it
    // is asserted there and its absence above the breakpoint is asserted too: a
    // desktop bar wraps instead of clipping, and a name silently truncated at
    // 1440 would be a different screen from the one the design draws.
    const { name } = await mount('panel')
    const painted = await paint(name.className)
    expect(winner(painted, 'text-overflow', '', MOBILE)).toBe('ellipsis')
    expect(winner(painted, 'white-space', '', MOBILE)).toBe('nowrap')
    expect(winner(painted, 'overflow', '', MOBILE)).toBe('hidden')
    expect(winner(painted, 'text-overflow'), 'the name clips on the desktop too').toBe('')
  })
})

describe('R3 — the two surfaces draw this bar at their own scale', () => {
  it('takes the panel’s gutter in the panel and the reader’s in the reader', async () => {
    // `padding:11px 22px; gap:12px` (panel 558) against `10px 20px; gap:10px`
    // (reader 312). The file drew the PANEL's numbers on both surfaces, as an
    // arbitrary `px-[22px]`. The two verticals are reported as un-minted; the
    // inline gutter and the gap both have tokens and are written as tokens here,
    // which is also what proves the value came from the theme rather than from
    // a literal that happens to match.
    const panel = await paint((await mount('panel')).bar.className)
    expect(winner(panel, 'padding-left')).toBe('var(--pad-topbar)')
    expect(winner(panel, 'gap')).toBe('var(--space-6)')

    const read = await paint((await mount('reader')).bar.className)
    expect(winner(read, 'padding-left')).toBe('var(--pad-topbar-reader)')
    expect(winner(read, 'gap')).toBe('var(--space-5)')
  })

  it('drops the reader’s «بازگشت» label to its glyph on a phone', async () => {
    // `[data-r-backlabel]{display:none !important}` — reader 105. The button
    // itself becomes a 38px square (reader 104); that size has no token and is
    // reported rather than approximated, so what lands here is the label half
    // of the same rule.
    await mount('reader')
    const label = document.querySelector('[data-r-backlabel]')
    expect(label, 'the reader’s back button draws no labelled span').not.toBeNull()
    const painted = await paint((label as HTMLElement).className)
    expect(winner(painted, 'display')).toBe('inline')
    expect(winner(painted, 'display', '', MOBILE)).toBe('none')
  })
})
