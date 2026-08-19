import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import type { AdminUser } from '../src/api/users'
import {
  CARD_BORDER, FIELD, SURFACE, TITLE_ON_FIELD,
  expandPadding, serve, shot, signedIn, trackCount, visit,
} from './_harness'

/**
 * Typed as the endpoints' own response types, not untyped literals: a change to
 * `AdminUser` or `Department` — a renamed field, a widened union — is then a
 * `tsc -b` error here rather than a screen rendering `undefined` in a check
 * that still passes because nothing it measures reads the payload.
 */
const DEPARTMENTS: Department[] = [
  { code: 'cashier', name: 'صندوق', count: 2, subs: 0, conflicts: 0 },
  { code: 'dining', name: 'سالن', count: 4, subs: 1, conflicts: 0 },
]

/**
 * Two accounts that differ in every column §6.7 draws.
 *
 * Sahar is active, an Admin, supervised by somebody who can still sign in, and
 * scoped to «صندوق» — which is the department name the ≤760 pass asserts is
 * gone, so it has to be a name that is on screen at 1440 and nowhere else. Nader
 * is disabled, a Reader, and his supervisor is disabled too, which is the only
 * fixture that puts `--conflict` in the supervisor column.
 */
const SAHAR: AdminUser = {
  id: 7, username: '09121111111', displayName: 'سحر بیات',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'manage_users'],
  scopes: ['dept:cashier'],
  supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: false },
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

const NADER: AdminUser = {
  id: 8, username: '09122222222', displayName: 'نادر قاسمی',
  roleId: 4, role: 'reader', capabilities: ['view'],
  scopes: ['dept:dining'],
  supervisor: { id: 22, username: '09124444444', displayName: 'بابک آرام', disabled: true },
  canSupervise: true, disabled: true, createdAt: 1600000000,
}

const USERS: AdminUser[] = [SAHAR, NADER]

/**
 * The viewer. **`signedIn`'s default session is not enough and the failure
 * looks like a broken screen rather than a wrong fixture**: it holds `edit` and
 * `confirm` but not `manage_users`, so `administrationRefusal` answers 403 and
 * this route renders the refusal surface — a page with no `[data-screen]` on it
 * at all, which every locator below then times out on.
 */
const VIEWER = {
  username: '09120000000', displayName: 'ویدا مهرآیین', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'],
}

test('users — six columns on the violet field, at three widths', async ({ page }) => {
  // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
  // /api/ request leaves the browser and is answered by the FastAPI container
  // on :8000, and `shot`'s own `expectEveryEndpointStubbed` fails the spec for
  // it. The session must be able to administer users, or this screen refuses.
  await signedIn(page, VIEWER)
  await serve(page, {
    '/api/users': USERS,
    // Read by `UsersBody`, which is where the department column's «صندوق» and
    // the department filter's options come from.
    '/api/departments': DEPARTMENTS,
    // `PanelShell` asks for this whenever the session holds `edit`.
    '/api/pending': [],
  })
  await visit(page, '/users')

  const width = page.viewportSize()!.width

  // There is no `expectDesign(page, 'users')`: this screen has no `DESIGN` row
  // and is not getting one — it draws no second line, so there is no
  // `[data-body]` to grade and `ScreenDesign.body` is required (Step 20 of the
  // plan, and `_harness.ts`'s own note at the head of the table). Its settled
  // numbers are asserted here instead, against the harness's own constants so a
  // re-cut token moves both at once.
  const screen = page.locator('[data-screen="users"]')
  expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(FIELD)
  const pad = expandPadding(await screen.evaluate((el) => getComputedStyle(el).padding))
  expect([pad.top, pad.left]).toEqual(width > 760 ? ['30px', '40px'] : ['18px', '14px'])

  // `> [data-col]`, and the child combinator is load-bearing: `DataTable` writes
  // `data-col="<key>"` on all six cells of every row, so a bare `[data-col]`
  // matches thirteen elements here and resolves strict mode against a table
  // cell. The screen's column is the one that is a direct child of the screen.
  const col = page.locator('[data-screen="users"] > [data-col]')
  expect(await col.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('920px')

  const h1 = page.locator('[data-h1]')
  await expect(h1).toHaveCSS('font-size', '22px')          // L-02
  await expect(h1).toHaveCSS('font-weight', '800')
  await expect(h1).toHaveCSS('color', TITLE_ON_FIELD)      // L-01 — white, not --warm

  const shell = page.locator('[data-r-tshell]').first()
  await expect(shell).toHaveCSS('border-radius', '18px')
  await expect(shell).toHaveCSS('border-color', CARD_BORDER)
  await expect(shell).toHaveCSS('background-color', SURFACE)

  const head = page.locator('[data-r-thead]')
  const row = page.getByRole('row').filter({ hasText: 'سحر بیات' })

  /* ---- the filter card: a detached card above the table (L-11) ---- */
  const filters = page.getByRole('group', { name: 'فیلتر کاربران' })
  await expect(filters).toHaveCSS('background-color', 'rgb(244, 239, 251)')   // --tile-v2
  await expect(filters).toHaveCSS('border-top-color', 'rgb(233, 224, 247)')   // --line-filter
  await expect(filters).toHaveCSS('border-radius', '14px')

  if (width > 760) {
    // §6.7 — the exact template, not "six of something". The rails are fixed
    // lengths and survive into the used value; the four `fr` tracks resolve to
    // px, so they are counted rather than matched.
    const tracks = await head.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(tracks).toMatch(/^16px .+ 34px$/)
    expect(trackCount(tracks)).toBe(6)
    // …and the row is laid on the SAME six, which is the whole promise of a
    // minted template: a head and a body that cannot drift apart (R11).
    const rowTracks = await row.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(rowTracks).toBe(tracks)
    await expect(head).toBeVisible()
    // L-11 — `#F8F4FE` is the one colour any table head paints, and the design
    // paints this one with it (`Inja Panel.dc.html:1250`). The plan's own text
    // called this "the one table head with no fill"; the deliverable disagrees
    // and the deliverable wins (R1).
    await expect(head).toHaveCSS('background-color', 'rgb(248, 244, 254)')
    await expect(head.getByText('دپارتمان')).toHaveCSS('font-size', '11.5px')
    await expect(head.getByText('دپارتمان')).toHaveCSS('color', 'rgb(138, 125, 176)')
    // The department column is drawn, and drawn in Persian: `dept:cashier` is a
    // storage key and nobody reads it.
    await expect(row.getByText('صندوق')).toBeVisible()
    await expect(row).not.toContainText('dept:')
  } else {
    // ≤760px: the head goes and the row becomes a flex line at 14px padding,
    // dropping the department and supervisor columns.
    await expect(head).toBeHidden()
    await expect(row).toHaveCSS('display', 'flex')
    await expect(row).toHaveCSS('padding', '14px')
    // Hidden, not absent — and `toBeHidden()` alone does not say that.
    // Playwright's own types: it *"Ensures that Locator **either does not
    // resolve to any DOM node**, or resolves to a non-visible one"*, so count 0
    // satisfies it — exactly the case this comment claims to guard against, and
    // exactly what a screen that dropped the column at ≤760 would produce. The
    // honest pair is both halves: the cell is in the DOM, and it is not painted.
    for (const text of ['صندوق', 'مریم رستمی']) {
      await expect(row.getByText(text), text).toHaveCount(1)
      await expect(row.getByText(text), text).toBeHidden()
    }
    // …and the two that stay, stay.
    await expect(row.getByText('سحر بیات')).toBeVisible()
    await expect(row.getByText('مدیر')).toBeVisible()
  }

  /* ---- the row's own paint, at every width ---- */
  // §5.2 gives coral to the new/primary-forward control; the design draws this
  // button `#FA5A52`.
  await expect(page.getByRole('button', { name: 'کاربر جدید' }))
    .toHaveCSS('background-color', 'rgb(250, 90, 82)')
  await expect(page.getByTestId('state-dot').first()).toHaveCSS('width', '9px')
  await expect(page.getByTestId('state-dot').first()).toHaveCSS('height', '9px')
  // The dot is the state, so the two states are two colours — and asserted on
  // both rows, because one colour alone passes for a screen that paints every
  // dot the same.
  await expect(page.locator('[data-state="active"]').first())
    .toHaveCSS('background-color', 'rgb(31, 138, 91)')      // --green
  await expect(page.locator('[data-state="disabled"]').first())
    .toHaveCSS('background-color', 'rgb(226, 61, 53)')      // --conflict

  // §1.2's role pill — the design declares both halves of the pair
  // (`roleBg`/`roleFg`) and paints only the foreground; F52 is why the fill is
  // drawn. Two roles, because one asserted alone passes for a screen that gives
  // every role the same tone.
  const admin = row.getByText('مدیر')
  await expect(admin).toHaveCSS('color', 'rgb(74, 37, 169)')            // --violet
  await expect(admin).toHaveCSS('background-color', 'rgb(240, 233, 251)')  // --tile-v
  const reader = page.getByRole('row').filter({ hasText: 'نادر قاسمی' }).getByText('خواننده')
  await expect(reader).toHaveCSS('background-color', 'rgb(244, 239, 251)') // --tile-v2

  // D14 — a supervisor who can no longer sign in is the whole warning this
  // column carries, and it is a colour the other row must not have.
  const gone = page.getByRole('row').filter({ hasText: 'نادر قاسمی' }).getByText('بابک آرام')
  await expect(gone).toHaveCSS('color', 'rgb(226, 61, 53)')              // --conflict
  await expect(row.getByText('مریم رستمی')).toHaveCSS('color', 'rgb(90, 81, 117)') // --text-current

  /* ---- the hover, and the duration the ledger chose for it ---- */
  // The row lifts nothing and tints instead (§4.6: `background:#FBF9FE`).
  // L-18 — the design writes `.14s` on this one row transition and `.16s`
  // everywhere else; `.14s` is a token nowhere, so the hover runs at
  // `--duration`.
  await expect(row).toHaveCSS('transition-duration', '0.16s')
  await row.hover()
  await expect(row).toHaveCSS('background-color', 'rgb(251, 249, 254)')   // --surface-sub

  /* ---- L-06 and L-43, which need a filter to be set ---- */
  const status = filters.getByRole('button', { name: /وضعیت/ })
  await status.click()
  // L-43 — one popover rung for every anchored menu in the product. The Users
  // filter's own `z-index:37` is gone with the six other values it sat among.
  await expect(page.locator('[data-popover]')).toHaveCSS('z-index', '1000')
  await page.getByRole('option', { name: 'غیرفعال' }).click()
  const clear = filters.getByRole('button', { name: 'پاک کردن فیلترها' })
  // L-06 — `--violet-mid`, not `--conflict`: clearing a filter destroys nothing.
  await expect(clear).toHaveCSS('color', 'rgb(122, 82, 208)')
  // F11 — the smallest interactive box, on a 12.5px text link.
  expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // R5 — the link goes when there is nothing left for it to clear, rather than
  // staying on screen disabled.
  await clear.click()
  await expect(filters.getByRole('button', { name: 'پاک کردن فیلترها' })).toHaveCount(0)

  await shot(page, 'users')
})
