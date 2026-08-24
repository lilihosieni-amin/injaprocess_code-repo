import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { FlowScreen } from './FlowScreen'
import { SurfaceProvider } from '../ui/surface'
import { renderAt } from '../test/utils'
import { paint, winner } from '../test/paint'
import type { SessionDescriptor } from '../auth/session'
import type { Confirmation } from '../api/types'

afterEach(() => vi.restoreAllMocks())

/**
 * **Owner ruling R47 — the ⋯ menu, and the panel's ≤760 action collapse.**
 *
 * R46 audited this control as C7/C8 and could not build it: the popover's
 * `min-width:225px` (panel 576, reader 336) had no token, and `tokens.css`'s own
 * `--width-menu` comment had already written down *"A later screen whose menu
 * genuinely wants 225 mints its own name; it does not re-value this one."* R47
 * minted `--width-menu-flow` and this is the screen that comment meant.
 *
 * The menu is not decoration. At ≤760 the panel **replaces** its whole action
 * group with it — `[data-r-flowbar] [data-r-flownav],[data-r-flowbar]
 * [data-r-actions]{display:none !important}` and `[data-r-flowmore]{display:flex
 * !important}` (panel 99, 102) — so every act the bar offers has to be inside it
 * or it stops existing on a phone. That is the mobile behaviour the owner
 * reported, and it is the same rule `ProcessList`'s own `⋯` docstring states.
 *
 * **R3 — the reader is the other way round.** Its actions STAY at ≤760, at
 * `order:2; margin-inline-start:0; flex:1 1 auto; justify-content:flex-end`
 * (reader 113), and `[data-r-flowmore]{display:none !important}` (reader 118):
 * the reader never draws a ⋯ on this bar at any width.
 *
 * Declarations are graded through compiled CSS, for the reason
 * `FlowScreen.responsive.test.tsx` states; the pixels are measured in Chrome at
 * 1440 / 1080 / 760 by `e2e/flow.spec.ts`.
 */
const MOBILE = '(max-width: 760px)'

const CONFIRMER: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'], scopes: ['dept:cooking'],
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

const CONFIRMED: Confirmation = {
  target: 'cooking-001', kind: 'process', fingerprint: 'sha256:aaa', confirmed: true,
  confirmed_by: '09120000001', confirmed_at: 1_760_000_000,
}

const reader = (node: ReactElement) => <SurfaceProvider surface="reader">{node}</SurfaceProvider>

async function mount(surface: 'panel' | 'reader', marks: Confirmation[] = [CONFIRMED]) {
  cleanup()
  const json = (body: unknown) => new Response(JSON.stringify(body),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url === '/api/departments') return Promise.resolve(json(DEPARTMENTS))
    if (url.startsWith('/api/confirmations')) return Promise.resolve(json(marks))
    if (url.endsWith('/processes')) return Promise.resolve(json([proc, sibling]))
    return Promise.resolve(json(proc))
  })
  const tree = <FlowScreen />
  renderAt('/processes/:pid/flow', surface === 'reader' ? reader(tree) : tree,
    '/processes/cooking-001/flow', CONFIRMER)
  await screen.findByText('ثبت درخواست')
}

const more = () => screen.getByRole('button', { name: 'ابزارها' })

describe('R47 — the ⋯ overflow menu (C7)', () => {
  it('is drawn on the panel, off above 760 and on below it', async () => {
    // `display:none` on the element (panel 571) and `display:flex !important`
    // inside the ≤760 block (panel 102). Exactly one of the ⋯ and the action
    // group is on screen at any width, which is what makes "replaces" true.
    await mount('panel')
    const el = document.querySelector('[data-r-flowmore]')
    expect(el, 'the panel flow bar draws no ⋯ trigger').not.toBeNull()
    const painted = await paint((el as HTMLElement).className)
    expect(winner(painted, 'display')).toBe('none')
    expect(winner(painted, 'display', '', MOBILE)).toBe('flex')
  })

  it('is drawn at --size-tool, the 34px box the design gives it', async () => {
    // `width:34px;height:34px;border-radius:10px` (panel 571). NOT
    // `--size-menu-more`'s 36px, which is the PANEL's own chrome square and is
    // what `ProcessList`'s ⋯ is drawn at — a different bar, a different rung.
    await mount('panel')
    const painted = await paint((document.querySelector('[data-r-flowmore]') as HTMLElement).className)
    expect(winner(painted, 'width')).toBe('var(--size-tool)')
    expect(winner(painted, 'height')).toBe('var(--size-tool)')
    expect(winner(painted, 'border-radius')).toBe('var(--radius-control)')
    // …and F11's 44px hit target as a transparent `::before` AROUND that box,
    // never by inflating the box: 34 + 2×5 = 44, and --space-2 is the 5. Same
    // rule `ProcessList`'s 36px ⋯ keeps with its own 4.
    expect(winner(painted, 'inset', '::before')).toBe('calc(var(--space-2) * -1)')
  })

  it('is never drawn on the reader, at any width', async () => {
    // `[data-r-flowmore]{display:none !important}` — reader 118. The reader's
    // actions stay on the bar at ≤760 (reader 113), so it has nothing to put in
    // a menu; R44 already makes this the file's one surface branch.
    await mount('reader')
    expect(document.querySelector('[data-r-flowmore]')).toBeNull()
  })

  it('opens a popover with the design’s own 225px floor', async () => {
    // `min-width:225px` — panel 576 and reader 336, the two lines
    // `tokens.css`'s --width-menu comment names and defers. --width-menu is
    // 265px and is the panel SHELL's «مدیریت» popover: two menus, two floors,
    // and borrowing either would crop one label or pad the other.
    await mount('panel')
    await userEvent.click(more())
    const popover = screen.getByRole('menu')
    const painted = await paint(popover.className)
    expect(winner(painted, 'min-width')).toBe('var(--width-menu-flow)')
    // `box-shadow:0 20px 45px -20px rgba(74,37,169,.45)` (panel 576) is
    // --shadow-pop exactly. Read off `--tw-shadow` rather than `box-shadow`,
    // which Tailwind composes from four ring/shadow variables.
    expect(winner(painted, '--tw-shadow')).toBe('var(--shadow-pop)')
    expect(winner(painted, 'border-radius')).toBe('var(--radius-card)')
  })
})

describe('R47 — what is in the menu (C8)', () => {
  it('carries the design’s five rows, in the design’s order', async () => {
    // تأییدشده · ویرایش · divider · فرآیند بعدی · فرآیند قبلی — panel 577-594.
    await mount('panel')
    await userEvent.click(more())
    const rows = screen.getAllByRole('menuitem').map((n) => n.textContent?.trim())
    expect(rows).toEqual(['تأییدشده', 'ویرایش', 'فرآیند بعدی', 'فرآیند قبلی'])
  })

  it('opens the very same §6.15 dialog the toolbar’s act opens', async () => {
    // The design's `mConfirm` is `set({flowMenu:false, confirmDialog:true})` —
    // one dialog, reached from two places, and the menu closes behind it. The
    // dialog is therefore NOT owned by whichever control was pressed.
    await mount('panel')
    await userEvent.click(more())
    await userEvent.click(screen.getByRole('menuitem', { name: 'تأییدشده' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('برداشتن تأیید')
  })

  it('draws the row’s tick green when the mark stands, and empty when it does not', async () => {
    // `border:1.5px solid {{confTickBorder}}; background:{{confTickBg}}` — green
    // on green when confirmed, white behind --border-pick when not (panel
    // 3586-3587). Ledger L-48 makes every `TickBox` violet and RESERVES green
    // for this element by name, so this row draws its own box rather than
    // borrowing the primitive.
    await mount('panel')
    await userEvent.click(more())
    const on = await paint(screen.getByTestId('flowmenu-tick').className)
    expect(winner(on, 'background-color')).toBe('var(--green)')

    await mount('panel', [{ ...CONFIRMED, confirmed: false, confirmed_by: null, confirmed_at: null }])
    await userEvent.click(more())
    const off = await paint(screen.getByTestId('flowmenu-tick').className)
    expect(winner(off, 'background-color')).toBe('var(--card)')
    expect(winner(off, 'border-color')).toBe('var(--border-pick)')
  })

  it('separates the two groups with the design’s own hairline', async () => {
    // `height:1px; background:#F2ECE3; margin:6px 4px` (panel 590) — --hair,
    // "internal divider", and the fourth utility R46 reported as named but
    // unwritable is its `bg-` spelling.
    await mount('panel')
    await userEvent.click(more())
    const rule = screen.getByTestId('flowmenu-rule')
    const painted = await paint(rule.className)
    expect(winner(painted, 'background-color')).toBe('var(--hair)')
  })
})

/**
 * **Owner ruling — the edit toolbar collapses too.** *"in flowchart page, the
 * topmenue isn't responsive"*, said about edit mode.
 *
 * R47 read panel 99 as a rule about the VIEW state and gated the ⋯ on
 * `!editing`, on the argument that hiding `data-r-actions` while editing would
 * take undo, «ذخیره» and «انصراف» off a phone with nothing offering them
 * instead. The argument was right about the acts and wrong about the remedy: it
 * left seven tools plus both commitments on one bar, which wraps to three rows
 * at 390 and pushes the canvas down by a third of the screen.
 *
 * The split it should have made is between the TOOLS and the two acts that END
 * the edit. The tools go in the ⋯ (they are repeatable, and a menu is a fine
 * place for them); «انصراف» and «ذخیره» stay on the bar at every width, because
 * one of them discards work and neither belongs behind a press on the screen
 * where the edit is hardest to make.
 */
describe('the ≤760 edit-toolbar collapse', () => {
  /** Enters edit mode through the ⋯, which is the only door at ≤760. */
  async function edit() {
    await mount('panel')
    await userEvent.click(more())
    await userEvent.click(screen.getByRole('menuitem', { name: 'ویرایش' }))
  }

  it('keeps drawing the ⋯ once the edit has started', async () => {
    // It used to disappear at exactly the moment the bar got seven more
    // controls on it, which is the defect in one sentence.
    await edit()
    expect(document.querySelector('[data-r-flowmore]')).not.toBeNull()
  })

  it('holds every tool the bar draws, and holds them only in edit mode', async () => {
    await edit()
    await userEvent.click(more())
    expect(screen.getAllByRole('menuitem').map((n) => n.textContent?.trim())).toEqual([
      'واگرد', 'ازنو', 'حالت جابه‌جایی', 'حالت انتخاب',
      'چیدمان خودکار', 'افزودن فعالیت', 'افزودن اتصال',
    ])
  })

  it('offers no act that would abandon the edit', async () => {
    // «تأییدشده» and «ویرایش» are the state being edited and the door already
    // walked through; the next/previous pair would navigate away from unsaved
    // work. All four are view-mode rows and none belongs here.
    await edit()
    await userEvent.click(more())
    for (const gone of ['تأییدشده', 'ویرایش', 'فرآیند بعدی', 'فرآیند قبلی']) {
      expect(screen.queryByRole('menuitem', { name: gone }), gone).toBeNull()
    }
  })

  it('marks which mouse mode is on, because it is a setting and not a command', async () => {
    await edit()
    await userEvent.click(more())
    await userEvent.click(screen.getByRole('menuitem', { name: 'حالت انتخاب' }))
    // The press closes the menu — there is nothing to repeat about a setting —
    // so the state is read on the next opening.
    await userEvent.click(more())
    const rows = screen.getAllByRole('menuitem')
    const select = rows.find((r) => r.textContent?.includes('حالت انتخاب'))!
    const pan = rows.find((r) => r.textContent?.includes('جابه‌جایی'))!
    expect(winner(await paint(select.firstElementChild!.className), 'background-color'))
      .toBe('var(--violet)')
    expect(winner(await paint(pan.firstElementChild!.className), 'background-color'))
      .toBe('var(--card)')
  })

  it('takes the tool groups off the bar at ≤760 and leaves the commitments on it', async () => {
    // The whole point of a collapse: exactly one of the two is on screen at any
    // width. A `contents`/`hidden` wrapper is what says it once for all four
    // groups without changing the flex layout above the breakpoint — measured by
    // VALUE at both widths, because an appended `hidden` reads identically in a
    // class string and paints one of them everywhere.
    await edit()
    const tools = document.querySelector('[data-r-actions] > div.contents') as HTMLElement
    expect(tools, 'the edit tool groups are not wrapped, so nothing can collapse them').not.toBeNull()
    const painted = await paint(tools.className)
    expect(winner(painted, 'display')).toBe('contents')
    expect(winner(painted, 'display', '', MOBILE)).toBe('none')
    // …and «ذخیره»/«انصراف» are outside it, so they survive the breakpoint.
    expect(tools.contains(screen.getByTestId('save'))).toBe(false)
    expect(tools.contains(screen.getByTestId('flow-cancel'))).toBe(false)
  })
})

describe('the reader’s flow bar', () => {
  it('draws no action group at all when it has nothing in it — owner ruling', async () => {
    // *"in reder view in flowchart page, the title shows with … but it has
    // space to shpw ather part of title."*
    //
    // On the reader this group is EMPTY — `ConfirmAction` returns null without
    // `confirm` and «ویرایش» is gated on `edit` — and it carried `flex:1 1 auto`
    // from reader 113 while the title beside it carried `flex:1 1 0%`. Two
    // growing items split the free space: measured at 390, a 156px title beside
    // a 156px empty box, and a name needing 410 ellipsised for nothing.
    //
    // `:empty` is a CSS state jsdom does not resolve, so what is pinned here is
    // that the class is WRITTEN; `e2e/behaviour.spec.ts` measures the width it
    // buys, in a browser, on the surface that has the bug.
    await mount('reader')
    const group = document.querySelector('[data-r-actions]') as HTMLElement
    expect(group.className).toContain('empty:hidden')
  })


  it('draws no process id — owner ruling', async () => {
    // *"in reader view, in flowchart page we don't need show process id.remove
    // it. and then make back buttomn and title in one row."* The id is an
    // editor's handle — it keys «فرآیند بعدی», names a row in the conflict
    // inbox, and carries an export's filename. A reader is given the department
    // and the name, and on their bar the badge was the one thing standing
    // between the back button and the title.
    await mount('reader')
    const bar = document.querySelector('[data-r-flowbar]') as HTMLElement
    expect(bar.textContent).not.toContain('cooking-001')
    // …and the panel keeps it, so this is a surface branch and not a deletion.
    await mount('panel')
    expect((document.querySelector('[data-r-flowbar]') as HTMLElement).textContent)
      .toContain('cooking-001')
  })
})

describe('R47 — the ≤760 action collapse', () => {
  it('takes the panel’s action group off the bar at ≤760 and leaves the reader’s on', async () => {
    // panel 99 against reader 113. The two deliverables disagree deliberately
    // (R3) and this is the disagreement the owner was looking at: on the panel
    // the acts move into the ⋯; on the reader they stay, re-ordered.
    await mount('panel')
    const panel = await paint((document.querySelector('[data-r-actions]') as HTMLElement).className)
    expect(winner(panel, 'display', '', MOBILE)).toBe('none')

    await mount('reader')
    const read = await paint((document.querySelector('[data-r-actions]') as HTMLElement).className)
    expect(winner(read, 'display', '', MOBILE)).not.toBe('none')
    expect(winner(read, 'order', '', MOBILE)).toBe('2')
    expect(winner(read, 'margin-inline-start', '', MOBILE)).toBe('0px')
    expect(winner(read, 'justify-content', '', MOBILE)).toBe('flex-end')
  })
})
