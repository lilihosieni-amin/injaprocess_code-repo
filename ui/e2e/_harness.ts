import { expect, type Page } from '@playwright/test'

/* The design's numbers, as Chrome serialises them from getComputedStyle.
   Every one is quoted from .superpowers/sdd/ui-design-spec.md. */

/** §6.0 — the whole application sits on the deep violet field #2A1D5E. */
export const FIELD = 'rgb(42, 29, 94)'
/** §9.1 — every card on that field is #fff in both deliverables (ledger L-14). */
export const SURFACE = 'rgb(255, 255, 255)'
/** §4.3 — the default card border, 46 uses (ledger L-15). */
export const CARD_BORDER = 'rgba(42, 29, 94, 0.07)'
/** §4.2 — THE card shadow: two-layer, neutral-dark, 25 uses. */
export const CARD_SHADOW =
  'rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px'
/** §4.6 — focus is a coral border. 15 of 15 declarations, no ring, no glow. */
export const FOCUS = 'rgb(250, 90, 82)'
/** §4.5 — --hover-lift: translateY(-2px). */
export const LIFT = 'matrix(1, 0, 0, 1, 0, -2)'

export interface ScreenDesign {
  field?: string
  column?: string
  padding?: string
  h1?: { size: string; weight: string }
  body?: { size: string }
  card?: { radius?: string; shadow?: string; border?: string; background?: string }
  /** A selector to focus; its border must turn coral and gain no outline. */
  focus?: string
  /** A selector to hover; its transform must become the -2px lift. */
  lift?: string
}

/**
 * One entry per screen. A screen task adds its own row and calls
 * `expectDesign(page, '<name>')` at all three widths.
 *
 * `departments` is deliberately partial: the visual audit calls this screen
 * near pixel-faithful, and it is — on the field, the column, the padding, the
 * title and the card's radius. Its card is still cream `#FBF7F1` with
 * `--shadow-card-dark` and a `#EFE7DC` border, which ledger L-14/L-15 retire;
 * Task 14 rebuilds it white with `CARD_BORDER` and `CARD_SHADOW` and adds
 * `background`, `border` and `shadow` to this record in the same commit.
 * The screen has no focusable control, so `focus` is absent by fact.
 */
export const DESIGN = {
  departments: {
    field: FIELD,
    column: '1120px',
    padding: '38px 40px 48px',
    h1: { size: '34px', weight: '800' },
    body: { size: '14px' },
    card: { radius: '20px' },
    lift: '[data-card]',
  },
} satisfies Record<string, ScreenDesign>

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

/** Answers GET /api/auth/me so the app renders past RequireAuth. */
export async function signedIn(page: Page, over: Partial<Session> = {}) {
  const body = JSON.stringify({ ...EDITOR, ...over })
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body }))
}

/**
 * Answers the read endpoints from fixtures. Nothing reaches the vite proxy, so
 * the check needs no backend and cannot go red because a database moved.
 */
export async function serve(page: Page, table: Record<string, unknown>) {
  for (const [path, value] of Object.entries(table)) {
    const body = JSON.stringify(value)
    await page.route(`**${path}`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body }))
  }
}

const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate(
    (el, p) => getComputedStyle(el).getPropertyValue(p),
    prop,
  )

/** Asserts the screen's computed values against the design's numbers. */
export async function expectDesign(page: Page, screen: keyof typeof DESIGN) {
  const d: ScreenDesign = DESIGN[screen]
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible()

  if (d.field) {
    expect(await css(page, `[data-screen="${screen}"]`, 'background-color')).toBe(d.field)
  }
  if (d.column) {
    expect(await css(page, '[data-col]', 'max-width')).toBe(d.column)
  }
  if (d.padding) {
    const [top, x, bottom] = d.padding.split(' ')
    const s = `[data-screen="${screen}"]`
    expect(await css(page, s, 'padding-top')).toBe(top)
    expect(await css(page, s, 'padding-left')).toBe(x)
    expect(await css(page, s, 'padding-right')).toBe(x)
    expect(await css(page, s, 'padding-bottom')).toBe(bottom ?? top)
  }
  if (d.h1) {
    expect(await css(page, '[data-h1]', 'font-size')).toBe(d.h1.size)
    expect(await css(page, '[data-h1]', 'font-weight')).toBe(d.h1.weight)
  }
  if (d.body) {
    expect(await css(page, '[data-body]', 'font-size')).toBe(d.body.size)
  }
  if (d.card) {
    const c = d.card
    if (c.radius) expect(await css(page, '[data-card]', 'border-top-left-radius')).toBe(c.radius)
    if (c.shadow) expect(await css(page, '[data-card]', 'box-shadow')).toBe(c.shadow)
    if (c.border) {
      expect(await css(page, '[data-card]', 'border-top-color')).toBe(c.border)
      expect(await css(page, '[data-card]', 'border-top-width')).toBe('1px')
    }
    if (c.background) {
      expect(await css(page, '[data-card]', 'background-color')).toBe(c.background)
    }
  }
  if (d.focus) {
    await page.locator(d.focus).first().focus()
    expect(await css(page, d.focus, 'border-top-color')).toBe(FOCUS)
    // §4.6 — no glow, no ring, no outline anywhere in the panel.
    expect(await css(page, d.focus, 'box-shadow')).toBe('none')
  }
  if (d.lift) {
    const target = page.locator(d.lift).first()
    expect(await css(page, d.lift, 'transform')).toBe('none')
    await target.hover()
    await expect
      .poll(() => css(page, d.lift!, 'transform'))
      .toBe(LIFT)
  }
}

/**
 * The camera's precondition: nothing may move under it.
 *
 * This is asserted rather than assumed because the setting that grants it is an
 * easy one to write inertly. `reducedMotion` is a BrowserContext option; put at
 * the top level of `use` — beside `viewport`, where it reads perfectly natural —
 * @playwright/test 1.61 ignores it and every run still goes green with the
 * media query false. Measured on this repo before the config was corrected. So
 * the guarantee is checked in the browser, at the moment it is relied on.
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

/** A screenshot at the running project's width, for comparison against ui/design/. */
export async function shot(page: Page, name: string) {
  await expectReducedMotion(page)
  const width = page.viewportSize()?.width ?? 0
  await page.screenshot({ path: `e2e/__shots__/${name}-${width}.png`, fullPage: true })
}
