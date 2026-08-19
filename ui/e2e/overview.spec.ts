import { test, expect } from '@playwright/test'
import type { Department, Overview } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

/**
 * Task 17 — the department page, `Inja Panel.dc.html:466` (§6.4). Panel only:
 * the reader deliverable draws no department summary, so there is no reader row
 * and none is wanted.
 *
 * Typed as the endpoints' own response types rather than as untyped literals: a
 * renamed field or a widened union is then a `tsc -b` error here instead of a
 * screen rendering `undefined` inside a check that still passes because nothing
 * it measures reads the payload.
 */
const CODE = 'cooking'

const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
  { code: 'dining', name: 'سالن', count: 3, subs: 0, conflicts: 0 },
]

/**
 * TWO sub-units, deliberately — and short ones.
 *
 * `[data-r-2col]` is not drawn for an empty list, and a one-item grid proves no
 * gutter and no second track: the row's own vacuity guard fires on it. Short,
 * because `hook()` refuses a measurement target that is off-screen and the
 * accordion header is the last thing on the page — a fixture with paragraphs in
 * it pushes `[aria-expanded]` past the fold at 900px and reports the screen's
 * focus indicator missing when it is the FIXTURE that is wrong.
 */
const OVERVIEW: Overview = {
  department: CODE,
  name: 'دپارتمان پخت',
  updated_at: '2026-07-06T10:00:00Z',
  description: 'واحد پخت غذاهای گرم رستوران است.',
  sub_units: [
    { name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' },
    { name: 'آشپزخانهٔ سرد', description: 'پیش‌غذا و سالاد' },
  ],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه', 'کنترل کیفیت'], kpi: ['کاهش ضایعات'] }],
}

/** The tracks a grid really laid out, counted the way `_harness` counts them. */
const cols = (t: string) => t.split(' ').filter(Boolean).length

/** `rotate-0` and `rotate-90`, as Chrome serialises them. */
const AT_REST = 'matrix(1, 0, 0, 1, 0, 0)'
const TURNED = 'matrix(0, 1, -1, 0, 0, 0)'

test('department overview', async ({ page }) => {
  await signedIn(page)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': [],
    [`/api/departments/${CODE}/overview`]: OVERVIEW,
    // The harness's default session holds `confirm` over every scope, so the
    // screen asks for this listing on mount. Unstubbed it leaves the browser
    // and is answered by the container on :8000.
    [`/api/confirmations?department=${CODE}`]: [],
  })
  // `visit` rather than `page.goto`: it waits for the screen and pins the page
  // to it, so a navigation between here and the measurements below is named as
  // a navigation instead of being reported as a defect in the screen.
  await visit(page, `/departments/${CODE}/overview`, 'overview')
  await page.getByText('نقش‌ها و شرح وظایف').waitFor()

  await expectDesign(page, 'overview')

  const w = page.viewportSize()!.width

  /**
   * The two R7 rules this screen owns, each asked of the browser at the width
   * the project is running at. `expectDesign` already grades both from the
   * frozen row; these are the per-width record, written where a reviewer
   * reading the spec can see which rule belongs to this screen.
   */
  const grid = page.locator('[data-r-2col]')
  expect(cols(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)))
    .toBe(w > 760 ? 2 : 1)

  const pad = page.locator('[data-r-pad]')
  expect(await pad.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(w > 760 ? '40px' : '14px')

  /* ---- the accordion §6.4 specifies, in a browser ---- */

  const head = page.locator('[data-screen="overview"] [aria-expanded]').first()
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('کنترل کیفیت')).toHaveCount(0)

  // F11's 44px floor, MEASURED rather than read off a class. §6.4's own
  // `padding:14px 16px` around a 14px line already clears it, which is why the
  // header is not inflated to 44 — the plan's rule is that a drawn control
  // keeps the design's box.
  const box = (await head.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)

  // The chevron turns, and it turns by ROTATING one glyph rather than swapping
  // two paths: the `d` is `chevronEnd`'s in both states, and §6.4's open path
  // `M6 15l6-6 6 6` is exactly that drawing a quarter turn on.
  const chev = head.locator('svg')
  const turn = chev.locator('xpath=..')
  const d = await chev.locator('path').getAttribute('d')
  expect(await turn.evaluate((el) => getComputedStyle(el).transform)).toBe(AT_REST)

  await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('کنترل کیفیت')).toBeVisible()
  await expect
    .poll(() => turn.evaluate((el) => getComputedStyle(el).transform))
    .toBe(TURNED)
  expect(await chev.locator('path').getAttribute('d')).toBe(d)

  // Nothing scales or bounces on press (§4.6): the header is not a lifting
  // surface, and the turn belongs to the chevron and not to the control.
  expect(await head.evaluate((el) => getComputedStyle(el).transform)).toBe('none')

  // …and it closes from the same control, because there is only one. The
  // hand-rolled copy this replaced grew a second «بستن» button inside the body.
  await expect(page.getByRole('button', { name: 'بستن' })).toHaveCount(0)
  await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('کنترل کیفیت')).toHaveCount(0)
  await expect
    .poll(() => turn.evaluate((el) => getComputedStyle(el).transform))
    .toBe(AT_REST)

  await shot(page, 'overview')
})
