import { test, expect, type Page } from '@playwright/test'
import type { Department, Process } from '../src/api/types'
import { FIELD, ON_FIELD, pinPage, serve, shot, signedIn } from './_harness'

/**
 * R40 — **the flowchart screen is cream, for everyone.**
 *
 * Owner ruling: *"the flowchart screen background should back to last version
 * cream color. all flowchart screen for all people should be cream."* It is a
 * regression, not a preference. At this branch's merge base `PanelShell` painted
 * `bg-bg` on its root; the shell rebuild moved both shell roots to `bg-ink`
 * (§6.0's violet field, which is right for every other screen and is pinned for
 * eight of them by `sweep.spec.ts`), and `FlowScreen` paints no ground of its
 * own — so the canvas silently inherited violet. Ledger **L-01** records
 * `#FBF7F1` as *"the flow canvas's ground"*, which is `ON_FIELD` here.
 *
 * **The shells are not reverted, and this file pins that too.** Every test below
 * asserts the shell root behind the screen is still `FIELD`. A fix that repainted
 * the shell would make the flow screen cream and take seven other screens off the
 * field with it, and no assertion in this suite outside `sweep.spec.ts` would
 * notice.
 *
 * ## Why this cannot be a vitest assertion
 *
 * A background is paint. `FlowScreen`'s root is an ancestor of a React Flow pane
 * whose own `.react-flow` background-color is `transparent` by default
 * (`@xyflow/react/dist/style.css`), so what a reader sees on the canvas is
 * decided by compositing four levels of transparent boxes against the first
 * opaque one — jsdom computes none of that, lays nothing out, and paints
 * nothing. This exact defect class, a background jsdom cannot see, has shipped
 * twice on this project.
 */

const DEPARTMENTS: Department[] = [
  { code: 'dining', name: 'سالن', count: 2, subs: 0 },
  { code: 'cooking', name: 'پخت', count: 1, subs: 0 },
]

/** Two activities and the edge between them, so the canvas has something on it —
 *  an empty graph would let a cream `<div>` behind an empty pane pass for a
 *  cream canvas. */
const PROCESS: Process = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از میهمان', parent: null,
  summary: 'میهمان از در ورودی تا میز خود همراهی می‌شود.',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [],
  nodes: [
    {
      id: 'n1', type: 'activity', label: 'استقبال', description: '', actor: 'میزبان',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] },
    },
    {
      id: 'n2', type: 'activity', label: 'هدایت به میز', description: '', actor: 'میزبان',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 260, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] },
    },
  ],
  edges: [{ from: 'n1', to: 'n2' }],
  pending: [],
}

/**
 * A second process in the department, so the next/previous group is drawn at all
 * — it is the first control the design takes off the bar at ≤760, and a bar that
 * never had it cannot prove it went.
 */
const SIBLING: Process = {
  ...PROCESS, id: 'dining-004',
  // Deliberately far longer than a phone's bar. `[data-r-pname]` clipping is a
  // rule about a name that does not fit, and a name that fits proves nothing
  // about it either way.
  name: 'تسویه حساب میهمان و صدور صورتحساب نهایی و دریافت وجه و بدرقهٔ ایشان تا درِ خروجی رستوران و ثبت بازخورد ایشان در دفتر نظرات و پیگیری رضایت میهمان',
}

/**
 * R46 — a mark for THIS process, at the fingerprint it was vouched for.
 *
 * `confirmed: true` is "the stored mark is for these bytes", not "a mark
 * exists": the server recomputes the fingerprint on read, so a flowchart whose
 * nodes moved since arrives `false`. Empty here before this task, which is why
 * nothing in this file had ever seen the control.
 */
const MARKS = [{
  target: 'dining-003', kind: 'process', fingerprint: 'c'.repeat(64),
  confirmed: true, confirmed_by: '09120000001', confirmed_at: 1_770_000_000,
}]

const STUBS: Record<string, unknown> = {
  '/api/departments': DEPARTMENTS,
  '/api/pending': [],
  '/api/departments/dining/processes': [PROCESS, SIBLING],
  '/api/confirmations?department=dining': MARKS,
  '/api/processes/dining-003': PROCESS,
  '/api/processes/dining-004': SIBLING,
}

/** A reader — no panel capability at all, which is what `selectShell` reads. */
const READER = {
  role: 'reader',
  displayName: 'سحر بیات',
  capabilities: ['view', 'comment', 'export_pdf'],
  scopes: ['dept:dining', 'dept:cooking'],
}

/**
 * Opens the flowchart on one of R3's two surfaces and waits for the canvas.
 *
 * Waiting on `.react-flow__renderer` rather than on the process name: the name is
 * in the toolbar, which mounts before React Flow has measured anything, and a
 * colour read off an unlaid-out pane is a colour read off a zero-height box.
 */
async function flow(page: Page, surface: 'panel' | 'reader') {
  await signedIn(page, surface === 'reader'
    ? READER
    : { capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'], scopes: ['*'] })
  await serve(page, STUBS)
  await page.goto('/processes/dining-003/flow')
  await page.locator(`[data-shell="${surface}"]`).waitFor()
  await page.locator('.react-flow__renderer').waitFor()
  await page.getByText('پذیرایی از میهمان').waitFor()
  await pinPage(page, `goto('/processes/dining-003/flow') as ${surface}`)
}

/**
 * The colour actually painted at a viewport point.
 *
 * The topmost element there, with every transparent box above it composited
 * against the first opaque background in its ancestor chain — which is what a
 * reader's eye does and what `getComputedStyle` on any single element cannot
 * say. `background-color: transparent` computes to `rgba(0, 0, 0, 0)` on the
 * React Flow pane, its viewport, its renderer and the `Canvas` box alike, so
 * every one of those four answers "nothing" and only the composite answers the
 * question the owner asked.
 *
 * Returns `rgb(r, g, b)`, rounded, so it compares against the harness constants
 * verbatim.
 */
async function paintedAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(([px, py]) => {
    const parse = (c: string): [number, number, number, number] | null => {
      const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(c.trim())
      if (!m) return null
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
    }
    const over = (top: number[], under: number[]): number[] => {
      const a = top[3]
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat([1])
    }
    const start = document.elementFromPoint(px, py)
    if (start === null) return 'no element at this point'
    const stack: string[] = []
    for (let n: Element | null = start; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      // A background IMAGE this method cannot reduce to a colour would make the
      // answer a guess; say so rather than guess. Nothing on this screen has one.
      if (s.backgroundImage !== 'none') return `background-image on <${n.tagName.toLowerCase()}>`
      stack.push(s.backgroundColor)
      const c = parse(s.backgroundColor)
      if (c && c[3] >= 1) break
    }
    let painted = [255, 255, 255, 1]
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = parse(stack[i])
      if (c && c[3] > 0) painted = over(c, painted)
    }
    return `rgb(${painted.slice(0, 3).map((v) => Math.round(v)).join(', ')})`
  }, [x, y] as const)
}

for (const surface of ['panel', 'reader'] as const) {
  test(`the flowchart screen is cream on the ${surface} surface`, async ({ page }) => {
    await flow(page, surface)

    // 1. The screen's own ground. `background-color` does not inherit, so this
    //    is the element that has to declare it — the shell above is violet and
    //    must stay violet.
    const screen = page.locator('[data-r-flow]')
    await expect(screen, 'the flow screen has no measurable root').toHaveCount(1)
    await expect(screen).toHaveCSS('background-color', ON_FIELD)

    // 2. The shell behind it is untouched. §6.0's field is right for every other
    //    screen and `bg-ink` on `[data-screen]` is pinned across the rebuild;
    //    repainting the shell would be the wrong fix and would pass check 1.
    await expect(page.locator(`[data-shell="${surface}"]`)).toHaveCSS('background-color', FIELD)

    // 3. And the canvas is cream where a reader actually looks — composited, not
    //    declared. Sampled at four points inside the React Flow pane rather than
    //    one, because `fitView` centres the graph and a node sitting under a
    //    single sample would be measuring the node's own fill.
    const pane = (await page.locator('.react-flow').boundingBox())!
    expect(pane.height, 'the canvas has no height to measure').toBeGreaterThan(80)
    for (const [fx, fy] of [[0.08, 0.12], [0.92, 0.12], [0.08, 0.88], [0.92, 0.88]] as const) {
      const x = pane.x + pane.width * fx
      const y = pane.y + pane.height * fy
      expect(await paintedAt(page, x, y), `the canvas at (${fx}, ${fy}) is not the cream L-01 gives it`)
        .toBe(ON_FIELD)
    }

    await shot(page, `flow-cream-${surface}`)
  })
}

test('the loading state paints the same cream the loaded screen does', async ({ page }) => {
  // `FlowScreen`'s `if (!ed.doc) return <div className="flex-1 bg-bg" />` — the
  // in-flight blank. It was already cream while the screen behind it was violet,
  // which is the wrong kind of consistency: the flash was the only correct pixel
  // on the route. Held here so the pair can only move together.
  await signedIn(page, { capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['*'] })
  await serve(page, STUBS)
  // The process read is delayed, so the blank is on screen long enough to grade.
  await page.route('**/api/processes/dining-003', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROCESS) })
  })
  await page.goto('/processes/dining-003/flow')
  await page.locator('[data-shell="panel"]').waitFor()
  await pinPage(page, "goto('/processes/dining-003/flow') with the read delayed")
  const blank = page.locator('[data-shell="panel"] main > div')
  await expect(blank).toHaveCSS('background-color', ON_FIELD)
  // …and then the loaded screen, which is the same colour by the same token.
  await page.locator('.react-flow__renderer').waitFor()
  await expect(page.locator('[data-r-flow]')).toHaveCSS('background-color', ON_FIELD)
})

/**
 * **Owner ruling R46 — the flowchart at the three widths the design declares.**
 *
 * *"in mobile version it doesn't responsive now. find the different between
 * current ui and design in flowchart screen and fix it."*
 *
 * Not an exaggeration: at this task's merge base `FlowScreen.tsx` contained
 * **zero** `max760:` or `max1080:` variants, alone among the screens, because
 * `src/flow/` was frozen for the whole 25-task rebuild (F16). NFR-15 is explicit
 * that staff read and comment on phones and that the interface must be *built*
 * for that rather than adapted to it.
 *
 * Every assertion below is a MEASUREMENT. `toHaveClass` proves a string was
 * written and never a pixel, and this project has shipped a missing background,
 * a raw z-index that made a modal clickable-through and a centred label all past
 * a green unit suite. The declarations are graded separately, through compiled
 * CSS, by `src/flow/FlowScreen.responsive.test.tsx`.
 *
 * There is **no `flow` row in `_harness.ts`'s `DESIGN`** and this task did not
 * add one — the table is frozen against the screens that trust it, and a row
 * that graded this build would be grading my own homework. That gap is in the
 * task report.
 */
/** The relative luminance of a `rgb(r, g, b)` string, per WCAG. Same pair
 *  `e2e/write.spec.ts` carries; both want lifting into `_harness.ts`, which is
 *  frozen against this task. */
function luminance(colour: string): number {
  const [r, g, b] = (/rgba?\(([^)]+)\)/.exec(colour)?.[1] ?? '0,0,0')
    .split(',').slice(0, 3).map((n) => Number(n.trim()) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

const barOf = (page: Page) => page.locator('[data-r-flowbar]')

/**
 * **The contrast census — every run of text under `root`, graded against the
 * ground actually behind it.** Returns the ones below 4.5:1, already formatted.
 *
 * R46 wrote this inline for one test and it earned its keep immediately:
 * `ConfirmMark`'s byline came back at **1.74:1** on this white toolbar, which is
 * why the mark is deliberately not drawn here. R47 lifted it to a function
 * because the ⋯ menu puts five more runs of text on the same ground and nothing
 * had measured them — a census that only ever runs on the closed bar is a census
 * of half the screen.
 *
 * Each run is compared against the first OPAQUE background in its ancestor
 * chain, not against the bar's own white: the id badge's white type sits on its
 * own violet tile and is correct, and grading everything against the bar would
 * fail it.
 *
 * **`mustCover` — owner ruling R48, and the half that stops this going green
 * for the wrong reason.** A census reports the runs it graded; it says nothing
 * at all about a run it never saw, and every way an element leaves the DOM —
 * a gate that flipped, a surface branch, a capability the session stopped
 * holding — takes it out of this list silently. R48 draws three runs of text
 * that were deliberately absent until now, so every caller declares what its
 * census must have READ before the grading is allowed to mean anything.
 *
 * Hidden runs are graded too, and deliberately: `querySelectorAll` returns a
 * `display:none` element and `getComputedStyle` still resolves its colour, so
 * the panel's ≤760 action group and the reader's ≤1080 crumb pair are both
 * covered at every width rather than only at the one that paints them.
 */
async function censusOf(page: Page, root: string, mustCover: readonly string[] = []): Promise<string[]> {
  const runs = await page.locator(root).evaluate((el) => {
    const groundOf = (n0: Element): string => {
      for (let n: Element | null = n0; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor
        const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(c)
        if (m && (m[4] === undefined || Number(m[4]) >= 1)) return c
      }
      return 'rgb(255, 255, 255)'
    }
    return [...el.querySelectorAll('*')]
      .filter((n) => n.children.length === 0 && (n.textContent ?? '').trim() !== '')
      .map((n) => ({
        text: (n.textContent ?? '').trim().slice(0, 24),
        ink: getComputedStyle(n).color,
        ground: groundOf(n),
      }))
  })
  expect(runs.length, `${root} has no text to grade`).toBeGreaterThan(1)
  const seen = runs.map((r) => r.text)
  for (const want of mustCover) {
    expect(
      seen.some((t) => t.includes(want)),
      `the census of ${root} never read «${want}», so it graded nothing about it and would `
      + 'report this bar clean with the element missing. What it did read: '
      + seen.map((t) => `«${t}»`).join(' · '),
    ).toBe(true)
  }
  return runs
    .map((r) => ({ ...r, ratio: contrast(r.ink, r.ground) }))
    .filter((r) => r.ratio < 4.5)
    .map((r) => `«${r.text}» ${r.ink} on ${r.ground} = ${r.ratio.toFixed(2)}:1`)
}

/** The painted box of one control, rounded the way a person reads a ruler. */
async function boxOf(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox()
  expect(b, `${selector} has no box to measure`).not.toBeNull()
  return { x: b!.x, y: b!.y, w: Math.round(b!.width), h: Math.round(b!.height), mid: b!.y + b!.height / 2 }
}

for (const surface of ['panel', 'reader'] as const) {
  test(`the flow toolbar spans the window and keeps its controls on it — ${surface}`, async ({ page }) => {
    const w = page.viewportSize()!.width
    await flow(page, surface)
    const bar = barOf(page)
    await expect(bar, 'the flow toolbar carries no data-r-flowbar hook').toHaveCount(1)

    // 1. The bar is the window's width at every one of the three, and its
    //    hairline reaches both edges. A bar that overflowed instead of wrapping
    //    still measures its own content width, so this is what catches it.
    const box = (await bar.boundingBox())!
    expect(Math.round(box.width), 'the toolbar is not spanning the window').toBe(w)
    expect(Math.round(box.x)).toBe(0)

    // 2. Nothing on the bar sticks out past it. This is the defect the owner
    //    was looking at: with no wrap and no shrink, the last controls were
    //    simply off the right of a phone screen — measured, not inferred.
    const spill = await bar.evaluate((el) => {
      const edge = el.getBoundingClientRect()
      return [...el.querySelectorAll('*')]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.right > edge.right + 1 || r.left < edge.left - 1))
        .length
    })
    expect(spill, 'a control is painted outside the toolbar').toBe(0)
  })

  test(`the next/previous group is on the bar above 760 and gone on a phone — ${surface}`, async ({ page }) => {
    const w = page.viewportSize()!.width
    await flow(page, surface)
    const nav = page.locator('[data-r-flownav]')
    if (w <= 760) {
      // `[data-r-flowbar] [data-r-flownav]{display:none !important}` — panel 99,
      // reader 115.
      await expect(nav).toBeHidden()
    } else {
      await expect(nav).toBeVisible()
      // …and drawn at `--size-tool`, which is the 34px both deliverables give
      // every button in this group (panel 561, reader 320).
      const btn = await boxOf(page, '[data-r-flownav] button')
      expect({ w: btn.w, h: btn.h }).toEqual({ w: 34, h: 34 })
    }
  })
}

test('a long process name is clipped on a phone and laid out in full above it', async ({ page }) => {
  // `[data-r-flowbar] [data-r-flowtitle] [data-r-pname]{overflow:hidden;
  // text-overflow:ellipsis; white-space:nowrap; min-width:0}` — panel 95,
  // reader 111, and both deliverables put it INSIDE the ≤760 block.
  //
  // Measured as clipping and not as a declaration: `text-overflow:ellipsis`
  // does nothing at all unless the box is actually narrower than its text, and
  // whether it is depends on `min-width:0` reaching the two flex items above it
  // — which is a fact about layout that no class assertion can reach. A name
  // wider than its own box has `scrollWidth > clientWidth`; one that fits does
  // not.
  const w = page.viewportSize()!.width
  await signedIn(page, { capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'], scopes: ['*'] })
  await serve(page, STUBS)
  await page.goto('/processes/dining-004/flow')
  await page.locator('[data-shell="panel"]').waitFor()
  await page.locator('.react-flow__renderer').waitFor()
  await pinPage(page, "goto('/processes/dining-004/flow')")

  const name = page.locator('[data-r-pname]')
  await expect(name).toBeVisible()
  const fit = await name.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  if (w <= 760) {
    expect(fit.scroll, 'the long name is not being clipped on a phone')
      .toBeGreaterThan(fit.client)
  } else {
    expect(fit.scroll, 'the name is clipped above the breakpoint too').toBe(fit.client)
  }

  // …and at every width the whole title group stays inside the bar. This is the
  // half that was actually broken: with no `min-width:0` the name refused to
  // shrink below its own text, so the bar grew past the window and the controls
  // after it were pushed off the screen.
  const bar = (await barOf(page).boundingBox())!
  const title = (await page.locator('[data-r-flowtitle]').boundingBox())!
  expect(title.x, 'the title group starts left of the toolbar').toBeGreaterThanOrEqual(bar.x - 1)
  expect(title.x + title.width, 'the title group runs off the end of the toolbar')
    .toBeLessThanOrEqual(bar.x + bar.width + 1)
})

test('the reader’s «بازگشت» keeps its glyph and drops its word on a phone', async ({ page }) => {
  // `[data-r-backlabel]{display:none !important}` — reader 105. The control
  // itself stays reachable at every width: R21, this is the reader's only way
  // off this screen.
  const w = page.viewportSize()!.width
  await flow(page, 'reader')
  const back = page.locator('[data-r-flowback]')
  await expect(back).toBeVisible()
  const label = page.locator('[data-r-backlabel]')
  if (w <= 760) {
    await expect(label).toBeHidden()
    // The word is gone and the target is not: the glyph is still pressable.
    const b = await boxOf(page, '[data-r-flowback]')
    expect(b.w, 'the back control collapsed to nothing').toBeGreaterThan(20)
  } else {
    await expect(label).toBeVisible()
    await expect(label).toHaveText('بازگشت')
  }
})

test('R46 — the process confirmation is on the flowchart, at every width', async ({ page }) => {
  // The owner's headline: *"the each process accept or reject should be in
  // flowchart page, not in information page."* Both deliverables draw it in
  // `data-r-actions` (panel 597-608, reader 357-368), immediately before
  // «ویرایش».
  await flow(page, 'panel')
  const actions = page.locator('[data-r-flowbar] [data-r-actions]')
  await expect(actions).toHaveCount(1)

  // Everything drawn on this bar is legible ON THIS BAR. The toolbar is white
  // (`--card`) and every other call site of the confirm pair is inside a
  // `bg-ink` screen root, so ink chosen for the violet field lands here on
  // white — `ConfirmMark`'s byline is `--role-subtitle-on-field` #C9BEEE and
  // its own docstring says both its call sites are on the field "and never on
  // cream". Measured against what is really behind it rather than argued from
  // hex values.
  //
  // **R48 names what it must have read.** The pill's label is the run this
  // ruling was raised about; before it was drawn, this census graded a bar the
  // word was simply not on, and would have gone on doing so if a later gate
  // took it back off.
  const dim = await censusOf(page, '[data-r-flowbar]', ['تأییدشده'])
  expect(dim, 'ink chosen for the violet field is being drawn on the white toolbar').toEqual([])

  // **The act, reachable — not merely present.** `toBeVisible` passes for a
  // control painted under something else, so this presses it.
  //
  // **Above 760 only, as of owner ruling R47.** The panel's own ≤760 block takes
  // this whole group off the bar (`[data-r-flowbar] [data-r-actions]{display:
  // none !important}`, panel 99) and puts its acts in the ⋯ instead (panel 102);
  // the act is measured through that route by the R47 block below, at the width
  // where it is the only route. The title of this test still holds — the
  // confirmation is on the flowchart at every width — but the CONTROL is not the
  // same control at every width, and pretending otherwise is how a collapse
  // ships half-done.
  if (page.viewportSize()!.width <= 760) {
    await expect(actions).toBeHidden()
    await expect(page.getByRole('button', { name: 'ابزارها' })).toBeVisible()
    return
  }

  const act = page.getByRole('button', { name: 'لغو تأیید' })
  await expect(act).toBeVisible()

  // **The design's pill, as of owner ruling R48 — not the 34px tool box.**
  // R47 drew §6.3's settled control here and reported the pill as blocked: its
  // label measured 3.72:1 unconfirmed and 3.86:1 confirmed on this white bar,
  // and it referred the choice rather than shipping either. The owner ruled
  // *"make the text darker so people can read it"*, so the box is drawn at
  // panel 599's own numbers — `padding:7px 12px` around the 19px tick behind
  // the app's hairline edge — and the label is read by the census above rather
  // than by a class name.
  //
  // **35, and the missing pixel is Chrome rather than this build.** The
  // deliverable's own arithmetic is 1.5 + 7 + 19 + 7 + 1.5 = 36; measured here,
  // `getComputedStyle(...).borderTopWidth` on this element is **`1px`** —
  // Chrome floors a 1.5px border to a whole device pixel at DPR 1 — so the
  // painted box is 35. That is true of every `border-hairline` in this app and
  // is reported rather than compensated for: padding the box back to 36 would
  // be drawing a number the design does not give to hide a number the browser
  // does. The label's own line box is 18.75 and loses to the 19px tick, so the
  // tick governs the height exactly as the design intends.
  const drawn = await boxOf(page, '[data-testid="confirm-box"]')
  expect(drawn.h, 'the confirm control is not the design’s 7px-12px pill').toBe(35)
  await expect(act).toHaveText('تأییدشده')
  const tick = await boxOf(page, '[data-testid="confirm-tick"]')
  expect({ w: tick.w, h: tick.h }, 'the tick inside the pill is not --size-tick').toEqual({ w: 19, h: 19 })

  // F11's 44px floor, kept as a transparent `::before` AROUND the 36px box and
  // never by inflating it — the same idiom the ⋯ trigger uses, and the defect
  // `write.spec.ts` documents about handing a sized control `min-h-touch`.
  const target = await act.evaluate((el) => {
    const b = getComputedStyle(el, '::before')
    const r = el.getBoundingClientRect()
    const px = (v: string) => Number.parseFloat(v) || 0
    return { h: r.height - px(b.top) - px(b.bottom), w: r.width - px(b.left) - px(b.right) }
  })
  expect(target.h, 'the confirm pill’s hit target is under F11’s floor').toBeGreaterThanOrEqual(44)
  expect(target.w, 'the confirm pill’s hit target is under F11’s floor').toBeGreaterThanOrEqual(44)

  await act.click()
  // §6.15's dialog, and the sentence FR-V2 / FR-V3 / AC-18 is stated in — the
  // only place in the product where the rule is said to the person it binds.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('برداشتن تأیید')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

/**
 * **Owner ruling R47 — the ⋯ menu, and the panel's ≤760 action collapse.**
 *
 * R46 audited this as C7/C8 and could not build it: the popover's
 * `min-width:225px` (panel 576, reader 336) had no token, and `tokens.css`'s own
 * `--width-menu` comment had already written down *"A later screen whose menu
 * genuinely wants 225 mints its own name; it does not re-value this one."* R47
 * minted `--width-menu-flow`, and this is the block that measures what it
 * unblocked.
 *
 * It is a REPLACEMENT and not an addition. `[data-r-flowbar] [data-r-flownav],
 * [data-r-flowbar] [data-r-actions]{display:none !important}` at panel 99 and
 * `[data-r-flowmore]{display:flex !important}` at panel 102 — so at ≤760 exactly
 * one of the ⋯ and the action group is on screen, and every act the bar offered
 * has to be inside the other one or it has stopped existing on a phone. That is
 * the behaviour the owner reported missing, and it is why the assertions below
 * are about BOTH halves at once rather than about the ⋯ alone.
 */
for (const surface of ['panel', 'reader'] as const) {
  test(`R47 — exactly one of the ⋯ and the action group is on the bar — ${surface}`, async ({ page }) => {
    const w = page.viewportSize()!.width
    await flow(page, surface)
    const more = page.locator('[data-r-flowmore]')
    const actions = page.locator('[data-r-flowbar] [data-r-actions]')

    if (surface === 'reader') {
      // `[data-r-flowmore]{display:none !important}` (reader 118) at the one
      // width it could have appeared at, because the reader's actions STAY —
      // `order:2; margin-inline-start:0; flex:1 1 auto; justify-content:flex-end`
      // (reader 113). R3: the two deliverables disagree here on purpose, and
      // this build follows each of them on its own surface.
      await expect(more).toHaveCount(0)
      await expect(actions).toHaveCount(1)

      // **…and on this surface the group is always EMPTY, which is a finding and
      // not a gap.** The design gates its contents on `showEditTools`, and in
      // this build that gate is the SHELL: `auth/session.ts`'s `selectShell`
      // sends anyone holding `edit` or `confirm` to the panel (F2), so a session
      // on the reader surface can never hold either. Reader 357-368 draws a
      // confirm control and an «ویرایش» that nobody who reaches this bar could
      // be offered. The hook and its ≤760 rules are kept because they are the
      // design's and are graded as declarations by
      // `src/flow/FlowScreen.more.test.tsx`; what cannot be measured here is a
      // box, because there is nothing in it. Reported in R47's task report.
      const kids = await actions.evaluate((el) => el.childElementCount)
      expect(kids, 'the reader’s action group has contents — re-measure its ≤760 layout').toBe(0)
      return
    }

    if (w <= 760) {
      await expect(more, 'the ⋯ is not drawn on a phone').toBeVisible()
      await expect(actions, 'the action group survives ≤760 beside the ⋯').toBeHidden()
      // The DRAWN box is the design's 34, and the PRESSABLE one is the app's 44
      // floor as a transparent ::before around it (F11) — never the box
      // inflated. Both are measured, because only one of them is visible.
      const drawn = await boxOf(page, '[data-r-flowmore]')
      expect({ w: drawn.w, h: drawn.h }, 'the ⋯ is not --size-tool').toEqual({ w: 34, h: 34 })
      const hit = await more.evaluate((el) => {
        const r = getComputedStyle(el, '::before')
        return { top: r.top, inset: r.insetInlineStart }
      })
      expect(hit.top, 'the ⋯ has no 44px target around its 34px box').toBe('-5px')
    } else {
      await expect(more, 'the ⋯ is drawn above the breakpoint too').toBeHidden()
      await expect(actions).toBeVisible()
    }
  })
}

test('R47 — the ⋯ menu opens at the design’s 225px floor, inside the window', async ({ page }) => {
  const w = page.viewportSize()!.width
  await flow(page, 'panel')
  if (w > 760) {
    test.skip(true, 'the ⋯ is display:none above 760 — panel 571 against panel 102')
    return
  }
  const trigger = page.getByRole('button', { name: 'ابزارها' })
  await trigger.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  // `min-width:225px` (panel 576). A FLOOR, so it is asserted as one — and the
  // popover must still be inside the window at the narrowest width the design
  // declares, which is the half a `min-width` can break.
  const box = (await menu.boundingBox())!
  expect(Math.round(box.width), 'the menu is narrower than its own floor')
    .toBeGreaterThanOrEqual(225)
  const bar = (await barOf(page).boundingBox())!
  expect(box.x, 'the menu is painted off the left of the window').toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width, 'the menu is painted off the right of the window')
    .toBeLessThanOrEqual(w + 1)
  // …and it hangs BELOW the bar rather than over it: `top:calc(100% + 6px)`.
  expect(box.y, 'the menu overlaps the bar it hangs from')
    .toBeGreaterThanOrEqual(bar.y + bar.height - 1)

  // Every act the collapsed bar took away is in here, which is what makes
  // "replaces" true rather than "hides".
  const rows = await menu.getByRole('menuitem').allInnerTexts()
  expect(rows.map((t) => t.trim()))
    .toEqual(['تأییدشده', 'ویرایش', 'فرآیند بعدی', 'فرآیند قبلی'])

  // **The contrast census, run again with the menu OPEN.** R46's version graded
  // the closed bar and caught `ConfirmMark`'s byline at 1.74:1; a menu is five
  // more runs of text on the same white ground, and nothing had ever measured
  // them. Same method: each run against the first OPAQUE background above it.
  const dim = await censusOf(page, '[data-r-flowbar]', ['تأییدشده', 'فرآیند بعدی'])
  expect(dim, 'ink on the ⋯ menu is below the floor the rest of this bar is held to')
    .toEqual([])

  await shot(page, 'flow-more-menu')

  // …and the act is reachable from in here, not merely listed: this row and the
  // toolbar's control open ONE dialog (panel 3563's `mConfirm` is
  // `set({flowMenu:false, confirmDialog:true})`), and the menu closes behind it.
  await menu.getByRole('menuitem', { name: 'تأییدشده' }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('برداشتن تأیید')
})

test('R47 — the reader’s «بازگشت» becomes a 38px square on a phone', async ({ page }) => {
  // `[data-r-flowback]{order:-1; width:38px; justify-content:center;
  // padding:9px 0}` (reader 104). R46 drew the label half of this rule and
  // reported the square, because three tokens hold 38px and none of them was
  // this button; R47 mints --width-flowback-mobile.
  const w = page.viewportSize()!.width
  await flow(page, 'reader')
  const back = await boxOf(page, '[data-r-flowback]')
  if (w <= 760) {
    expect(back.w, 'the back control is not the design’s 38px square').toBe(38)
    // …and it is still the FIRST thing on the bar, which is R46's own
    // `order-first` finding: both the title and this carry `order:-1`, so DOM
    // order decides and a change to either can jump it.
    const title = (await page.locator('[data-r-flowtitle]').boundingBox())!
    const box = (await page.locator('[data-r-flowback]').boundingBox())!
    expect(box.y, 'the back button is no longer on the first row').toBeLessThanOrEqual(title.y + 1)
  } else {
    expect(back.w, 'the back control is squared above the breakpoint too').toBeGreaterThan(38)
  }
})

/**
 * **Owner ruling R48 — the reader flow bar's department crumb and its «/».**
 *
 * `<span data-r-hide>{{ deptName }}</span><span data-r-hide>/</span>` at reader
 * 317-318, between «بازگشت» and the next/previous group. R47 measured them at
 * **3.72:1** and **1.44:1** on this white bar and drew neither — the separator
 * is below even the 2.0 `_harness.ts` calls "text the reader cannot see at
 * all" — and referred the choice. The owner ruled that the text is to be
 * readable, so both are drawn in `--text-body`.
 *
 * **This test is the reason the ruling could be shipped broken.** R46's census
 * runs on the PANEL, and the panel's flow bar carries no crumb at any width:
 * until this ran, the two runs of text the whole ruling is about were graded by
 * nothing at all, on either surface.
 */
test('R48 — the reader’s department crumb and its «/» are drawn, and legible on this bar', async ({ page }) => {
  const w = page.viewportSize()!.width
  await flow(page, 'reader')

  const pair = page.locator('[data-r-flowbar] [data-r-hide]')
  await expect(pair, 'the reader flow bar draws no crumb pair').toHaveCount(2)
  await expect(pair.nth(0), 'the crumb does not name the department').toHaveText('سالن')
  await expect(pair.nth(1)).toHaveText('/')

  // The census, on the surface these two live on, naming them so a run that
  // stopped being drawn fails here instead of quietly emptying the list.
  const dim = await censusOf(page, '[data-r-flowbar]', ['سالن', '/'])
  expect(dim, 'ink on the reader flow bar is below the floor this bar is held to').toEqual([])

  // `[data-r-topbar] [data-r-hide]{display:none}` — reader 35. The rule is
  // written at these two children rather than by putting `data-r-topbar` on the
  // bar: `reader-shell.spec.ts` counts that hook to assert the reader draws no
  // chrome at all on this route, which is the whole of R21's arrangement.
  if (w <= 1080) await expect(pair.first()).toBeHidden()
  else await expect(pair.first()).toBeVisible()

  // …and the crumb sits between the back button and the title, which is the
  // order reader 313-320 draws and what makes it read as a trail rather than a
  // label floating after the process name.
  if (w > 1080) {
    const back = (await page.locator('[data-r-flowback]').boundingBox())!
    const crumb = (await pair.first().boundingBox())!
    const title = (await page.locator('[data-r-flowtitle]').boundingBox())!
    // RTL: the bar reads right to left, so "after" is a SMALLER x.
    expect(crumb.x, 'the crumb is not between «بازگشت» and the title').toBeLessThan(back.x)
    expect(crumb.x, 'the crumb is not between «بازگشت» and the title').toBeGreaterThan(title.x)
  }

  await shot(page, 'flow-reader-crumb')
})

test('R46 — the process summary no longer acts on the confirmation', async ({ page }) => {
  // The other half of the move. The summary keeps its status pill — the design
  // draws one on that screen's badge row (`Inja Panel.dc.html:389`, under
  // `isEditor`) — and its action group holds only «ویرایش اطلاعات» (`:393-396`).
  await signedIn(page, { capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'], scopes: ['*'] })
  await serve(page, STUBS)
  await page.goto('/processes/dining-003')
  await page.locator('[data-screen="summary"]').waitFor()
  await pinPage(page, "goto('/processes/dining-003')")

  await expect(page.getByTestId('confirm-mark')).toBeVisible()
  await expect(page.getByTestId('confirm-box')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'لغو تأیید' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'تأیید محتوا' })).toHaveCount(0)
})


/**
 * A fact citing `dining-003`, thin enough that only the process row matters.
 * `visit` is not used to reach it — the point of the test is the journey.
 */
const CITING_FACT = {
  entry: {
    id: 'F-00077', kind: 'rule' as const, key: 'welcome_time',
    title: 'زمان پذیرایی', statement: 'یک قاعده.',
    scope: { departments: ['dining'], branches: [] },
    status: 'confirmed' as const, retired: false,
    updated_at: '2026-09-16T14:05:00Z',
    data: { inputs: [], outputs: [] }, source: [],
  },
  confirmation: { confirmed: false, can_confirm: true, fingerprint: 'sha256:f77' },
  red_paths: { unknown: [], disputed: [] },
  resolved: { 'dining-003': { kind: 'process', title: 'پذیرایی از میهمان' } },
  row_titles: {}, path_labels: {}, consumers: [],
  processes: [{ ref: 'dining-003', title: 'پذیرایی از میهمان',
                tombstoned: false, heir: null, missing_nodes: [] }],
}

test('a process cited by a fact opens its FLOWCHART, and «بازگشت» returns to the fact', async ({ page }) => {
  // **Owner ruling, 2026-09-06**, both halves of one report: «when you click on
  // a process from within a quantitative-data item, it should open that
  // process's flowchart page — not the process's general data. Also … pressing
  // back should return you to the quantitative-data item, not send you to the
  // app's home page.»
  //
  // The second half is why this is an e2e and not two unit assertions:
  // «بازگشت» answers history only when `canGoBack()` sees React Router's
  // `history.state.idx`, which a `MemoryRouter` does not have — so in jsdom the
  // control is always the crumb LINK and the regression this guards is
  // invisible. Only a real browser has the history to walk back through.
  await signedIn(page, { capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['*'] })
  await serve(page, { ...STUBS, '/api/facts/F-00077': CITING_FACT })
  await page.goto('/facts/F-00077')

  await page.getByRole('button', { name: /پذیرایی از میهمان/ }).click()
  // The flowchart, not `/processes/dining-003`.
  await expect(page).toHaveURL(/\/processes\/dining-003\/flow$/)
  await page.locator('.react-flow__renderer').waitFor()

  await page.getByRole('button', { name: 'بازگشت' }).click()
  await expect(page).toHaveURL(/\/facts\/F-00077$/)
})
