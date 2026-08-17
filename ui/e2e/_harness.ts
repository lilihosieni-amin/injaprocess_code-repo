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

/** A colour that paints nothing: `rgba(r, g, b, 0)`, or the keyword. */
function transparent(colour: string): boolean {
  if (colour === 'transparent') return true
  const alpha = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(colour.trim())
  return alpha !== null && Number(alpha[1]) === 0
}

/* ------------------------------------------------------------------ *
 * grid track counting
 * ------------------------------------------------------------------ */

/**
 * How many columns a computed `grid-template-columns` really draws.
 *
 * Not a whitespace-token count, which is what this used to be, and which is
 * wrong twice — both measured in Chrome 150 on this repo:
 *
 * 1. **A grid that is not laid out reports its *specified* value.** Prepend
 *    `<div data-grid class="hidden grid-cols-1">` inside `[data-col]` and Chrome
 *    answers `repeat(1, minmax(0px, 1fr))` — three whitespace tokens, which a
 *    naive count reads as "3 columns". A hidden one-column decoy then satisfies
 *    a three-column assertion, silently. That is refused here rather than
 *    counted: any `f(…)` in the value means the track list was never resolved,
 *    so the element is `display:none` or inside something that is. (`hook()`
 *    also requires the grid to be **visible**, so this is the second of two
 *    independent kills.)
 * 2. **Named grid lines are not tracks.** `[a] 545px [b] 545px` is a two-column
 *    grid and counts four whitespace tokens. Only bare `px`/`fr` lengths count.
 *
 * A used value is always a plain length list — Chrome resolves `repeat()`,
 * `minmax()`, `fit-content()`, `auto` and percentages to `px` for a grid that
 * has layout. Measured on the departments grid at 1440: `361.328px 361.328px
 * 361.344px` → 3.
 */
export function trackCount(computed: string): number {
  const value = computed.trim()
  if (value === '' || value === 'none') return 0
  if (/[a-zA-Z-]+\(/.test(value)) {
    throw new Error(
      `_harness: \`grid-template-columns: ${value}\` is a **specified** value, not a used one. ` +
      'Chrome only resolves a track list for a grid that is laid out, so this element is ' +
      '`display:none` or inside something that is — measure a visible grid, or point ' +
      '`grid.selector` at the twin that is on screen at this width. (Counting the whitespace ' +
      'tokens of `repeat(1, minmax(0px, 1fr))` is how a hidden one-column decoy used to pass a ' +
      'three-column assertion.)',
    )
  }
  return value.split(/\s+/).filter((t) => /^-?[\d.]+(px|fr)$/.test(t)).length
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
  /**
   * A focusable selector **inside the screen**; focusing it must raise a coral
   * indicator that was not there at rest. See `expectFocusIndicator` for the
   * two idioms this codebase actually ships and why "a coral border" alone is
   * not the assertion.
   */
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
    // §6.16 requires `[data-r-pad]{padding:18px 14px}` at ≤760px and the screen
    // ships one padding at every width — `Departments.tsx` writes a bare
    // `pt-[38px] pb-12 px-10` with no `max760:` variant, so the mobile viewport
    // gets the desktop's 40px side padding. That is the same R7 defect the grid
    // line below records, and the same task closes it: **Task 14 rewrites the
    // line below as a per-width record — `{ 1440: '38px 40px 48px', 1080: '38px
    // 40px 48px', 760: '18px 14px' }` — in the same commit that adds
    // `max760:px-s7 max760:py-s9` to the screen.** Until then this states what
    // the screen *does*, so the mutant that changes the padding dies today.
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
    if (s.table.has(pathname)) {
      throw new Error(
        `serve(): \`${pathname}\` is stubbed twice. A query string in a key is documentation, ` +
        'not a discriminator — only the pathname is matched — so the second fixture would ' +
        'silently replace the first and the request the first was written for would be ' +
        'answered with the wrong body. Write one fixture per pathname.',
      )
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
 *
 * **A spec that registered nothing fails hardest of all.** The empty-list form
 * this used to take — `s ? [...s.unstubbed] : []` — reported a clean bill of
 * health for the one case where *nothing at all* was intercepted: no
 * `signedIn`, no `serve`, therefore no `page.route`, therefore every `/api/`
 * request leaves the browser, is proxied by vite to the FastAPI container on
 * `:8000`, and is answered by it. Measured on this repo: an unstubbed
 * `GET /api/pending?department=cooking` came back `401
 * {"detail":"authentication required"}` — a real response, from a real
 * database, in a check whose whole premise is that it grades the working tree.
 */
export async function expectEveryEndpointStubbed(page: Page) {
  const s = STUBS.get(page)
  if (!s) {
    throw new Error(
      'this spec registered no stubs at all — call `signedIn(page)` and `serve(page, …)` ' +
      'before `page.goto`. With no page.route installed nothing is intercepted: every /api/ ' +
      'request reaches the vite proxy and the FastAPI container on :8000, which is listening ' +
      'and answers, so the check would be grading a live database instead of the working tree.',
    )
  }
  expect(
    [...s.unstubbed].sort(),
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

/**
 * Names a missing hook in ~5s instead of timing out for 30 inside `evaluate`,
 * and refuses to measure one that is **not on screen**.
 *
 * Attached-only was not enough. Every read here is `.first()`, so the hook the
 * harness grades is the first in document order — and twenty-one screens are
 * about to carry `max760:hidden` twins, overlays and `display:none` scaffolding
 * wearing the same attributes. A hidden element does not merely look wrong, it
 * *reads* wrong: Chrome answers a `display:none` grid's `grid-template-columns`
 * with its specified value (see `trackCount`), so a hidden one-column decoy
 * satisfied a three-column assertion. Where a screen legitimately has two
 * twins, point `grid.selector` at the one that is on screen at this width.
 */
async function hook(page: Page, selector: string, what: string) {
  const el = page.locator(selector).first()
  await expect(
    el,
    `missing measurement hook: ${what} — nothing matches \`${selector}\``,
  ).toBeAttached({ timeout: HOOK_TIMEOUT })
  await expect(
    el,
    `hidden measurement hook: ${what} — \`${selector}\` resolves first to an element that is ` +
    'not visible. A hidden twin is measured with the wrong values, not skipped; give the ' +
    'visible one a distinct selector.',
  ).toBeVisible({ timeout: HOOK_TIMEOUT })
}

/* ------------------------------------------------------------------ *
 * focus
 * ------------------------------------------------------------------ */

/** Everything that can carry a focus indicator, read in one pass. */
interface FocusState {
  borderColor: string
  borderWidth: string
  outlineStyle: string
  outlineColor: string
  outlineWidth: string
  shadow: string
}

const focusState = (page: Page, selector: string): Promise<FocusState> =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      borderColor: cs.getPropertyValue('border-top-color'),
      borderWidth: cs.getPropertyValue('border-top-width'),
      outlineStyle: cs.getPropertyValue('outline-style'),
      outlineColor: cs.getPropertyValue('outline-color'),
      outlineWidth: cs.getPropertyValue('outline-width'),
      shadow: cs.getPropertyValue('box-shadow'),
    }
  })

/** A border that is actually drawn, in the focus colour. */
const coralBorder = (s: FocusState) =>
  s.borderColor === FOCUS && parseFloat(s.borderWidth) > 0

/** A ring that is actually drawn — `outline-none` is a *transparent* outline. */
const paintsRing = (s: FocusState) =>
  s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && !transparent(s.outlineColor)

/**
 * Focusing this control raises a coral indicator, and nothing else.
 *
 * **This is the assertion that had never run.** No `DESIGN` row set `focus` and
 * no spec exercised it, so the branch was furniture — and measured against the
 * two focus idioms that exist in `src/`, the version it replaced could not pass
 * on either:
 *
 * | | `<input … outline-none focus:border-coral>` (21 sites) | `<button>` (`Button.tsx`, coral) |
 * |---|---|---|
 * | `border-top-color` on focus | `rgb(250, 90, 82)` ✓ | `rgb(229, 231, 235)` at **0px** — `border-0` ✗ |
 * | `shadowOf(box-shadow)` | `none` ✓ | `rgba(250, 90, 82, 0.9) 0px 12px 26px -12px` (`shadow-coral`, at rest too) ✗ |
 * | `outline` on focus | `solid 2px rgba(0, 0, 0, 0)` — Tailwind's `outline-none` beats `base.css` ✗ | `solid 3px rgb(250, 90, 82)` ✓ |
 *
 * A "coral border, no box-shadow, coral outline" rule goes red on every real
 * control in the repo, and the cheap repair — weakening it — would have been
 * enshrined twenty-one times. So the assertion is the guarantee that is
 * genuinely true of both, and it is written as a **difference**, which is what
 * makes it able to fail:
 *
 * 1. focus raises a coral indicator — the design's border (§4.6:
 *    `border-color:#FA5A52`, 15 of 15 declarations) **or** the app-wide ring
 *    `base.css` F11 adds for keyboard users (`outline: 3px solid var(--coral)`);
 * 2. it was **not** there at rest, so a permanently coral control cannot pass;
 * 3. nothing non-coral appears with it — no second focus idiom;
 * 4. no glow is *added*: `shadowOf` must be unchanged, which holds a button's
 *    resting `shadow-coral` harmless while still killing a `focus:shadow-…`.
 *
 * It then blurs, and requires the indicator to go away — otherwise `shot()`
 * would photograph a focus ring the design does not draw, which is exactly the
 * defect I5 fixed for hover.
 */
export async function expectFocusIndicator(page: Page, selector: string, label: string) {
  const el = page.locator(selector).first()
  const rest = await focusState(page, selector)

  await el.focus()
  await expect(el, `${label}: \`${selector}\` did not take focus — is it focusable?`).toBeFocused()
  const held = await focusState(page, selector)

  const seen = ` (at rest ${JSON.stringify(rest)}; focused ${JSON.stringify(held)})`
  const borderChanged = held.borderColor !== rest.borderColor || held.borderWidth !== rest.borderWidth
  const ringChanged = held.outlineColor !== rest.outlineColor ||
    held.outlineStyle !== rest.outlineStyle || held.outlineWidth !== rest.outlineWidth

  expect(
    coralBorder(held) || (paintsRing(held) && held.outlineColor === FOCUS),
    `${label}: focusing \`${selector}\` draws no coral indicator — §4.6's coral border, or the ` +
    'coral ring base.css F11 adds, must appear. Note that Tailwind\'s `outline-none` is a ' +
    'transparent 2px outline that beats the F11 rule, so a control wearing it must bring its ' +
    'own `focus:border-coral`.' + seen,
  ).toBe(true)

  expect(
    borderChanged || ringChanged,
    `${label}: nothing changed when \`${selector}\` took focus — the indicator this asserts is ` +
    'already there at rest, so the assertion cannot fail and is not an indicator.' + seen,
  ).toBe(true)

  if (borderChanged) {
    expect(held.borderColor, `${label}: focus border colour`).toBe(FOCUS)
  }
  if (paintsRing(held)) {
    expect(held.outlineColor, `${label}: focus ring colour`).toBe(FOCUS)
  }
  expect(
    shadowOf(held.shadow),
    `${label}: focus added a glow — §4.6 declares none (the resting shadow is allowed to stay)`,
  ).toBe(shadowOf(rest.shadow))

  // Leave the control as it was found: `shot()` runs after `expectDesign`, and
  // a still-focused control would put a 3px coral ring in every reference image.
  await el.blur()
  await expect
    .poll(async () => {
      const after = await focusState(page, selector)
      return coralBorder(after) || paintsRing(after)
    }, {
      message: `${label}: \`${selector}\` still shows a focus indicator after blur`,
      timeout: HOOK_TIMEOUT,
    })
    .toBe(false)
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
    expect(trackCount(tracks), `${screen}: grid columns at ${w}px (grid-template-columns: ${tracks})`)
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
    await expectFocusIndicator(page, target, `${screen}: focus`)
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
    // Put the pointer back where it was found. Two things depended on that and
    // neither got it: a second `expectDesign` call on the same page read the
    // inherited hover as the resting transform, and `shot()` — which parks the
    // pointer itself but only after this ran — had to undo it. Polling the
    // transform back to `none` rather than only moving the mouse also proves
    // the lift is released, which a one-way check never did.
    await page.mouse.move(0, 0)
    await expect
      .poll(() => css(page, target, 'transform'), {
        message: `${screen}: the lift did not release when the pointer left. The pointer is ` +
          'parked at (0, 0); a screen that reaches the top-left corner must park it elsewhere.',
        timeout: HOOK_TIMEOUT,
      })
      .toBe('none')
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

/**
 * Everything inside a screen that the pointer is currently over.
 *
 * A fixed tag list — `[data-card]`, `a`, `button`, `[role=button]`, `input`,
 * `select`, `textarea` — was the wrong shape for this: the app's hover styles
 * are Tailwind `hover:` utilities, and they go on whatever element the design
 * needs, most often a `<div>`. A hovered `<div class="hover:bg-tile-v2">` sat
 * under the shutter uncounted. Which element is hovered is not knowable from
 * its tag, so nothing is enumerated — `:hover` is asked directly, and every
 * descendant under the pointer answers.
 */
const HOVERED = '[data-screen] :hover'

const hoveredCount = (page: Page) =>
  page.evaluate((sel) => document.querySelectorAll(sel).length, HOVERED)

/** A screenshot at the running project's width, for comparison against ui/design/. */
export async function shot(page: Page, name: string) {
  await expectReducedMotion(page)
  await expectEveryEndpointStubbed(page)

  // The camera's two preconditions, both of which the first cut of this file
  // stated and neither of which it obtained.
  //
  // 1. Nothing is hovered. `expectDesign`'s `lift` check used to end with the
  //    pointer on card 1 and never move it — so every reference image the
  //    screen tasks compare against `ui/design/` differed from the design by
  //    one lifted, hover-shadowed tile. Measured: `{ hovered: true, transform:
  //    matrix(1, 0, 0, 1, 0, -2) }` at the moment the shutter fired.
  //    `expectDesign` now restores the pointer itself; this stays because
  //    `shot()` may be called without it, and because the census below is a
  //    stronger claim than "the mouse was moved".
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
