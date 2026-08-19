import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import type { AdminUser, Role, SupervisorCandidate } from '../src/api/users'
import { FOCUS, SUBPANEL_SURFACE, serve, shot, signedIn, visit } from './_harness'

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
  // S1's two-layer dialog shadow, at every width.
  await expect(box).toHaveCSS(
    'box-shadow',
    'rgba(16, 10, 40, 0.28) 0px 4px 10px 0px, rgba(16, 10, 40, 0.8) 0px 44px 90px -30px',
  )

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
  const [create, cancel] = await Promise.all([
    footer.getByRole('button', { name: 'ایجاد کاربر' }).boundingBox(),
    footer.getByRole('button', { name: 'انصراف' }).boundingBox(),
  ])
  expect(Math.abs(create!.width - cancel!.width)).toBeLessThan(2)

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

  // §5.2 TextField — 1.5px --line, focus turns it coral, no ring.
  const name = box.getByLabel('نام و نام خانوادگی')
  await expect(name).toHaveCSS('border-width', '1.5px')
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
