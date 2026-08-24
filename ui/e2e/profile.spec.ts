import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import { expandPadding, expectDesign, serve, shot, signedIn, visit } from './_harness'

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

  // §5.2's field box, for the control this screen actually draws: `padding:
  // 12px 14px` **plus `padding-inline-start:46px`**, because all three of these
  // are `PasswordField`s and a password field with a reveal button reserves the
  // button's room on its own edge. §5.2 states that as a rule of the component
  // ("A password field with a reveal button reserves `padding-inline-start:46px`
  // and places a 32x32 button at left:8px"), and `Inja Panel.dc.html:1858` draws
  // it — the 46 is 8 + 32 + 6, the button's inset, the button, and the gap to
  // the value.
  //
  // This line used to read `toHaveCSS('padding', '12px 14px')`, transcribed from
  // §6.13's sentence about the deliverable's own profile — where the three
  // controls are bare `type="password"` inputs with no reveal at all. **The
  // divergence is real and is reported, not settled here**: this app's Profile
  // screen deliberately took the shared `PasswordField` (task 22, note N6), and
  // this spec grades the screen that exists. What it must not do is assert the
  // *bare* field's box on a *reveal* field, which is a box no control in this
  // product has: the reserve would have to be missing for it to pass, and a
  // missing reserve is the F-defect `fields.test.tsx` was written around — the
  // eye sitting over the last 25px of the value.
  const pad = expandPadding(await input.evaluate((el) => getComputedStyle(el).padding))
  expect([pad.top, pad.bottom]).toEqual(['12px', '12px'])
  // The document is RTL, so inline-start is the RIGHT edge and inline-end the
  // left. Read as the four physical edges rather than as the shorthand string,
  // so a reserve that landed on the wrong side is a failure here and not a
  // different-looking pass.
  expect([pad.right, pad.left]).toEqual(['46px', '14px'])

  // …and the reserve is the button's room rather than 46px of empty margin.
  // Two assertions that each pinned one side independently were both green
  // while the eye stood over the value and the room sat on the other edge
  // (`fields.test.tsx`, "reserves the inline-start room the reveal button
  // occupies"); jsdom can relate the two only through the cascade, so the
  // browser relates them through geometry.
  const eye = page.getByRole('button', { name: 'نمایش گذرواژه' }).first()
  const [field, button] = await Promise.all([input.boundingBox(), eye.boundingBox()])
  const inlineStart = field!.x + field!.width          // the right edge, in RTL
  expect(button!.x + button!.width).toBeLessThanOrEqual(inlineStart)
  expect(button!.x).toBeGreaterThan(inlineStart - 46)

  // **The amber notice is gone** — owner ruling, *"in profile page, i want to
  // delete text «با عوض شدن گذرواژه…»"*. Its «همهٔ دستگاه‌های دیگر از این حساب
  // بیرون آمدند» twin still runs after the change succeeds; what went is the
  // warning before it.
  await expect(page.getByRole('note', { name: 'هشدار' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ذخیرهٔ گذرواژه' }))
    .toHaveCSS('background-color', 'rgb(74, 37, 169)')

  await shot(page, 'profile')
})
