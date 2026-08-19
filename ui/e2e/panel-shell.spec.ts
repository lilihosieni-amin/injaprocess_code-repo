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

/*
 * ## `inline-flex` on either bar is NOT visible here, and that is measured
 *
 * A reviewer's mutation survey expected `flex` → `inline-flex` on the top bar
 * to shrink the white ground to the width of its own buttons and stop the cream
 * hairline at the last one. Run: it does not. Both bars are direct children of
 * `[data-shell="panel"]`, which is a flex column, so each is a FLEX ITEM — and
 * a flex item's `display` is blockified, `inline-flex` computing to `flex`. The
 * used box is identical and `toHaveCSS('display', …)` reports `flex` either
 * way, so an assertion on that property here would be green on both spellings
 * and would read as a pin while proving nothing.
 *
 * The declaration is still wrong and is still worth refusing — it would bite
 * the day either bar stopped being a flex item — so it is refused where it can
 * actually be seen: the whole-set `declarations()` guards in shells.test.tsx
 * compile the class string and compare `display: flex` by value.
 *
 * What the two tests below pin is the other half, which no unit test can reach:
 * that the used box really does span the window. A max-width, a stray margin,
 * a padding that overflows or an ancestor that has stopped stretching are all
 * invisible to a class string and all end with the field showing through the
 * chrome.
 */

test('the top bar is a full-width block, and its hairline reaches both edges', async ({ page }) => {
  await home(page)
  const width = page.viewportSize()!.width
  const bar = page.locator('[data-r-topbar]')
  const box = (await bar.boundingBox())!
  expect(Math.round(box.width), 'the bar is not spanning the window').toBe(width)
  expect(Math.round(box.x)).toBe(0)
  // …and the rule under it is drawn across that whole width rather than under
  // the controls alone, which is the thing a reader would actually notice.
  const rule = await bar.evaluate((el) => {
    const s = getComputedStyle(el)
    return { w: el.getBoundingClientRect().width, style: s.borderBottomStyle }
  })
  expect(rule.style).toBe('solid')
  expect(Math.round(rule.w)).toBe(width)
})

test('the crumb strip is a full-width block too', async ({ page }) => {
  // The other chrome. Its ground is the lavender tile, so any width it fails to
  // cover is the deep violet field showing through the middle of the chrome.
  await inner(page)
  const width = page.viewportSize()!.width
  const strip = page.locator('[data-r-crumbbar]')
  const box = (await strip.boundingBox())!
  expect(Math.round(box.width), 'the strip is not spanning the window').toBe(width)
  expect(Math.round(box.x)).toBe(0)
})

/* ------------------------------------------------------------------ *
 * Reachability — the chrome off the home screen
 *
 * §6.0 draws the top bar on `/departments` and the crumb strip everywhere
 * else, and this shell keeps that. What the design cannot settle is where the
 * app's own controls live on the screens without a bar: it draws no sign-out
 * anywhere, so it never had to answer.
 *
 * The answer this shell shipped with was "nowhere" — measured on
 * `/departments/dining` and `/processes/dining-003/flow`: no `[data-r-menu]`,
 * no «خروج», no «صندوق بازبینی». The strip carried «بازگشت» and «خانه» and
 * nothing else, at all three widths.
 * ------------------------------------------------------------------ */

/** An editor who also holds both administration capabilities, scoped `*`. */
async function administrator(page: Page) {
  await signedIn(page, {
    capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm', 'manage_users', 'set_visibility'],
    scopes: ['*'],
  })
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': PENDING,
    '/api/departments/dining/processes': PROCESSES,
    '/api/confirmations?department=dining': [],
    '/api/processes/dining-003': PROCESS,
  })
}

for (const [where, url] of [
  ['an inner screen', '/departments/dining'],
  ['the flow screen, which has no bar of its own', '/processes/dining-003/flow'],
] as const) {
  test(`sign-out, the inbox and administration are reachable from ${where}`, async ({ page }) => {
    await administrator(page)
    await page.goto(url)
    await page.locator('[data-r-crumbbar]').waitFor()
    await pinPage(page, `goto('${url}')`)
    // Visible at EVERY width: the strip has no nav tray for this to stand in
    // for, unlike the bar's hamburger, so hiding it above 1080 puts every
    // desktop editor back where they started.
    const opener = page.locator('[data-r-crumbbar] [data-r-menu]')
    await expect(opener).toBeVisible()
    await opener.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'خروج' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /صندوق بازبینی/ })).toBeVisible()
    for (const name of ['دپارتمان‌ها', 'کاربران', 'سیاست نمایش محتوا', 'پروفایل و گذرواژه']) {
      await expect(sheet.getByRole('link', { name: new RegExp(name) }), name).toBeVisible()
    }
  })
}

test('the sheet’s rows read down the leading edge, not from the middle', async ({ page }) => {
  // §6.0's sheet rows are `display:flex; width:100%; text-align:start` with the
  // label on a `flex:1` span (Panel :2082) — a stack a thumb reads down one
  // edge of.
  //
  // They were written as the bar's ghost recipe plus `justify-start`, and drew
  // CENTRED: Tailwind emits `justify-center` after `justify-start`, so the
  // ghost's value wins no matter which order the class attribute is in. The
  // build exits 0, jsdom reads the class name and reports the intent, and this
  // is the only place the difference exists. RTL, so the leading edge is the
  // right one.
  await administrator(page)
  await page.goto('/departments/dining')
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, "goto('/departments/dining')")
  await page.locator('[data-r-crumbbar] [data-r-menu]').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  const rows = sheet.getByRole('link')
  const n = await rows.count()
  expect(n, 'the sheet drew no destinations, so this test is about nothing').toBeGreaterThan(2)
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i)
    await expect(row).toHaveCSS('justify-content', 'flex-start')
    // …and the label actually sits against the padding edge, which is the part
    // a declaration alone cannot promise.
    const gap = await row.evaluate((el) => {
      const pad = parseFloat(getComputedStyle(el).paddingInlineStart)
      const box = el.getBoundingClientRect()
      const label = (el.firstChild as Text | Element | null)
      const range = document.createRange()
      if (label === null) return NaN
      range.selectNodeContents(el)
      const text = range.getBoundingClientRect()
      // RTL: the inline start of both boxes is their right edge.
      return box.right - text.right - pad
    })
    expect(Math.abs(gap), `row ${i} is not sitting against its leading edge`).toBeLessThan(2)
  }
  // …and the rows span the sheet rather than sitting at the width of their own
  // words. Not an `inline-flex` check — the sheet's body is a flex column, so
  // its rows are flex items and `inline-flex` is blockified to `flex` there
  // exactly as it is on the two bars above; that spelling is refused by value
  // in shells.test.tsx instead. This is a width pin, and it is the reason every
  // row's leading edge lines up with every other's.
  const sheetBox = (await sheet.boundingBox())!
  const first = (await rows.first().boundingBox())!
  const last = (await rows.last().boundingBox())!
  expect(Math.round(first.width), 'the rows are not the same width as each other')
    .toBe(Math.round(last.width))
  expect(first.width).toBeGreaterThan(sheetBox.width * 0.8)
})

/**
 * Open the nav sheet from the crumb strip's own opener, which §6.0 draws at
 * every width — the top bar's hamburger is `hidden max1080:flex` and would make
 * the two blocks below untestable at 1440.
 */
async function openSheet(page: Page) {
  await administrator(page)
  await page.goto('/departments/dining')
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, "goto('/departments/dining')")
  await page.locator('[data-r-crumbbar] [data-r-menu]').click()
  const sheet = page.getByRole('dialog', { name: 'فهرست' })
  await expect(sheet).toBeVisible()
  return sheet
}

/** Every rung of the adopted scale (R9 / L-42), read off the document itself. */
async function rungs(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return Object.fromEntries(['dropdown', 'chrome', 'floating', 'drawer', 'modal'].map(
      (r) => [r, Number(cs.getPropertyValue(`--role-z-${r}`))],
    )) as Record<string, number>
  })
}

test('an open sheet actually covers the chrome its aria-modal calls inert (L-42 / L-44)', async ({ page }) => {
  // The scrim wrote a raw `50 + depth * 10`. 50 is BELOW `--role-z-chrome`
  // (1020), so with any overlay open the top bar, the FAB (`--role-z-floating`,
  // 1030) and every popover (`--role-z-dropdown`, 1000) painted above it and
  // stayed hit-testable — while `aria-modal="true"` told assistive technology
  // the rest of the page was inert. Half the ladder was live and exactly the
  // half that lifts an overlay above it was dead.
  //
  // Measured as a HIT TEST, not as a class name and not as a pair of numbers:
  // the question is what a finger lands on, and `elementFromPoint` is the only
  // thing that answers it. Probed at 760x900 before the fix, this returned the
  // <header>.
  await administrator(page)
  await page.goto('/departments')
  await page.locator('[data-r-topbar]').waitFor()
  await pinPage(page, "goto('/departments')")
  // `[data-r-topbar]` is the app's ONLY `z-chrome` element (the crumb strip
  // carries no rung), and its opener for this sheet is `hidden max1080:flex`.
  // So this is the reproduction at every width where it can be reproduced —
  // which is also every width the sheet is reachable from the bar at all.
  test.skip(page.viewportSize()!.width > 1080,
    'the top bar draws no sheet opener above 1080, by design (§6.16)')
  await page.locator('[data-r-topbar] [data-r-menu]').click()
  await expect(page.getByRole('dialog', { name: 'فهرست' })).toBeVisible()

  const box = (await page.locator('[data-r-topbar]').boundingBox())!
  const hit = await page.evaluate(({ x, y }) => {
    const scrim = document.querySelector('[role="dialog"]')!.parentElement!
    const el = document.elementFromPoint(x, y)
    return {
      tag: el === null ? null : el.tagName,
      inScrim: el !== null && scrim.contains(el),
      barZ: Number(getComputedStyle(document.querySelector('[data-r-topbar]')!).zIndex),
      scrimZ: Number(getComputedStyle(scrim).zIndex),
    }
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })

  // The bar really is on its rung, so this is not a test that passes because
  // the chrome forgot to raise itself.
  const rung = await rungs(page)
  expect(hit.barZ, 'the top bar is not on --role-z-chrome, so this proves nothing')
    .toBe(rung.chrome)
  expect(hit.inScrim, `a pointer over the top bar landed on <${hit.tag}>, through the scrim`)
    .toBe(true)
  // …and it is the LADDER that put it there, at the rung L-44 names for a
  // drawer or bottom sheet — not a number this component chose.
  expect(hit.scrimZ).toBe(rung.drawer)
  for (const under of ['dropdown', 'chrome', 'floating'] as const) {
    expect(hit.scrimZ, `the scrim does not clear --role-z-${under}`)
      .toBeGreaterThan(rung[under])
  }
  // The two rungs are the standard's, in the standard's order (R9 / L-42).
  expect(rung.drawer).toBeLessThan(rung.modal)
})

test('the nav sheet is a drawer above 760 and a bottom sheet at or below it, with no band between', async ({ page }) => {
  // F6 — measured in Chrome before the fix: 760 → a bottom sheet; **764 → a
  // centred rounded card 716px wide**; 768 → an inline-start drawer. The box was
  // keyed on Tailwind's `md` (768) while the scrim beside it used the design's
  // 760, so 761–767 was neither presentation. The sheet is reachable at every
  // width ≤1080 (its opener is `hidden max1080:flex`) and from the crumb strip
  // at all of them, and NO spec measured its box at any width.
  const sheet = await openSheet(page)
  // The crumb strip carries no rung, so the hit test above cannot run here —
  // but the rung itself can be asserted at every width, and this is the only
  // block that opens the sheet at 1440 at all.
  expect(await sheet.evaluate((el) => Number(getComputedStyle(el.parentElement!).zIndex)))
    .toBe((await rungs(page)).drawer)
  const measure = () => sheet.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const scrim = getComputedStyle(el.parentElement!)
    return {
      width: Math.round(box.width),
      viewport: Math.round(document.documentElement.clientWidth),
      bottomGap: Math.round(document.documentElement.clientHeight - box.bottom),
      topLeft: cs.borderTopLeftRadius,
      bottomLeft: cs.borderBottomLeftRadius,
      align: scrim.alignItems,
      padding: scrim.paddingTop,
    }
  })

  for (const width of [760, 764, 768, 1080]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(sheet).toBeVisible()
    const m = await measure()
    if (width <= 760) {
      // A bottom sheet: full width, flush with the bottom, in a scrim with no
      // padding, flat-bottomed and — owner ruling R35 — 22px on top.
      expect(m.width, `${width}: not full width`).toBe(m.viewport)
      expect(m.align, `${width}: the scrim is not bottom-aligned`).toBe('flex-end')
      expect(m.padding, `${width}: the scrim kept its inset`).toBe('0px')
      expect(m.bottomGap, `${width}: the sheet is not flush with the bottom`).toBe(0)
      expect(m.topLeft, `${width}: §5.2 draws the drawer-as-sheet at 22px (R35)`).toBe('22px')
      expect(m.bottomLeft, `${width}: a bottom sheet has no bottom corners`).toBe('0px')
    } else {
      // A drawer: --width-drawer wide, full height, anchored to the inline
      // start, radiused on all four corners. 764 is the band, and it is the
      // reason this loop is not [760, 1080].
      expect(m.width, `${width}: not the drawer's own width`).toBe(340)
      expect(m.align, `${width}: the scrim is not centred`).toBe('center')
      expect(m.bottomGap, `${width}: a drawer is full height`).toBe(24)
      expect(m.topLeft, `${width}: a drawer is the dialog radius on all four corners`).toBe('24px')
      expect(m.bottomLeft, `${width}: a drawer is the dialog radius on all four corners`).toBe('24px')
    }
  }
})

test('the «مدیریت» popover closes on Escape, from the keyboard alone', async ({ page }) => {
  // Probed before this landed: open, press Escape, the menu is still there. The
  // only exits were a mouse click on the trigger or on an `aria-hidden` scrim,
  // so a keyboard-only caller could tab through the menu, past it, and never
  // dismiss it. `src/ui/Menu.tsx` and `src/ui/Overlay.tsx` both answer Escape
  // through the shared dismissible stack; this shell now joins it.
  await administrator(page)
  await page.goto('/departments')
  await page.locator('[data-r-topbar]').waitFor()
  await pinPage(page, "goto('/departments')")
  test.skip(page.viewportSize()!.width <= 1080, 'the nav tray is hidden at this width, by design')
  const trigger = page.getByRole('button', { name: /مدیریت/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  // …and the keyboard is back on the trigger, so the next Tab carries on from
  // the bar rather than restarting at the top of the document.
  await expect(trigger).toBeFocused()
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

/**
 * Every control on one surface, at rest and hovered, against what is painted
 * behind it. `least` is the floor on how many were actually measured, so a
 * selector that matches nothing cannot pass.
 */
async function expectNothingVanishesOnHover(page: Page, root: string, least: number) {
  const controls = page.locator(`${root} a, ${root} button`)
  const n = await controls.count()
  expect(n, `${root} drew almost nothing, so this check is about nothing`).toBeGreaterThan(least)
  let measured = 0
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i)
    if (!(await c.isVisible())) continue
    // At rest first: a control that is already illegible is not a hover defect.
    expect(await contrastOf(c), `${root} control ${i} at rest`).toBeGreaterThan(LEGIBLE)
    await c.hover()
    await expect(c).toHaveCSS('cursor', /pointer|default/)
    const ratio = await contrastOf(c)
    expect(
      ratio,
      `${root} control ${i} (${(await c.textContent())?.trim() || (await c.getAttribute('aria-label'))}) ` +
      `hovered: its label is ${ratio.toFixed(2)}:1 against its own fill`,
    ).toBeGreaterThan(LEGIBLE)
    measured++
  }
  expect(measured, `every control in ${root} was invisible, so nothing was measured`)
    .toBeGreaterThan(least - 1)
  await page.mouse.move(0, 0)
}

test('no header control disappears when you point at it', async ({ page }) => {
  // Audit S1, measured: `text-card` over `hover:bg-tile-v2` is white on #F4EFFB,
  // about 1.04:1, and jsdom could never have caught it. The floor is the
  // harness's LEGIBLE — deliberately not WCAG AA, which this design does not
  // meet anywhere; what is being caught is text a reader cannot see AT ALL.
  await home(page)
  await expectNothingVanishesOnHover(page, '[data-r-topbar]', 2)
})

test('no CRUMB STRIP control disappears when you point at it either', async ({ page }) => {
  // The half this sweep was missing, and the one that matters most: the strip
  // is the chrome on six of the eight panel routes, and its opener is the only
  // route to sign-out on all six. The unit twin is a class-name pairing check
  // that a mutation dropping the hover half of the ghost recipe walks straight
  // through — `Icon` draws in `currentColor`, so a `text-card` label on the
  // strip's own white box is an empty white square where sign-out is, and only
  // a browser can weigh one against the other.
  await administrator(page)
  await page.goto('/departments/dining')
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, "goto('/departments/dining')")
  await expectNothingVanishesOnHover(page, '[data-r-crumbbar]', 2)
})

test('no SHEET row disappears when you point at it', async ({ page }) => {
  // The third chrome surface, and the only one a phone has. §6.0's
  // current-entry highlight is a white label on the brand violet, and the
  // resting rows hover onto `--tile-v2` — put those two together on one row and
  // it is audit S1's 1.04:1 pairing again, on the app's whole mobile menu.
  await administrator(page)
  // `/profile` because the sheet DRAWS that route, so its row wears §6.0's
  // current-entry paint while every other row is at rest — both are on screen
  // at once. It is also one of the three screens with no back control, and the
  // strip's opener is drawn at every width, so this runs on all three projects.
  // The screen behind it makes no read of its own, so it needs no stub.
  await page.goto('/profile')
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, "goto('/profile')")
  await page.locator('[data-r-crumbbar] [data-r-menu]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNothingVanishesOnHover(page, '[role="dialog"]', 4)
})

test('the strip’s opener is reachable from the keyboard, and its cluster reads «خانه» first', async ({ page }) => {
  // Two defects one control apart, neither of them visible to a class-name
  // check. `tabIndex={-1}` leaves a keyboard-only caller with no sign-out at
  // all on six of the eight routes — the element is still there, still
  // labelled, still the right size, still clickable by a mouse. And an `order-`
  // on either control transposes the cluster without moving a line of markup:
  // the deliverable reads «خانه» first from the inline start (Panel :188-190),
  // and RTL makes that the RIGHT-hand end.
  await administrator(page)
  await page.goto('/departments/dining')
  await page.locator('[data-r-crumbbar]').waitFor()
  await pinPage(page, "goto('/departments/dining')")
  const homeBtn = page.getByRole('link', { name: 'خانه' })
  const opener = page.locator('[data-r-crumbbar] [data-r-menu]')
  await expect(homeBtn).toBeVisible()
  await expect(opener).toBeVisible()
  // The two are adjacent in the cluster, so one Tab off «خانه» must land on the
  // opener. A `tabIndex` of -1 takes it out of the sequence and the Tab runs
  // past it into the page.
  await homeBtn.focus()
  await page.keyboard.press('Tab')
  await expect(opener).toBeFocused()
  // …and Enter on it opens the sheet, so the keyboard reaches sign-out.
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'خروج' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  // The painted order, which is the half `order-` moves.
  const [h, o] = [(await homeBtn.boundingBox())!, (await opener.boundingBox())!]
  expect(h.x, 'RTL: «خانه» is the inline-start control, so it sits to the RIGHT of the opener')
    .toBeGreaterThan(o.x)
  expect(Math.round(h.width), 'the deliverable draws both cluster controls at 36px').toBe(36)
  expect(Math.round(o.width)).toBe(36)
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
