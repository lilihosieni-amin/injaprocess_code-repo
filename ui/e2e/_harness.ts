import { expect, type Page } from '@playwright/test'

/* The design's numbers, as Chrome serialises them from getComputedStyle.
   Every one is quoted from .superpowers/sdd/ui-design-spec.md. */

/** §6.0 — the whole application sits on the deep violet field #2A1D5E. */
export const FIELD = 'rgb(42, 29, 94)'
/** §9.1 — every card on that field is #fff in both deliverables (ledger L-14). */
export const SURFACE = 'rgb(255, 255, 255)'
/** §6.1 — the cream a heading is written in **on the field** (`--bg`, #FBF7F1). */
export const ON_FIELD = 'rgb(251, 247, 241)'
/** §6.1 — the muted violet body copy on the field (#B7A6E0). */
export const ON_FIELD_MUTED = 'rgb(183, 166, 224)'
/** §4.3 — the default card border, 46 uses (ledger L-15). */
export const CARD_BORDER = 'rgba(42, 29, 94, 0.07)'
/**
 * §4.2 — THE card shadow: two-layer, neutral-dark, 25 uses.
 *
 * **Two layers, and this constant carries exactly those two.** What Chrome
 * prints for an element wearing Tailwind's `shadow-card` is *four*: Tailwind 3
 * composes every shadow utility as
 * `box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)`,
 * so two fully transparent ring layers are serialised ahead of the real ones —
 * measured on this repo:
 *
 * ```
 * rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px,
 * rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px
 * ```
 *
 * A raw `toBe(CARD_SHADOW)` against that can never pass. **Do not repair a red
 * by pasting what the browser printed** — that would write Tailwind's ring
 * scaffolding into the design's ledger and enshrine it in every screen that
 * follows. Compare with `shadowOf()` instead, which drops the layers that paint
 * nothing. `harness.spec.ts` holds both halves of that: the real class passes
 * through `shadowOf`, and the raw string does not equal this constant.
 */
export const CARD_SHADOW =
  'rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px'
/** §4.6 — focus is a coral border. 15 of 15 declarations, no glow. */
export const FOCUS = 'rgb(250, 90, 82)'
/** §4.5 — --hover-lift: translateY(-2px). */
export const LIFT = 'matrix(1, 0, 0, 1, 0, -2)'

/* ------------------------------------------------------------------ *
 * Per-width expectations — the only thing that makes 1080 and 760 pay
 * ------------------------------------------------------------------ */

/**
 * The widths `playwright.config.ts` declares a project for.
 *
 * R7 is "every page and component is responsive", and a check can only gate it
 * by asserting something that **differs between these numbers**. A computed
 * `max-width`, font-size, padding, radius or transform does not: it is the
 * declared length at every viewport, so running it three times costs 3× and
 * proves 1×. Anything genuinely width-dependent — a used width, a grid's track
 * count — is written as a `ByWidth` record, and `atWidth` picks the row.
 */
export const WIDTHS = [1440, 1080, 760] as const
export type Width = (typeof WIDTHS)[number]
/** One expected value per project width. Every key is required. */
export type ByWidth<T> = { readonly [W in Width]: T }
/** Either one value for all three widths, or one per width. */
export type PerWidth<T> = T | ByWidth<T>

/** Picks the row for the running project's viewport. */
export function atWidth<T>(width: number, value: PerWidth<T>): T {
  if (typeof value !== 'object' || value === null) return value
  const byWidth = value as unknown as Record<number, T>
  const missing = WIDTHS.filter((w) => !(w in byWidth))
  if (missing.length) {
    throw new Error(
      `_harness: a per-width expectation is missing ${missing.join(', ')}; ` +
      `every one of ${WIDTHS.join(' / ')} must be written out`,
    )
  }
  if (!(WIDTHS as readonly number[]).includes(width)) {
    throw new Error(
      `_harness: the running project's viewport is ${width}px, which is not one of ` +
      `${WIDTHS.join(' / ')}. Add it to WIDTHS and to every ByWidth record, or the ` +
      `new project silently grades nothing.`,
    )
  }
  return byWidth[width]
}

/* ------------------------------------------------------------------ *
 * box-shadow, minus Tailwind's ring scaffolding
 * ------------------------------------------------------------------ */

/** Splits a comma-separated CSS value without splitting inside `rgba(…)`. */
function layers(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  const tail = value.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

/** A shadow layer whose colour is fully transparent paints nothing. */
function paintsNothing(layer: string): boolean {
  if (layer === '' || layer === 'none') return true
  const alpha = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(layer)
  return alpha !== null && Number(alpha[1]) === 0
}

/**
 * The shadow a computed `box-shadow` actually paints.
 *
 * Tailwind 3 emits every shadow utility as three composed layers —
 * `var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)` — and
 * Chrome serialises the two unset ring layers as `rgba(0, 0, 0, 0) 0px 0px 0px
 * 0px`. They are invisible, they are not the design's, and they are not
 * something a screen task should have to know about. Stripped here so a
 * `DESIGN` record can quote §4.2 verbatim.
 *
 * The same normalisation is what makes "no shadow" answerable: an element with
 * `shadow-none` computes to *three* transparent layers, not `none`, so a raw
 * `toBe('none')` fails on an element that has no shadow.
 */
export function shadowOf(computed: string): string {
  const painted = layers(computed).filter((l) => !paintsNothing(l))
  return painted.length ? painted.join(', ') : 'none'
}

/* ------------------------------------------------------------------ *
 * padding shorthand
 * ------------------------------------------------------------------ */

/** The CSS 1–4 value `padding` shorthand, expanded to its four sides. */
export function expandPadding(shorthand: string): {
  top: string; right: string; bottom: string; left: string
} {
  const v = shorthand.trim().split(/\s+/).filter((s) => s !== '')
  if (v.length < 1 || v.length > 4) {
    throw new Error(
      `_harness: \`${shorthand}\` is not a CSS padding shorthand — it must carry 1 to 4 lengths`,
    )
  }
  const [top, right = top, bottom = top, left = right] = v
  return { top, right, bottom, left }
}

/* ------------------------------------------------------------------ *
 * What a screen declares
 * ------------------------------------------------------------------ */

/** One run of type: its size, optionally its weight, and — always — its colour. */
export interface Measured {
  size: PerWidth<string>
  weight?: PerWidth<string>
  /**
   * Required, and that is the point. Nine screens shipped where every
   * individual value was legal and the page still looked wrong; a legal colour
   * on the wrong element is the archetype of that. `text-bg` → `text-ink` on
   * the departments H1 paints #2A1D5E on the #2A1D5E field — an invisible page
   * title — and every other assertion in this file stays green.
   */
  color: PerWidth<string>
}

export interface ScreenDesign {
  /** computed `background-color` of `[data-screen]` */
  field: PerWidth<string>
  /** computed `max-width` of `[data-col]` — the design's declared column */
  column: PerWidth<string>
  /**
   * computed **used** `width` of `[data-col]`, per project width.
   *
   * Required, and the only assertion in this file whose expected value changes
   * with the viewport. `column` above is the declared cap and computes to the
   * same length at 760 as at 1440; this is what the reader actually gets.
   */
  columnWidth: ByWidth<string>
  /** the `padding` shorthand of `[data-screen]`, 1–4 lengths */
  padding: PerWidth<string>
  /** computed on `[data-h1]` */
  h1: Measured & { weight: PerWidth<string> }
  /** computed on `[data-body]` */
  body: Measured
  /**
   * The card grid's track count per width — §6.16's only structural rule.
   *
   * Optional because not every screen has a grid. Where a screen does, this is
   * the assertion that notices a layout collapsing or refusing to collapse:
   * `grid-cols-3` → `grid-cols-1` changes nothing else measured here.
   */
  grid?: { selector?: string; columns: ByWidth<number> }
  card?: {
    radius?: PerWidth<string>
    /** compared through `shadowOf` — quote `CARD_SHADOW`, never the raw computed string */
    shadow?: PerWidth<string>
    border?: PerWidth<string>
    background?: PerWidth<string>
  }
  /** A selector **inside the screen**; its border must turn coral on focus. */
  focus?: string
  /** A selector **inside the screen**; its transform must become the -2px lift. */
  lift?: string
}

/**
 * One entry per screen. A screen task adds its own row and calls
 * `expectDesign(page, '<name>')` at all three widths.
 *
 * `departments` is deliberately partial in its optional half: the visual audit
 * calls this screen near pixel-faithful, and it is — on the field, the column,
 * the padding, the title and the card's radius. Its card is still cream
 * `#FBF7F1` with `--shadow-card-dark` and a `#EFE7DC` border, which ledger
 * L-14/L-15 retire; Task 14 rebuilds it white with `CARD_BORDER` and
 * `CARD_SHADOW` and adds `background`, `border` and `shadow` to this record in
 * the same commit. The screen has no focusable control, so `focus` is absent by
 * fact.
 */
export const DESIGN = {
  departments: {
    field: FIELD,
    column: '1120px',
    // 1440 − 80 of screen padding is capped by the 1120 column; 1080 and 760 are not.
    columnWidth: { 1440: '1120px', 1080: '1000px', 760: '680px' },
    padding: '38px 40px 48px',
    h1: { size: '34px', weight: '800', color: ON_FIELD },
    body: { size: '14px', color: ON_FIELD_MUTED },
    // §6.16 requires 3 / 2 / 1 and the screen ships 3 / 3 / 3 — `Departments.tsx`
    // writes a bare `grid-cols-3` with no `max1080:` or `max760:` variant, so the
    // three-column grid is squeezed into 760px. That is a real R7 defect and it
    // is Task 14's to close; what this row states is what the screen *does*, so
    // the mutant that collapses the grid dies at all three widths today. **Task
    // 14 edits the line below to `{ 1440: 3, 1080: 2, 760: 1 }` in the same
    // commit that adds the variants.**
    grid: { columns: { 1440: 3, 1080: 3, 760: 3 } },
    card: { radius: '20px' },
    lift: '[data-card]',
  },
} satisfies Record<string, ScreenDesign>

/* ------------------------------------------------------------------ *
 * The stubs
 * ------------------------------------------------------------------ */

interface Session {
  username: string
  displayName: string
  role: string
  capabilities: string[]
  scopes: string[]
  supervisor: string | null
  canSupervise: boolean
  pendingApprovals: number
}

const EDITOR: Session = {
  username: 'editor',
  displayName: 'ویراستار',
  role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'],
  scopes: ['*'],
  supervisor: null,
  canSupervise: false,
  pendingApprovals: 0,
}

interface Stubs {
  /** pathname → JSON body */
  table: Map<string, string>
  /** every `/api/` pathname the app asked for that nothing answered */
  unstubbed: Set<string>
}

const STUBS = new WeakMap<Page, Stubs>()

/**
 * The one handler every `/api/` request goes through.
 *
 * Three defects it exists to make impossible, all three measured on this repo:
 *
 * 1. **Nothing falls through to the container.** With one `page.route` per
 *    endpoint, an endpoint a later screen forgets to stub reaches the vite
 *    proxy and the FastAPI container on `:8000` — which is listening, and
 *    answered. A check that silently grades a live database is the drift R6
 *    exists to catch. Anything unstubbed is aborted and **named** by
 *    `expectEveryEndpointStubbed`, which `expectDesign` and `shot` both call.
 * 2. **Query strings match.** The old form globbed `**${path}`, which does not
 *    match `/api/confirmations?department=cooking` — the exact URL
 *    `useConfirmations` fetches. Matching is on `URL.pathname`, so a query is
 *    irrelevant by construction.
 * 3. **Registration order cannot matter.** Playwright tries route handlers in
 *    *reverse* registration order — measured: of two handlers for one glob, the
 *    last registered wins — so a catch-all added after the specific routes
 *    swallows them. There is only one handler here, so there is no order.
 */
async function stubs(page: Page): Promise<Stubs> {
  const existing = STUBS.get(page)
  if (existing) return existing
  const s: Stubs = { table: new Map(), unstubbed: new Set() }
  STUBS.set(page, s)
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const { pathname } = new URL(route.request().url())
      const body = s.table.get(pathname)
      if (body === undefined) {
        s.unstubbed.add(pathname)
        return route.abort()
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body })
    },
  )
  return s
}

/** Answers GET /api/auth/me so the app renders past RequireAuth. */
export async function signedIn(page: Page, over: Partial<Session> = {}) {
  const s = await stubs(page)
  s.table.set('/api/auth/me', JSON.stringify({ ...EDITOR, ...over }))
}

/**
 * Answers the read endpoints from fixtures, keyed by **pathname**.
 *
 * A key may carry a query string for readability — `'/api/confirmations?department=cooking'`
 * — but only its pathname is matched, so every query on that path gets the same
 * body. Write the fixture for the query the screen actually sends.
 */
export async function serve(page: Page, table: Record<string, unknown>) {
  const s = await stubs(page)
  for (const [key, value] of Object.entries(table)) {
    const pathname = key.split('?')[0]
    if (!pathname.startsWith('/api/')) {
      throw new Error(`serve(): \`${key}\` is not an /api/ path; nothing else is intercepted`)
    }
    s.table.set(pathname, JSON.stringify(value))
  }
}

/**
 * Every `/api/` endpoint the app asked for was answered from a fixture.
 *
 * Called by `expectDesign` and by `shot`. A screen that grows a new read and
 * forgets to stub it fails here, naming the pathname, instead of quietly
 * grading whatever the container on `:8000` happened to hold.
 */
export async function expectEveryEndpointStubbed(page: Page) {
  const s = STUBS.get(page)
  expect(
    s ? [...s.unstubbed].sort() : [],
    'endpoints the spec never stubbed — add them to serve()',
  ).toEqual([])
}

/* ------------------------------------------------------------------ *
 * The measurement
 * ------------------------------------------------------------------ */

/** How long a missing measurement hook is waited for before it is named. */
const HOOK_TIMEOUT = 5_000

const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate(
    (el, p) => getComputedStyle(el).getPropertyValue(p),
    prop,
  )

/** Names a missing hook in ~5s instead of timing out for 30 inside `evaluate`. */
async function hook(page: Page, selector: string, what: string) {
  await expect(
    page.locator(selector).first(),
    `missing measurement hook: ${what} — nothing matches \`${selector}\``,
  ).toBeAttached({ timeout: HOOK_TIMEOUT })
}

/** Asserts the screen's computed values against the design's numbers. */
export async function expectDesign(page: Page, screen: keyof typeof DESIGN) {
  const d: ScreenDesign = DESIGN[screen]
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('_harness: the running project declares no viewport')
  const w = viewport.width
  const at = <T>(v: PerWidth<T>): T => atWidth(w, v)

  const root = `[data-screen="${screen}"]`
  /**
   * Every content hook is resolved **inside the screen**, never document-wide.
   *
   * `data-screen` was the only namespaced selector; the other four were global.
   * Measured: adding a `data-body` to `PanelShell`'s topbar made the departments
   * check read the topbar's 22px instead of the screen's 14px. It went red there
   * — the dangerous case is the stray hook whose value happens to match, which
   * would grade the wrong element in silence. Twenty-one screens are about to
   * add these hooks, some behind overlays that co-exist with a screen.
   */
  const within = (selector: string) => `${root} ${selector}`

  await expect(page.locator(root), `${screen}: \`${root}\` is not visible`).toBeVisible()

  expect(await css(page, root, 'background-color'), `${screen}: field`).toBe(at(d.field))

  const col = within('[data-col]')
  await hook(page, col, 'data-col')
  expect(await css(page, col, 'max-width'), `${screen}: column max-width`).toBe(at(d.column))
  // The one width-dependent assertion. See `ByWidth` above for why it exists.
  expect(await css(page, col, 'width'), `${screen}: column used width at ${w}px`)
    .toBe(atWidth(w, d.columnWidth))

  const pad = expandPadding(at(d.padding))
  expect(await css(page, root, 'padding-top'), `${screen}: padding-top`).toBe(pad.top)
  expect(await css(page, root, 'padding-right'), `${screen}: padding-right`).toBe(pad.right)
  expect(await css(page, root, 'padding-bottom'), `${screen}: padding-bottom`).toBe(pad.bottom)
  expect(await css(page, root, 'padding-left'), `${screen}: padding-left`).toBe(pad.left)

  const h1 = within('[data-h1]')
  await hook(page, h1, 'data-h1')
  expect(await css(page, h1, 'font-size'), `${screen}: h1 size`).toBe(at(d.h1.size))
  expect(await css(page, h1, 'font-weight'), `${screen}: h1 weight`).toBe(at(d.h1.weight))
  expect(await css(page, h1, 'color'), `${screen}: h1 colour`).toBe(at(d.h1.color))

  const body = within('[data-body]')
  await hook(page, body, 'data-body')
  expect(await css(page, body, 'font-size'), `${screen}: body size`).toBe(at(d.body.size))
  expect(await css(page, body, 'color'), `${screen}: body colour`).toBe(at(d.body.color))
  if (d.body.weight !== undefined) {
    expect(await css(page, body, 'font-weight'), `${screen}: body weight`).toBe(at(d.body.weight))
  }

  if (d.grid) {
    const grid = within(d.grid.selector ?? '[data-grid]')
    await hook(page, grid, d.grid.selector ?? 'data-grid')
    const tracks = await css(page, grid, 'grid-template-columns')
    const count = tracks === 'none' ? 0 : tracks.trim().split(/\s+/).length
    expect(count, `${screen}: grid columns at ${w}px (grid-template-columns: ${tracks})`)
      .toBe(atWidth(w, d.grid.columns))
  }

  if (d.card) {
    const c = d.card
    const card = within('[data-card]')
    await hook(page, card, 'data-card')
    if (c.radius !== undefined) {
      expect(await css(page, card, 'border-top-left-radius'), `${screen}: card radius`)
        .toBe(at(c.radius))
    }
    if (c.shadow !== undefined) {
      expect(shadowOf(await css(page, card, 'box-shadow')), `${screen}: card shadow`)
        .toBe(at(c.shadow))
    }
    if (c.border !== undefined) {
      expect(await css(page, card, 'border-top-color'), `${screen}: card border colour`)
        .toBe(at(c.border))
      expect(await css(page, card, 'border-top-width'), `${screen}: card border width`).toBe('1px')
    }
    if (c.background !== undefined) {
      expect(await css(page, card, 'background-color'), `${screen}: card background`)
        .toBe(at(c.background))
    }
  }

  if (d.focus) {
    const target = within(d.focus)
    await hook(page, target, `focus target \`${d.focus}\``)
    await page.locator(target).first().focus()
    expect(await css(page, target, 'border-top-color'), `${screen}: focus border`).toBe(FOCUS)
    // §4.6 — a coral border, and no glow. The design paints no ring either, but
    // `src/styles/base.css` does: F11 sets `:focus-visible { outline: 3px solid
    // var(--coral); outline-offset: 2px }` app-wide, deliberately, so that a
    // keyboard user has an indicator the design forgot. Measured on a focused
    // control here: `outline: solid 3px rgb(250, 90, 82)`. So the claim this
    // asserts is the true one — no glow, and any ring that *is* drawn is the
    // coral focus colour, never a second focus idiom — rather than the "no
    // outline anywhere" the comment used to make while reading no outline at all.
    expect(shadowOf(await css(page, target, 'box-shadow')), `${screen}: focus glow`).toBe('none')
    if (await css(page, target, 'outline-style') !== 'none') {
      expect(await css(page, target, 'outline-color'), `${screen}: focus ring colour`).toBe(FOCUS)
    }
  }

  if (d.lift) {
    const target = within(d.lift)
    await hook(page, target, `lift target \`${d.lift}\``)
    const el = page.locator(target).first()
    expect(await css(page, target, 'transform'), `${screen}: transform at rest`).toBe('none')
    await el.hover()
    await expect
      .poll(() => css(page, target, 'transform'), { message: `${screen}: transform on hover` })
      .toBe(LIFT)
  }

  await expectEveryEndpointStubbed(page)
}

/**
 * `contextOptions.reducedMotion` is really set.
 *
 * This is asserted rather than assumed because the setting that grants it is an
 * easy one to write inertly. `reducedMotion` is a BrowserContext option; put at
 * the top level of `use` — beside `viewport`, where it reads perfectly natural —
 * @playwright/test 1.61 ignores it and every run still goes green with the
 * media query false. Measured on this repo before the config was corrected.
 *
 * What it does **not** prove is that nothing moves: `src/` defines zero
 * `prefers-reduced-motion` rules (measured: 0 in every stylesheet in the page),
 * so the media feature changes nothing the app paints — a card's
 * `transition-duration` is still `0.16s` under it. Freezing the page for the
 * camera is `animations: 'disabled'` on the screenshot itself; see `shot`.
 */
export async function expectReducedMotion(page: Page) {
  const reduced = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  expect(
    reduced,
    'playwright.config.ts must set use.contextOptions.reducedMotion = "reduce"',
  ).toBe(true)
}

/** Anything inside a screen that changes appearance while the pointer is on it. */
const HOVERABLE =
  '[data-screen] [data-card]:hover, [data-screen] a:hover, [data-screen] button:hover, ' +
  '[data-screen] [role="button"]:hover, [data-screen] input:hover, ' +
  '[data-screen] select:hover, [data-screen] textarea:hover'

const hoveredCount = (page: Page) =>
  page.evaluate((sel) => document.querySelectorAll(sel).length, HOVERABLE)

/** A screenshot at the running project's width, for comparison against ui/design/. */
export async function shot(page: Page, name: string) {
  await expectReducedMotion(page)
  await expectEveryEndpointStubbed(page)

  // The camera's two preconditions, both of which the first cut of this file
  // stated and neither of which it obtained.
  //
  // 1. Nothing is hovered. `expectDesign`'s `lift` check ends with the pointer
  //    on card 1, and it was never moved — so every reference image the screen
  //    tasks compare against `ui/design/` differed from the design by one
  //    lifted, hover-shadowed tile. Measured: `{ hovered: true, transform:
  //    matrix(1, 0, 0, 1, 0, -2) }` at the moment the shutter fired.
  await page.mouse.move(0, 0)
  await expect
    .poll(() => hoveredCount(page), {
      message:
        'something inside [data-screen] is still :hover at the moment of the screenshot. ' +
        'The pointer is parked at (0, 0); a screen that reaches the top-left corner must ' +
        'park it somewhere else before calling shot().',
      timeout: HOOK_TIMEOUT,
    })
    .toBe(0)

  // 2. Nothing is mid-transition. `page.screenshot` defaults to
  //    `animations: 'allow'` — only `toHaveScreenshot` disables them — and the
  //    app reads `prefers-reduced-motion` nowhere, so a transform was sampled
  //    mid-flight at `matrix(1, 0, 0, 1, 0, -0.298916)`.
  const width = page.viewportSize()?.width ?? 0
  await page.screenshot({
    path: `e2e/__shots__/${name}-${width}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}
