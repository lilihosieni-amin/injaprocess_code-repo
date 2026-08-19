import { test, expect } from '@playwright/test'
import { FOCUS, shot, signedIn } from './_harness'

/** `--login-bg` #2E1668, the one field in the product that is not `--ink`. */
const LOGIN_FIELD = 'rgb(46, 22, 104)'
/** `--login-orb` #3A1D85, defined and painted by nothing until this screen. */
const ORB = 'rgb(58, 29, 133)'

test('sign in', async ({ page }) => {
  // The one spec that must NOT be signed in — and it still installs the stub
  // layer, because `shot` calls `expectEveryEndpointStubbed` and a spec that
  // intercepts nothing is grading whatever the FastAPI container on :8000
  // happens to hold. `signedIn` installs the layer; the route registered after
  // it wins (Playwright tries handlers in reverse registration order) and
  // answers the session endpoint the way an anonymous caller is answered.
  await signedIn(page)
  await page.route((url) => url.pathname === '/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json',
                    body: JSON.stringify({ detail: 'authentication required' }) }))

  await page.goto('/login')
  await page.getByLabel('شمارهٔ موبایل').waitFor()

  // There is no `expectDesign(page, 'signIn')`: this screen has no `DESIGN`
  // row and is not getting one — it is identical at 1440, 1080 and 760, and a
  // row with no width-dependent expectation fails the harness's own guard on
  // the day it is added (Step 13, finding F1). Its numbers are asserted here.
  const screen = page.locator('[data-screen]')
  expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(LOGIN_FIELD)

  const card = page.locator('form')
  const box = (await card.boundingBox())!
  // 380 at every width this suite runs, and that IS the claim (F1). `max-w-full`
  // is the floor under it: the wrapper's own `p-s10` leaves 22px each side, so
  // the card only starts shrinking below a 424px viewport, which is narrower
  // than the narrowest breakpoint the design declares.
  expect(Math.round(box.width)).toBe(380)
  expect(await card.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('24px')
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none')  // no gradients, anywhere

  const logo = page.getByRole('img', { name: 'اینجا فست‌فود' })
  expect(Math.round((await logo.boundingBox())!.width)).toBe(76)

  // The depth is two solid circles, and they are on the page.
  await expect(page.locator('.login-orb-a')).toBeVisible()
  await expect(page.locator('.login-orb-b')).toBeVisible()
  expect(await page.locator('.login-orb-a').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(ORB)
  // …solid, and not a gradient. The readme is explicit that the depth on this
  // screen comes from the two circles "not a gradient", and there is no
  // gradient anywhere else in the product either — so the absence is asserted
  // rather than assumed, on the orb as well as on the card above it.
  expect(await page.locator('.login-orb-a').evaluate((el) => getComputedStyle(el).backgroundImage))
    .toBe('none')

  // The two fields are 16px apart — the DS Login's `marginBottom` on every
  // Input. Read as geometry and not as a class, because the class is on the
  // field WRAPPER and a margin that collapsed, or a `mb-*` that lost its race
  // with another utility in Tailwind's output order, is still the right string
  // on the right element and the wrong picture.
  // The two labels, in DOM order — the number's and the password's. `.nth(1)`
  // rather than a text filter because «گذرواژه» is also inside the reveal
  // button's accessible name and inside the field's own placeholder.
  const labels = page.locator('form label')
  await expect(labels).toHaveCount(2)
  const number = (await page.getByLabel('شمارهٔ موبایل').boundingBox())!
  const passwordLabel = (await labels.nth(1).boundingBox())!
  expect(Math.round(passwordLabel.y - (number.y + number.height))).toBe(16)

  // Focus is border-colour and nothing else — no ring, no glow, no outline.
  const field = page.getByLabel('شمارهٔ موبایل')
  await field.focus()
  expect(await field.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(FOCUS)

  // R5's rule on this screen: nothing here leads anywhere but in. The submit
  // and the password reveal are the whole of it — no «رمز را فراموش کرده‌ام»,
  // no sign-up, no «ورود با کد یک‌بارمصرف». Every one of those is a control
  // this product would refuse: it has no reset flow, no self-registration and
  // no second factor, and D56 means the refusal could not even say why.
  await expect(page.locator('form a')).toHaveCount(0)
  await expect(page.locator('form button')).toHaveCount(2)

  // `shot` appends the viewport width itself, so the name carries none: the
  // three runs file `sign-in-1440.png`, `-1080.png` and `-760.png`. (Passing
  // `sign-in-${w}` writes `sign-in-1440-1440.png`; `e2e/__shots__/` holds six
  // files named that way from an earlier task, which is how this was noticed.)
  await shot(page, 'sign-in')
})
