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
  // **Set it in a poll, not once.** Arriving here is itself a navigation, so
  // `useScrollMemory` is holding this box at 0 until its content is there —
  // deliberately, because the browser re-applies an old offset the moment a
  // reused container grows. A single programmatic write can land inside that
  // window and be corrected; a real person's wheel or finger ends the loop, and
  // a test has neither.
  const box = scroller(page)
  await expect.poll(async () => {
    await box.evaluate((el) => { el.scrollTop = 400 })
    return box.evaluate((el) => el.scrollTop)
  }).toBeGreaterThan(100)
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
  await expect.poll(async () => {
    await scroller(page).evaluate((el) => { el.scrollTop = 400 })
    return scroller(page).evaluate((el) => el.scrollTop)
  }).toBeGreaterThan(100)

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

  // Polled for the reason the first test in this file records: the reset loop
  // is still holding this box at 0 until the parent's own content is there.
  const box = scroller(page)
  await expect.poll(async () => {
    await box.evaluate((el) => { el.scrollTop = el.scrollHeight })
    return box.evaluate((el) => el.scrollTop)
  }, { message: 'the parent is not tall enough to scroll — the test proves nothing' })
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
  // …and neither control fell below the touch floor to get there.
  for (const name of [/به بالا/, /به پایین/]) {
    const b = (await row.getByRole('button', { name }).boundingBox())!
    expect(Math.round(b.height)).toBeGreaterThanOrEqual(44)
  }
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
