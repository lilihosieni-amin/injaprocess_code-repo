import { test, expect, type Page } from '@playwright/test'
import type { Confirmation, Department, Process, ProcNode } from '../src/api/types'
import { FIELD, serve, shot, signedIn, visit } from './_harness'

/**
 * The write flows, in a browser.
 *
 * **Every claim here is one jsdom cannot make.** `toHaveClass` proves a string
 * was written into an attribute; it proves nothing about a pixel, and this task
 * exists because a `min-h-touch` on one button set the height of every row on a
 * list while a green unit suite watched. So each test below says which claim it
 * is making and measures it: a used height, a used width, a computed colour, a
 * contrast ratio, and what `document.elementFromPoint` finds over the chrome.
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

test('the confirm control is the design’s 34px inside the app’s 44px target', async ({ page }) => {
  await signedIn(page)
  await reads(page, CONFIRMED)
  await visit(page, `/processes/${PID}`, 'summary')

  const button = page.getByRole('button', { name: 'لغو تأیید' })
  const drawn = page.getByTestId('confirm-box')
  const [hit, painted] = await Promise.all([button.boundingBox(), drawn.boundingBox()])

  // §5.2's rule for every rung of the design's 30/32/34/36/40/42 ladder, and the
  // one a class list cannot express: the DRAWN box is the design's `--size-tool`
  // 34 and the 44px accessibility floor is padding around it. A `w-tool h-tool`
  // handed to `Button` instead compiles to a class that is written and never
  // painted, because `min-height` beats `height` whatever order they are emitted
  // in — which is exactly what `ProcessList` documents about its delete square.
  expect(painted!.width).toBe(34)
  expect(painted!.height).toBe(34)
  expect(hit!.width).toBeGreaterThanOrEqual(44)
  expect(hit!.height).toBeGreaterThanOrEqual(44)

  // F4 — the byline, against what is really behind it. The finding said
  // `--text-faint` on CREAM (2.27:1); both call sites are on the violet field,
  // where the prescribed `--text-muted` would have measured 3.93 against the
  // 5.88 it replaced. Read from the browser rather than argued from hex values.
  const by = page.getByTestId('confirm-by')
  await expect(by).toBeVisible()
  const ink = await by.evaluate((el) => getComputedStyle(el).color)
  await expect(page.locator('[data-screen="summary"]')).toHaveCSS('background-color', FIELD)
  expect(contrast(ink, FIELD)).toBeGreaterThan(4.5)

  await shot(page, 'confirm-action')
})

test('the confirm-content dialog is §6.15’s, and the page behind it is really inert', async ({ page }) => {
  await signedIn(page)
  await reads(page)
  await visit(page, `/processes/${PID}`, 'summary')

  await page.getByRole('button', { name: 'تأیید محتوا' }).click()
  const box = page.getByRole('dialog', { name: 'تأیید محتوا' })
  const width = page.viewportSize()!.width

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

  // **P3/O7, and the only form of it worth asserting.** Five dialogs painted
  // their own scrim at z-40/50/60/72/74, all of them BELOW `--role-z-chrome`
  // (1020), so the panel's top bar stayed above the scrim and hit-testable while
  // `aria-modal="true"` told assistive technology the page was inert. This is
  // what `elementFromPoint` finds over the middle of the chrome; a class name
  // could never have answered it.
  const scrim = box.locator('xpath=..')
  await expect(scrim).toHaveCSS('background-color', 'rgba(36, 17, 82, 0.45)')
  const overChrome = await page.evaluate(() => {
    const header = document.querySelector('header')
    if (!header) return 'no header'
    const r = header.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit?.closest('[role="dialog"]') ? 'the dialog'
      : hit === document.querySelector('[role="dialog"]')?.parentElement ? 'the scrim'
        : 'the page behind it'
  })
  expect(overChrome).not.toBe('the page behind it')

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

  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
  await shot(page, 'create-process')
})
