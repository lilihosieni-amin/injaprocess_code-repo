import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

/**
 * `signedIn(page)`'s default session holds `edit`/`confirm` (`PanelShell`
 * territory — `selectShell` puts it there), so `/profile` mounts inside
 * `PanelShell`, which fetches both endpoints below on every route: `/api/pending`
 * (gated on `canEdit`, which this session has) and `/api/departments` (its own
 * nav). Neither is read by `Profile` itself, but `expectEveryEndpointStubbed`
 * (which `expectDesign` and `shot` both call) aborts anything the *shell* asks
 * for and nothing here answered — the failure would read as a broken Profile
 * screen for a reason that has nothing to do with it.
 */
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'آشپزخانه', count: 3, subs: 0, conflicts: 0 },
]

test('profile — 700 wide, paired fields, violet labels', async ({ page }) => {
  // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
  // /api/ request leaves the browser and is answered by the FastAPI container
  // on :8000, and `expectDesign` fails the spec for it.
  await signedIn(page)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  await visit(page, '/profile', 'profile')
  await expectDesign(page, 'profile')

  const pair = page.getByTestId('password-pair')
  const items = pair.locator('> *')
  // `Locator` has no `boundingBoxes()` (plural) — only a single-element
  // `boundingBox()` — so the pair's two children are measured individually
  // rather than through a method the Playwright API does not have.
  const boxes = await Promise.all([items.nth(0), items.nth(1)].map((l) => l.boundingBox()))

  if (page.viewportSize()!.width > 760) {
    // §6.13 — `grid repeat(2,1fr); gap:12px`. The finding: three inputs in one
    // 882px column at y 428/509/590.
    await expect(pair).toHaveCSS('grid-template-columns', /^\d+(\.\d+)?px \d+(\.\d+)?px$/)
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2)
    await expect(pair).toHaveCSS('gap', '12px')
  } else {
    await expect(pair).toHaveCSS('grid-template-columns', /^\d+(\.\d+)?px$/)
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y)
  }

  // §5.2 — the field-label register the app collapsed into the caption one.
  const label = page.getByText('گذرواژهٔ فعلی')
  await expect(label).toHaveCSS('font-size', '12.5px')
  await expect(label).toHaveCSS('font-weight', '600')
  await expect(label).toHaveCSS('color', 'rgb(74, 37, 169)')

  const input = page.getByLabel('گذرواژهٔ فعلی')
  await expect(input).toHaveCSS('font-size', '14px')
  await expect(input).toHaveCSS('border-radius', '12px')
  await expect(input).toHaveCSS('padding', '12px 14px')

  await expect(page.getByRole('note', { name: 'هشدار' }))
    .toHaveCSS('background-color', 'rgb(251, 238, 220)')
  await expect(page.getByRole('button', { name: 'ذخیرهٔ گذرواژه' }))
    .toHaveCSS('background-color', 'rgb(74, 37, 169)')

  await shot(page, 'profile')
})
