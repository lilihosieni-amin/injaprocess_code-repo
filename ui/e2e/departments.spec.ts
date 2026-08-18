import { test } from '@playwright/test'
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

test('departments renders the design’s numbers', async ({ page }) => {
  await signedIn(page)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  // `visit` rather than `page.goto`: it waits for the screen and pins the page
  // to it, so a navigation between here and the measurements below is named as
  // a navigation instead of being reported as a defect in the screen.
  await visit(page, '/departments', 'departments')
  await expectDesign(page, 'departments')
  await shot(page, 'departments')
})
