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
  const bar = barOf(page)
  const runs = await bar.evaluate((root) => {
    // Each run of text against the first OPAQUE background above it, which is
    // what the eye sees. Comparing every ink to the BAR's own white would fail
    // the id badge, whose white type sits on its own violet tile.
    const groundOf = (el: Element): string => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor
        const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(c)
        if (m && (m[4] === undefined || Number(m[4]) >= 1)) return c
      }
      return 'rgb(255, 255, 255)'
    }
    return [...root.querySelectorAll('*')]
      .filter((n) => n.children.length === 0 && (n.textContent ?? '').trim() !== '')
      .map((n) => ({
        text: (n.textContent ?? '').trim().slice(0, 24),
        ink: getComputedStyle(n).color,
        ground: groundOf(n),
      }))
  })
  expect(runs.length, 'the toolbar has no text to grade').toBeGreaterThan(1)
  const dim = runs
    .map((r) => ({ ...r, ratio: contrast(r.ink, r.ground) }))
    .filter((r) => r.ratio < 4.5)
    .map((r) => `«${r.text}» ${r.ink} on ${r.ground} = ${r.ratio.toFixed(2)}:1`)
  expect(dim, 'ink chosen for the violet field is being drawn on the white toolbar').toEqual([])

  // …and the act, reachable — not merely present. `toBeVisible` passes for a
  // control painted under something else, so this presses it.
  const act = page.getByRole('button', { name: 'لغو تأیید' })
  await expect(act).toBeVisible()
  const drawn = await boxOf(page, '[data-testid="confirm-box"]')
  expect({ w: drawn.w, h: drawn.h }, 'the confirm box is not --size-tool')
    .toEqual({ w: 34, h: 34 })

  await act.click()
  // §6.15's dialog, and the sentence FR-V2 / FR-V3 / AC-18 is stated in — the
  // only place in the product where the rule is said to the person it binds.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('برداشتن تأیید')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
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
