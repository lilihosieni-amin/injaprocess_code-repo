import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import type { AdminUser } from '../src/api/users'
import {
  CARD_BORDER, CARD_SHADOW, SUBPANEL_BORDER, SURFACE,
  expectDesign, serve, shadowOf, shot, signedIn, visit,
} from './_harness'

/**
 * Typed as the endpoints' own response types, not untyped literals: a change to
 * `AdminUser` or `Department` — a renamed field, a widened union — is then a
 * `tsc -b` error here rather than a screen rendering `undefined` in a check
 * that still passes because nothing it measures reads the payload.
 */
const DEPARTMENTS: Department[] = [
  { code: 'dining', name: 'سالن', count: 4, subs: 1, conflicts: 0 },
  { code: 'cashier', name: 'صندوق', count: 2, subs: 0, conflicts: 0 },
]

/**
 * The account on screen. Two scopes at two different shapes — a whole
 * department and one report of another — because §6.8 draws one chip per scope
 * and `scopes[0]` renders the single-scope majority perfectly.
 */
const SAHAR: AdminUser = {
  id: 2, username: '09121111111', displayName: 'سحر بیات',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'manage_users'],
  scopes: ['dept:dining', 'dept:cashier/report:steps'],
  supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: true },
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

/**
 * The viewer. **`signedIn`'s default session is not enough and the failure is
 * silent-looking**: it holds `edit` and `confirm` but not `manage_users`, so
 * `administrationRefusal` answers 403 and this route renders the refusal
 * surface — a page with no `[data-screen="access"]` on it at all, which
 * `visit()` then times out waiting for. `manage_peers` is needed as well: the
 * subset rule is strict without it, and the target above holds exactly what an
 * Admin holds, so the three manage panels would be absent by R5 and the four
 * panels below would be two.
 */
const VIEWER = {
  username: '09120000000', displayName: 'ویدا مهرآیین', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'],
}

test('access — four panels at 820, and no glyph arrows', async ({ page }) => {
  // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
  // /api/ request leaves the browser and is answered by the FastAPI container
  // on :8000, and `expectDesign` fails the spec for it.
  await signedIn(page, VIEWER)
  await serve(page, {
    // The record itself. `/api/users` (the LIST) is not read by this screen.
    '/api/users/2': SAHAR,
    // Read twice: by `PanelShell`'s nav and by §6.8 panel 1, which needs it to
    // print «سالن» where the row stores `dept:dining`.
    '/api/departments': DEPARTMENTS,
    // `PanelShell` asks for this whenever the session holds `edit`.
    '/api/pending': [],
  })
  await visit(page, '/users/2', 'access')
  await expectDesign(page, 'access')

  const w = page.viewportSize()!.width

  /* ---- the way back ---- */
  const back = page.getByRole('link', { name: 'فهرست کاربران' })
  const box = (await back.boundingBox())!
  // F11 — the smallest interactive box. It was a 17px-tall text link.
  expect(box.height, 'the back link is under the 44px touch floor').toBeGreaterThanOrEqual(44)
  const chevron = back.locator('svg')
  await expect(chevron).toBeVisible()
  // §5.2 bans unicode-glyph icons, and §8 fixes which way this one points: in a
  // right-to-left reading, what you came from lies to the RIGHT. Asserted on
  // the drawn path rather than on the icon's name, because a name is not a
  // picture — `chevronEnd` would render, would look deliberate, and would point
  // at the screen this link does not go to.
  await expect(chevron.locator('path')).toHaveAttribute('d', 'M9 18l6-6-6-6')
  await expect(back).not.toContainText('←')

  /* ---- the four panels, in the design's order ---- */
  const groups = page.getByRole('group')
  await expect(groups).toHaveCount(4)
  await expect(groups).toHaveText([
    /نقش و دپارتمان/, /سرپرست/, /گذرواژه/, /غیرفعال‌سازی کاربر/,
  ])

  /* ---- §6.8's three panel skins, which are three and not one ---- */
  // Panels 1 and 2: white on the sub-panel edge, and FLAT. The card shadow here
  // is the single value that would make them read as cards on the field rather
  // than as sub-panels in a column, and no length, colour or radius moves with
  // it — which is why it is asserted rather than assumed.
  for (const label of ['نقش و دپارتمان', 'سرپرست']) {
    const panel = page.getByRole('group', { name: label })
    await expect(panel).toHaveCSS('background-color', SURFACE)
    await expect(panel).toHaveCSS('border-top-color', SUBPANEL_BORDER)
    await expect(panel).toHaveCSS('border-top-width', '1px')
    await expect(panel).toHaveCSS('border-radius', '16px')
    expect(shadowOf(await panel.evaluate((el) => getComputedStyle(el).boxShadow)),
      `${label} is drawn as a card on the field, not as a sub-panel`).toBe('none')
  }
  // Panel 3 is the card recipe proper — a different edge AND the shadow.
  const password = page.getByRole('group', { name: 'گذرواژه' })
  await expect(password).toHaveCSS('border-top-color', CARD_BORDER)
  expect(shadowOf(await password.evaluate((el) => getComputedStyle(el).boxShadow)))
    .toBe(CARD_SHADOW)

  /* ---- the scope chips ---- */
  // The department's NAME. `dept:dining` is a storage key; nobody reads it.
  const panel1 = page.getByRole('group', { name: 'نقش و دپارتمان' })
  await expect(panel1).not.toContainText('dept:')
  const scope = panel1.getByText('سالن', { exact: true })
  await expect(scope).toHaveCSS('font-size', '12.5px')
  await expect(scope).toHaveCSS('font-weight', '600')
  await expect(scope).toHaveCSS('background-color', 'rgb(244, 239, 251)')
  await expect(scope).toHaveCSS('border-radius', '10px')
  await expect(scope).toHaveCSS('border-top-color', 'rgb(227, 216, 245)')
  // The edge's WIDTH is not asserted here and cannot be: §5.2 draws it at
  // `--border-hairline` 1.5px, and Chrome's `getComputedStyle` returns the USED
  // border-width, floored to whole device pixels — 1px at DPR 1, whatever the
  // stylesheet says. Repairing that red by writing `1px` into this file would
  // enshrine the browser's rounding as the design's number. The 1.5 is held one
  // layer down instead, against the compiled rule, in
  // `users.test.tsx`'s «paints §5.2's scope chip».
  // The report-scoped one is a scope in its own right and is drawn as one, so a
  // head of one department and one report is not shown as reaching both whole.
  await expect(panel1.getByText('صندوق (فقط راهنمای گام‌به‌گام)')).toBeVisible()

  /* ---- the boundary ---- */
  const danger = page.getByRole('group', { name: 'غیرفعال‌سازی کاربر' })
  await expect(danger).toHaveCSS('border-top-color', 'rgb(253, 217, 214)')
  const disable = danger.getByRole('button')
  await expect(disable).toHaveCSS('color', 'rgb(226, 61, 53)')
  await expect(disable).toHaveCSS('background-color', 'rgb(255, 243, 242)')

  /* ---- the one thing that goes at ≤760 ---- */
  // §6.8 draws a `1px --warm` rule between the role chip and the scope chips —
  // the only mark on the panel that says "these are two different kinds of
  // fact" — and hides it on the mobile pass, where the chips wrap and a
  // vertical rule between two wrapped rows says nothing.
  const rule = panel1.locator('[aria-hidden]')
  await expect(rule).toHaveCount(1)
  if (w <= 760) await expect(rule).toBeHidden()
  else {
    await expect(rule).toBeVisible()
    await expect(rule).toHaveCSS('background-color', 'rgb(239, 231, 220)')
  }

  await shot(page, 'user-detail')
})

test('access — R5: a viewer who may not act is shown nothing, not told', async ({ page }) => {
  // The same account and the same screen, read by somebody the subset rule
  // refuses: this viewer holds `manage_users` without `manage_peers`, and the
  // target holds exactly what they hold, so every write from here would come
  // back NOT_A_SUBSET.
  //
  // In a browser rather than only in jsdom because "absent" is a claim about
  // what is on screen: a control moved off-viewport, painted at `opacity:0` or
  // covered by another element is absent to no one, and `queryByRole` cannot
  // tell the difference. `toBeVisible` can.
  await signedIn(page, {
    ...VIEWER,
    capabilities: ['view', 'comment', 'export_pdf', 'manage_users'],
  })
  await serve(page, {
    '/api/users/2': { ...SAHAR, capabilities: ['view', 'comment', 'export_pdf', 'manage_users'] },
    '/api/departments': DEPARTMENTS,
    '/api/pending': [],
  })
  await visit(page, '/users/2', 'access')

  // Two panels, not four, and nothing where the other two were.
  await expect(page.getByRole('group')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'ویرایش' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'تغییر سرپرست' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /غیرفعال‌سازی/ })).toHaveCount(0)
  // R5 — where a control's availability depends on the TARGET rather than the
  // caller, it is still absent rather than explained.
  await expect(page.getByText(/دسترسی این حساب/)).toHaveCount(0)
  await expect(page.getByText(/حساب خودتان/)).toHaveCount(0)

  // …and the record itself is still readable, which is the other half of the
  // rule: this surface is `*`-gated, so everybody who reaches it may see
  // everybody. A screen that hid the account as well would be answering a 404
  // the server does not.
  await expect(page.getByRole('heading', { name: 'سحر بیات' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'نقش و دپارتمان' })).toBeVisible()

  await shot(page, 'user-detail-readonly')
})
