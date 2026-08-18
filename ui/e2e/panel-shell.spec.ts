import { test, expect, type Page } from '@playwright/test'
import type { Department, PendingItem, Process } from '../src/api/types'
import { FIELD, LEGIBLE, SURFACE, pinPage, serve, shot, signedIn, visit } from './_harness'

/*
 * One spec, three projects: playwright.config.ts runs it at 1440, 1080 and 760.
 * vitest renders on jsdom, which does no layout and computes no colour — which
 * is exactly why nine screens shipped with every individual value legal and the
 * page still wrong (R6).
 *
 * ## Why there is no `expectDesign(page, 'panel-shell')` here
 *
 * The plan's Step 13 calls it. There is no such row: `DESIGN` holds nine rows
 * and every one of them is a SCREEN — `departments`, `processList`, `summary`,
 * `overview`, `policy`, `access`, `profile` and the two reader twins. The
 * function reads `[data-screen="<name>"]` and grades a column max-width, a used
 * column width, a four-sided screen padding, an H1 and a body line off it, and
 * the panel chrome is none of those things: it has no `data-screen`, no column
 * and no title. A row for it could not be filled in, and `_harness.ts` is frozen
 * and pre-populated in any case. Reported in .superpowers/sdd/ui-task-12-report.md.
 *
 * So the chrome is graded here, directly, against the deliverable's own lines.
 */

const DEPARTMENTS: Department[] = [
  { code: 'dining', name: 'سالن', count: 3, subs: 0, conflicts: 2 },
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
]

/** Two open conflicts, so the count badge is drawn rather than skipped. */
const PENDING: PendingItem[] = [
  {
    process: 'dining-001', department: 'dining', name: 'پذیرایی',
    node: 'n1', index: 0, field: 'description',
    current: 'الف', proposed: 'ب', source: 'meeting-004', status: 'open',
  },
  {
    process: 'dining-002', department: 'dining', name: 'تسویه',
    node: 'n2', index: 0, field: 'actor',
    current: 'ج', proposed: 'د', source: 'meeting-004', status: 'open',
  },
]

const PROCESSES: Process[] = []

/** One process, so the trail on `/processes/{pid}` has an id to draw. */
const PROCESS: Process = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از مهمان', summary: 'خلاصه',
  parent: null,
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [], edges: [], pending: [],
}

/** The home screen, where §6.0 draws the top bar. */
async function home(page: Page) {
  await signedIn(page)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': PENDING,
  })
  await visit(page, '/departments', 'departments')
}

/**
 * An inner screen, where §6.0 draws the crumb strip instead.
 *
 * Not `visit(page, url, screen)`: `ProcessList` carries no `[data-screen]` yet
 * (Task 15 adds it), so there is no row to wait for. The wait is on the chrome
 * this spec is about, and the pin is taken after it — `visit`'s own docstring
 * gives the reason the pin cannot be taken the instant `goto` resolves.
 */
async function inner(page: Page) {
  await signedIn(page)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': PENDING,
    '/api/departments/dining/processes': PROCESSES,
    '/api/confirmations?department=dining': [],
  })
  await page.goto('/departments/dining')
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, "goto('/departments/dining')")
}

/**
 * A process, where the trail carries §8's latin island.
 *
 * `url` because the id crumb is drawn by two different branches and only one of
 * them is reachable from each route: on `/processes/{pid}` the id is the LEAF,
 * so it is the `<span aria-current>`, and on `/processes/{pid}/flow` it is the
 * one before the leaf, so it is an `<a>`. A check that visited only the first
 * leaves the pin on the link untested — measured: removing `dir` from the
 * `<Link>` branch alone was invisible to this whole spec.
 */
async function process(page: Page, url = '/processes/dining-003') {
  await signedIn(page)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': PENDING,
    '/api/processes/dining-003': PROCESS,
    '/api/confirmations?department=dining': [],
  })
  await page.goto(url)
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, `goto('${url}')`)
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

test('the top bar is the design’s white bar on a cream hairline', async ({ page }) => {
  await home(page)
  const bar = page.locator('[data-r-topbar]')
  await expect(bar).toBeVisible()
  // §6.0 — `background:#fff; border-bottom:1px solid #EFE7DC`.
  await expect(bar).toHaveCSS('background-color', SURFACE)
  await expect(bar).toHaveCSS('border-bottom-color', 'rgb(239, 231, 220)')
  await expect(bar).toHaveCSS('border-bottom-width', '1px')
  // The app's field, behind everything (§6.0, §9.1). The audit's "solid violet
  // bar" was this colour on the bar itself.
  await expect(page.locator('[data-shell="panel"]')).toHaveCSS('background-color', FIELD)
  await expect(bar).not.toHaveCSS('background-color', FIELD)
  await shot(page, 'panel-shell')
})

test('the top bar pads 22px above 760 and 14px below it', async ({ page }) => {
  await home(page)
  const width = page.viewportSize()!.width
  // §3.2 `--pad-topbar: 22px`, `padding:12px 22px`; §6.16
  // `[data-r-topbar]{padding:10px 14px; gap:10px}` at ≤760.
  const bar = page.locator('[data-r-topbar]')
  await expect(bar).toHaveCSS('padding-left', width <= 760 ? '14px' : '22px')
  await expect(bar).toHaveCSS('padding-right', width <= 760 ? '14px' : '22px')
  await expect(bar).toHaveCSS('padding-top', width <= 760 ? '10px' : '12px')
  await expect(bar).toHaveCSS('column-gap', width <= 760 ? '10px' : '14px')
})

test('the brand mark is the raster no file used to import', async ({ page }) => {
  // Audit S2. `toBeVisible` is not enough for an <img>: a broken src is a
  // visible element with no picture in it, so the decoded size is read as well.
  await home(page)
  const logo = page.locator('[data-r-topbar] img')
  await expect(logo).toBeVisible()
  const box = await logo.evaluate((el) => {
    const img = el as HTMLImageElement
    return { w: img.naturalWidth, h: img.naturalHeight, drawn: img.getBoundingClientRect().width }
  })
  expect(box.w, 'the logo file did not decode — the <img> is drawing nothing').toBeGreaterThan(0)
  expect(box.h).toBeGreaterThan(0)
  expect(box.drawn).toBe(38)
})

/* ------------------------------------------------------------------ *
 * The two breakpoints
 * ------------------------------------------------------------------ */

test('the nav tray and the inbox go at 1080, and the hamburger arrives', async ({ page }) => {
  // §6.16 — `[data-r-nav]{display:none}` and `[data-r-topbar] [data-r-hide]
  // {display:none}` at ≤1080, which covers the divider AND the inbox button;
  // `[data-r-topbar] [data-r-show]{display:flex}` brings the hamburger in at the
  // same width.
  await home(page)
  const width = page.viewportSize()!.width
  const nav = page.locator('[data-r-nav]')
  const burger = page.locator('[data-r-menu]')
  const inbox = page.getByRole('button', { name: /صندوق بازبینی/ })
  if (width <= 1080) {
    await expect(nav).toBeHidden()
    await expect(inbox).toBeHidden()
    await expect(burger).toBeVisible()
  } else {
    await expect(nav).toBeVisible()
    await expect(inbox).toBeVisible()
    await expect(burger).toBeHidden()
  }
})

test('the crumbs go at 760, and the way back does not', async ({ page }) => {
  await inner(page)
  const width = page.viewportSize()!.width
  await expect(page.locator('[data-r-crumbbar]')).toBeVisible()
  await expect(page.getByRole('link', { name: 'بازگشت' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'خانه' })).toBeVisible()
  if (width <= 760) await expect(page.locator('[data-r-crumbs]')).toBeHidden()
  else await expect(page.locator('[data-r-crumbs]')).toBeVisible()
  // The deliverable draws this strip `padding:9px 22px` (`Inja Panel.dc.html:174`)
  // and writes NO ≤760 override for it — unlike `[data-r-topbar]` two tests up,
  // which it overrides by name. So the gutter is the same at all three widths.
  const strip = page.locator('[data-r-crumbbar]')
  await expect(strip).toHaveCSS('padding-left', '22px')
  await expect(strip).toHaveCSS('padding-top', '9px')
  await expect(strip).toHaveCSS('background-color', 'rgb(244, 239, 251)')
  await expect(strip).toHaveCSS('border-bottom-color', 'rgb(227, 216, 245)')
  await shot(page, 'panel-crumbstrip')
})

test('the trail names where you are, and returns you to where you were', async ({ page }) => {
  // Audit S3 — standing on an inner screen there used to be nothing in the
  // chrome that named where you were or returned you to it.
  await inner(page)
  test.skip(page.viewportSize()!.width <= 760, 'the trail is hidden at this width, by design')
  const crumbs = page.locator('[data-r-crumbs]')
  await expect(crumbs.getByRole('link', { name: 'دپارتمان‌ها' })).toBeVisible()
  // The leaf is the current page, and it is not a link.
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('دپارتمان سالن')
  await expect(crumbs.getByRole('link', { name: 'دپارتمان سالن' })).toHaveCount(0)
  await crumbs.getByRole('link', { name: 'دپارتمان‌ها' }).click()
  await expect(page.locator('[data-screen="departments"]')).toBeVisible()
  await expect(page.locator('[data-r-topbar]')).toBeVisible()
})

test('the process id in the trail is a latin island, drawn left to right', async ({ page }) => {
  // §8 — an id is a latin island in RTL prose. `direction` is an INHERITED
  // computed property that jsdom reports as the empty string, so the unit test
  // can only see that the attribute was written; this is where it is measured.
  test.skip(page.viewportSize()!.width <= 760, 'the trail is hidden at this width, by design')
  await process(page)
  const crumbs = page.locator('[data-r-crumbs]')
  const id = crumbs.getByText('dining-003')
  await expect(id).toBeVisible()
  // The leaf branch: on `/processes/{pid}` the id is where you already are.
  await expect(id).toHaveAttribute('aria-current', 'page')
  await expect(id).toHaveCSS('direction', 'ltr')
  // …and the Persian crumbs beside it are not dragged along with it.
  await expect(crumbs.getByRole('link', { name: 'دپارتمان‌ها' })).toHaveCSS('direction', 'rtl')
  await expect(crumbs.getByText('دپارتمان سالن')).toHaveCSS('direction', 'rtl')
  // The trail's mono family is the design's latin stack, not the Persian sans
  // every other crumb inherits.
  const [idFamily, persianFamily] = await Promise.all([
    id.evaluate((el) => getComputedStyle(el).fontFamily),
    crumbs.getByText('دپارتمان سالن').evaluate((el) => getComputedStyle(el).fontFamily),
  ])
  expect(idFamily).not.toBe(persianFamily)
})

test('the process id is still an island when the trail makes it a link', async ({ page }) => {
  // The other branch. One step deeper the id is no longer the leaf, so it is
  // drawn as an `<a>` back to the summary rather than as the current-page span —
  // a second element, a second `dir`, and the first spelling of this test could
  // not see it at all.
  test.skip(page.viewportSize()!.width <= 760, 'the trail is hidden at this width, by design')
  await process(page, '/processes/dining-003/flow')
  const crumbs = page.locator('[data-r-crumbs]')
  const id = crumbs.getByRole('link', { name: 'dining-003' })
  await expect(id).toBeVisible()
  await expect(id).toHaveAttribute('href', '/processes/dining-003')
  await expect(id).toHaveCSS('direction', 'ltr')
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('فلوچارت')
  await expect(crumbs.locator('[aria-current="page"]')).toHaveCSS('direction', 'rtl')
  // …and the leaf is drawn in the same family as every other Persian crumb.
  // The `mono` flag drives BOTH the pin and the family, so a leaf that took the
  // latin stack would be a Persian word in a monospace face — and the id/Persian
  // comparison in the test above cannot see it, because there the id IS the leaf.
  const [leaf, persian, latin] = await Promise.all([
    crumbs.locator('[aria-current="page"]').evaluate((el) => getComputedStyle(el).fontFamily),
    crumbs.getByRole('link', { name: 'دپارتمان‌ها' }).evaluate((el) => getComputedStyle(el).fontFamily),
    id.evaluate((el) => getComputedStyle(el).fontFamily),
  ])
  expect(leaf).toBe(persian)
  expect(latin).not.toBe(persian)
})

/* ------------------------------------------------------------------ *
 * Audit S1, measured rather than asserted from a class name
 * ------------------------------------------------------------------ */

/**
 * The contrast of an element's own text against what is painted behind it.
 *
 * Composited from the first fully opaque ancestor inward, which is what the
 * compositor does — the same method `_harness.ts`'s type census uses. A control
 * with a transparent fill is graded against the bar behind it rather than being
 * reported as 1.0 against nothing.
 */
async function contrastOf(handle: ReturnType<Page['locator']>): Promise<number> {
  return handle.evaluate((el) => {
    const parse = (c: string): number[] => {
      if (c.trim() === 'transparent') return [0, 0, 0, 0]
      const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(c.trim())
      return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : [0, 0, 0, 0]
    }
    const over = (top: number[], bottom: number[]): number[] => {
      const a = top[3] + bottom[3] * (1 - top[3])
      if (a === 0) return [0, 0, 0, 0]
      const mix = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a
      return [mix(0), mix(1), mix(2), a]
    }
    const lum = (c: number[]) => {
      const ch = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])
    }
    const stack: number[][] = []
    for (let p: Element | null = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor)
      stack.push(c)
      if (c[3] >= 1) break
    }
    let bg = [255, 255, 255, 1]
    for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg)
    const fg = over(parse(getComputedStyle(el).color), bg)
    const [a, b] = [lum(fg), lum(bg)]
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

test('no header control disappears when you point at it', async ({ page }) => {
  // Audit S1, measured: `text-card` over `hover:bg-tile-v2` is white on #F4EFFB,
  // about 1.04:1, and jsdom could never have caught it. The floor is the
  // harness's LEGIBLE — deliberately not WCAG AA, which this design does not
  // meet anywhere; what is being caught is text a reader cannot see AT ALL.
  await home(page)
  const controls = page.locator('[data-r-topbar] a, [data-r-topbar] button')
  const n = await controls.count()
  expect(n, 'the bar drew almost nothing, so this test is about nothing').toBeGreaterThan(2)
  let measured = 0
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i)
    if (!(await c.isVisible())) continue
    // At rest first: a control that is already illegible is not a hover defect.
    expect(await contrastOf(c), `control ${i} at rest`).toBeGreaterThan(LEGIBLE)
    await c.hover()
    await expect(c).toHaveCSS('cursor', /pointer|default/)
    const ratio = await contrastOf(c)
    expect(ratio, `control ${i} hovered: its label is ${ratio.toFixed(2)}:1 against its own fill`)
      .toBeGreaterThan(LEGIBLE)
    measured++
  }
  expect(measured, 'every control in the bar was invisible, so nothing was measured').toBeGreaterThan(1)
  await page.mouse.move(0, 0)
})

/* ------------------------------------------------------------------ *
 * F11's floor, as a pointer actually lands
 * ------------------------------------------------------------------ */

test('the 34px sign-out control catches a pointer 44px wide', async ({ page }) => {
  // The painted box stays the design's and a transparent `::before` grows the
  // target. Nothing about that is visible — in a snapshot, in a build, or in
  // jsdom, which computes no boxes at all. So it is probed: a point 3px OUTSIDE
  // the drawn edge, which is inside the 5px overlay, must resolve to this
  // control and to nothing else.
  await home(page)
  const out = page.getByRole('button', { name: 'خروج' })
  await expect(out).toBeVisible()
  const box = (await out.boundingBox())!
  expect(Math.round(box.width), 'the drawn control is not the design’s 34px box').toBe(34)
  expect(Math.round(box.height)).toBe(34)
  const probe = { x: box.x - 3, y: box.y + box.height / 2 }
  const hit = await page.evaluate(
    (p) => {
      const el = document.elementFromPoint(p.x, p.y)
      return el === null ? null : (el.closest('button')?.getAttribute('aria-label') ?? el.tagName)
    },
    probe,
  )
  expect(hit, 'a pointer 3px off the drawn edge did not land on the sign-out control').toBe('خروج')
})

/* ------------------------------------------------------------------ *
 * Audit S5 — the badge
 * ------------------------------------------------------------------ */

test('the conflict count is a 19px round badge in Persian, not a 44px coral square', async ({ page }) => {
  await home(page)
  test.skip(page.viewportSize()!.width <= 1080, 'the inbox button is hidden at this width, by design')
  const badge = page.locator('[data-r-topbar] button span[aria-hidden="true"]')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('۲')
  const box = (await badge.boundingBox())!
  expect(Math.round(box.height), 'audit S5 — the badge inherited the 44px touch floor').toBe(19)
  expect(Math.round(box.width)).toBe(19)
  await expect(badge).toHaveCSS('background-color', 'rgb(250, 90, 82)')
  await expect(badge).toHaveCSS('border-radius', /50%|9.5px/)
  // The ring is the card WHITE, so the badge is cut out of the button edge it
  // overlaps. `--border-card` is the same name one letter apart and is 7% alpha.
  await expect(badge).toHaveCSS('border-top-color', SURFACE)
  await expect(badge).toHaveCSS('border-top-width', '2px')
  // …and it hangs off the button's corner rather than sitting inside it.
  const button = (await page.getByRole('button', { name: /صندوق بازبینی/ }).boundingBox())!
  expect(box.y).toBeLessThan(button.y)
  expect(box.x).toBeLessThan(button.x)
})
