import { test, expect, type Page } from '@playwright/test'
import type { Confirmation, Department, Process, ProcNode } from '../src/api/types'
import { FIELD, pinPage, serve, shot, signedIn, visit } from './_harness'

/**
 * The write flows, in a browser.
 *
 * **Every claim here is one jsdom cannot make.** `toHaveClass` proves a string
 * was written into an attribute; it proves nothing about a pixel, and this task
 * exists because a `min-h-touch` on one button set the height of every row on a
 * list while a green unit suite watched. So each test below says which claim it
 * is making and measures it: a used height, a used width, a computed colour, a
 * contrast ratio, and a `var()` the theme resolves and jsdom hands back as a
 * literal string.
 *
 * No `expectDesign` and no `DESIGN` row: a dialog is not a `[data-screen]`
 * region — no field, no screen padding, no `[data-col]`, no `[data-h1]`, no
 * `[data-body]` — and neither is a control inside one. `_harness.ts` is frozen
 * and this spec was always the one screen task that wanted nothing from its
 * table (`ui-harness-preflight-report.md`, F6); the fixtures live here.
 */

const CODE = 'dining'
const PID = 'dining-001'

const DEPARTMENTS: Department[] = [
  { code: CODE, name: 'سالن', count: 2, subs: 0, conflicts: 0 },
]

const activity = (id: string): ProcNode => ({
  id, type: 'activity', label: id, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 'seed', touched_by: [] },
})

const EMPTY_ICOM = { inputs: [], controls: [], outputs: [], mechanisms: [] }

/**
 * A long name on purpose.
 *
 * The row title is `truncate`, so a name that fits proves nothing about the line
 * it is on: the height finding below is about what ELSE was on that line, and a
 * short name leaves room for a control to sit beside it without wrapping. This
 * one cannot fit at 760.
 */
const PROCESSES: Process[] = [
  {
    id: PID, department: CODE, name: 'پذیرش مهمان و چیدمان میزهای سالن اصلی',
    summary: 'از خوش‌آمدگویی تا نشاندن مهمان.', parent: null,
    idef0: EMPTY_ICOM, kpis: [{ name: 'زمان انتظار' }],
    nodes: [activity('n1'), activity('n2')], edges: [], pending: [],
  },
  {
    id: 'dining-002', department: CODE, name: 'سرو غذا', summary: 'خلاصه',
    parent: null, idef0: EMPTY_ICOM, kpis: [],
    nodes: [activity('n1')], edges: [], pending: [],
  },
]

/** UNCONFIRMED, so the act on offer is «تأیید محتوا» and the dialog is the
 *  confirming one — the tinted-green branch of §6.15. */
const CONFIRMATIONS: Confirmation[] = [
  {
    target: PID, kind: 'process', fingerprint: 'a'.repeat(64),
    confirmed: false, confirmed_by: null, confirmed_at: null,
  },
]

/** …and the same row confirmed, which is what puts the byline on screen. */
const CONFIRMED: Confirmation[] = [
  {
    target: PID, kind: 'process', fingerprint: 'a'.repeat(64),
    confirmed: true, confirmed_by: '09120000001', confirmed_at: 1770000000,
  },
]

/** Every read the panel shell and these two screens make. */
async function reads(page: Page, marks: Confirmation[] = CONFIRMATIONS) {
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    [`/api/departments/${CODE}/processes`]: PROCESSES,
    [`/api/processes/${PID}`]: PROCESSES[0],
    [`/api/confirmations?department=${CODE}`]: marks,
    [`/api/departments/${CODE}/next-id`]: { next_id: `${CODE}-003` },
    '/api/pending': [],
  })
}

/**
 * The flowchart, which is where the confirm control lives as of owner ruling
 * R46 — *"the each process accept or reject should be in flowchart page, not in
 * information page. exactly like design."* Both deliverables draw it in the flow
 * bar's `data-r-actions` (panel 597-608, reader 357-368) and give the process
 * summary's action group only «ویرایش اطلاعات» (panel 393-396).
 *
 * Not `visit()`: that waits on a `[data-screen]` and the flow route mounts none
 * — see `FlowScreen.tsx`'s own note on `data-r-flow`.
 */
async function flowchart(page: Page) {
  await page.goto(`/processes/${PID}/flow`)
  await page.locator('[data-r-flowbar]').waitFor()
  await page.locator('.react-flow__renderer').waitFor()
  await pinPage(page, `goto('/processes/${PID}/flow')`)
}

/** The relative luminance of a `rgb(r, g, b)` string, per WCAG. */
function luminance(colour: string): number {
  const [r, g, b] = (/rgba?\(([^)]+)\)/.exec(colour)?.[1] ?? '0,0,0')
    .split(',').slice(0, 3).map((n) => Number(n.trim()) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

test('a process row is as tall as its own type', async ({ page }) => {
  // `signedIn` + `serve`, not a bare `goto`: `shot` calls
  // `expectEveryEndpointStubbed`, which fails a spec that intercepts nothing —
  // with no route installed every /api/ request leaves the browser and is
  // answered by the FastAPI container on :8000, so the check would grade a live
  // database instead of the working tree.
  await signedIn(page)
  await reads(page)
  await visit(page, `/departments/${CODE}`, 'processList')

  const title = page.getByTestId(`title-${PID}`)
  const box = (await title.boundingBox())!
  // **F1, the finding this whole task is about.** `ConfirmMark` put a
  // `min-h-touch min-w-touch` `Button` on this line, so a row whose tallest type
  // is 17px measured 44 — on every row of the list, which is how one control
  // came to set the rhythm of a whole screen. jsdom lays nothing out, so no unit
  // test in this repo could ever have seen it. §6.2 draws the line at 17px with
  // a 12px numeral beside it; 30 is the ceiling that leaves for leading and
  // fails the moment a 44px control comes back.
  expect(box.height).toBeLessThan(30)
  // …and it is really on screen, not a zero-height box that trivially satisfies
  // the line above.
  expect(box.height).toBeGreaterThan(15)

  // Nothing on this line is a control any more — neither the mark (which moved
  // to the meta row as §6.2's chip) nor the act (which moved to the header).
  await expect(title.getByRole('button')).toHaveCount(0)
  await expect(title.getByTestId('confirm-mark')).toHaveCount(0)
  await expect(title.getByTestId('confirm-box')).toHaveCount(0)

  await shot(page, 'process-list-row')
})

test('the confirm control is the design’s pill inside the app’s 44px target', async ({ page }) => {
  // **R46 moved this control to the flowchart.** It is measured where it is
  // drawn; the summary half of the move is asserted at the foot of this file.
  await signedIn(page)
  await reads(page, CONFIRMED)
  await flowchart(page)

  // **Above 760 only, as of owner ruling R47.** The panel takes its whole action
  // group off the flow bar at ≤760 (`Inja Panel.dc.html:99`) and replaces it
  // with the ⋯ menu (panel 102), so below the breakpoint this control is not
  // painted at all and the act is a menu ROW instead — a different shape, with
  // no drawn box to measure. That route is graded in `e2e/flow.spec.ts`'s R47 block,
  // at the width where it is the only one. Skipping rather than asserting
  // nothing, so a run at w760 says which check did not apply and why.
  if (page.viewportSize()!.width <= 760) {
    await expect(page.getByRole('button', { name: 'ابزارها' })).toBeVisible()
    test.skip(true, 'the confirm control is inside the ⋯ menu at ≤760 — panel 99 and 102')
    return
  }

  const button = page.getByRole('button', { name: 'لغو تأیید' })
  const drawn = page.getByTestId('confirm-box')
  const painted = await drawn.boundingBox()

  // **Owner ruling R48 — this is the design's pill now, not §6.3's 34px tool
  // box.** R47 drew the tool box here and reported why it could not draw the
  // pill: the label the pill carries measured 3.72:1 unconfirmed and 3.86:1
  // confirmed on the white flow bar, against the 4.5:1 that bar is graded at,
  // and choosing between the design's ink and a readable one was the owner's
  // call rather than a task's. The owner made it — *"make the text darker so
  // people can read it"* — so panel 599's own box is drawn: `padding:7px 12px`
  // around a 19px tick behind the app's hairline edge.
  //
  // **35 and not the deliverable's 36**, because Chrome's used value for a
  // 1.5px border is 1px at DPR 1 — measured on this element, not assumed. The
  // number is asserted as painted rather than as designed; `e2e/flow.spec.ts`
  // carries the same measurement and the reason.
  expect(painted!.height).toBe(35)
  await expect(button).toHaveText('تأییدشده')

  // §5.2's rule survives the change of shape, and it is the one a class list
  // cannot express: the DRAWN box is the design's and the 44px accessibility
  // floor is a transparent `::before` around it. A `min-h-touch` handed to a
  // sized control instead repaints it at 44, because `min-height` beats
  // `height` whatever order they are emitted in — which is exactly what
  // `ProcessList` documents about its delete square.
  const hit = await button.evaluate((el) => {
    const b = getComputedStyle(el, '::before')
    const r = el.getBoundingClientRect()
    const px = (v: string) => Number.parseFloat(v) || 0
    return { w: r.width - px(b.left) - px(b.right), h: r.height - px(b.top) - px(b.bottom) }
  })
  expect(hit.w).toBeGreaterThanOrEqual(44)
  expect(hit.h).toBeGreaterThanOrEqual(44)

  // F4 was about the byline's ink against what is really behind it. The byline
  // is not on this bar and must not be: `ConfirmMark` paints it in
  // `--role-subtitle-on-field`, which is chosen for the violet field, and the
  // flow toolbar is `--card` white — measured, 1.74:1. `e2e/flow.spec.ts` runs
  // the contrast census that keeps it off.
  await expect(page.getByTestId('confirm-by')).toHaveCount(0)

  await shot(page, 'confirm-action')
})

test('the byline stays on the summary, and stays legible on the field it is drawn on', async ({ page }) => {
  // **F4, kept where the byline is.** The finding said `--text-faint` on CREAM
  // (2.27:1); the mark's one remaining call site on this route is the process
  // summary's badge row, which is inside a `bg-ink` screen root, and there the
  // prescribed `--text-muted` would have measured 3.93 against the 5.88 it
  // replaced. Read from the browser rather than argued from hex values.
  //
  // R46 moved the ACT to the flowchart and left the MARK here, which is what
  // `Inja Panel.dc.html:389` draws under `isEditor`. That split is the reason
  // this assertion is now its own test: the control it used to travel with is
  // measured on another screen.
  await signedIn(page)
  await reads(page, CONFIRMED)
  await visit(page, `/processes/${PID}`, 'summary')

  const by = page.getByTestId('confirm-by')
  await expect(by).toBeVisible()
  const ink = await by.evaluate((el) => getComputedStyle(el).color)
  await expect(page.locator('[data-screen="summary"]')).toHaveCSS('background-color', FIELD)
  expect(contrast(ink, FIELD)).toBeGreaterThan(4.5)

  // …and the act really is gone from this screen, which is the other half of
  // the ruling.
  await expect(page.getByTestId('confirm-box')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'لغو تأیید' })).toHaveCount(0)
})

test('the confirm-content dialog is §6.15’s, and its scrim is on the modal rung', async ({ page }) => {
  await signedIn(page)
  await reads(page)
  await flowchart(page)

  const width = page.viewportSize()!.width
  // **Two routes to one dialog, and this test takes whichever the width offers.**
  // Owner ruling R47: at ≤760 the panel's flow bar replaces its action group
  // with the ⋯ menu (`Inja Panel.dc.html:99` and `:102`), so the act is a menu
  // row there. The dialog is the SAME dialog either way — the design keeps it in
  // app state and opens it from both (`mConfirm`, panel 3563) — and this test
  // must go on running at ≤760, because the rules it grades below are §5.2's
  // bottom-sheet ones, which only exist at that width.
  if (width > 760) {
    await page.getByRole('button', { name: 'تأیید محتوا' }).click()
  } else {
    await page.getByRole('button', { name: 'ابزارها' }).click()
    await page.getByRole('menuitem', { name: 'تأییدشده' }).click()
  }
  const box = page.getByRole('dialog', { name: 'تأیید محتوا' })

  // §6.15 — `width:460px; border-radius:24px; padding:26px`, and §5.2's ≤760
  // pass turns every modal into a bottom sheet with 20px top corners only.
  if (width > 760) {
    await expect(box).toHaveCSS('width', '460px')
    await expect(box).toHaveCSS('border-radius', '24px')
    await expect(box).toHaveCSS('padding', '26px')
  } else {
    await expect(box).toHaveCSS('border-radius', '20px 20px 0px 0px')
    await expect(box).toHaveCSS('width', `${width}px`)
  }

  // §6.15's glyph tile — 42x42 at radius 14, tinted for which way the press
  // goes. The class is asserted in jsdom; what is asserted here is that the
  // three declarations reach the element and paint.
  const glyph = page.getByTestId('confirm-glyph')
  await expect(glyph).toHaveCSS('border-radius', '14px')
  await expect(glyph).toHaveCSS('background-color', 'rgb(228, 246, 236)')  // --tile-ok
  const tile = (await glyph.boundingBox())!
  expect(tile.width).toBe(42)
  expect(tile.height).toBe(42)

  const scrim = box.locator('xpath=..')
  await expect(scrim).toHaveCSS('background-color', 'rgba(36, 17, 82, 0.45)')

  // FR-I3 — the box asks, it does not write. Escape takes it away with nothing
  // sent; `expectEveryEndpointStubbed` inside `shot` fails the spec if a POST
  // had gone out to an endpoint nothing here stubs.
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)

  await shot(page, 'confirm-dialog')
})

test('the create dialog is one dialog', async ({ page }) => {
  await signedIn(page)
  await reads(page)
  await visit(page, `/departments/${CODE}`, 'processList')

  // At ≤760 the action bar is replaced by §6.2's `⋯`, so the opener is inside
  // it. Both are the same act; the bar is `display:none` below the breakpoint,
  // and R5 puts the overflow's list and the bar's on one array so neither can
  // hold an act the other does not. The role differs, though: inside the menu it
  // is a `role="menuitem"`, which REPLACES the implicit `button` role, so one
  // `getByRole('button')` cannot reach both.
  const width = page.viewportSize()!.width
  if (width <= 760) {
    await page.getByRole('button', { name: 'کارهای بیشتر' }).click()
    await page.getByRole('menuitem', { name: 'فرآیند جدید' }).click()
  } else {
    await page.getByRole('button', { name: 'فرآیند جدید' }).click()
  }

  const box = page.getByRole('dialog', { name: 'ایجاد فرآیند جدید' })
  // §5.2 — one scrim, one shadow, one radius, and a bottom sheet at ≤760px.
  await expect(box.locator('xpath=..'))
    .toHaveCSS('background-color', 'rgba(36, 17, 82, 0.45)')
  if (width > 760) {
    await expect(box).toHaveCSS('width', '460px')
    await expect(box).toHaveCSS('border-radius', '24px')
  } else {
    await expect(box).toHaveCSS('border-radius', '20px 20px 0px 0px')
  }

  // §5.2's footer is two `flex:1` buttons, and the design's touch floor applies
  // to both. Measured, because `min-h-touch` is a class either way.
  for (const name of ['ایجاد و ویرایش', 'انصراف']) {
    const b = (await box.getByRole('button', { name }).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
  }

  // **P3/O7.** Five dialogs painted their own scrim at z-40 / z-50 / z-[60] /
  // z-[72] / z-[74], every one of them BELOW `--role-z-chrome` (1020), so the
  // panel's top bar, the comment FAB and every anchored popover painted *above*
  // a scrim whose box said `aria-modal="true"`. This asserts the scrim sits on
  // L-44's modal rung, read from the page's own custom property so no number is
  // written here — and it is a claim only a browser can settle, because jsdom
  // resolves no `var()` and reports the literal string back.
  //
  // **It is asserted this way and not with `elementFromPoint`, and the reason is
  // a guard that could not fail.** The first cut of this check asked what
  // `document.elementFromPoint` returned over the middle of the chrome. Measured:
  // it returned `no header` at every width on both of the routes these dialogs
  // open from — `/departments/{code}` and `/processes/{pid}` draw the crumb
  // strip, not the top bar, and nothing on either screen is on the z ladder at
  // all. So the check passed with the scrim *mutated down to `z-40`*, which is
  // exactly the defect it claimed to catch. A hit test against static content
  // cannot see this bug either: a `position:fixed` scrim paints above static
  // siblings at z-40 just as happily as at 1055. The rung is the claim.
  const rung = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--role-z-modal').trim())
  expect(Number(rung)).toBeGreaterThanOrEqual(1000)
  await expect(box.locator('xpath=..')).toHaveCSS('z-index', rung)

  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
  await shot(page, 'create-process')
})
