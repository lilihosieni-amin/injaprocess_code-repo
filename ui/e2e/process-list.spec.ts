import { test, expect, type Page } from '@playwright/test'
import type { Confirmation, Department, Process, ProcNode } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

const CODE = 'cooking'

/**
 * Typed as the endpoints' own response types, not untyped literals: a change to
 * `Department`/`Process` — a renamed field, a widened union — is then a
 * `tsc -b` error here rather than a screen that renders `undefined` in a check
 * that still passes because nothing it measures reads the payload.
 */
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'پخت', count: 3, subs: 1, conflicts: 0 },
  { code: 'warehouse', name: 'انبار', count: 5, subs: 2, conflicts: 0 },
]

const activity = (id: string): ProcNode => ({
  id, type: 'activity', label: id, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 'seed', touched_by: [] },
})

const EMPTY_ICOM = { inputs: [], controls: [], outputs: [], mechanisms: [] }

const PROCESSES: Process[] = [
  {
    id: 'cooking-001', department: CODE, name: 'خرید و پرداخت', summary: 'خلاصه',
    parent: null, idef0: EMPTY_ICOM, kpis: [{ name: 'زمان چرخه' }],
    nodes: [activity('n1'), activity('n2')], edges: [], pending: [],
  },
  {
    id: 'cooking-014', department: CODE, name: 'پرداخت هزینه', summary: 'خلاصه',
    parent: { process: 'cooking-001', node: 'n1' }, idef0: EMPTY_ICOM, kpis: [],
    nodes: [activity('n1')], edges: [], pending: [],
  },
  {
    id: 'cooking-002', department: CODE, name: 'فرآیند قدیمی', summary: 'خلاصه',
    parent: null, idef0: EMPTY_ICOM, kpis: [], nodes: [], edges: [], pending: [],
    tombstoned: true, superseded_by: ['cooking-050'],
  },
]

/** One confirmed row, so §6.2's confirmation CHIP is on screen and in the shot. */
const CONFIRMATIONS: Confirmation[] = [
  {
    target: 'cooking-001', kind: 'process', fingerprint: 'a'.repeat(64),
    confirmed: true, confirmed_by: '09120000001', confirmed_at: 1770000000,
  },
]

/** Every read either shell or this screen makes, in one place. */
async function reads(page: Page) {
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    [`/api/departments/${CODE}/processes`]: PROCESSES,
    [`/api/confirmations?department=${CODE}`]: CONFIRMATIONS,
    '/api/pending': [],
  })
}

/** The painted box of a control, rounded the way a person would read a ruler. */
const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox()
  return { w: Math.round(b!.width), h: Math.round(b!.height) }
}

test('process list — the panel', async ({ page }) => {
  await signedIn(page)
  await reads(page)
  await visit(page, `/departments/${CODE}`, 'processList')
  await page.locator('[data-r-prow]').first().waitFor()
  const w = page.viewportSize()!.width

  await expectDesign(page, 'processList')

  // R7 — the one rule this screen owns at ≤760: the bar is REPLACED, so exactly
  // one of the two is on screen at any width. Both halves are asserted at both
  // widths, because a `⋯` that is `display:none` everywhere satisfies "the bar
  // is hidden on a phone" and leaves the acts unreachable — the reader
  // deliverable's own defect #2.
  const bar = page.locator('[data-r-plistactions]')
  const more = page.locator('[data-r-plistmore]')
  if (w <= 760) {
    await expect(bar).toBeHidden()
    await expect(more).toBeVisible()
    // …and the acts really are in it. §6.2 — `36×36`, with F11's 44px target as
    // a transparent ::before around it rather than a control inflated to 44.
    const trigger = page.getByRole('button', { name: 'کارهای بیشتر' })
    expect(await box(page, '[data-r-plistmore] button')).toEqual({ w: 36, h: 36 })
    await trigger.click()
    // The exports are in here as of the owner's ruling — *"in mobile version we
    // don't have download buttomn in : menu.add it."* The bar's fourth control
    // is `ExportMenu`, and it was the one act the ⋯ never mirrored, so at this
    // width a person could not take a document out of the product at all.
    await expect(page.getByRole('menuitem')).toHaveText([
      'ترتیب فرآیندها', 'اطلاعات دپارتمان', 'فرآیند جدید',
      'خروجی مستندات کامل', 'خروجی راهنمای گام‌به‌گام',
    ])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem')).toHaveCount(0)
    // …and hand the keyboard focus back. Escape sets the keyboard modality, so
    // `base.css`'s F11 ring is painted on the trigger from here on and `shot()`
    // — which parks the pointer but says nothing about focus — would photograph
    // a coral ring the design does not draw, in the one image this screen is
    // compared against `ui/design/` by.
    await trigger.blur()
  } else {
    await expect(bar).toBeVisible()
    await expect(more).toBeHidden()
  }

  // The row is a row, not a 44px-tall title line pretending to be one. The old
  // screen put a `min-h-touch` confirm/revoke Button in the title line, so a
  // line of 17px type measured 44 — invisible to jsdom, which lays nothing out.
  const row = page.locator('[data-r-prow]').first()
  const title = row.locator('[data-testid^="title-"]').first()
  expect((await title.boundingBox())!.height).toBeLessThan(30)
  expect(await row.evaluate((el) => getComputedStyle(el).flexDirection))
    .toBe(w <= 760 ? 'column' : 'row')

  // §6.16's own two lines for this row: the meta line and the position numeral
  // are gone at ≤760 and present above it.
  const meta = row.locator('[data-r-pmeta]')
  const pos = row.locator('[data-testid^="pos-"]')
  if (w <= 760) {
    await expect(meta).toBeHidden()
    await expect(pos).toBeHidden()
  } else {
    await expect(meta).toBeVisible()
    await expect(pos).toBeVisible()
    // **The 34px square on this row is the ⋮ now** — owner ruling, *"add ather
    // buttomn in card to : menue"*, and `Inja Panel.dc.html:355`. The delete
    // moved inside it, with «اطلاعات کلی»: both were loose controls before, and
    // on a phone the most destructive act in the product was a `flex-1`
    // neighbour of «فلوچارت».
    //
    // Same rung, same "never inflate" rule as the header's `⋯`: `Button`'s BASE
    // carries `min-h-touch min-w-touch`, and a min- beats a width whatever the
    // emitted order is, so a `w-tool h-tool` passed through it would paint 44×44
    // with the class that says 34 never drawn. That is why this is a bare
    // `<button>` and not a `Button`.
    expect(await box(page, '[data-r-pactions] [data-r-prowmenu] button')).toEqual({ w: 34, h: 34 })
  }

  // §8 — RTL text, right-hand scrollbar. The box is `ltr` and EVERY immediate
  // child is flipped back, not just the one somebody remembered: that second
  // half is the whole of O1, and a check that read `firstElementChild` alone
  // would pass on the very arrangement this task deleted.
  //
  // …which is what this WAS, in a longer spelling. `[data-r-pad]` has exactly
  // one element child on this route, so `Array.from(el.children)` and
  // `firstElementChild` were the same assertion and the stronger half was
  // stated, not exercised. The rule under test is
  // `[data-r-pad] > * { direction: rtl }` in `src/styles/base.css`, and what it
  // claims is REACH — so a second child is added, measured, and taken away
  // again. A rule written `[data-r-pad] > :first-child`, or moved onto the
  // screen's own element, fails on `probe` while every real child still passes.
  const pad = page.locator('[data-r-pad]')
  expect(await pad.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr')
  const flipped = await pad.evaluate((el) => {
    const before = el.children.length
    const probe = document.createElement('div')
    el.append(probe)
    const nested = document.createElement('span')
    probe.append(nested)
    const answer = {
      before,
      strays: Array.from(el.children)
        .filter((c) => getComputedStyle(c).direction !== 'rtl').length,
      probe: getComputedStyle(probe).direction,
      // `> *` and not a descendant selector: a rule that reached every level
      // would flip a genuine latin island — `IdBadge`, a mono process id — back
      // out of `ltr` several elements down.
      nested: getComputedStyle(nested).direction,
    }
    probe.remove()
    return answer
  })
  expect(flipped.before, 'the real tree has one child here, which is why the probe exists').toBe(1)
  expect(flipped.strays).toBe(0)
  expect(flipped.probe, 'a child the screen did not write is not flipped back').toBe('rtl')
  expect(flipped.nested, 'the flip reaches past the immediate children').toBe('rtl')

  await shot(page, 'process-list')
})

test('process list — the reader’s own composition', async ({ page }) => {
  // Two reachable departments, so R4 leaves this reader on the list rather than
  // redirecting: `ReaderShell` decides that from the LENGTH of the scope-filtered
  // `/api/departments`, and the redirect itself is proved in reader-shell.spec.ts.
  await signedIn(page, {
    username: 'reader', displayName: 'خواننده', role: 'reader',
    capabilities: ['view'], scopes: ['dept:cooking', 'dept:warehouse'],
  })
  await reads(page)
  await visit(page, `/departments/${CODE}`, 'processListReader')
  await page.locator('[data-r-prow]').first().waitFor()

  await expectDesign(page, 'processListReader')

  // R5 — a reader may not create, reorder, delete or export, so none of those is
  // drawn, greyed or explained. `Inja Reader.dc.html:196` draws one centred
  // «اطلاعات دپارتمان» button and nothing else above the search field.
  await expect(page.locator('[data-r-plistactions]')).toHaveCount(0)
  await expect(page.locator('[data-r-plistmore]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'فرآیند جدید' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ترتیب فرآیندها' })).toHaveCount(0)
  await expect(page.getByTitle('حذف فرآیند')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'اطلاعات دپارتمان' })).toBeVisible()

  // The confirmation chip is an editor's mark: `GET /api/confirmations` 403s a
  // reader, so the query is never made and the chip is absent — asserted here
  // because the fixture above DOES carry a confirmed row, so a screen that drew
  // the mark on scope rather than on capability would say so.
  await expect(page.getByText('تأیید شده')).toHaveCount(0)

  await shot(page, 'process-list-reader')
})
