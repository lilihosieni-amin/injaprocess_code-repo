import { test } from '@playwright/test'
import { expectDesign, serve, shot, signedIn } from './_harness'

const DEPARTMENTS = [
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
  await page.goto('/departments')
  await expectDesign(page, 'departments')
  await shot(page, 'departments')
})
