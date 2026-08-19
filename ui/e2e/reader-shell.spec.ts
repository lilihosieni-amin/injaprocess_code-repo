import { test, expect, type Page } from '@playwright/test'
import type { Department, Process } from '../src/api/types'
import { FIELD, LEGIBLE, SURFACE, pinPage, serve, shot, signedIn, visit } from './_harness'

/*
 * One spec, three projects: playwright.config.ts runs it at 1440, 1080 and 760.
 * vitest renders on jsdom, which does no layout and computes no colour — which
 * is exactly why nine screens shipped with every individual value legal and the
 * page still wrong (R6).
 *
 * ## Why there is no `expectDesign(page, 'reader-shell')` here
 *
 * The plan's Step 11 calls it. There is no such row and there cannot be one:
 * `DESIGN` holds nine rows and every one of them is a SCREEN. The function reads
 * `[data-screen="<name>"]` and grades a column max-width, a used column width, a
 * four-sided screen padding, an H1 and a body line off it, and the reader chrome
 * is none of those things: it has no `data-screen`, no column and no title. The
 * same was true of `PanelShell` and is recorded in
 * `.superpowers/sdd/ui-task-12-report.md`; `_harness.ts` is frozen in any case.
 *
 * So the chrome is graded here, directly, against the deliverable's own lines.
 *
 * ## What this file is for that the jsdom suite is not
 *
 * R3 says the two surfaces differ deliberately. Every one of those differences
 * is a COMPUTED value: `--role-iconbtn` is 40px on `:root` and 42px under
 * `[data-surface='reader']` from the identical class string, `--role-lh-lockup`
 * is 1.25 and 1.3 the same way, and jsdom resolves no custom property at all. A
 * reader chrome that had quietly taken the panel's scale passes the whole vitest
 * file and shows up here.
 */

const TWO: Department[] = [
  { code: 'dining', name: 'سالن', count: 3, subs: 0 },
  { code: 'cooking', name: 'پخت', count: 6, subs: 3 },
]

/** R4's own fixture: one reachable department, so the list is never drawn. */
const ONE: Department[] = [{ code: 'dining', name: 'سالن', count: 3, subs: 0 }]

const PROCESSES: Process[] = []

const PROCESS: Process = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از مهمان', summary: 'خلاصه',
  parent: null,
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [], edges: [], pending: [],
}

/**
 * A reader — no panel capability at all, which is what `selectShell` reads to
 * choose this shell — scoped to the two departments the fixture serves.
 */
const READER = {
  role: 'reader',
  displayName: 'سحر بیات',
  capabilities: ['view', 'comment', 'export_pdf'],
  scopes: ['dept:dining', 'dept:cooking'],
}

async function reader(page: Page, depts: Department[] = TWO, over: Record<string, unknown> = {}) {
  await signedIn(page, { ...READER, ...over })
  await serve(page, {
    '/api/departments': depts,
    '/api/departments/dining/processes': PROCESSES,
    '/api/processes/dining-003': PROCESS,
    // A reader holds no `confirm`, so `useConfirmations` is disabled and this is
    // never asked for. Stubbed anyway: the gate is the screen's, and a screen
    // that loses it would otherwise reach the container on :8000 rather than
    // being named by `expectEveryEndpointStubbed`.
    '/api/confirmations?department=dining': [],
  })
}

/** The reader's root, where the design draws the top bar. */
async function home(page: Page) {
  await reader(page)
  // `departmentsReader`, not `departments`. Task 14 gave the reader half of the
  // board its own DESIGN row deliberately, because the two surfaces differ in
  // composition and not only in scale, so the screen hook differs too. This
  // helper still named the panel's, and every assertion below it timed out
  // waiting for a hook the reader never writes -- seven tests at three widths
  // that looked like design failures while grading nothing at all.
  await visit(page, '/departments', 'departmentsReader')
}

/** An inner screen, where the design draws the back bar instead. */
async function inner(page: Page, url = '/departments/dining') {
  await reader(page)
  await page.goto(url)
  await page.locator('[data-r-backbar]').waitFor()
  await pinPage(page, `goto('${url}')`)
}

/* ------------------------------------------------------------------ *
 * The top bar
 * ------------------------------------------------------------------ */

test('the reader top bar is the design’s white bar on a cream hairline', async ({ page }) => {
  await home(page)
  const bar = page.locator('[data-r-topbar]')
  await expect(bar).toBeVisible()
  // reader 133 — `background:#fff; border-bottom:1px solid #EFE7DC`.
  await expect(bar).toHaveCSS('background-color', SURFACE)
  await expect(bar).toHaveCSS('border-bottom-color', 'rgb(239, 231, 220)')
  await expect(bar).toHaveCSS('border-bottom-width', '1px')
  // The app's field behind everything (§6.0, §9.1). Audit S7 read this shell as
  // inverted against the design; §9.1 settles it the other way.
  await expect(page.locator('[data-shell="reader"]')).toHaveCSS('background-color', FIELD)
  await expect(bar).not.toHaveCSS('background-color', FIELD)
  // …and it spans the window, so no strip of the field shows through the chrome.
  const width = page.viewportSize()!.width
  const box = (await bar.boundingBox())!
  expect(Math.round(box.width), 'the bar is not spanning the window').toBe(width)
  expect(Math.round(box.x)).toBe(0)
  await shot(page, 'reader-shell')
})

test('the reader top bar pads 20px above 760 and 14px below it', async ({ page }) => {
  // reader 133 — `gap:12px; padding:12px 20px`; reader 97 —
  // `[data-r-topbar]{padding:10px 14px; gap:10px}` at ≤760.
  //
  // The PANEL draws `gap:14px; padding:12px 22px` on its own bar. Two pixels and
  // two pixels, from a token whose name is one word different, and this is the
  // only place either is measured. `--pad-reader-x` — the reader's CONTENT
  // gutter, 24px — is the third value that compiles here and is not this row.
  await home(page)
  const width = page.viewportSize()!.width
  const bar = page.locator('[data-r-topbar]')
  await expect(bar).toHaveCSS('padding-left', width <= 760 ? '14px' : '20px')
  await expect(bar).toHaveCSS('padding-right', width <= 760 ? '14px' : '20px')
  await expect(bar).toHaveCSS('padding-top', width <= 760 ? '10px' : '12px')
  await expect(bar).toHaveCSS('column-gap', width <= 760 ? '10px' : '12px')
})

test('the reader scale actually resolves on this surface', async ({ page }) => {
  // R3 — the scale layer, measured rather than assumed. jsdom resolves no custom
  // property, so this assertion is only meaningful in a browser, and it is the
  // whole reason neither shell writes a pixel for its icon buttons.
  await home(page)
  const role = await page.locator('[data-shell="reader"]').evaluate((el) => {
    const s = getComputedStyle(el)
    const read = (n: string) => s.getPropertyValue(n).trim()
    return {
      // R3's geometry switch, carried by `[data-surface='reader']`.
      body: read('--role-fs-body'),
      iconbtn: read('--role-iconbtn'),
      lockup: read('--role-lh-lockup'),
      column: read('--role-column'),
      // …and F8's density switch, which is a DIFFERENT layer on a different
      // attribute. The two are one letter apart in the name and neither
      // duplicates the other's declarations.
      density: read('--fs-role-body'),
    }
  })
  expect(role.body).toBe('15px')
  expect(role.iconbtn).toBe('42px')
  expect(role.iconbtn).not.toBe('40px')
  expect(role.lockup).toBe('1.3')
  expect(role.lockup).not.toBe('1.25')
  expect(role.column).toBe('720px')
  expect(role.density).toBe('15px')
})

test('the brand lockup takes the reader’s leading and the reader’s two type steps', async ({ page }) => {
  // reader 136-138 — `line-height:1.3`, then 14.5px over 11px. The panel draws
  // 1.25 over 14px over 10.5px, and `leading-lockup` is ONE class that is both.
  // A leading is a ratio, so it is read against the element's own font size
  // rather than as a px string: that is what makes it a scale and not a number.
  await home(page)
  const lockup = page.locator('[data-r-topbar] a > span')
  const m = await lockup.evaluate((el) => {
    const s = getComputedStyle(el)
    return { lh: parseFloat(s.lineHeight), fs: parseFloat(s.fontSize) }
  })
  expect(m.lh / m.fs).toBeCloseTo(1.3, 2)
  await expect(lockup.locator('span').first()).toHaveCSS('font-size', '14.5px')
  await expect(lockup.locator('span').nth(1)).toHaveCSS('font-size', '11px')
  // reader 138/2497 — that second line is the SIGNED-IN PERSON's role, put
  // through `roleLabel` because this app's `role` is a seed identifier (D50)
  // and the deliverable's is already a Persian word. `READER` above signs in as
  // `reader`; raw, this line would read `reader` in latin under «اینجا فست‌فود».
  await expect(lockup.locator('span').nth(1)).toHaveText('خواننده')
  // …and the logo beside it decoded, which `toBeVisible` cannot say: a broken
  // src is a visible element with no picture in it.
  const logo = page.locator('[data-r-topbar] img')
  const img = await logo.evaluate((el) => {
    const i = el as HTMLImageElement
    return { w: i.naturalWidth, drawn: i.getBoundingClientRect().width }
  })
  expect(img.w, 'the logo file did not decode — the <img> is drawing nothing').toBeGreaterThan(0)
  expect(img.drawn).toBe(38)
})

test('the reader’s icon buttons are 42px, not the panel’s 34 — and catch a 44px pointer', async ({ page }) => {
  await home(page)
  for (const control of [
    page.getByRole('link', { name: 'پروفایل من' }),
    page.getByRole('button', { name: 'خروج' }),
  ]) {
    const box = (await control.boundingBox())!
    expect(Math.round(box.width)).toBe(42)
    expect(Math.round(box.height)).toBe(42)
    await expect(control).toHaveCSS('border-radius', '12px')
    // F11's floor, as a pointer actually lands: the painted box stays the
    // design's 42 and a transparent `::before` grows the target to 52. Nothing
    // about that is visible in a snapshot, in a build, or in jsdom, which
    // computes no boxes at all — so it is probed 3px outside the drawn edge.
    const probe = { x: box.x + box.width + 3, y: box.y + box.height / 2 }
    const hit = await page.evaluate((p) => {
      const el = document.elementFromPoint(p.x, p.y)
      return el === null ? null : (el.closest('a, button')?.getAttribute('aria-label') ?? el.tagName)
    }, probe)
    expect(hit, 'a pointer 3px off the drawn edge did not land on this control')
      .toBe(await control.getAttribute('aria-label'))
  }
})

/* ------------------------------------------------------------------ *
 * The back bar
 * ------------------------------------------------------------------ */

test('a back bar below the root, and no chrome at all on the flowchart', async ({ page }) => {
  await inner(page)
  await expect(page.locator('[data-r-backbar]')).toBeVisible()
  await expect(page.locator('[data-r-topbar]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/departments')
  await shot(page, 'reader-backbar')

  // R3 — "a back bar, and neither on the flow screen". The panel keeps its crumb
  // strip here and this shell keeps nothing.
  await page.goto('/processes/dining-003/flow')
  await page.getByText('پذیرایی از مهمان').waitFor()
  await pinPage(page, "goto('/processes/dining-003/flow')")
  await expect(page.locator('[data-r-backbar]')).toHaveCount(0)
  await expect(page.locator('[data-r-topbar]')).toHaveCount(0)
  // …and the screen behind it is still there, so this is a bar that is absent
  // rather than a shell that rendered nothing.
  await expect(page.locator('[data-shell="reader"] main')).toBeVisible()
  // R21 — and this is the other half of "no chrome": the design puts «بازگشت»
  // INSIDE the flow toolbar (reader 312-313, `data-r-flowback` as its first
  // child) rather than on a bar of its own. Before it landed, the complete set
  // of controls a reader was offered on this screen was «ویرایش» and React
  // Flow's three zoom buttons — no back, no home, no sign-out, no link of any
  // kind, measured in this browser.
  const flowback = page.locator('[data-r-flowback]')
  await expect(flowback).toBeVisible()
  await expect(flowback).toHaveAttribute('href', '/processes/dining-003')
  await shot(page, 'reader-flow-nochrome')
})

test('a reader can LEAVE the flowchart, which is what R21 is for', async ({ page }) => {
  // The dead end, closed and then walked. `toHaveAttribute` says the control
  // points somewhere; only the click says a reader gets there — a `<Link>` whose
  // `to` never reaches the router, or a control the canvas paints over, has the
  // right href and goes nowhere.
  await reader(page)
  await page.goto('/processes/dining-003/flow')
  await page.getByText('پذیرایی از مهمان').waitFor()
  await pinPage(page, "goto('/processes/dining-003/flow')")
  await page.locator('[data-r-flowback]').click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/processes/dining-003')
  // …and where they land has the reader's own chrome on it, so the way out
  // continues rather than stopping one screen later.
  await expect(page.locator('[data-r-backbar]')).toBeVisible()
})

test('the flow toolbar’s «بازگشت» is drawn at the design’s own numbers', async ({ page }) => {
  // reader 313 — `padding:9px 13px; border-radius:11px; font-weight:700;
  // font-size:13px; gap:6px`, on `#F4EFFB` behind a `1.5px solid #E3D8F5`, with
  // a 15px chevron at `stroke-width:2.4` pointing the way an RTL reader came
  // from. Every one of those numbers differs from the back BAR's «بازگشت» one
  // route over, which is `10px 15px / radius 12 / 13.5px / gap 7px` — so a
  // control copied off that bar compiles, paints, reads correctly and is the
  // wrong size on the one screen the design draws this one on.
  await reader(page)
  await page.goto('/processes/dining-003/flow')
  await page.getByText('پذیرایی از مهمان').waitFor()
  await pinPage(page, "goto('/processes/dining-003/flow')")
  const back = page.locator('[data-r-flowback]')
  await expect(back).toHaveCSS('padding-top', '9px')
  await expect(back).toHaveCSS('padding-left', '13px')
  await expect(back).toHaveCSS('border-radius', '11px')
  await expect(back).toHaveCSS('font-size', '13px')
  await expect(back).toHaveCSS('font-weight', '700')
  await expect(back).toHaveCSS('column-gap', '6px')
  await expect(back).toHaveCSS('background-color', 'rgb(244, 239, 251)')
  await expect(back).toHaveCSS('color', 'rgb(74, 37, 169)')
  await expect(back).toHaveCSS('border-top-color', 'rgb(227, 216, 245)')
  const glyph = back.locator('svg')
  await expect(glyph).toHaveAttribute('width', '15')
  await expect(glyph).toHaveAttribute('stroke-width', '2.4')
  await expect(glyph.locator('path')).toHaveAttribute('d', 'M9 18l6-6-6-6')
  // It is the INLINE-START control on that toolbar (reader 313 is the bar's
  // first child), which in RTL means it sits to the right of everything else.
  const box = (await back.boundingBox())!
  const id = (await page.getByText('dining-003').boundingBox())!
  expect(box.x, '«بازگشت» is not the inline-start control on the flow toolbar')
    .toBeGreaterThan(id.x)
})

test('the back bar keeps its 20px gutter at every width, and the field does not show through', async ({ page }) => {
  // reader 156 — `gap:10px; padding:10px 20px`, and the deliverable writes its
  // ≤760 override against `[data-r-topbar]` BY NAME (reader 97) and writes none
  // for this bar. So the gutter is the same at all three widths, exactly as the
  // panel's own strip is — a `max760:px-s7` copied off the bar above narrows
  // this one by six pixels on every phone and nothing else says so.
  await inner(page)
  const bar = page.locator('[data-r-backbar]')
  await expect(bar).toHaveCSS('padding-left', '20px')
  await expect(bar).toHaveCSS('padding-right', '20px')
  await expect(bar).toHaveCSS('padding-top', '10px')
  await expect(bar).toHaveCSS('column-gap', '10px')
  // It is the WHITE bar, not the panel's lavender strip behind a violet
  // hairline — which is `rgb(244, 239, 251)` on `rgb(227, 216, 245)` and is what
  // every control on this bar is painted IN.
  await expect(bar).toHaveCSS('background-color', SURFACE)
  await expect(bar).toHaveCSS('border-bottom-color', 'rgb(239, 231, 220)')
  await expect(page.locator('[data-shell="reader"]')).toHaveCSS('background-color', FIELD)
  const width = page.viewportSize()!.width
  const box = (await bar.boundingBox())!
  expect(Math.round(box.width), 'the bar is not spanning the window').toBe(width)
  expect(Math.round(box.x)).toBe(0)
})

test('every control on the reader’s bars is the LAVENDER box the design draws', async ({ page }) => {
  // reader 142, 148, 157, 162 — `background:#F4EFFB; border:1.5px solid #E3D8F5;
  // color:#4A25A9`, on all four.
  //
  // This is the reversal that makes the two surfaces different rather than
  // scaled: the panel puts a WHITE control on a lavender strip, the reader a
  // LAVENDER control on a white bar. `bg-card` — the panel's own ghost recipe,
  // byte for byte — compiles, builds, passes every class-name assertion in the
  // vitest file, and paints a white button on a white bar with a hairline round
  // it. Only a composited measurement can tell the two apart.
  const TILE = 'rgb(244, 239, 251)'
  const VIOLET = 'rgb(74, 37, 169)'
  const LINE = 'rgb(227, 216, 245)'
  await inner(page)
  for (const control of [
    page.getByRole('link', { name: 'بازگشت' }),
    page.getByRole('link', { name: 'خانه' }),
  ]) {
    await expect(control).toHaveCSS('background-color', TILE)
    await expect(control).not.toHaveCSS('background-color', SURFACE)
    await expect(control).toHaveCSS('color', VIOLET)
    await expect(control).toHaveCSS('border-top-color', LINE)
    // The hairline is `--border-hairline` 1.5px and Chrome reports `1px`: the
    // computed value of a border width is the USED one, snapped to a whole
    // device pixel, and these three projects all run at DPR 1. So the NUMBER is
    // not observable here at any width — it is pinned by name in
    // `shells.test.tsx`, which compiles the class string — and what is
    // observable, and asserted, is that a border is drawn at all and in the
    // colour the design gives it. `border-hairline` dropped entirely computes
    // `0px` and `none`, which is the failure this can see.
    await expect(control).toHaveCSS('border-top-style', 'solid')
    await expect(control).not.toHaveCSS('border-top-width', '0px')
  }
  await page.goto('/departments')
  await page.locator('[data-r-topbar]').waitFor()
  await pinPage(page, "goto('/departments')")
  for (const control of [
    page.getByRole('link', { name: 'پروفایل من' }),
    page.getByRole('button', { name: 'خروج' }),
  ]) {
    await expect(control).toHaveCSS('background-color', TILE)
    await expect(control).toHaveCSS('color', VIOLET)
    await expect(control).toHaveCSS('border-top-color', LINE)
  }
})

test('«بازگشت» is drawn at all five of the reader’s own numbers', async ({ page }) => {
  // reader 157 — `gap:7px; padding:10px 15px; border-radius:12px;
  // font-weight:700; font-size:13.5px`, against the panel's own back button at
  // `gap:6px; padding:7px 12px; radius 11; 12.5px`. Five values, five different,
  // and one class string carries all of them.
  await inner(page)
  const back = page.getByRole('link', { name: 'بازگشت' })
  await expect(back).toHaveCSS('padding-top', '10px')
  await expect(back).toHaveCSS('padding-left', '15px')
  await expect(back).toHaveCSS('border-radius', '12px')
  await expect(back).toHaveCSS('font-size', '13.5px')
  await expect(back).toHaveCSS('font-weight', '700')
  await expect(back).toHaveCSS('column-gap', '7px')
  // The chevron in it is 16px (reader 158) and points the way an RTL reader came
  // from, which is to the RIGHT. `chevronEnd` is the same picture mirrored.
  const glyph = back.locator('svg')
  await expect(glyph).toHaveAttribute('width', '16')
  await expect(glyph.locator('path')).toHaveAttribute('d', 'M9 18l6-6-6-6')
  // …and F11's floor, which those five values leave it 1.75px short of: the
  // design draws this button 42.25px tall, and 42 is a rung of the same control
  // ladder the two icon buttons are on. The painted box stays the design's and
  // the `::before` grows the target, so the probe is 3px below the drawn edge.
  //
  // `expectExpandedHitArea` cannot say this one: it RESOLVES the drawn box from
  // the element's own `w-`/`h-` classes, and this control has neither — its box
  // is its padding and its text. So it is measured here or nowhere.
  const box = (await back.boundingBox())!
  expect(box.height, 'the drawn button already meets the floor, so the overlay is the wrong tool')
    .toBeLessThan(44)
  const probe = { x: box.x + box.width / 2, y: box.y + box.height + 3 }
  const hit = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y)
    return el === null ? null : (el.closest('a, button')?.textContent?.trim() ?? el.tagName)
  }, probe)
  expect(hit, 'a pointer 3px below the drawn edge did not land on «بازگشت»').toBe('بازگشت')
})

test('the home square is the reader’s 38px box, and it catches a 44px pointer', async ({ page }) => {
  // reader 162 — `38×38; border-radius:11px`. The panel's three squares are all
  // 36 (`--size-menu-more`), and `--size-logo-bar` is also 38 and belongs to the
  // logo IMAGE: a same-value swap paints identically.
  await inner(page)
  const home = page.getByRole('link', { name: 'خانه' })
  const box = (await home.boundingBox())!
  expect(Math.round(box.width)).toBe(38)
  expect(Math.round(box.height)).toBe(38)
  await expect(home).toHaveCSS('border-radius', '11px')
  await expect(home.locator('svg')).toHaveAttribute('width', '17')
  const probe = { x: box.x - 3, y: box.y + box.height / 2 }
  const hit = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y)
    return el === null ? null : (el.closest('a, button')?.getAttribute('aria-label') ?? el.tagName)
  }, probe)
  expect(hit, 'a pointer 3px off the drawn edge did not land on «خانه»').toBe('خانه')
})

test('the back bar names the screen it is on, on one line, between its two controls', async ({ page }) => {
  // reader 160 — the one piece of text on this bar, and the thing that says
  // which document you are in. `flex:1; min-width:0` with an ellipsis, so a long
  // department name pushes neither control off the bar nor onto a second row.
  await inner(page)
  const bar = page.locator('[data-r-backbar]')
  const title = bar.locator('> span')
  await expect(title).toHaveText('سالن')
  await expect(title).toHaveCSS('font-size', '13.5px')
  await expect(title).toHaveCSS('text-overflow', 'ellipsis')
  await expect(title).toHaveCSS('white-space', 'nowrap')
  // One row: all three sit on the bar's own centre line. A title that wrapped,
  // or a control that dropped below it, moves one of these three off it — and
  // the height of the bar alone cannot say so, because a bar that grew to fit
  // two rows is a bar that fits its content either way.
  const barBox = (await bar.boundingBox())!
  const back = (await page.getByRole('link', { name: 'بازگشت' }).boundingBox())!
  const homeBox = (await page.getByRole('link', { name: 'خانه' }).boundingBox())!
  const titleBox = (await title.boundingBox())!
  const mid = barBox.y + barBox.height / 2
  for (const [what, b] of [['بازگشت', back], ['title', titleBox], ['خانه', homeBox]] as const) {
    expect(Math.abs(b.y + b.height / 2 - mid), `${what} is off the bar's centre line`).toBeLessThan(2)
  }
  // RTL — «بازگشت» is the inline-start control, so it sits to the RIGHT of the
  // title, and «خانه» is at the far left. An `order-` on any of the three
  // transposes the bar without moving a line of markup.
  expect(back.x).toBeGreaterThan(titleBox.x)
  expect(titleBox.x).toBeGreaterThan(homeBox.x)
})

/* ------------------------------------------------------------------ *
 * R4, in a real browser
 * ------------------------------------------------------------------ */

test('R4 — a reader with one department lands on its process list, with no way back to a list', async ({ page }) => {
  // The plan expected this to be un-exercisable here on the grounds that the
  // harness's fixture is a many-department reader. It is not: `signedIn` takes
  // the session and `serve` takes the department list, so the rule is a browser
  // navigation like any other — and it is the only place the REDIRECT itself is
  // measured, rather than the routing decision behind it.
  await reader(page, ONE, { scopes: ['dept:dining'] })
  await page.goto('/departments')
  await page.locator('[data-r-topbar]').waitFor()
  await pinPage(page, "goto('/departments')")
  expect(new URL(page.url()).pathname).toBe('/departments/dining')
  // That list is now their root, so it carries the TOP bar and no back bar…
  await expect(page.locator('[data-r-backbar]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'بازگشت' })).toHaveCount(0)
  // …and sign-out is one control away, which is what the top bar being here
  // buys them: the back bar has no sign-out on it at all.
  // `exact`, because Playwright matches an accessible name as a SUBSTRING by
  // default and the process list beneath this bar draws «خروجی‌ها» — the exports
  // control — which contains «خروج» and is a different button entirely.
  await expect(page.getByRole('button', { name: 'خروج', exact: true })).toBeVisible()
  // …and «خانه» one level down points at THEIR root rather than at the list.
  await page.goto('/processes/dining-003')
  await page.locator('[data-r-backbar]').waitFor()
  await pinPage(page, "goto('/processes/dining-003')")
  await expect(page.getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/departments/dining')
})

/* ------------------------------------------------------------------ *
 * The badge, and audit S1 measured rather than asserted from a class name
 * ------------------------------------------------------------------ */

test('the approval count is a 19px round badge in Persian', async ({ page }) => {
  // Audit S4 and S5 together. reader 145 — `min-width:19px; height:19px;
  // border-radius:50%` on the coral, and the digits Persian.
  await reader(page, TWO, { pendingApprovals: 4 })
  await visit(page, '/departments', 'departmentsReader')
  const badge = page.getByRole('status')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('۴')
  const box = (await badge.boundingBox())!
  expect(Math.round(box.height), 'audit S5 — the badge inherited the 44px touch floor').toBe(19)
  expect(Math.round(box.width)).toBe(19)
  await expect(badge).toHaveCSS('background-color', 'rgb(250, 90, 82)')
  await expect(badge).toHaveCSS('border-radius', /50%|9.5px/)
})

/**
 * The contrast of an element's own text against what is painted behind it.
 *
 * Composited from the first fully opaque ancestor inward, which is what the
 * compositor does, so a control with a transparent fill is graded against the
 * bar behind it rather than reported as 1.0 against nothing.
 *
 * A second copy of `panel-shell.spec.ts`'s helper, and deliberately so rather
 * than by import: a spec file's `test()` calls run at module scope, so importing
 * one spec from another registers its whole suite twice. The home for this is
 * `_harness.ts`, which is frozen for the duration of this plan; recorded in this
 * task's report.
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
 * Nothing on this bar stops being visible when a pointer lands on it.
 *
 * TWO readings, because a control can go missing in two ways and the first
 * spelling of this function could only see one of them.
 *
 *  · its LABEL against its own fill, which is what `contrastOf` grades; and
 *  · its BOX against the bar behind it, which is not a contrast question at
 *    all. `hover:bg-card` on the reader's ghost — the other half of the panel's
 *    recipe, and one word — paints the hovered control exactly the colour of
 *    the bar it sits on. The label stays violet on white and reads perfectly,
 *    so the ratio above says nothing is wrong; the tile the design draws has
 *    disappeared under the pointer. The name of this function promised that and
 *    the body measured only the first half of it.
 *
 * Asked only of a control that paints a tile AT REST: the brand lockup is a
 * transparent link on the bar and there is no box of its own to lose.
 */
async function expectNothingVanishesOnHover(page: Page, root: string, least: number) {
  const controls = page.locator(`${root} a, ${root} button`)
  const n = await controls.count()
  expect(n, `${root} drew almost nothing, so this check is about nothing`).toBeGreaterThan(least)
  const fill = (el: ReturnType<Page['locator']>) =>
    el.evaluate((e) => getComputedStyle(e).backgroundColor)
  const bar = await fill(page.locator(root))
  let measured = 0
  let tiles = 0
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i)
    if (!(await c.isVisible())) continue
    const name = (await c.textContent())?.trim() || (await c.getAttribute('aria-label'))
    expect(await contrastOf(c), `${root} control ${i} at rest`).toBeGreaterThan(LEGIBLE)
    // Transparent at rest, or already the bar's own colour, is not a tile.
    const rest = await fill(c)
    const isTile = rest !== bar && !/,\s*0\)$/.test(rest)
    await c.hover()
    await expect(c).toHaveCSS('cursor', /pointer|default/)
    const ratio = await contrastOf(c)
    expect(
      ratio,
      `${root} control ${i} (${name}) hovered: its label is ${ratio.toFixed(2)}:1 against its own fill`,
    ).toBeGreaterThan(LEGIBLE)
    if (isTile) {
      expect(
        await fill(c),
        `${root} control ${i} (${name}) hovered: its fill became ${bar}, which is the bar's own — ` +
        'the label is still legible and the control is no longer a box',
      ).not.toBe(bar)
      tiles++
    }
    measured++
  }
  expect(measured, `every control in ${root} was invisible, so nothing was measured`)
    .toBeGreaterThan(least - 1)
  expect(tiles, `no control in ${root} painted a tile of its own, so the box half measured nothing`)
    .toBeGreaterThan(0)
  await page.mouse.move(0, 0)
}

test('no control on the reader’s top bar disappears when you point at it', async ({ page }) => {
  // Audit S1, measured: `text-card` over `--tile-v2` is white on #F4EFFB, about
  // 1.04:1, and jsdom could never have caught it. On THIS surface the lavender
  // is the control's RESTING fill, so a label colour copied off the wrong half
  // of the panel's recipe is that pairing from the first frame rather than on
  // hover. The floor is the harness's LEGIBLE — deliberately not WCAG AA, which
  // this design does not meet anywhere; what is caught is text a reader cannot
  // see AT ALL.
  await home(page)
  await expectNothingVanishesOnHover(page, '[data-r-topbar]', 1)
})

test('no control on the reader’s BACK BAR disappears when you point at it either', async ({ page }) => {
  // The chrome on every screen but one, and the only route back from any of
  // them. `Icon` draws in `currentColor`, so an unreadable label here is an
  // empty lavender square where «بازگشت» is.
  await inner(page)
  await expectNothingVanishesOnHover(page, '[data-r-backbar]', 1)
})
