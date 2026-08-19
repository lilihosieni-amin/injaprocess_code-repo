import { test, expect } from '@playwright/test'
import type { Confirmation, Department, Process } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

const PID = 'cooking-001'
const CODE = 'cooking'

/**
 * Typed as the endpoints' own response types, not untyped literals: a change to
 * `Department`/`Process` — a renamed field, a widened union — is then a
 * `tsc -b` error here rather than a screen that renders `undefined` in a check
 * that still passes because nothing it measures reads the payload.
 */
const DEPARTMENTS: Department[] = [
  { code: CODE, name: 'پخت', count: 3, subs: 1, conflicts: 0 },
]

/**
 * A process with all three switchable fields populated.
 *
 * `summary` is not decoration here: `[data-body]` is the `{proc.summary}`
 * paragraph and it is inside a non-empty guard, so an empty string leaves the
 * `summary` row's `body` expectation with no element and `expectDesign` fails
 * on a missing hook. `kpis` non-empty for the same reason on `[data-r-2col]`,
 * which the screen only draws when there is a KPI to put in it.
 */
const PROCESS: Process = {
  id: PID, department: CODE, name: 'خرید و پرداخت',
  summary: 'از ثبت درخواست خرید تا پرداخت به تأمین‌کننده و بایگانی فاکتور.',
  parent: null,
  idef0: {
    inputs: ['درخواست خرید', 'فهرست تأمین‌کنندگان'],
    controls: ['سقف بودجه', 'دستورالعمل خرید'],
    outputs: ['فاکتور پرداخت‌شده'],
    mechanisms: ['کارپرداز', 'صندوق'],
  },
  kpis: [
    { name: 'زمان چرخهٔ خرید', definition: 'میانگین فاصلهٔ ثبت درخواست تا پرداخت', target: 'کمتر از ۳ روز' },
    { name: 'نرخ خطای فاکتور', definition: 'سهم فاکتورهای برگشتی از کل', target: 'کمتر از ۲٪' },
  ],
  nodes: [], edges: [], pending: [],
}

/**
 * The same process as `visibility.filtered` hands it to a reader whose
 * department has the content switch off: `summary`, `idef0` and `kpis` present
 * and **emptied**, not dropped. Byte for byte this is also a genuinely empty
 * process, which is the point — the screen cannot tell the two apart.
 */
const BLANKED: Process = {
  ...PROCESS,
  summary: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [],
}

/** One confirmed row, so §6.3's status pill is on screen and in the shot. */
const CONFIRMATIONS: Confirmation[] = [
  {
    target: PID, kind: 'process', fingerprint: 'a'.repeat(64),
    confirmed: true, confirmed_by: '09120000001', confirmed_at: 1770000000,
  },
]

test('process summary', async ({ page }) => {
  // An editor, and not for convenience: `[data-body]` is behind the summary
  // guard and the whole read branch is behind `hasPublishedDetail`, so a
  // session served a blanked document leaves `summary.body` with nothing to
  // grade. `signedIn`'s default session also holds `confirm` over `*`, which is
  // why the confirmations listing has to be stubbed below — the screen asks for
  // it, and anything unstubbed is aborted and named by `expectDesign`.
  await signedIn(page)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    [`/api/processes/${PID}`]: PROCESS,
    [`/api/confirmations?department=${CODE}`]: CONFIRMATIONS,
    '/api/pending': [],
  })
  await visit(page, `/processes/${PID}`, 'summary')
  await page.locator('[data-r-idef0]').waitFor()
  const w = page.viewportSize()!.width

  await expectDesign(page, 'summary')

  // R7 — the two rules this screen owns.
  const idef0 = page.locator('[data-r-idef0]')
  expect(await idef0.evaluate((el) => getComputedStyle(el).display)).toBe(w <= 760 ? 'flex' : 'grid')
  if (w <= 760) expect(await idef0.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column')

  const twoCol = page.locator('[data-r-2col]').first()
  if (await twoCol.count()) {
    const tracks = (await twoCol.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ').length
    expect(tracks).toBe(w <= 760 ? 1 : 2)
  }

  // The A-0 box is violet with white type and the violet button glow.
  const box = page.getByText('A-0 ·').locator('..')
  expect(await box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(74, 37, 169)')
  expect(await box.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
  expect(await page.getByText('A-0 ·').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr')

  // No unicode glyph is doing an icon's job anywhere on the screen.
  expect(await page.locator('body').innerText()).not.toContain('×')

  await shot(page, `summary-${w}`)
})

/**
 * The claim this screen exists to stop making, checked where it is actually
 * painted rather than where it is merely written.
 *
 * `src/screens/Summary.test.tsx` proves the strings are in the DOM; jsdom lays
 * nothing out, so it cannot tell a card that is drawn from one that is present
 * and invisible. Here the limit card has to be a visible box on the field and
 * «شاخصی برای این فرآیند ثبت نشده است» has to be absent from the rendered text
 * of the whole page — not merely from a query on one element.
 *
 * No `expectDesign` in this one: the read branch is not drawn at all in this
 * state, so `[data-body]` and `[data-card]` have nothing to hook and the
 * `summary` row would fail on a missing hook. What the row grades is the
 * populated screen, and the test above is where it grades it.
 */
test('process summary — the fields the reader is not being shown', async ({ page }) => {
  // **A READER**, and that is now load-bearing rather than incidental. The card
  // is a statement about the visibility POLICY, and `visibility.filtered`
  // returns the document untouched for anyone holding `edit` on its department —
  // so drawing it for an editor says a switch withheld something when nothing
  // was filtered at all. This spec used to run as `signedIn`'s default editor,
  // which is exactly the caller the claim is false for; the editor's own
  // rendering of the same payload is the block below.
  await signedIn(page, { role: 'reader', capabilities: ['view', 'comment', 'export_pdf'] })
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    [`/api/processes/${PID}`]: BLANKED,
    [`/api/confirmations?department=${CODE}`]: CONFIRMATIONS,
    '/api/pending': [],
  })
  await visit(page, `/processes/${PID}`, 'summary')

  await expect(page.getByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).toBeVisible()
  await expect(page.getByText('نمای IDEF0 سطح فرآیند (A-0)')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain('شاخصی برای این فرآیند ثبت نشده است')

  await shot(page, `summary-withheld-${page.viewportSize()!.width}`)
})

/**
 * The same bytes, the other caller — NFR-12 / AC-25 from the side that was
 * getting it wrong.
 *
 * `routers/processes.py`'s `_skeleton` writes every new process with an empty
 * summary, an empty ICOM and no KPIs, so this payload is not a contrivance: it
 * is what every process looks like at the moment its own editor creates it.
 * That editor was shown «سیاست نمایش محتوای این دپارتمان تعیین می‌کند…» — a
 * sentence about a filter that never ran for them — with the honest empty states
 * suppressed behind it.
 *
 * Paired with the test above deliberately: the two differ in the session and in
 * nothing else, so neither can pass for a screen that ignores it.
 */
test('process summary — an editor’s brand-new process is empty, not withheld', async ({ page }) => {
  await signedIn(page)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    [`/api/processes/${PID}`]: BLANKED,
    [`/api/confirmations?department=${CODE}`]: CONFIRMATIONS,
    '/api/pending': [],
  })
  await visit(page, `/processes/${PID}`, 'summary')

  await expect(page.getByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).toHaveCount(0)
  await expect(page.getByText('نمای IDEF0 سطح فرآیند (A-0)')).toBeVisible()
  expect(await page.locator('body').innerText()).toContain('شاخصی برای این فرآیند ثبت نشده است')
})
