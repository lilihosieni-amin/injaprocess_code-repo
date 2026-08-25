import { test, expect, type Page } from '@playwright/test'
import type { Department, Process } from '../src/api/types'
import { pinPage, serve, signedIn, visit } from './_harness'

/**
 * Three behaviours from the owner's second review that **only a browser can
 * grade**, and each for a different reason:
 *
 *   · the scroll memory — jsdom implements no scrolling at all, so `scrollTop`
 *     is a no-op there and a unit test of it asserts nothing;
 *   · the focus control — it is arithmetic over a laid-out viewport, and jsdom
 *     lays nothing out;
 *   · the row menu's stacking — the bug was a `transform` creating a stacking
 *     context, which is a paint-order fact and invisible to a class assertion.
 *
 * The first and third had both shipped past a full unit suite.
 */
const DEPARTMENTS: Department[] = [{ code: 'dining', name: 'سالن', count: 12, subs: 1 }]

const proc = (id: string, name: string, over: Partial<Process> = {}): Process => ({
  id, department: 'dining', name, parent: null, summary: 'خلاصه',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
  nodes: [], edges: [], pending: [], ...over,
})

/** Long enough that the list really scrolls at every project width. */
const PROCS: Process[] = Array.from({ length: 14 }, (_, i) =>
  proc(`dining-${String(i + 1).padStart(3, '0')}`, `فرآیند شمارهٔ ${i + 1}`))

/** A parent whose step list runs well past a phone, with its LAST step leading
 *  into a child that also scrolls — the exact shape of the owner's report. */
const PARENT: Process = proc('dining-020', 'فرآیند مادر', {
  nodes: Array.from({ length: 12 }, (_, i) => ({
    id: `n${i}`, type: 'activity', label: `گام شمارهٔ ${i + 1} از فرآیند`,
    description: 'توضیح این گام برای پرسنل، به اندازهٔ کافی بلند که صفحه اسکرول شود.',
    actor: 'میزبان', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    subprocess: i === 11 ? 'dining-021' : null,
    position: { x: i * 200, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] },
  })),
  edges: Array.from({ length: 11 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
} as Partial<Process>)

const CHILD: Process = proc('dining-021', 'فرآیند فرزند', {
  parent: { process: 'dining-020', node: 'n11' },
  nodes: Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`, type: 'activity', label: i === 0 ? 'گرفتن وجه' : `کار فرزند ${i + 1}`,
    description: 'توضیحی به اندازهٔ کافی بلند که صفحهٔ فرزند هم اسکرول شود.',
    actor: 'صندوق', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    subprocess: null, position: { x: i * 200, y: 0 }, layout: 'auto',
    source: { created_by: '', touched_by: [] },
  })),
  edges: Array.from({ length: 9 }, (_, i) => ({ from: `c${i}`, to: `c${i + 1}` })),
} as Partial<Process>)

/** Two activities far apart, so "the first one is in the corner" is a claim
 *  `fitView` — which frames BOTH — could not accidentally satisfy. */
const FLOW: Process = proc('dining-001', 'فرآیند شمارهٔ 1', {
  nodes: [
    { id: 'n1', type: 'activity', label: 'استقبال', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] } },
    { id: 'n2', type: 'activity', label: 'بدرقه', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 1400, y: 900 }, layout: 'auto', source: { created_by: '', touched_by: [] } },
  ],
  edges: [{ from: 'n1', to: 'n2' }],
} as Partial<Process>)

const STUBS: Record<string, unknown> = {
  '/api/departments': DEPARTMENTS,
  '/api/pending': [],
  '/api/departments/dining/processes': PROCS,
  '/api/confirmations?department=dining': [],
  '/api/processes/dining-001': FLOW,
  '/api/processes/dining-020': PARENT,
  '/api/processes/dining-021': CHILD,
}

const EDITOR = { capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'], scopes: ['*'] }

/** The screen root is the scroll box — `main`'s only element child. */
const scroller = (page: Page) => page.locator('main > *').first()

async function list(page: Page) {
  await signedIn(page, EDITOR)
  await serve(page, STUBS)
  await visit(page, '/departments/dining', 'processList')
}

test('«بازگشت» returns to the offset it left', async ({ page }) => {
  // **Owner ruling** — *"the back button should always and everywhere return to
  // the same scroll position it was at, no matter where in the app it's used."*
  //
  // Nothing in this app scrolls the WINDOW: every screen is a `flex-1
  // overflow-auto` box inside `main`, so the browser's own restoration has
  // nothing to restore and React Router v6 restores nothing at all. The
  // position lived nowhere.
  await list(page)
  // **Scrolled the way a person does, and that is not fussiness.** Arriving here
  // is itself a navigation, so `useScrollMemory` is holding this box at 0 until
  // its content is there — deliberately, because the browser re-applies an old
  // offset the moment a reused container grows. What ends that hold is a wheel,
  // a finger or a key; a bare `scrollTop =` is none of them, and the loop's next
  // frame puts it back. Instrumented, the sequence was exactly that: the write
  // landed, the loop corrected it, and the correction is what got remembered.
  const box = scroller(page)
  await box.hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  const left = await box.evaluate((el) => el.scrollTop)

  // **Left by a control in the CHROME, not by one in the list.** Playwright
  // scrolls an element into view before clicking it, so pressing a row's own
  // «فلوچارت» would scroll this box back to the top first — and the offset the
  // test then expects back would be the zero it just wrote. The crumb strip's
  // «خانه» is outside the scroll box and moves nothing.
  await page.getByRole('link', { name: 'خانه' }).click()
  await page.locator('[data-screen="departments"]').waitFor()

  await page.goBack()
  await page.locator('[data-screen="processList"]').waitFor()
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop))
    .toBeCloseTo(left, -1)
})

test('a new screen opens at the top, even when it reuses the one before it', async ({ page }) => {
  // The other half of the ruling — *"when a report enters a sub-process, that
  // sub-process should be displayed starting from the top of the page."*
  //
  // `/processes/a/steps` → `/processes/b/steps` is the SAME route, so React
  // keeps the component and the DOM node and the parent's offset simply stays:
  // the child opened halfway down itself. Exercised here on the department
  // route, which has the same shape and a fixture tall enough to scroll.
  await list(page)
  await scroller(page).hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(100)

  await page.getByRole('link', { name: 'خانه' }).click()
  await page.locator('[data-screen="departments"]').waitFor()
  await pinPage(page, 'after the home link')
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(0)
})

test('a sub-process opens at the top of itself, not at the bottom', async ({ page }) => {
  // **Owner ruling** — *"in etep by step page when i click on step that has
  // subprocess, it open subprocesspage in end of page.but it should open new
  // page at the top of page."*
  //
  // `/processes/a/steps` → `/processes/b/steps` is the same route, so React
  // keeps the component and the DOM node. Traced frame by frame the box went
  // `543/1188` → `0/645` → `326/971`: the child's placeholder empties it, the
  // browser clamps the parent's offset to 0, `scroll.ts` writes its own 0 into a
  // box already there — and the instant the child's content lands the browser
  // puts the offset back, at the new maximum. A box remembers what it was ASKED
  // to be scrolled to; a clamp is not an answer to that, and assigning the value
  // it already holds does not withdraw it.
  //
  // NOT scroll anchoring, which was the obvious suspect and was measured and
  // cleared: `overflow-anchor: none` on this very box left the trace unchanged.
  await page.setViewportSize({ width: 390, height: 700 })
  await signedIn(page, EDITOR)
  await serve(page, STUBS)
  await visit(page, '/processes/dining-020/steps')
  await page.getByText('گام شمارهٔ 1 از فرآیند').waitFor()

  // Scrolled with the wheel for the reason the first test in this file records:
  // the reset loop holds this box at 0 until the parent's own content is there,
  // and only a real gesture ends it.
  const box = scroller(page)
  await box.hover()
  await page.mouse.wheel(0, 4000)
  await expect.poll(() => box.evaluate((el) => el.scrollTop),
    { message: 'the parent is not tall enough to scroll — the test proves nothing' })
    .toBeGreaterThan(100)

  await page.getByText('گام شمارهٔ 12 از فرآیند').click()
  await page.getByText('گرفتن وجه').waitFor()
  // …and the child really does scroll, or "it is at the top" is vacuous.
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(100)
  await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(0)
})

test('the focus control puts the first node in the corner, not the whole graph on screen', async ({ page }) => {
  // **Owner ruling** — *"when user click on The square focus button located
  // below the zoom buttons, It should focus in such a way that the first node
  // (the start node) is positioned exactly in the top-left corner of the
  // screen."* React Flow's own `fitView` frames everything, which on a real
  // department zooms out until the labels are unreadable.
  await signedIn(page, EDITOR)
  await serve(page, STUBS)
  await page.goto('/processes/dining-001/flow')
  await page.locator('.react-flow__renderer').waitFor()
  await page.getByText('استقبال').waitFor()

  // Somewhere else entirely first, so the assertion cannot pass on the initial
  // view: `fitView` on mount already centres both nodes.
  await page.locator('.react-flow__pane').hover()
  await page.mouse.wheel(0, 400)
  await page.locator('.react-flow__controls-fitview').click()
  await pinPage(page, 'after the focus control')

  const pane = (await page.locator('.react-flow__renderer').boundingBox())!
  const first = (await page.getByText('استقبال').locator('..').boundingBox())!
  // The 32px pad the canvas draws it at, with slack for the transform's
  // rounding. `toBeCloseTo(…, -1)` is ±5.
  expect(first.x - pane.x, 'the first node is not at the pane’s left edge').toBeCloseTo(32, -1)
  expect(first.y - pane.y, 'the first node is not at the pane’s top edge').toBeCloseTo(32, -1)
})

test('the reader’s flow title takes the whole bar, not half of it', async ({ page }) => {
  // **Owner ruling** — *"in reder view in flowchart page, the title shows with …
  // but it has space to shpw ather part of title."*
  //
  // On the reader `[data-r-actions]` is EMPTY — `ConfirmAction` returns null
  // without `confirm`, «ویرایش» is gated on `edit` — and it still carried
  // `flex:1 1 auto`. Two growing items split the free space: measured at 390, a
  // 156px title beside a 156px empty box. `empty:hidden` is the fix and this is
  // the measurement, because `:empty` is a state jsdom does not resolve.
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page, {
    role: 'reader', displayName: 'سحر بیات',
    capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  })
  await serve(page, STUBS)
  await page.goto('/processes/dining-020/flow')
  await page.locator('.react-flow__renderer').waitFor()
  await pinPage(page, 'reader flow bar')

  const bar = (await page.locator('[data-r-flowbar]').boundingBox())!
  const back = (await page.locator('[data-r-flowback]').boundingBox())!
  const title = (await page.locator('[data-r-flowtitle]').boundingBox())!
  // Everything the bar has left after the back button and the gaps around it.
  expect(title.width).toBeGreaterThan(bar.width - back.width - 40)
  await expect(page.locator('[data-r-actions]')).toBeHidden()
})

test('a reorder row is as tall as its text, not as two stacked buttons', async ({ page }) => {
  // **Owner ruling** — *"the high og each box is much.fit with text."* Measured
  // at 106px per row for one 12.5px line: `IconButton` carries F11's
  // `min-h-touch`, so the two move controls in a COLUMN were 88px of button
  // under a 19px name. Side by side they are 44, which is the floor.
  await list(page)
  // §6.2 replaces the action bar with the ⋯ at ≤760, so the act is reached
  // through whichever of the two is on screen at this width.
  const bar = page.getByRole('button', { name: 'ترتیب فرآیندها' })
  if (await bar.isVisible()) await bar.click()
  else {
    await page.getByRole('button', { name: 'کارهای بیشتر' }).click()
    await page.getByRole('menuitem', { name: 'ترتیب فرآیندها' }).click()
  }
  const row = page.getByTestId('reorder-row').first()
  await row.waitFor()
  const box = (await row.boundingBox())!
  expect(Math.round(box.height), 'the row is back to a stacked pair of buttons')
    .toBeLessThan(70)
  // …and it got there by LOSING those controls, not by shrinking them under the
  // touch floor: *"remove top and dpwn buttomn in order popup."* The keyboard
  // path they used to be is the row itself, which `ReorderModal.test.tsx` pins.
  await expect(row.getByRole('button')).toHaveCount(0)
  await expect(row).toHaveAttribute('tabindex', '0')
})

test('the A4 width is drawn while editing, and only while editing', async ({ page }) => {
  // **Owner ruling** — *"in export pdf, the flowchart should be in A4 page.so in
  // edit flowchart page i want to show the width of A4 to editor see and try to
  // input nodes in A4 width.it just show in editor of flowchrt.in edit mode.not
  // read mode."*
  //
  // The width is derived, not chosen: `PRINT.W` is the page box less the `@page`
  // margins `print.css` declares, and `PrintDiagrams` pads the diagram by
  // `PRINT.PAD` a side before `planBands` computes `min(1, PRINT.W / width)`.
  // `export/print/a4-lane.test.ts` ties the lane to that arithmetic; this is
  // where it is checked that the lane appears at all, and where.
  //
  // A later ruling widened it — *"just two node can be in one line.but i want to
  // at lest 4-5 nodes be in one line.can you make it bigger but it be still
  // A4?"* — by turning the sheet, which is the only way an A4 page gets wider.
  await signedIn(page, EDITOR)
  await serve(page, STUBS)
  await page.goto('/processes/dining-001/flow')
  await page.locator('.react-flow__renderer').waitFor()
  // A reader — and an editor who has not pressed «ویرایش» — sees nothing.
  await expect(page.locator('[data-a4-lane]')).toHaveCount(0)

  const more = page.locator('[data-r-flowmore]')
  if (await more.isVisible()) {
    await more.click()
    await page.getByRole('menuitem', { name: 'ویرایش' }).click()
  } else await page.getByTestId('enter-edit').click()

  const lane = page.locator('[data-a4-lane]')
  await expect(lane).toBeVisible()
  // 1250 flow px — `engine/layout`'s own five-column band. Asserted on the box the
  // browser actually lays out rather than on the constant, because the constant
  // being right is what `a4-lane.test.ts` covers and this is the half only a
  // browser can see.
  await expect(lane).toHaveCSS('width', '1250px')
  // And how many cards that is, measured against a card the browser really drew
  // rather than against the 170 in the stylesheet. Both boxes are inside the same
  // `ViewportPortal` transform, so the *ratio* is zoom-invariant even though
  // neither width is — which is why this is a ratio and not two widths. At w760
  // React Flow zooms the canvas out far enough that the lane measures only a
  // couple of cards' worth of screen pixels; it still holds five of them.
  const laneW = (await lane.boundingBox())!.width
  const cardW = (await page.locator('.react-flow__node').first().boundingBox())!.width
  expect(Math.floor(laneW / cardW)).toBeGreaterThanOrEqual(5)

  // `FLOW`'s two nodes are 1400 apart, so this diagram is still over — which is
  // the state the ruling exists for and the one a same-coloured lane would let
  // an editor scroll past.
  await expect(lane).toHaveAttribute('data-over', 'true')
  // It is furniture, not a control: a press goes through it to the canvas.
  await expect(lane).toHaveCSS('pointer-events', 'none')
})

test('the A4 lane stays put while the diagram is dragged around under it', async ({ page }) => {
  // **Owner ruling** — *"in edit mode when i in حالت انتخاب mouse, the A4 line can
  // be move.but i don't want it.it's location should be fix."*
  //
  // The lane used to anchor to the nodes' own bounding box, so dragging a node
  // left dragged the lane left with it — a ruler that moves with the thing it is
  // measuring can never be overrun, and told the editor nothing. It is pinned to
  // the flow origin now, and only its height follows the content.
  //
  // Only a browser can see this: the anchor is computed from React Flow's node
  // store, which is populated by real pointer events and real measurement, and
  // jsdom has neither.
  await signedIn(page, EDITOR)
  await serve(page, STUBS)
  await page.goto('/processes/dining-001/flow')
  await page.locator('.react-flow__renderer').waitFor()
  const more = page.locator('[data-r-flowmore]')
  if (await more.isVisible()) {
    await more.click()
    await page.getByRole('menuitem', { name: 'ویرایش' }).click()
  } else await page.getByTestId('enter-edit').click()

  const lane = page.locator('[data-a4-lane]')
  await expect(lane).toBeVisible()

  // Measured as the gap between the lane's left rail and a node that is NOT
  // dragged, rather than as the lane's screen position. Dragging inside a canvas
  // can pan the viewport, which moves the lane and every node together by the
  // same amount — a screen-position assertion cannot tell that apart from the bug,
  // and a first draft of this test failed on exactly that. A distance between two
  // things in the same `ViewportPortal` is invariant under both pan and zoom, so
  // it changes only if the lane really did re-anchor itself.
  const moved = page.locator('.react-flow__node').first()
  const still = page.locator('.react-flow__node').nth(1)
  const gap = async () => {
    const l = (await lane.boundingBox())!
    const s = (await still.boundingBox())!
    return { dx: s.x - l.x, dy: s.y - l.y, w: l.width }
  }
  const before = await gap()
  const stillBefore = (await still.boundingBox())!
  const nb = (await moved.boundingBox())!

  // Drag one node a long way left and up — the direction that used to drag the
  // lane's own left rail along with it.
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2)
  await page.mouse.down()
  await page.mouse.move(nb.x + nb.width / 2 - 220, nb.y + nb.height / 2 - 90, { steps: 12 })
  await page.mouse.up()

  // The precondition: that really did move one node *relative to the other*, and
  // was not the whole canvas panning under a missed grab. Without this the
  // assertions below can pass on a drag that never happened.
  const na = (await moved.boundingBox())!
  const stillAfter = (await still.boundingBox())!
  const relBefore = nb.x - stillBefore.x
  const relAfter = na.x - stillAfter.x
  expect(Math.abs(relAfter - relBefore)).toBeGreaterThan(50)

  // …and the lane did not follow it. Within a pixel, at the same width.
  const after = await gap()
  expect(Math.abs(after.dx - before.dx)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.dy - before.dy)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.w - before.w)).toBeLessThanOrEqual(1)
})

test('an open row menu paints over the rows after it', async ({ page }) => {
  // **Owner ruling** — *"When you click on this button on a process box and the
  // menu opens, the other process boxes appear on top of it."*
  //
  // §6.2 lifts a row 2px under the pointer, and a `transform` other than `none`
  // makes an element a stacking context — so at the moment the popover appears
  // its own card is one, and `z-dropdown` cannot escape it. Measured by asking
  // the browser what is actually AT a point inside the menu, which is the only
  // question a class assertion cannot answer.
  await list(page)
  await page.getByRole('button', { name: /^کارهای «فرآیند شمارهٔ 1»/ }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  const box = (await menu.boundingBox())!
  const onTop = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el === null ? null : el.closest('[role="menu"]') !== null
  }, { x: box.x + box.width / 2, y: box.y + box.height - 4 })
  expect(onTop, 'a process card is painted over the bottom of the open menu').toBe(true)
})
