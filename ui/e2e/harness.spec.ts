import { expect, test, type Page } from '@playwright/test'
import type { Department } from '../src/api/types'
import type { PerWidth, ScreenDesign } from './_harness'
import {
  atWidth, CARD_SHADOW, DESIGN, expandPadding, expectDesign, expectEveryEndpointStubbed,
  expectFocusIndicator, serve, shadowOf, signedIn, trackCount, WIDTHS,
} from './_harness'

/**
 * The harness's own gate.
 *
 * Every assertion in `_harness.ts` is copied into twenty-one later screen
 * checks, so a rule that is wrong here is wrong twenty-one times — and a rule
 * that *cannot fail* here is twenty-one screens that ship wrong while the suite
 * stays green. Four assertions had never been executed by any screen: the card
 * shadow, the "no shadow" case, the scoping of the content hooks, and the whole
 * `focus` branch, which could not have passed on either focus idiom that exists
 * in `src/`. They are executed here, and so are the guards' own preconditions.
 */

const DEPARTMENTS: Department[] = [
  { code: 'management', name: 'مدیریت', count: 4, subs: 1, conflicts: 0 },
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
  { code: 'warehouse', name: 'انبار', count: 5, subs: 2, conflicts: 0 },
]

const onDepartments = async (page: Page) => {
  await signedIn(page)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  await page.goto('/departments')
  await page.locator('[data-screen="departments"]').waitFor()
}

/* ================================================================== *
 * Width-independent — proved once, not three times
 * ================================================================== */

test.describe('proved once', () => {
  // Nothing in this block reads the viewport, and three of them do not open a
  // page at all. Run in every project they were 9 of the suite's 18 reported
  // passes — the same three assertions, three times: exactly the "3× cost, 1×
  // proof" that `WIDTHS`' own comment condemns two files away.
  test.skip(
    ({ viewport }) => viewport?.width !== WIDTHS[0],
    'width-independent: one project is the whole proof',
  )

  test('atWidth resolves a per-width record and refuses an unlisted width', () => {
    const perWidth: PerWidth<string> = { 1440: 'a', 1080: 'b', 760: 'c' }
    expect(atWidth(1440, perWidth)).toBe('a')
    expect(atWidth(1080, perWidth)).toBe('b')
    expect(atWidth(760, perWidth)).toBe('c')
    expect(atWidth(1440, 'flat')).toBe('flat')
    expect(atWidth(999, 'flat')).toBe('flat')
    // A fourth project added without extending the table must not grade nothing.
    expect(() => atWidth(999, perWidth)).toThrow(/not one of 1440 \/ 1080 \/ 760/)
  })

  test('expandPadding takes the whole 1–4 value shorthand', () => {
    expect(expandPadding('30px'))
      .toEqual({ top: '30px', right: '30px', bottom: '30px', left: '30px' })
    expect(expandPadding('30px 40px'))
      .toEqual({ top: '30px', right: '40px', bottom: '30px', left: '40px' })
    expect(expandPadding('38px 40px 48px'))
      .toEqual({ top: '38px', right: '40px', bottom: '48px', left: '40px' })
    // The four-value form is where the old parser was silently wrong: it
    // destructured `[top, x, bottom]` and then asserted padding-left against `x`,
    // i.e. against the **right** value.
    expect(expandPadding('1px 2px 3px 4px'))
      .toEqual({ top: '1px', right: '2px', bottom: '3px', left: '4px' })
    expect(expandPadding('  38px   40px  ').top).toBe('38px')
    expect(() => expandPadding('')).toThrow(/1 to 4 lengths/)
    expect(() => expandPadding('1px 2px 3px 4px 5px')).toThrow(/1 to 4 lengths/)
  })

  test('trackCount counts drawn tracks, not whitespace', () => {
    // A used value — the only thing a *visible* grid reports. Measured on the
    // departments grid at 1440.
    expect(trackCount('361.328px 361.328px 361.344px')).toBe(3)
    expect(trackCount('300px 300px')).toBe(2)
    expect(trackCount('1fr 1fr')).toBe(2)
    expect(trackCount('none')).toBe(0)
    expect(trackCount('')).toBe(0)
    // Named grid lines are not tracks. The whitespace count says 4.
    expect(trackCount('[a] 545px [b] 545px')).toBe(2)
    // And the one that made a hidden decoy pass a three-column assertion: Chrome
    // reports the **specified** value for a grid that is not laid out, and
    // `repeat(1, minmax(0px, 1fr))` is three whitespace tokens.
    expect(() => trackCount('repeat(1, minmax(0px, 1fr))')).toThrow(/specified/)
    expect(() => trackCount('repeat(3, minmax(0px, 1fr))')).toThrow(/specified/)
  })

  test('every DESIGN row carries a width-dependent expectation', () => {
    // R7's gate is only real if something differs between the three projects.
    // Every other property this harness reads — max-width, font-size, padding,
    // radius, transform — computes to its declared value at every viewport, so
    // 1080 and 760 would cost 3× and prove 1×.
    //
    // Iterating the table, not `DESIGN.departments.columnWidth`, is the point:
    // the single-field version of this test stayed green when a second, wholly
    // non-responsive row was added — and twenty-one rows are coming.
    const rows = Object.entries(DESIGN)
    expect(rows.length, 'DESIGN is empty').toBeGreaterThan(0)
    for (const [screen, row] of rows) {
      const records = byWidthRecords(row)
      expect(records.length, `${screen}: the row declares no per-width expectation at all`)
        .toBeGreaterThan(0)
      const varying = records.filter(({ values }) => new Set(values.map(String)).size > 1)
      expect(
        varying.map((r) => r.path),
        `${screen}: nothing in this row differs between ${WIDTHS.join(' / ')}px, so the 1080 ` +
        'and 760 projects grade exactly what 1440 already graded. `columnWidth` is the usual ' +
        'one — run the check once and read the three used widths out of the failure message — ' +
        'and `grid.columns` is the other.',
      ).not.toEqual([])
    }
  })

  test('expectEveryEndpointStubbed fails when the spec registered no stubs', async ({ page }) => {
    // The vacuous case the old `s ? [...s.unstubbed] : []` reported clean. A
    // spec that forgets both `signedIn()` and `serve()` installs no page.route,
    // so every /api/ call reaches the vite proxy and the container on :8000 —
    // and the guard said "nothing unstubbed".
    await expect(expectEveryEndpointStubbed(page)).rejects.toThrow(/registered no stubs at all/)
  })

  test('serve() refuses to stub one pathname twice', async ({ page }) => {
    // Two keys, one pathname: only the pathname is matched, so keeping the
    // second silently answers the first's request with the wrong body.
    await expect(serve(page, {
      '/api/pending?department=cooking': [],
      '/api/pending?department=warehouse': [{ id: 'p1' }],
    })).rejects.toThrow(/stubbed twice/)
    // …and across two calls, which is how it actually happens.
    await serve(page, { '/api/departments': DEPARTMENTS })
    await expect(serve(page, { '/api/departments': [] })).rejects.toThrow(/stubbed twice/)
  })
})

/** Every `ByWidth` record in a `DESIGN` row, with the dotted path that reaches it. */
function byWidthRecords(
  node: unknown, path = '', out: { path: string; values: unknown[] }[] = [],
): { path: string; values: unknown[] }[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return out
  const rec = node as Record<string, unknown>
  if (WIDTHS.every((w) => String(w) in rec)) {
    out.push({ path: path || '(root)', values: WIDTHS.map((w) => rec[String(w)]) })
    return out
  }
  for (const [key, value] of Object.entries(rec)) {
    byWidthRecords(value, path ? `${path}.${key}` : key, out)
  }
  return out
}

/* ================================================================== *
 * Measured in the browser, at all three widths
 * ================================================================== */

test('shadowOf strips Tailwind’s ring layers, so CARD_SHADOW is reachable', async ({ page }) => {
  await onDepartments(page)

  const measured = await page.evaluate(() => {
    const probe = document.createElement('div')
    document.body.append(probe)
    const read = (className: string) => {
      probe.className = className
      return getComputedStyle(probe).getPropertyValue('box-shadow')
    }
    const out = { card: read('shadow-card'), none: read('shadow-none'), bare: read('') }
    probe.remove()
    return out
  })

  // What the browser actually prints for `shadow-card`: four layers, the first
  // two of them Tailwind's unset ring, which no design document mentions.
  expect(measured.card).toBe(
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, ' +
    'rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px',
  )
  // So a raw comparison against the design's number can never pass …
  expect(measured.card).not.toBe(CARD_SHADOW)
  // … and through `shadowOf` it does. This is the pair that stops the next
  // screen task from "fixing" its red by pasting the browser's string into
  // CARD_SHADOW: doing that turns the line above red.
  expect(shadowOf(measured.card)).toBe(CARD_SHADOW)

  // "No shadow" is answerable for the same reason: Tailwind's `shadow-none` is
  // three transparent layers, not the keyword. Whether that class is emitted in
  // this build or not, the normalised answer is `none`.
  expect(shadowOf(measured.none)).toBe('none')
  expect(shadowOf(measured.bare)).toBe('none')
  expect(shadowOf(
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, ' +
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px',
  )).toBe('none')
})

const DECOY_HOOKS = ['data-col', 'data-h1', 'data-body', 'data-card', 'data-grid'] as const

test('the content hooks are read inside the screen, never document-wide', async ({ page }) => {
  await onDepartments(page)

  // Decoys in the shell's topbar — outside `[data-screen]`, wearing every
  // content hook and none of the screen's numbers. This is the shape of the
  // real hazard: twenty-one screens are about to add these attributes, some to
  // overlays and shell chrome that co-exist with a screen, and a decoy whose
  // value happened to match would grade the wrong element in silence.
  await page.evaluate((attrs) => {
    const host = document.querySelector('header')!
    for (const attr of attrs) {
      const decoy = document.createElement('div')
      decoy.setAttribute(attr, '')
      decoy.setAttribute('data-decoy', '')
      decoy.setAttribute('style',
        'font-size:22px;font-weight:400;color:rgb(1,2,3);max-width:11px;width:11px;' +
        'border-top-left-radius:1px;display:grid;grid-template-columns:11px 11px 11px 11px 11px')
      // Prepended, so a document-wide `.first()` would find the decoy, not the screen.
      host.prepend(decoy)
    }
  }, [...DECOY_HOOKS])

  await expectDesign(page, 'departments')

  // **The guard's own precondition, asserted after the measurement.** Without
  // this, replacing the `host.prepend(decoy)` above with a no-op leaves all
  // three projects green: nothing checked the decoys were there, so a topbar
  // re-render — a pending badge arriving, a toast, a route change — that
  // dropped the injected nodes would quietly degrade this test to "expectDesign
  // passes on an unmodified page", and I3 would stop being guarded with no
  // signal at all. What is asserted is the exact condition that makes the test
  // mean something: for every hook, the element a document-wide `.first()`
  // would have picked is the decoy, and it is outside the screen.
  const globalFirstIsTheDecoy = await page.evaluate((attrs) => attrs.map((attr) => {
    const first = document.querySelector(`[${attr}]`)
    return first !== null && first.hasAttribute('data-decoy') && first.closest('[data-screen]') === null
  }), [...DECOY_HOOKS])
  expect(
    globalFirstIsTheDecoy,
    `the decoys are not in front of the screen's hooks any more (${DECOY_HOOKS.join(', ')}), so ` +
    'this test proved nothing about scoping. Re-plant them, or fix whatever removes them.',
  ).toEqual(DECOY_HOOKS.map(() => true))
})

/* ------------------------------------------------------------------ *
 * The focus branch, on both idioms this codebase actually ships
 * ------------------------------------------------------------------ */

/**
 * `src/screens/ProcessList.tsx:100`, verbatim minus the layout classes: the
 * text-field idiom, 21 `outline-none` sites. Its coral **border** is the
 * indicator; Tailwind's `outline-none` (a transparent 2px outline) beats
 * `base.css`'s `:focus-visible` rule, so it has no ring.
 */
const FIELD_IDIOM = 'px-3 py-2 border-[1.5px] border-line rounded-[13px] text-[13px] ' +
  'text-ink bg-white outline-none focus:border-coral'

/**
 * `src/ui/Button.tsx`'s shape: `border-0` plus a resting coloured glow
 * (`shadow-coral`). Written as classes rather than by rendering the component,
 * because `Button.tsx` belongs to another task — what is under test is the
 * *shape*, which is what the harness has to survive. Measured 2026-08-18:
 * border `rgb(229, 231, 235)` at `0px`, `shadowOf` =
 * `rgba(250, 90, 82, 0.9) 0px 12px 26px -12px` at rest **and** focused, and the
 * indicator is base.css F11's `outline: solid 3px rgb(250, 90, 82)`.
 */
const BUTTON_IDIOM = 'inline-flex items-center justify-center rounded-button font-bold ' +
  'border-0 transition bg-coral text-card shadow-coral'

/** Plants a control inside the screen and returns its selector. */
async function plant(
  page: Page, tag: 'input' | 'button', name: string, className: string,
) {
  await page.evaluate(([t, n, c]) => {
    const el = document.createElement(t)
    el.setAttribute(`data-probe-${n}`, '')
    el.className = c
    if (t === 'button') el.textContent = 'دکمه'
    document.querySelector('[data-screen="departments"] [data-col]')!.prepend(el)
  }, [tag, name, className] as const)
  return `[data-probe-${name}]`
}

test('the focus branch passes on both focus idioms, and fails without one', async ({ page }) => {
  await onDepartments(page)

  const field = await plant(page, 'input', 'field', FIELD_IDIOM)
  const button = await plant(page, 'button', 'button', BUTTON_IDIOM)
  // The same two, with their indicator taken away — the mutants, planted
  // permanently so the branch can never quietly become unfailable again.
  const mute = await plant(page, 'input', 'mute', FIELD_IDIOM.replace('focus:border-coral', ''))
  const ringless = await plant(page, 'button', 'ringless', `${BUTTON_IDIOM} outline-none`)

  // Green on both real idioms. Before this fix the rule was "coral border, no
  // box-shadow, and a coral outline if any": one red on the field (its outline
  // is `solid 2px rgba(0, 0, 0, 0)`) and two on the button (its border is the
  // preflight `rgb(229, 231, 235)` under `border-0`, and its resting
  // `shadow-coral` is not `none`).
  await expectFocusIndicator(page, field, 'probe: field idiom')
  await expectFocusIndicator(page, button, 'probe: button idiom')

  // Red when the indicator is gone — on the field because nothing turns coral,
  // on the button because `outline-none` suppresses F11's ring.
  await expect(expectFocusIndicator(page, mute, 'probe: field without focus:border-coral'))
    .rejects.toThrow(/draws no coral indicator/)
  await expect(expectFocusIndicator(page, ringless, 'probe: button with outline-none'))
    .rejects.toThrow(/draws no coral indicator/)

  // And the wiring: `expectDesign` really resolves `d.focus` inside the screen
  // and runs the check. Tested by setting the key rather than by reading the
  // code, because the departments screen has no focusable control of its own
  // and a branch nothing calls is what this whole test exists to prevent. Safe:
  // a Playwright worker runs one test at a time, so this module instance is
  // this test's alone, and the key is removed again either way.
  const row = DESIGN.departments as ScreenDesign
  try {
    row.focus = '[data-probe-field]'
    await expectDesign(page, 'departments')
    row.focus = '[data-probe-mute]'
    await expect(expectDesign(page, 'departments'))
      .rejects.toThrow(/departments: focus: focusing .* draws no coral indicator/)
  } finally {
    delete row.focus
  }
})
