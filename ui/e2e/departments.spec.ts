import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

/**
 * Typed as the endpoint's own response type, not an untyped literal: a change
 * to `Department` — a renamed field, a widened union — is then a `tsc -b`
 * error here rather than a screen that renders `undefined` in a check that
 * still passes because nothing it measures reads the payload.
 */
const DEPARTMENTS: Department[] = [
  { code: 'management', name: 'مدیریت', count: 4, subs: 1, conflicts: 0 },
  { code: 'accounting', name: 'حسابداری', count: 3, subs: 0, conflicts: 2 },
  { code: 'warehouse', name: 'انبار', count: 5, subs: 2, conflicts: 0 },
  { code: 'procurement', name: 'کارپردازی', count: 2, subs: 0, conflicts: 0 },
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
  { code: 'preparation', name: 'آماده‌سازی', count: 1, subs: 0, conflicts: 0 },
]

/** The tracks a grid really laid out, counted the way `_harness` counts them. */
const cols = (t: string) => t.split(' ').filter(Boolean).length

test('departments renders the design’s numbers', async ({ page }) => {
  await signedIn(page)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  // `visit` rather than `page.goto`: it waits for the screen and pins the page
  // to it, so a navigation between here and the measurements below is named as
  // a navigation instead of being reported as a defect in the screen.
  await visit(page, '/departments', 'departments')
  await expectDesign(page, 'departments')

  const w = page.viewportSize()!.width

  /**
   * The three R7 rules this screen owns, each asked of the browser at the width
   * the project is running at.
   *
   * `expectDesign` already grades the column count and the padding from the
   * frozen `DESIGN` row, so these are not a second copy of those numbers — they
   * are the per-width record written out here, where a reviewer reading the
   * spec can see which rule belongs to this screen rather than to the table.
   */
  const grid = page.locator('[data-r-deptgrid]')
  expect(cols(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)))
    .toBe(w > 1080 ? 3 : w > 760 ? 2 : 1)

  const h1 = page.getByRole('heading', { level: 1 })
  expect(await h1.evaluate((el) => getComputedStyle(el).fontSize)).toBe(w > 760 ? '34px' : '25px')

  const pad = page.locator('[data-r-pad]')
  expect(await pad.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(w > 760 ? '40px' : '14px')

  // R7 — the plan's own decision, and NOT one of §6.16's rules: the deliverable
  // stacks `[data-r-stack]` into a column at ≤760 and keeps the counters. The
  // plan drops them instead, so the mobile header is the title and the lead.
  if (w <= 760) await expect(page.getByText('فرآیند مستند')).toBeHidden()
  else await expect(page.getByText('فرآیند مستند')).toBeVisible()

  await shot(page, 'departments')
})

test('departments — the reader’s own composition', async ({ page }) => {
  // R4: this screen exists for a reader only when they reach two or more
  // departments. `ReaderShell` decides that from the LENGTH of the list
  // `/api/departments` serves — which is the scope-filtered list — so the
  // fixture above, at six rows, is what keeps this spec on the departments
  // screen instead of on one department's process list.
  await signedIn(page, {
    username: 'reader', displayName: 'خواننده', role: 'reader',
    capabilities: ['view'], scopes: ['cooking', 'warehouse'],
  })
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  await visit(page, '/departments', 'departmentsReader')
  await expectDesign(page, 'departmentsReader')

  const grid = page.locator('[data-r-deptgrid]')
  expect(cols(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns))).toBe(1)

  // R3's scale layer, measured rather than read off a class: `--role-tile` is
  // 48px under `:root` and 54px under `[data-surface='reader']`, so `IconTile`
  // writes one class on both surfaces and this is the only place the 54 can be
  // proved. The radius rides the same role — 14px panel, 16px reader.
  const tile = page.locator('[data-r-deptgrid] [data-tile]').first()
  const box = await tile.boundingBox()
  expect(Math.round(box!.width)).toBe(54)
  expect(Math.round(box!.height)).toBe(54)
  expect(await tile.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('16px')

  // R5 — the editor's counts are absent from a reader's screen, not greyed and
  // not explained. The panel fixture above carries `subs` and `conflicts` on
  // four of its six rows, so a composition that leaked them would say so here.
  await expect(page.getByText('زیرفرآیند')).toHaveCount(0)
  await expect(page.getByText('تعارض')).toHaveCount(0)
  await expect(page.getByText('فرآیند مستند')).toHaveCount(DEPARTMENTS.length)

  await shot(page, 'departments-reader')
})
