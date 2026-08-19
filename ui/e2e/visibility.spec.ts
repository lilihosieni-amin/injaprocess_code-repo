import { test, expect } from '@playwright/test'
import type { Department } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

/**
 * Task 23 — the visibility policy, `Inja Panel.dc.html:1756` (§6.12). Six rows
 * on one card, and a word on the left that fills the 55–60% of a row F5 left
 * blank.
 *
 * Typed as the endpoints' own response types, not untyped literals: a renamed
 * field or a widened union is then a `tsc -b` error here, instead of a screen
 * rendering `undefined` inside a check that still passes because nothing it
 * measures reads the payload.
 */
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
]

/** process_summary OFF, node_actor ON — so the first drawn row («خلاصهٔ
 *  فرآیند») is the unchecked tick this spec measures, and «مسئول فعالیت» is a
 *  hairline-bordered row with the ON state word to hover. */
const POLICY = {
  fields: {
    process_summary: false, process_idef0: false, process_kpis: false,
    node_description: true, node_actor: true, node_icom: false,
  },
  version: '0123456789abcdef',
}

/**
 * `signedIn`'s own default session (`_harness.ts`'s `EDITOR`) holds `edit` and
 * `confirm` but not `set_visibility` — every other spec's fixture is fine with
 * that and this one is not: `set_visibility` at `*` is what `Visibility.tsx`
 * gates the whole screen on (D16 — one global policy, so the endpoints refuse
 * anyone scoped to less than every department). Left at the default, the
 * screen never gets past `<RefusalScreen status={403} />` and every locator
 * below times out on a page with no `[data-screen]` on it at all.
 */
test('policy — one card, 19px ticks, a word on the left', async ({ page }) => {
  // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
  // /api/ request leaves the browser and is answered by the FastAPI container
  // on :8000, and `expectDesign` fails the spec for it.
  await signedIn(page, {
    capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm', 'set_visibility'],
  })
  await serve(page, { '/api/visibility': POLICY, '/api/departments': DEPARTMENTS, '/api/pending': [] })
  await visit(page, '/visibility', 'policy')
  await expectDesign(page, 'policy')

  // One card, not six (or seven).
  await expect(page.getByRole('group', { name: 'سیاست نمایش محتوا' })).toHaveCount(1)

  // §6.12 draws a 19×19 tick. Ledger **L-09** — the unchecked tick border is
  // the DOMINANT value (`--border-pick`, `#C9B8EC`, 13+11 other uses), not the
  // policy row's own one-off `#DCD3EC` variant, which is what the deliverable
  // actually drew here. `TickBox` (Task 8) paints every unchecked tick in the
  // app from the one token, and this row is not a second exception to it.
  //
  // 19 is the `row` rung under owner ruling R36, which kept all four of the
  // design's tick sizes rather than normalising them to two: this row is panel
  // 1764, and `[data-rung]` says so on the element. The other three rungs are
  // measured together in `e2e/user-dialog.spec.ts`, where the design draws them
  // in one open dialog.
  const tick = page.getByTestId('tick').first()
  await expect(tick).toHaveAttribute('data-rung', 'row')
  await expect(tick).toHaveCSS('width', '19px')
  await expect(tick).toHaveCSS('height', '19px')
  await expect(tick).toHaveCSS('border-radius', '6px')
  await expect(tick).toHaveCSS('border-color', 'rgb(201, 184, 236)')   // --border-pick

  const row = page.getByRole('listitem', { name: 'مسئول فعالیت' })
  await expect(row).toHaveCSS('border-bottom-color', 'rgb(242, 236, 227)')   // --hair
  await expect(row).toHaveCSS('border-bottom-width', '1px')

  // …and the LAST row is not ruled off, which nothing anywhere asserted. All
  // six `<li>` carry one className literal, so the vitest half can only say
  // that `last:border-b-0` is written on every one of them; whether it lands is
  // `:last-child`, and that is a question about a rendered document. This row
  // is picked by position for exactly that reason.
  const rows = page.getByRole('listitem')
  const count = await rows.count()
  expect(count).toBeGreaterThan(1)
  await expect(rows.nth(count - 1)).toHaveCSS('border-bottom-width', '0px')
  await expect(rows.nth(count - 2)).toHaveCSS('border-bottom-width', '1px')

  // The state word sits at the inline end — which in RTL is the physical left,
  // and it is what the empty 60% of the row was for.
  const state = row.getByText(/نمایش داده می‌شود|پنهان است/)
  const [rowBox, stateBox] = await Promise.all([row.boundingBox(), state.boundingBox()])
  expect(stateBox!.x - rowBox!.x).toBeLessThan(rowBox!.width * 0.35)
  await expect(state).toHaveCSS('font-size', '11px')
  await expect(state).toHaveCSS('font-weight', '600')

  // F7 — `cursor-pointer` on six clickable cards with no hover whatsoever.
  await row.hover()
  await expect(row.locator('label')).toHaveCSS('background-color', 'rgb(248, 244, 254)')   // --tile-v4

  await shot(page, 'visibility')
})
