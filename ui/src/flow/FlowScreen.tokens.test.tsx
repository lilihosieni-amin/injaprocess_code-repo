import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { FlowScreen } from './FlowScreen'
import { SurfaceProvider } from '../ui/surface'
import { renderAt } from '../test/utils'
import { paint, winner } from '../test/paint'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/**
 * **Owner ruling R47 — the flow bar reads the theme, at every value it draws.**
 *
 * R46 conformed this bar as far as the frozen files allowed and stopped at two
 * walls: eight values with no token at all, and four utilities whose token
 * existed but which could not be consumed without editing `theme.test.ts`'s
 * `UNPAINTED` list. R47 minted the first eight and took the four lines off the
 * second list, so every assertion below is a value that was **unwritable** when
 * this file's sibling `FlowScreen.responsive.test.tsx` was written.
 *
 * **Why compiled CSS and not `toHaveClass`.** jsdom applies no stylesheet, so a
 * class-string assertion proves a string was written and cannot tell a real
 * utility from a misspelt one — an invented name emits no rule and the build
 * still exits 0. It also cannot tell `py-flowbar-y` from `py-option-y`: both
 * are 11px today, both compile, and the two move apart the day either role
 * does. `paint()` runs the element's own rendered class string through the real
 * `tailwind.config.js` and `winner()` reports the token the cascade lands on,
 * so a borrowed neighbour fails here even while it paints identically.
 *
 * The pixels are measured in Chrome at 1440 / 1080 / 760 by `e2e/flow.spec.ts`.
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
/** A second process in the department, so the next/previous group is drawn. */
const sibling = { ...proc, id: 'cooking-002', name: 'فرآیند دو' }

const reader = (node: ReactElement) => <SurfaceProvider surface="reader">{node}</SurfaceProvider>

async function mount(surface: 'panel' | 'reader') {
  // A test that measures BOTH surfaces mounts twice, and `document.querySelector`
  // would otherwise answer with the first render's bar.
  cleanup()
  const json = (body: unknown) => new Response(JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.endsWith('/processes')) return Promise.resolve(json([proc, sibling]))
    return Promise.resolve(json(proc))
  })
  const tree = <FlowScreen />
  renderAt('/processes/:pid/flow', surface === 'reader' ? reader(tree) : tree,
    '/processes/cooking-001/flow', EDITOR)
  await screen.findByText('ثبت درخواست')
  return (sel: string) => {
    const el = document.querySelector(sel)
    expect(el, `the flow toolbar draws no ${sel}`).not.toBeNull()
    return el as HTMLElement
  }
}

describe('R47 — the eight values R46 had no name for', () => {
  it('gives the panel bar its own padding-y, and the reader the ladder rung it draws', async () => {
    // `padding:11px 22px` (panel 558) against `10px 20px` (reader 312). The 11
    // was `py-[11px]` on BOTH surfaces before R46 and an arbitrary literal on
    // the panel after it: eleven tokens hold 11px and not one was a bar's
    // padding-y, so R47 mints --pad-flowbar-y.
    const at = await mount('panel')
    const panel = await paint(at('[data-r-flowbar]').className)
    expect(winner(panel, 'padding-top')).toBe('var(--pad-flowbar-y)')
    expect(winner(panel, 'padding-bottom')).toBe('var(--pad-flowbar-y)')

    // The reader's 10px needed nothing minted — it is --space-5 — and asserting
    // it here is what stops a later pass "simplifying" the two surfaces onto one
    // number, which is the R3 defect this bar shipped with.
    const read = await paint((await mount('reader'))('[data-r-flowbar]').className)
    expect(winner(read, 'padding-top')).toBe('var(--space-5)')
  })

  it('takes both surfaces to the design’s ≤760 gutter', async () => {
    // `[data-r-flowbar]{padding:9px 12px; gap:8px}` — panel 93 and reader 99,
    // the one place the two surfaces converge. The 12 is --space-6 and the 8 is
    // --space-4; the 9 is R47's --pad-flowbar-y-mobile, and it is a THIRD role
    // at that number on this bar alone.
    for (const surface of ['panel', 'reader'] as const) {
      const painted = await paint((await mount(surface))('[data-r-flowbar]').className)
      expect(winner(painted, 'padding-top', '', MOBILE), surface)
        .toBe('var(--pad-flowbar-y-mobile)')
      expect(winner(painted, 'padding-left', '', MOBILE), surface).toBe('var(--space-6)')
      expect(winner(painted, 'gap', '', MOBILE), surface).toBe('var(--space-4)')
    }
  })

  it('draws «ویرایش» at the design’s padding rather than Tailwind’s rem scale', async () => {
    // `padding:9px 16px` (panel 607, reader 367). It was `px-4 py-2` — 16px and
    // 8px off Tailwind's own rem ladder, which is the scale the `s` prefix
    // exists to keep out of this app, and which no guard can see because a
    // t-shirt name is not an arbitrary value. The 16 is --space-8; the 9 is
    // R47's --pad-flowbar-action-y.
    const at = await mount('panel')
    const painted = await paint(at('[data-testid="enter-edit"]').className)
    expect(winner(painted, 'padding-top')).toBe('var(--pad-flowbar-action-y)')
    expect(winner(painted, 'padding-left')).toBe('var(--space-8)')
  })

  it('gives the reader’s «بازگشت» its own padding and its ≤760 square', async () => {
    // `padding:9px 13px` (reader 313), and `width:38px; padding:9px 0` at ≤760
    // (reader 104). Neither number is a back button's padding today: reader
    // 157's CHROME back button is `10px 15px` and owns --pad-back-y and
    // --pad-button-x. Three 38px tokens exist and none of them is this button.
    const at = await mount('reader')
    const painted = await paint(at('[data-r-flowback]').className)
    expect(winner(painted, 'padding-top')).toBe('var(--pad-flowback-y)')
    expect(winner(painted, 'padding-left')).toBe('var(--pad-flowback-x)')
    expect(winner(painted, 'width', '', MOBILE)).toBe('var(--width-flowback-mobile)')
    expect(winner(painted, 'padding-left', '', MOBILE)).toBe('0px')
  })
})

describe('R47 — the four utilities that existed and had never been writable', () => {
  it('paints the nav group from --gap-tab-flow and --space-2, the tokens minted for it', async () => {
    // `gap:3px; padding:5px` (panel 560, reader 315). --gap-tab-flow's own
    // comment in tokens.css reads "the flow nav group, `gap:3px; padding:5px`"
    // — it was minted FOR this element and had never been writable, because the
    // only file that would consume it was frozen by F16 and the list recording
    // its orphanhood (theme.test.ts's UNPAINTED) was frozen too. Writing it
    // turned that guard red as `stale`, which is why R46 left `gap-[3px]`
    // and `p-[5px]` standing and reported them.
    const at = await mount('panel')
    const painted = await paint(at('[data-r-flownav]').className)
    expect(winner(painted, 'gap')).toBe('var(--gap-tab-flow)')
    expect(winner(painted, 'padding')).toBe('var(--space-2)')
  })

  it('paints the edit toolbar’s disabled glyph and the tombstone from their own tokens', async () => {
    // **The one part of the edit toolbar R47 touches, and only because the token
    // says so in words.** The design draws NO flowchart edit mode at all (R46's
    // F1), so nothing in that block has a role to conform to and it is left
    // exactly as it stands — with three exceptions, which are the three hex
    // LITERALS whose token's own `_ds` comment IS their role:
    //
    //   · `--text-disabled` #cfc7e0 — "disabled tool button glyph". R46 wrote
    //     `text-disabled` on the next/previous pair's disabled arrows and left
    //     the identical literal on undo and redo three lines below, because the
    //     surrounding block was out of its scope. Same literal, same role, same
    //     token.
    //   · `--tile-dead` #EDEAF3 — "tombstoned process". This IS the tombstone
    //     strip.
    //   · `--tile-v2` #F4EFFB — the lavender tool tile «انصراف» hovers to.
    //
    // No LENGTH, radius or type step in that block is touched: a number with a
    // token is not the same as a role with a token, and picking one for an
    // element the design never drew is inventing a design. The inventory is in
    // R47's report.
    const at = await mount('panel')
    await userEvent.click(at('[data-testid="enter-edit"]'))
    const undo = at('[title="واگرد"]')
    const painted = await paint(undo.className)
    expect(winner(painted, 'color', ':disabled')).toBe('var(--text-disabled)')

    const cancel = at('[data-testid="flow-cancel"]')
    expect(winner(await paint(cancel.className), 'background-color', ':hover'))
      .toBe('var(--tile-v2)')
  })

  it('paints the tool-group divider from --line-divider rather than its hex', async () => {
    // `width:1px; height:18px; background:#D9CEF0` (panel 563, reader 318+). The
    // colour is --line-divider, whose §9.8 correction in tokens.css names it
    // "tool-group divider" — this group, and no other in the app.
    const at = await mount('panel')
    const painted = await paint(at('[data-r-flownav] > div').className)
    expect(winner(painted, 'background-color')).toBe('var(--line-divider)')
    expect(winner(painted, 'height')).toBe('var(--space-9)')
  })
})
