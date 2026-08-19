import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import type { AdminUser, Role, SupervisorCandidate } from '../src/api/users'
import { FOCUS, SUBPANEL_SURFACE, serve, shadowOf, shot, signedIn, visit } from './_harness'

/**
 * **The nine of the real deployment**, and that is the whole point of this file.
 *
 * The finding it exists for is a height: 2207px of content in an 850px box, of
 * which ~1300px was one control — a scope fieldset drawing 1 + 9 + 18 = 28
 * stacked 44px checkbox rows. Three departments could never have produced it, so
 * a fixture of three would measure a dialog that was never broken.
 */
const DEPARTMENTS: Department[] = [
  { code: 'management', name: 'مدیریت', count: 0, subs: 0, conflicts: 0 },
  { code: 'accounting', name: 'حسابداری', count: 0, subs: 0, conflicts: 0 },
  { code: 'warehouse', name: 'انبار', count: 1, subs: 0, conflicts: 0 },
  { code: 'procurement', name: 'تدارکات', count: 0, subs: 0, conflicts: 0 },
  { code: 'cooking', name: 'پخت', count: 3, subs: 1, conflicts: 0 },
  { code: 'preparation', name: 'آماده‌سازی', count: 0, subs: 0, conflicts: 0 },
  { code: 'dining', name: 'سالن', count: 4, subs: 1, conflicts: 0 },
  { code: 'cashier', name: 'صندوق', count: 2, subs: 0, conflicts: 0 },
  { code: 'logistics', name: 'پشتیبانی', count: 0, subs: 0, conflicts: 0 },
]

const SAHAR: AdminUser = {
  id: 7, username: '09121111111', displayName: 'سحر بیات',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'manage_users'],
  scopes: ['dept:cashier'],
  supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: false },
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

const USERS: AdminUser[] = [SAHAR]

const ROLES: Role[] = [
  { id: 3, name: 'admin', capabilities: ['view', 'comment', 'export_pdf', 'manage_users'] },
  { id: 4, name: 'reader', capabilities: ['view', 'comment', 'export_pdf'] },
  { id: 5, name: 'reader_no_download', capabilities: ['view', 'comment'] },
]

/**
 * Forty of them — F29's own number. Forty 49px radio rows was ~1960px of
 * supervisor picker stacked *under* the 1300px scope fieldset, in the same
 * scrolling box. The popover's `--height-popover` cap is what makes the count
 * stop mattering, and a fixture of two would never show it.
 */
const CANDIDATES: SupervisorCandidate[] = Array.from({ length: 40 }, (_, i) => ({
  id: 100 + i,
  username: `0912${String(1000000 + i)}`.slice(0, 11),
  displayName: `سرپرست شمارهٔ ${i + 1}`,
  scopes: ['*'],
  canSupervise: true,
}))

/** The viewer must be able to administer users, or `/users` renders the refusal
 *  surface and every locator below times out on a screen that is not there. */
const VIEWER = {
  username: '09120000000', displayName: 'ویدا مهرآیین', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'],
}

test('new user — 520 wide, and it fits', async ({ page }) => {
  await signedIn(page, VIEWER)
  await serve(page, {
    '/api/users': USERS,
    '/api/departments': DEPARTMENTS,
    // `PanelShell` asks for this whenever the session holds `edit`.
    '/api/pending': [],
    // The dialog's own three reads. Unstubbed, `shot`'s own
    // `expectEveryEndpointStubbed` fails the spec by pathname rather than
    // letting the FastAPI container on :8000 answer them.
    '/api/roles': ROLES,
    '/api/users/supervisor-candidates': CANDIDATES,
  })
  await visit(page, '/users')
  await page.getByRole('button', { name: 'کاربر جدید' }).click()
  const box = page.getByRole('dialog', { name: 'کاربر جدید' })
  await expect(box).toBeVisible()

  // No `expectDesign(page, 'new-user')`: a dialog is not a `[data-screen]`
  // region — no field, no screen padding, no `[data-col]`, no `[data-h1]`, no
  // `[data-body]` — so it has no row in `DESIGN` and is not getting one. Its
  // numbers are asserted here, which is where they belong.
  const width = page.viewportSize()!.width
  if (width > 760) {
    await expect(box).toHaveCSS('width', '520px')
    await expect(box).toHaveCSS('border-radius', '24px')     // ledger L-04
    await expect(box).toHaveCSS('padding', '26px')
  } else {
    // §5.2 — at ≤760px every modal becomes a bottom sheet.
    await expect(box).toHaveCSS('border-radius', '20px 20px 0px 0px')
    await expect(box).toHaveCSS('width', `${width}px`)
  }
  // S1's two-layer dialog shadow (§5.2, ledger L-04), at every width — read
  // through `shadowOf`, which is the only way this can be asserted.
  //
  // Tailwind 3 composes every shadow utility as
  // `var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)`, so
  // Chrome serialises TWO fully transparent ring layers ahead of the design's
  // two: the raw computed value here is `rgba(0, 0, 0, 0) 0px 0px 0px 0px,
  // rgba(0, 0, 0, 0) 0px 0px 0px 0px, <the two below>`. A raw `toHaveCSS` can
  // therefore never pass, and the repair `_harness.ts` names in as many words —
  // "do not repair a red by pasting what the browser printed" — is not to write
  // the ring scaffolding into the expectation but to drop the layers that paint
  // nothing. `harness.spec.ts:347` holds both halves of that: the real class
  // passes through `shadowOf`, and the raw string does not equal the constant.
  await expect
    .poll(async () => shadowOf(await box.evaluate((el) => getComputedStyle(el).boxShadow)))
    .toBe('rgba(16, 10, 40, 0.28) 0px 4px 10px 0px, rgba(16, 10, 40, 0.8) 0px 44px 90px -30px')

  // **The finding this whole task exists for**: 2207px of content in an 850px
  // box, with «ساخت کاربر» below the fold. Nine departments are on screen and
  // forty candidates are one popover away, and the body still scrolls less than
  // twice its own height.
  const body = box.getByTestId('dialog-body')
  const { scroll, client } = await body.evaluate((el) =>
    ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(scroll).toBeLessThan(client * 2)

  // The header and the footer are OUTSIDE that scroll box, which is what makes
  // the claim above about the form rather than about the dialog.
  await expect(body).toHaveCSS('flex', '1 1 0%')
  await expect(body).toHaveCSS('overflow', 'auto')

  // …and the footer is on screen without scrolling, at every width.
  const footer = box.getByTestId('dialog-footer')
  await expect(footer.getByRole('button', { name: 'ایجاد کاربر' })).toBeInViewport()
  await expect(box.getByRole('heading', { name: 'کاربر جدید' })).toBeInViewport()

  // §5.2's footer is "two `flex:1` buttons", and that is asserted as the
  // DECLARATION plus a bound on what `flex:1` can still leave unequal.
  //
  // Not `Math.abs(a - b) < 2`, which is what stood here and which nothing in
  // this product could have satisfied. The two differ by exactly 2px at all
  // three widths — measured 227 / 229 in a 466px footer — and the 2px is not
  // sub-pixel rounding, it is the ghost's own edge: `flex-basis:0` under
  // `box-sizing:border-box` floors each item's flex BASE size at its own
  // padding + border, so the free space is divided equally and the secondary
  // keeps its `1.5px --line` border ON TOP of its half. The deliverable draws
  // the same pair the same way — `Inja Panel.dc.html:1934-1935`, `flex:1;
  // border:0` beside `flex:1; border:1.5px solid #E3D8F5` — where content-box
  // widens the difference to 3px rather than narrowing it. So «equal» is
  // `flex:1`; the residual is the border one of them wears, and asserting it
  // away would be asking the screen to be something the design is not.
  const create = footer.getByRole('button', { name: 'ایجاد کاربر' })
  const cancel = footer.getByRole('button', { name: 'انصراف' })
  await expect(create).toHaveCSS('flex', '1 1 0%')
  await expect(cancel).toHaveCSS('flex', '1 1 0%')
  const [createBox, cancelBox, edge] = await Promise.all([
    create.boundingBox(),
    cancel.boundingBox(),
    // Read off the element rather than written as `2`: the bound is the ghost's
    // border, so a padding or a width that drifted for any OTHER reason is
    // still a failure here.
    cancel.evaluate((el) => {
      const cs = getComputedStyle(el)
      return parseFloat(cs.borderInlineStartWidth) + parseFloat(cs.borderInlineEndWidth)
    }),
  ])
  expect(Math.abs(createBox!.width - cancelBox!.width)).toBeLessThanOrEqual(edge)
  // …and it is the BORDERED one that is wider, which is what says the residual
  // is that border and not something squeezing the primary.
  expect(cancelBox!.width).toBeGreaterThanOrEqual(createBox!.width)

  // F36 — the ghost cancel was white on white. §5.2's sheet keeps it white and
  // the section cards tint, so the contrast comes from the surface behind it.
  await expect(box.getByRole('group', { name: 'هویت و ورود' }))
    .toHaveCSS('background-color', SUBPANEL_SURFACE)
  await expect(box.getByRole('group', { name: 'جایگاه در سازمان' }))
    .toHaveCSS('background-color', SUBPANEL_SURFACE)

  // §6.8's grid, which is what replaced the 28 stacked rows: two columns above
  // the breakpoint, one below it, and nine tiles either way.
  const grid = box.getByRole('group', { name: 'دپارتمان' })
  expect(await grid.getByRole('checkbox').count()).toBe(9)
  const tracks = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
  expect(tracks.split(' ')).toHaveLength(width > 760 ? 2 : 1)

  // §5.2 TextField — the design's hairline edge, and coral on focus.
  const name = box.getByLabel('نام و نام خانوادگی')

  // The width is compared against the design's own `--border-hairline` and not
  // against the literal `1.5px`, which is a value NO element can report in this
  // browser. `getComputedStyle` hands back the USED border width, and a used
  // border is snapped to whole device pixels: measured here at
  // `devicePixelRatio: 1`, a `<div style="border:1.5px solid red">` reports
  // `border-top-width: 1px` while its own `style.borderTopWidth` still reads
  // `1.5px`. `toHaveCSS('border-width', '1.5px')` — which is what stood here —
  // could therefore not have passed on any element at all, hairline or not.
  //
  // The DECLARATION is graded where it is legible: `src/ui/fields.test.tsx`
  // ("rests on the control border and turns coral on focus, on every shape a
  // field takes") compiles the field's class string through the real theme and
  // asserts `border-width: var(--border-hairline)` on the input, the password
  // input and the textarea. What is graded here is the half only a browser can
  // see — that this field's edge is the one the design's hairline resolves to,
  // and that it is drawn at all rather than collapsed to nothing.
  const hairline = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'border-style:solid;border-width:var(--border-hairline)'
    document.body.appendChild(probe)
    const used = getComputedStyle(probe).borderTopWidth
    probe.remove()
    return used
  })
  expect(parseFloat(hairline)).toBeGreaterThan(0)
  await expect(name).toHaveCSS('border-width', hairline)

  await name.focus()
  await expect(name).toHaveCSS('border-color', FOCUS)

  // §5.2 Dropdown — forty candidates behind a scroll cap, not forty rows in the
  // dialog. This is the assertion F29 is about, and jsdom can make no part of it.
  await box.getByRole('button', { name: /^سرپرست/ }).click()
  const popover = page.locator('[data-popover]')
  await expect(popover).toBeVisible()
  const capped = await popover.evaluate((el) =>
    ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(capped.client).toBeLessThanOrEqual(280)          // --height-popover
  expect(capped.scroll).toBeGreaterThan(capped.client)    // …and it really is capped
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()

  await shot(page, 'new-user')
})
