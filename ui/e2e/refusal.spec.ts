import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import { FIELD, expandPadding, serve, shot, signedIn } from './_harness'

/**
 * Typed as the endpoint's own response type, for the reason
 * `departments.spec.ts` states: a renamed field is then a `tsc -b` error here
 * rather than a screen rendering `undefined` under a check that still passes.
 */
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
  { code: 'warehouse', name: 'انبار', count: 5, subs: 2, conflicts: 0 },
]

/** A department this session holds no scope for, and which is not in the list. */
const OUT_OF_SCOPE = 'logistics'

/**
 * **An editor scoped to two departments — not the reader the task brief asked
 * for**, and the difference is what makes half 2 of this spec mean anything.
 *
 * `selectShell` puts anyone without a panel capability into `ReaderShell`, and
 * `ReaderShell` draws no «مدیریت» popover at all: against a `capabilities:
 * ['view']` session the brief's two assertions — that «کاربران» and the
 * visibility entry are absent from the chrome — pass because the chrome that
 * could have drawn them was never on the page. (They passed twice over: the
 * panel's entry is labelled «سیاست نمایش محتوا», and `getByRole(name)` matches
 * the accessible name whole, so «نمایش محتوا» matched nothing either way.)
 *
 * This session gets `PanelShell`, which DOES draw the popover, and is refused
 * both entries in it:
 *   · «کاربران» — `administrationRefusal` returns **404**, not 403, because the
 *     scopes hold no `*` and D56 checks scope BEFORE capability. User
 *     administration is not scoped to a department (D11), so a department-scoped
 *     holder may not learn the surface is there.
 *   · «سیاست نمایش محتوا» — `useCan('set_visibility', '*')` is false, so the
 *     entry is absent rather than drawn and then refused on the click.
 * and «پروفایل و گذرواژه», which is ungated, is the positive control that says
 * the popover was open and was actually scanned.
 */
const SCOPED_EDITOR = {
  username: '09120000002', displayName: 'ویراستار پخت', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'],
  scopes: ['dept:cooking', 'dept:warehouse'],
}

test('refusal — reachable by typing, and only by typing', async ({ page }) => {
  await signedIn(page, SCOPED_EDITOR)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  // The 404 itself. `serve()` fulfils every fixture with a 200, so the one
  // answer this whole spec is about cannot come from it; the handler below is
  // registered after `serve` and therefore wins (Playwright tries handlers in
  // reverse registration order). Left unstubbed instead, the request would be
  // ABORTED — a network error, which `refusalStatus` maps to nothing at all,
  // so the screen would draw a failed read and this spec would grade the wrong
  // surface while looking green on its first assertion.
  await page.route(
    (url) => url.pathname === `/api/departments/${OUT_OF_SCOPE}/processes`,
    (route) => route.fulfill({
      status: 404, contentType: 'application/json',
      body: JSON.stringify({ detail: 'NOT_FOUND' }),
    }),
  )
  const w = page.viewportSize()!.width

  // Half 1: a typed URL for something out of scope answers 404, and says so
  // without confirming that anything is there.
  await page.goto(`/departments/${OUT_OF_SCOPE}`)
  await expect(page.getByText('چیزی اینجا نیست')).toBeVisible()
  await expect(page.getByText('اجازهٔ این کار را ندارید')).toHaveCount(0)
  // …and it does not echo what it was asked for. The server's own `detail` and
  // the department code are both on the wire and neither may reach the page:
  // printing either turns a uniform refusal into a confirmation that the name
  // was understood.
  await expect(page.locator('[data-screen="refusal"]')).not.toContainText(OUT_OF_SCOPE)
  await expect(page.locator('[data-screen="refusal"]')).not.toContainText('NOT_FOUND')

  // There is no `expectDesign(page, 'refusal')`: this screen has no `DESIGN`
  // row and is not getting one — `ScreenDesign` requires `h1` and `body`, and
  // the refusal has neither (its content is a `<p>` inside a `Card`, with no
  // heading at all). Step 13, finding F4. What *is* settled is asserted here.
  const screen = page.locator('[data-screen]')
  expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(FIELD)
  const col = page.locator('[data-col]')
  expect(await col.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('920px')  // ledger P3-6
  const pad = expandPadding(await screen.evaluate((el) => getComputedStyle(el).padding))
  expect([pad.top, pad.left]).toEqual(w > 760 ? ['30px', '40px'] : ['18px', '14px'])

  // Half 1, the other status: a refused act on a screen the reader can see.
  await page.goto('/visibility')
  await expect(page.getByText('اجازهٔ این کار را ندارید')).toBeVisible()
  await expect(page.getByText('چیزی اینجا نیست')).toHaveCount(0)

  // Half 2: nothing in the chrome offers a screen that would refuse them.
  //
  // The entries are behind a control at every width, so that control has to be
  // OPEN before their absence means anything — closed, all three are absent and
  // every assertion below passes over an empty page. «پروفایل و گذرواژه» is the
  // positive control: it is ungated, it is in the same list, and it proves the
  // list was rendered and read.
  //
  // WHICH control depends on the width, and this is the one part of these two
  // screens that does. `PanelShell` writes `max1080:hidden` on the nav tray
  // that holds the «مدیریت» popover and `hidden max1080:flex` on the «فهرست»
  // opener beside it, so at 1080 and 760 the popover's button is `display:none`
  // — not in the accessibility tree, not clickable — and the same `adminItems`
  // list is drawn inside the sheet instead.
  await page.goto('/departments')
  if (w > 1080) {
    await page.getByRole('button', { name: 'مدیریت' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
  } else {
    await page.getByRole('button', { name: 'فهرست' }).click()
    await expect(page.getByRole('dialog', { name: 'فهرست' })).toBeVisible()
  }
  await expect(page.locator('a[href="/profile"]')).toHaveCount(1)
  await expect(page.locator('a[href="/users"]')).toHaveCount(0)
  await expect(page.locator('a[href="/visibility"]')).toHaveCount(0)
  // The same claim by name, because an href is not what a person reads. Asked
  // of the whole page, not of the menu: an entry moved into the nav tray or the
  // mobile sheet is still an entry.
  await expect(page.getByRole('link', { name: 'پروفایل و گذرواژه' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'کاربران' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'سیاست نمایش محتوا' })).toHaveCount(0)

  // …and the refusal itself offers nothing onward.
  await page.goto(`/departments/${OUT_OF_SCOPE}`)
  const main = page.locator('main')
  await expect(main).toBeVisible()
  await expect(main.locator('[data-screen="refusal"]')).toBeVisible()
  await expect(main.locator('a, button')).toHaveCount(0)

  // `shot` appends the viewport width itself — see the note in sign-in.spec.ts.
  await shot(page, 'refusal')
})
