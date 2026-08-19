import { expect, test, type Page } from '@playwright/test'
import playwrightConfig from '../playwright.config'
import type { Department } from '../src/api/types'
import type { PerWidth, ScreenDesign } from './_harness'
import {
  atWidth, CARD_SHADOW, DESIGN, expandPadding, expectDesign, expectEveryEndpointStubbed,
  expectFocusIndicator, expectSamePage, isNavigationFault, pinPage, serve, shadowOf, shot,
  signedIn, trackCount, visit, WIDTHS,
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
  // `visit`, not `page.goto`: it pins the page, so everything this file plants
  // afterwards — decoys, probes, mutants — is planted inside a window the
  // harness is watching. With a bare `goto` the watch starts at the first
  // measurement instead, and a navigation before that one is invisible.
  await visit(page, '/departments', 'departments')
}

/**
 * The red a guard is supposed to produce, and not another red wearing its message.
 *
 * `expect(promise).rejects.toThrow(/…/)` prints the **caller's** message whatever
 * the promise actually did, so a navigation that wiped the mutation is reported
 * as "the mutant is no longer caught" — an accusation against the guard, and an
 * invitation to weaken it. `_harness` now names a navigation when it sees one;
 * this is what lets that name out, instead of replacing it with this file's own
 * theory of what went wrong.
 */
async function failsWith(run: Promise<unknown>, message: RegExp, accusation: string) {
  const failure = await run.then(() => null, (error: unknown) => error)
  if (isNavigationFault(failure)) throw failure
  expect(failure, `${accusation} — it did not fail at all`).not.toBeNull()
  expect((failure as Error).message, accusation).toMatch(message)
}

/* ================================================================== *
 * Width-independent — proved once, not three times
 * ================================================================== */

/**
 * **The ledger of what is allowed to be proved once.** Membership here is a
 * decision, not a location.
 *
 * Being inside the `proved once` describe means a test runs at 1440 and is
 * *skipped* at 1080 and 760. That is right for a pure function and wrong for
 * anything that renders — and skipping is silent. Measured: moving
 * `shadowOf strips…` into that describe took the suite from 18 passed / 12
 * skipped to **16 / 14**, with no failure and no warning; the assertion simply
 * stopped being made at two of the three widths. §4 invites screen authors into
 * this block by name, so the invitation now comes with a gate: a test in there
 * must be registered with `provedOnce()` **and** be named here, or the
 * `beforeEach` below fails it at 1440 and `the run shape` fails it everywhere.
 *
 * Before adding a title: if the test reads `page`, hovers, measures, screenshots
 * or asserts anything a stylesheet decides, it is **not** width-independent
 * however much it looks it — a `max760:` variant is exactly the kind of thing
 * that only appears at one width.
 */
const WIDTH_INDEPENDENT = [
  'atWidth resolves a per-width record and refuses an unlisted width',
  'expandPadding takes the whole 1–4 value shorthand',
  'trackCount counts drawn tracks, not whitespace',
  'every DESIGN row carries a width-dependent expectation',
  'expectEveryEndpointStubbed fails when the spec registered no stubs',
  'serve() refuses to stub one pathname twice',
] as const

/** The titles actually registered through `provedOnce`, in source order. */
const provedOnceTitles: string[] = []

/**
 * A `proved once` test never rendered anything.
 *
 * **The mechanical half of the ledger above, and the reason the ledger is no
 * longer only a comment.** Being named in `WIDTH_INDEPENDENT` and registered
 * with `provedOnce()` buys a test one run at 1440 and a silent skip at 1080 and
 * 760 — `31 passed / 14 skipped`, no failure, nothing in the output that says an
 * assertion stopped being made. Both gates that guarded that were judgement
 * calls: `WIDTH_INDEPENDENT`'s own doc concedes "membership here is a decision,
 * not a location", and the `beforeEach` below only catches the *shape* of the
 * registration, not what the test does. A test that satisfies both and still
 * opens a page was accepted in silence, which is the identical outcome to the
 * residual this file just closed.
 *
 * A test that never rendered cannot have seen a breakpoint, and that is checkable
 * without judgement: the page is still the one Playwright handed it. `location`
 * catches `page.goto`, and the empty `<body>` catches `page.setContent` and
 * anything else that puts a DOM in front of a stylesheet.
 *
 * Three of the six entries take no fixtures at all and never reach this — they
 * cannot render, having no page to render into (see `provedOnce`).
 */
async function expectNeverRendered(page: Page, title: string) {
  const state = await page.evaluate(() => ({
    url: location.href,
    body: document.body ? document.body.innerHTML.trim() : '',
  }))
  expect(
    state,
    `\`${title}\` is registered with provedOnce() and named in WIDTH_INDEPENDENT, so it ran at ` +
    `${WIDTHS[0]} and was skipped at ${WIDTHS.slice(1).join(' and ')} — and it rendered a page. ` +
    'Anything a stylesheet decides can differ at the two widths that skipped it: a `max760:` ' +
    'variant, a grid that collapses, a header that wraps, a column that stops being capped. ' +
    'Take it out of the `proved once` block and let it run three times; a browser test is not ' +
    'width-independent however much it looks it.',
  ).toEqual({ url: 'about:blank', body: '' })
}

/**
 * Registers a test that is skipped in every project but the first.
 *
 * The body is still handed its fixtures the way Playwright expects, and the
 * bodies that take none are still registered with none — three of the six ask
 * for nothing, and wrapping them in a `page`-taking signature would start a
 * browser context for tests that exist to call a pure function. A body that
 * *does* take `page` gets it, and is held to `expectNeverRendered` afterwards.
 *
 * Arity is what decides, and it is exact rather than a guess: a body with no
 * parameter has no fixture, so it has no page, so it cannot render. One that
 * destructures `{ page }` has arity 1. There is no third case, because a
 * Playwright test body's only route to a browser is the fixture in its signature.
 */
function provedOnce(title: string, body: (args: { page: Page }) => void | Promise<void>) {
  provedOnceTitles.push(title)
  if (body.length === 0) {
    test(title, () => (body as () => void | Promise<void>)())
    return
  }
  test(title, async ({ page }) => {
    await body({ page })
    await expectNeverRendered(page, title)
  })
}

test.describe('proved once', () => {
  // Nothing in this block reads the viewport, and three of them do not open a
  // page at all. Run in every project they were 9 of the suite's 18 reported
  // passes — the same three assertions, three times: exactly the "3× cost, 1×
  // proof" that `WIDTHS`' own comment condemns two files away.
  test.skip(
    ({ viewport }) => viewport?.width !== WIDTHS[0],
    'width-independent: one project is the whole proof',
  )

  // The gate on the invitation. A bare `test(...)` dropped in here — which is
  // what §4's own wording used to invite — runs once and is skipped twice with
  // no signal; this makes that a failure at the one width where it does run.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    expect(
      provedOnceTitles,
      `\`${testInfo.title}\` is inside the \`proved once\` describe but was registered with a ` +
      'bare `test(...)`, so it is silently skipped at 1080 and 760. Register it with ' +
      '`provedOnce(...)` and name it in WIDTH_INDEPENDENT — or, if it renders anything at all, ' +
      'move it out of this block and let it run three times.',
    ).toContain(testInfo.title)
  })

  provedOnce('atWidth resolves a per-width record and refuses an unlisted width', () => {
    const perWidth: PerWidth<string> = { 1440: 'a', 1080: 'b', 760: 'c' }
    expect(atWidth(1440, perWidth)).toBe('a')
    expect(atWidth(1080, perWidth)).toBe('b')
    expect(atWidth(760, perWidth)).toBe('c')
    expect(atWidth(1440, 'flat')).toBe('flat')
    expect(atWidth(999, 'flat')).toBe('flat')
    // A fourth project added without extending the table must not grade nothing.
    expect(() => atWidth(999, perWidth)).toThrow(/not one of 1440 \/ 1080 \/ 760/)
  })

  provedOnce('expandPadding takes the whole 1–4 value shorthand', () => {
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

  provedOnce('trackCount counts drawn tracks, not whitespace', () => {
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

  provedOnce('every DESIGN row carries a width-dependent expectation', () => {
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

  provedOnce('expectEveryEndpointStubbed fails when the spec registered no stubs', async ({ page }) => {
    // The vacuous case the old `s ? [...s.unstubbed] : []` reported clean. A
    // spec that forgets both `signedIn()` and `serve()` installs no page.route,
    // so every /api/ call reaches the vite proxy and the container on :8000 —
    // and the guard said "nothing unstubbed".
    await expect(expectEveryEndpointStubbed(page)).rejects.toThrow(/registered no stubs at all/)
  })

  provedOnce('serve() refuses to stub one pathname twice', async ({ page }) => {
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

/* ================================================================== *
 * The shape of the run itself
 * ================================================================== */

/**
 * **Deliberately not in `proved once`.** This is the one test that must survive
 * the projects being wrong, and every single-project gate has the same hole:
 * delete the project it is gated on and it stops running instead of failing.
 * Measured — deleting `w1440` from `playwright.config.ts` gave **8 passed, 12
 * skipped** and no failure at all, because `proved once` is keyed on
 * `WIDTHS[0]`: `trackCount`, the DESIGN row walk, the stub-vacuity guard and
 * the `serve()` duplicate guard all stopped being run, silently. So this one
 * pays 3× on purpose. It opens no page and takes microseconds.
 */
test('the run shape is the one §4 documents', () => {
  const declared = (playwrightConfig.projects ?? []).map(
    (project) => `${project.name}@${project.use?.viewport?.width ?? 'no viewport'}`,
  )
  expect(
    declared,
    'playwright.config.ts must declare exactly one project per width in WIDTHS, named `w<width>`. ' +
    'A width with no project is not a smaller run, it is an unproved breakpoint — and every ' +
    'assertion `proved once` gates on the first width stops running entirely. Add the project ' +
    'and the width to WIDTHS together; `atWidth` refuses a project whose width no ByWidth ' +
    'record carries, so the two cannot drift apart.',
  ).toEqual(WIDTHS.map((width) => `w${width}@${width}`))

  expect(
    provedOnceTitles,
    'the `proved once` ledger and the tests registered through `provedOnce()` have drifted. ' +
    'Every entry costs 1× and proves 1×, so adding one is a claim that the test cannot see a ' +
    'breakpoint. Make the claim in WIDTH_INDEPENDENT, where a reviewer reads it, or leave the ' +
    'test outside the block.',
  ).toEqual([...WIDTH_INDEPENDENT])
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

/**
 * **Deliberately not in `proved once` itself.** It renders, so it runs three
 * times — and a guard against tests being parked at one width cannot be parked
 * at one width.
 */
test('a proved-once test that renders is a failure, not a silent skip', async ({ page }) => {
  // The shape the three page-taking entries in WIDTH_INDEPENDENT really have:
  // they hold a `Page` because the stub table is keyed by one, and they never
  // put anything in front of a stylesheet.
  await expectNeverRendered(page, 'a test that only touched the stub table')

  await onDepartments(page)
  await expect(
    expectNeverRendered(page, 'a test that opened the departments screen'),
    'a genuine browser test can be registered with provedOnce(), named in WIDTH_INDEPENDENT, ' +
    'and go on running at one width while it is silently skipped at the other two. That is the ' +
    'residual this file just closed, re-opened.',
  ).rejects.toThrow(/it rendered a page/)
})

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
  await expectSamePage(page, 'planting the decoys')

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
  // Before the census, because the census cannot tell "the decoys were never
  // planted" from "the page they were planted on is gone" — and its message
  // says the first, which is the accusation this guard exists to stop.
  await expectSamePage(page, 'the decoy census')
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
  await expectSamePage(page, 'planting the two focus idioms and their mutants')

  // Green on both real idioms. Before this fix the rule was "coral border, no
  // box-shadow, and a coral outline if any": one red on the field (its outline
  // is `solid 2px rgba(0, 0, 0, 0)`) and two on the button (its border is the
  // preflight `rgb(229, 231, 235)` under `border-0`, and its resting
  // `shadow-coral` is not `none`).
  await expectFocusIndicator(page, field, 'probe: field idiom')
  await expectFocusIndicator(page, button, 'probe: button idiom')

  // Red when the indicator is gone — on the field because nothing turns coral,
  // on the button because `outline-none` suppresses F11's ring.
  await failsWith(
    expectFocusIndicator(page, mute, 'probe: field without focus:border-coral'),
    /draws no coral indicator/,
    'the field idiom stripped of `focus:border-coral` is no longer caught',
  )
  await failsWith(
    expectFocusIndicator(page, ringless, 'probe: button with outline-none'),
    /draws no coral indicator/,
    'the button idiom wearing `outline-none` is no longer caught',
  )

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
    await failsWith(
      expectDesign(page, 'departments'),
      /departments: focus: focusing .* draws no coral indicator/,
      '`expectDesign` no longer runs the focus branch it resolves from `d.focus`',
    )
  } finally {
    delete row.focus
  }
})

/* ------------------------------------------------------------------ *
 * Every clause of the focus check, pinned to a probe that kills it
 * ------------------------------------------------------------------ */

/**
 * The mutants, as CSS.
 *
 * Written as plain rules rather than Tailwind classes because
 * `tailwind.config.js`'s content globs are `index.html`, `src/`, `export/` and
 * `tailwind-probe.txt` — **not `e2e/`** — so a utility this file invents is
 * never emitted and a probe built from one would be styled by nothing. These
 * are also unlayered, which is what lets them beat `base.css`'s
 * `@layer base :focus-visible` where they mean to: an unlayered declaration
 * wins over any layer, which is the same reason Tailwind's `outline-none`
 * suppresses F11's ring on the 21 fields that wear it.
 *
 * Each probe is the smallest control that reaches exactly one clause and fails
 * it, with every earlier clause passing — otherwise it would not prove that
 * clause is what fired.
 */
const CLAUSE_PROBE_CSS = `
/* clause 2 — an indicator that is already there at rest, so nothing changes. */
[data-probe-stuck]{border:1.5px solid rgb(250,90,82);outline:2px solid transparent}
/* clause 3a — F11's coral ring appears, and the border turns the wrong colour with it. */
[data-probe-offcolour]{border:1.5px solid rgb(200,200,200)}
[data-probe-offcolour]:focus{border-color:rgb(42,29,94)}
/* clause 3b — the coral border appears, and a second, non-coral ring with it. */
[data-probe-offring]{border:1.5px solid rgb(200,200,200);outline:2px solid transparent}
[data-probe-offring]:focus{border-color:rgb(250,90,82);outline:3px solid rgb(42,29,94)}
/* clause 4 — the coral border appears, and brings a glow §4.6 does not declare. */
[data-probe-glow]{border:1.5px solid rgb(200,200,200);outline:2px solid transparent}
[data-probe-glow]:focus{border-color:rgb(250,90,82);box-shadow:0 0 0 4px rgba(250,90,82,.35)}
/* clause 5 — a correct indicator that never goes away again. */
[data-probe-sticky]{border:1.5px solid rgb(200,200,200);outline:2px solid transparent}
[data-probe-sticky].zz-still-focused{border-color:rgb(250,90,82)}
`

async function plantClauseProbes(page: Page) {
  await page.evaluate((css) => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const host = document.querySelector('[data-screen="departments"] [data-col]')!
    const make = (tag: 'input' | 'button', name: string) => {
      const el = document.createElement(tag)
      el.setAttribute(`data-probe-${name}`, '')
      if (tag === 'button') el.textContent = 'دکمه'
      host.prepend(el)
      return el
    }
    make('input', 'stuck')
    // A <button>, so `base.css`'s F11 ring is the indicator that satisfies
    // clause 1 and the wrong-coloured border is all that is left to fail.
    make('button', 'offcolour')
    make('input', 'offring')
    make('input', 'glow')
    // The ordinary React defect: a class set in an `onFocus` and never taken
    // off again. CSS alone cannot express "stays after blur".
    const sticky = make('input', 'sticky')
    sticky.addEventListener('focus', () => sticky.classList.add('zz-still-focused'))
    // Clause 0 — the self-diagnostic. A <button>, so `base.css`'s F11 ring is
    // its only possible indicator, and it drops focus on the modality keypress
    // so that Chrome withholds `:focus-visible` at the moment the focused state
    // is read. That is the state the diagnostic exists to name, and it is the
    // only probe here whose failure is supposed to blame the harness.
    const modality = make('button', 'modality')
    modality.addEventListener('keydown', () => modality.blur())
  }, CLAUSE_PROBE_CSS)
}

test('every clause of the focus check has a probe that kills it', async ({ page }) => {
  await onDepartments(page)
  await plantClauseProbes(page)
  await expectSamePage(page, 'planting the clause probes')

  // Clause 1 — "a coral indicator appears" — is pinned by `mute` and `ringless`
  // in the test above. These are the other four. Before them, deleting any one
  // of the four left the whole suite at 18 passed / 12 skipped: the evidence in
  // §10.4 was real but it lived in scratch probes that were deleted before the
  // commit, so the file twenty-one tasks inherit did not hold it.
  const dies = (probe: string, why: string, message: RegExp) => failsWith(
    expectFocusIndicator(page, `[data-probe-${probe}]`, `probe: ${why}`),
    message,
    `the \`${probe}\` probe stopped killing its clause — that clause can no longer fail`,
  )

  // 0. the self-diagnostic, which is not a clause about the screen at all: it
  //    decides whether a modality regression is reported as "this screen has no
  //    focus style" or as "the harness stopped setting the keyboard modality".
  //    That misattribution is the false red §10 just fixed, and deleting the
  //    check left the suite green — the probe below would simply have been
  //    reported as having no coral indicator, which is the wrong answer about
  //    the wrong file.
  await dies('modality', 'focus lost before the state is read', /fault in the harness/)
  // 2. it was not there at rest. A control with a decorative permanent coral
  //    border and no focus style at all is the escape this closes.
  await dies('stuck', 'a coral border that is there at rest', /nothing changed when/)
  // 3. nothing non-coral appears with it — both halves, border and ring.
  await dies('offcolour', 'a border that turns the wrong colour', /focus border colour/)
  await dies('offring', 'a ring that is not coral', /focus ring colour/)
  // 4. no glow is added.
  await dies('glow', 'a glow that arrives with focus', /focus added a glow/)
  // 5. the indicator goes away again, so `shot()` cannot photograph it.
  await dies('sticky', 'an indicator that survives blur', /still shows a focus indicator after blur/)
})

/* ------------------------------------------------------------------ *
 * The modality: a spec that used the mouse first is not a false red
 * ------------------------------------------------------------------ */

test('the focus check survives a spec that used the mouse first', async ({ page }) => {
  await onDepartments(page)
  const field = await plant(page, 'input', 'clicked-field', FIELD_IDIOM)
  const button = await plant(page, 'button', 'clicked-button', BUTTON_IDIOM)
  const elsewhere = await plant(page, 'button', 'elsewhere', BUTTON_IDIOM)

  const clickAndRelease = async (selector: string) => {
    await page.locator(selector).first().click()
    await page.locator(selector).first().blur()
  }

  // First, the browser behaviour this exists for, measured rather than
  // remembered: with the mouse used last, a bare `.focus()` leaves
  // `:focus-visible` off, F11's ring is not painted, and the at-rest and
  // focused states are byte-identical. That is what made `expectFocusIndicator`
  // report "draws no coral indicator" on a control whose indicator is correct —
  // a false **red**, inside a template that says "Do not weaken it".
  await clickAndRelease(elsewhere)
  await page.locator(button).first().focus()
  expect(
    await page.locator(button).first().evaluate((el) => ({
      focusVisible: el.matches(':focus-visible'),
      outlineStyle: getComputedStyle(el).outlineStyle,
    })),
    'Chrome no longer withholds `:focus-visible` from a scripted `.focus()` after a mouse ' +
    'click. If that is really true, the keyboard-modality press in `expectFocusIndicator` is ' +
    'no longer load-bearing — but check before removing it, because this is the only thing ' +
    'that says so.',
  ).toEqual({ focusVisible: false, outlineStyle: 'none' })
  await page.locator(button).first().blur()

  // And then the check itself, in the three shapes a real screen spec makes:
  // the pointer used elsewhere, the pointer used on the target, and the other
  // idiom for good measure. The suite used to pass only because the one spec
  // that exercised the button idiom did so on a pointer-virgin page.
  await clickAndRelease(elsewhere)
  await expectFocusIndicator(page, button, 'probe: button idiom, the mouse was used elsewhere')

  await clickAndRelease(button)
  await expectFocusIndicator(page, button, 'probe: button idiom, the target itself was clicked')

  await clickAndRelease(elsewhere)
  await expectFocusIndicator(page, field, 'probe: field idiom, the mouse was used elsewhere')
})

/* ------------------------------------------------------------------ *
 * A hook can be `toBeVisible()` and still paint nothing
 * ------------------------------------------------------------------ */

const FADED_GRID = '[data-screen="departments"] [data-grid]'

test('a hook that is laid out but painted at opacity 0 is not measured', async ({ page }) => {
  await onDepartments(page)

  await page.evaluate(() => {
    // The shape twenty-one screens will produce: a fade-in wrapper. Nothing
    // sets opacity on the grid itself.
    const fading = document.createElement('div')
    fading.setAttribute('style', 'opacity:0')
    const decoy = document.createElement('div')
    decoy.setAttribute('data-grid', '')
    // **Three** tracks — the number `DESIGN.departments.grid.columns` wants at
    // every width — so the count cannot be what saves this. Only the paint can.
    decoy.setAttribute('style', 'display:grid;height:40px;grid-template-columns:100px 100px 100px')
    fading.append(decoy)
    document.querySelector('[data-screen="departments"] [data-col]')!.prepend(fading)
  })

  // Playwright calls it visible: it has a box and it is not `visibility:hidden`.
  await expect(page.locator(FADED_GRID).first()).toBeVisible()
  // And it is laid out, so `trackCount` gets a used value and is content with
  // it — the `display:none` kill (§10.4's U) does not reach this at all.
  const tracks = await page.locator(FADED_GRID).first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns)
  expect(trackCount(tracks), `the decoy did not lay out (${tracks}); it must, or it proves nothing`)
    .toBe(3)

  // So without the paint gate this is a green run grading a decoy.
  await failsWith(
    expectDesign(page, 'departments'),
    /painted at opacity 0/,
    'a laid-out but unpainted decoy is measured again',
  )
})

/* ------------------------------------------------------------------ *
 * Composition: ten ways to break a page while every value stays legal
 * ------------------------------------------------------------------ */

const SCREEN = '[data-screen="departments"]'

/**
 * One change to the running page, and the assertion it must reach.
 *
 * Every one of these was applied to `Departments.tsx` or `base.css` for real and
 * the suite stayed at **30 passed / 12 skipped**. They are re-applied here at
 * runtime rather than left in `src/` for the obvious reason, and written as
 * plain CSS, attributes and nodes rather than Tailwind classes for the reason
 * `CLAUSE_PROBE_CSS` gives two hundred lines up: `tailwind.config.js`'s content
 * globs do not include `e2e/`, so a utility this file invents is emitted by
 * nothing. The injected sheet is unlayered, which is what lets it beat
 * `base.css`.
 */
interface Mutant {
  why: string
  /** the failure it must produce — the *specific* one, so a different red is a red here */
  message: RegExp
  /** an unlayered rule injected into `<head>` */
  css?: string
  /** `[host selector, outerHTML]`, prepended into the host */
  node?: readonly [string, string]
  /** `[name, value]`, set on the screen root */
  attr?: readonly [string, string]
  /** `[selector, class]`, removed from every match and put back afterwards */
  strip?: readonly [string, string]
}

const COMPOSITION_MUTANTS: readonly Mutant[] = [
  {
    // S1. Screenshot-verified: a solid violet rectangle, no text, no cards —
    // and every colour, length, radius and track underneath it still correct,
    // because a covered element is laid out exactly like an uncovered one.
    // `pointer-events-none` is what makes it survive to production and what
    // makes a naive `elementFromPoint` walk straight past it.
    why: 'a scrim that failed to unmount, over the whole page',
    node: [SCREEN, '<div style="position:fixed;inset:0;background:rgb(42, 29, 94);' +
      'z-index:50;pointer-events:none"></div>'],
    message: /covered measurement hook: data-col/,
  },
  {
    // S2. `max-width` and the used `width` — the two lengths the column is
    // graded on — do not move by a pixel.
    why: 'the content column pushed off the left edge',
    css: `${SCREEN} [data-col]{position:relative;left:-9999px}`,
    message: /off-screen measurement hook: data-col/,
  },
  {
    // S2, halfway: the shape the reviewer described as "cards sliced in half".
    // This one is *on* screen, so the intersection test above is content with
    // it; only the containment test sees it.
    why: 'the content column half off the side, where nothing scrolls',
    css: `${SCREEN} [data-col]{position:relative;left:-600px}`,
    message: /measurement hook off the side: data-col/,
  },
  {
    // S3. The mutation that opened this hole. The card title is not a hooked
    // element and never will be, which is why the census reads every run of
    // type on the screen instead of the two the DESIGN row names.
    why: 'every card title painted in the card’s own colour',
    css: '[data-card] .text-ink{color:rgb(251, 247, 241)}',
    message: /type the reader cannot see/,
  },
  {
    // S4. Radius, shadow, border and every length are untouched; the cards
    // simply stop being cards. `card.background` is required for this reason.
    why: 'the cards repainted the colour of the field',
    css: '[data-card]{background-color:rgb(42, 29, 94)}',
    message: /departments: card background/,
  },
  {
    // S5. `trackCount` still answers 3 and `[data-col]`'s used width does not
    // move — a three-column grid blown a quarter of the viewport apart.
    why: 'the grid gutter blown out to 240px',
    css: `${SCREEN} [data-grid]{gap:240px}`,
    message: /departments: grid column-gap/,
  },
  {
    // S5, the half a declared `gap` cannot see: the gutter the reader measures
    // is 98px and `column-gap` still says 18px. This is the mutant the
    // geometric half exists for, and the only thing that kills it.
    why: 'a margin on the items, opening a gutter `gap` never mentions',
    css: '[data-card]{margin-left:40px;margin-right:40px}',
    message: /the gutters the browser drew between adjacent items/,
  },
  {
    // S6. The most consequential of the seven: the entire Persian UI mirrors.
    // Headings to the other margin, cards in the reverse order, chevrons
    // backwards, the sentence-final period on the wrong side — and not one
    // length, colour, weight, radius or track count in this file moves.
    why: 'the whole right-to-left screen mirrored to LTR',
    attr: ['dir', 'ltr'],
    message: /direction — the application is Persian/,
  },
  {
    // S7. `base.css:8` is the *only* place the application's type stack is
    // named, so nothing declared a family, so nothing measured one.
    why: 'the application’s typeface replaced, globally, in one line',
    css: "body{font-family:'Times New Roman', serif}",
    message: /departments: h1 font-family/,
  },
  {
    // The waiver's own precondition. A `contrastWaived` entry that has outlived
    // the element it was written for is a hole nobody decided to open, and the
    // census would go on skipping whatever grew into its place.
    why: 'a contrast waiver that no longer matches anything',
    strip: ['[data-card] .pointer-events-none', 'pointer-events-none'],
    message: /`contrastWaived` names selectors that match nothing/,
  },
  {
    // D2. The `toBeVisible` half of `hook()` was doing real work and nothing
    // pinned it: deleting it left the suite fully green. Chrome answers a
    // `display:none` element with its *specified* values, so a decoy in front
    // of the real hook is measured with the wrong numbers rather than skipped.
    why: 'a display:none decoy in front of the real [data-h1]',
    node: [`${SCREEN} [data-col]`, '<div data-h1 style="display:none">دپارتمان‌ها</div>'],
    message: /hidden measurement hook: data-h1/,
  },
] as const

interface Change {
  css: string | null
  node: readonly [string, string] | null
  attr: readonly [string, string] | null
  strip: readonly [string, string] | null
}

const asChange = (m: Mutant): Change => ({
  css: m.css ?? null, node: m.node ?? null, attr: m.attr ?? null, strip: m.strip ?? null,
})

const applyMutant = (page: Page, c: Change) =>
  page.evaluate((m) => {
    if (m.css) {
      const sheet = document.createElement('style')
      sheet.id = 'zz-mutant'
      sheet.textContent = m.css
      document.head.append(sheet)
    }
    if (m.node) {
      const template = document.createElement('template')
      template.innerHTML = m.node[1]
      const el = template.content.firstElementChild!
      el.setAttribute('data-zz-mutant', '')
      document.querySelector(m.node[0])!.prepend(el)
    }
    if (m.attr) {
      document.querySelector('[data-screen="departments"]')!.setAttribute(m.attr[0], m.attr[1])
    }
    if (m.strip) {
      for (const el of Array.from(document.querySelectorAll(m.strip[0]))) {
        el.classList.remove(m.strip[1])
        el.setAttribute('data-zz-stripped', '')
      }
    }
  }, c)

const undoMutant = (page: Page, c: Change) =>
  page.evaluate((m) => {
    document.getElementById('zz-mutant')?.remove()
    for (const el of Array.from(document.querySelectorAll('[data-zz-mutant]'))) el.remove()
    if (m.attr) {
      document.querySelector('[data-screen="departments"]')!.removeAttribute(m.attr[0])
    }
    if (m.strip) {
      for (const el of Array.from(document.querySelectorAll('[data-zz-stripped]'))) {
        el.classList.add(m.strip[1])
        el.removeAttribute('data-zz-stripped')
      }
    }
  }, c)

test('every composition check has a mutant that kills it', async ({ page }) => {
  await onDepartments(page)

  // The page as it ships passes. Without this, "it went red" would prove
  // nothing about the mutant — the same red would be reported if the screen
  // were broken before anything was applied to it.
  await expectDesign(page, 'departments')

  for (const mutant of COMPOSITION_MUTANTS) {
    const change = asChange(mutant)
    await applyMutant(page, change)
    // The mutation landed on the page that was pinned. Without this the loop
    // could go on applying mutants to a page that had moved, and report every
    // one of them as "no longer caught" — see `failsWith`, which is the other
    // half of the same fix.
    await expectSamePage(page, `applying the “${mutant.why}” mutant`)
    await failsWith(
      expectDesign(page, 'departments'),
      mutant.message,
      `the “${mutant.why}” mutant is no longer caught, or is caught by something else. Each ` +
      'of these left the suite at 30 passed / 12 skipped when it was applied to the working ' +
      'tree for real; the page it produces is visibly wrong and every value on it is legal.',
    )
    await undoMutant(page, change)
  }

  // …and every one of them really was put back. Without this the run would
  // degrade, mutant by mutant, into "expectDesign fails on an already-broken
  // page", and the later entries would pass for the wrong reason.
  await expectDesign(page, 'departments')
})

/* ------------------------------------------------------------------ *
 * §8's scroll box — a correct screen the gate used to accuse
 * ------------------------------------------------------------------ */

/**
 * **A predicted false red, constructed and shown not to fire.**
 *
 * Task 15 puts `[data-r-pad]{direction:ltr}` and `[data-r-pad] > *{direction:rtl}`
 * into `base.css` (§8: RTL text, scrollbar on the right) and Task 14 puts
 * `data-r-pad` on this screen. `[data-r-pad]` **is** `[data-screen]`, so the root
 * computes `ltr` while everything under it computes `rtl` — and against a single
 * per-row `direction` that is a correct screen going red, in a file twenty-one
 * screen checks copy, whose cheapest repair is to weaken the direction check.
 * This project has already paid for that shape twice; the second time the false
 * red sat inside a template telling twenty-one tasks "Do not weaken it".
 *
 * So the three states are pinned here rather than argued about:
 *
 * 1. the scroll box, complete — **green**;
 * 2. the scroll box with the child reset missing — red, and specifically at the
 *    O1 defect, which is the reason §8 is a stylesheet rule and not two
 *    attributes;
 * 3. `dir="ltr"` with no scroll box at all — red, the whole Persian UI mirrored,
 *    which is one of the seven survivors the hardening pass was built to kill
 *    and which `text-align` cannot see (Chrome reports `start` in both
 *    directions).
 *
 * Deliberately **not** in `proved once`: it renders, and a `direction` that is
 * decided by a stylesheet is exactly the kind of thing a breakpoint can move.
 */
test('§8’s scroll box is a legal LTR root, and only when it proves itself', async ({ page }) => {
  await onDepartments(page)
  await expectDesign(page, 'departments')

  const change = (css: string, attr: readonly [string, string] | null = null): Change =>
    ({ css, node: null, attr, strip: null })

  // 1. Task 14 + Task 15, exactly as they will ship.
  const box = change(`${SCREEN}{direction:ltr} ${SCREEN} > *{direction:rtl}`, ['data-r-pad', ''])
  await applyMutant(page, box)
  await expectSamePage(page, 'applying §8’s scroll box')
  const root = page.locator(SCREEN)
  expect(
    await root.evaluate((el) => getComputedStyle(el).direction),
    'the construction did not take: this test proves nothing unless the root really is LTR',
  ).toBe('ltr')
  expect(
    await root.evaluate((el) => getComputedStyle(el.firstElementChild!).direction),
    'the child reset did not take, so state 1 is state 2 and the green below would be a lie',
  ).toBe('rtl')
  await expectDesign(page, 'departments')
  await undoMutant(page, box)

  // 2. The same box, minus the rule that flips the children back. This is O1:
  //    the attribute form flipped back the one child somebody remembered, and
  //    every dialog mounted beside it stayed LTR — the workaround five files in
  //    src/write/ each carry a comment about.
  // Since Task 15 shipped §8's rule into `base.css`, a mutant that only turns
  // the root LTR no longer REACHES state 2: the real
  // `[data-r-pad] > *{direction:rtl}` flips the children back and the check goes
  // — correctly — green, so `failsWith` below reported that the guard had died.
  // The state being pinned is "the reset did not reach them", so the mutant has
  // to defeat the real reset as well. An injected <style> is unlayered and beats
  // `@layer base` whatever the specificity, which is what makes that possible
  // without touching the stylesheet the app ships.
  const halfBox = change(`${SCREEN}{direction:ltr} ${SCREEN} > *{direction:ltr}`, ['data-r-pad', ''])
  await applyMutant(page, halfBox)
  await expectSamePage(page, 'applying the scroll box without its child reset')
  await failsWith(
    expectDesign(page, 'departments'),
    /did not reach all of them/,
    'a scroll box whose children were not flipped back is accepted, so §8’s rule could lose ' +
    'its second line and nothing would say so',
  )
  await undoMutant(page, halfBox)

  // 3. And the thing the check is actually for. No `data-r-pad`, so no reset and
  //    no scroll box: the page is mirrored.
  const mirror = change(`${SCREEN}{direction:ltr}`)
  await applyMutant(page, mirror)
  await expectSamePage(page, 'applying the LTR mirror')
  await failsWith(
    expectDesign(page, 'departments'),
    /carries no `data-r-pad`/,
    'an LTR root with no scroll box behind it is accepted — the whole Persian UI mirrors and ' +
    'not one length, colour, weight, radius or track count moves',
  )
  await undoMutant(page, mirror)

  // Everything really was put back, so the three states above graded three
  // pages and not one progressively broken one.
  await expectDesign(page, 'departments')
})

/**
 * The other half of the per-hook change: the override is **narrow**, and both
 * of its own guards fire.
 *
 * The reason `direction` is keyed by hook rather than stated once for the row is
 * that a row-wide `ltr` would excuse a mirrored page in the same breath as a
 * latin username. So the exemption has to be shown to cover the one hook it
 * names and no other — and, like `contrastWaived`, to be incapable of outliving
 * or misdescribing the thing it was written for.
 */
test('a direction override covers one hook, and cannot be a no-op or an orphan', async ({ page }) => {
  await onDepartments(page)
  const row = DESIGN.departments as ScreenDesign
  const ltrBody: Change =
    { css: `${SCREEN} [data-body]{direction:ltr}`, node: null, attr: null, strip: null }

  try {
    // A latin island on a hooked run of type, with nothing said about it.
    await applyMutant(page, ltrBody)
    await expectSamePage(page, 'flipping [data-body] to LTR')
    await failsWith(
      expectDesign(page, 'departments'),
      /departments: data-body direction/,
      'an LTR run of hooked type is accepted with nothing in the row saying so',
    )

    // Said, at the hook it is true of: green.
    row.direction = { body: 'ltr' }
    await expectDesign(page, 'departments')

    // …and it covers that hook and nothing else. The column mirrors too and the
    // row still goes red, which is what a single per-row value could not do.
    // `${SCREEN}{direction:rtl}` first, and it is not scenery: `[data-col]` is
    // the scroll box's own immediate child, so since Task 15 put §8's rule in
    // `base.css` this root really is `[data-r-pad]` and mirroring the column
    // alone ALSO breaks the root's scroll-box contract. The root is graded
    // before any content hook, so what arrived was the escaped-child failure and
    // not the per-hook one this line is about. Pinning the root back to `rtl`
    // takes it out of the LTR branch entirely and leaves `col` as the only thing
    // mirrored — which is the state this claim was always written against.
    const alsoCol: Change = {
      css: `${SCREEN}{direction:rtl} ${SCREEN} [data-col]{direction:ltr}`,
      node: null, attr: null, strip: null,
    }
    await applyMutant(page, alsoCol)
    await expectSamePage(page, 'flipping [data-col] to LTR as well')
    await failsWith(
      expectDesign(page, 'departments'),
      /departments: data-col direction/,
      'an override on `body` is excusing `col` as well — the exemption is not per hook at all',
    )
    await undoMutant(page, alsoCol)
    await undoMutant(page, ltrBody)

    // Guard 1: an entry that only restates the default.
    row.direction = { body: 'rtl' }
    await failsWith(
      expectDesign(page, 'departments'),
      /names a hook and then states the default/,
      'a no-op override is accepted, so a row can claim a deviation it does not have',
    )

    // Guard 2: an entry for a hook this row does not grade. `grid` is the one
    // that can be taken away without disturbing anything else measured here.
    const grid = row.grid
    try {
      delete row.grid
      row.direction = { grid: 'ltr' }
      await failsWith(
        expectDesign(page, 'departments'),
        /`direction` names hooks this row does not grade/,
        'an override for a hook that is never measured is accepted, so it can outlive the ' +
        'element it was written for exactly as a stale `contrastWaived` entry used to',
      )
    } finally {
      row.grid = grid
    }
  } finally {
    delete row.direction
    await undoMutant(page, ltrBody)
  }

  // The page really was put back.
  await expectDesign(page, 'departments')
})

/* ------------------------------------------------------------------ *
 * A navigation between a mutation and its measurement
 * ------------------------------------------------------------------ */

/**
 * **The failure mode every test above is built out of, and the one that used to
 * be laundered into an accusation against the guards.**
 *
 * Every check in this file works the same way: put something on the page, then
 * measure. If the page moves in between, the thing that was put there is gone —
 * and the measurement that follows is perfectly correct about a page nobody
 * asked about. What came out of that, measured on this repo on 2026-08-18 when a
 * watched file was saved mid-run, was not `Execution context was destroyed`
 * (which nobody misreads). It was:
 *
 * - `the “a scrim that failed to unmount, over the whole page” mutant is no
 *   longer caught, or is caught by something else`
 * - `the decoys are not in front of the screen's hooks any more (data-col, …),
 *   so this test proved nothing about scoping`
 * - `the \`modality\` probe stopped killing its clause — that clause can no
 *   longer fail`
 *
 * Three reds that name a guard as the suspect, in a file twenty-one screen
 * checks copy, and whose cheapest repair is to weaken the guard. This project
 * has already paid for that once: a false red sat inside a template telling
 * twenty-one tasks "Do not weaken it", which is an instruction to weaken a
 * correct assertion twenty-one times over.
 *
 * Both halves are pinned here because they fail differently and only one of them
 * is visible to a nonce on `window`.
 */
test('a navigation between a mutation and its measurement names itself', async ({ page }) => {
  await onDepartments(page)
  const scrim = asChange(COMPOSITION_MUTANTS[0])

  // 1. A new document. `page.reload()` puts the departments screen back exactly
  //    as it was, minus the mutant — which is why the loop above used to report
  //    the mutant as "no longer caught" instead of reporting the reload.
  await applyMutant(page, scrim)
  await page.reload()
  await page.locator(SCREEN).waitFor()
  const hard = await expectDesign(page, 'departments').then(() => null, (e: unknown) => e as Error)
  expect(hard, 'expectDesign passed on a page that had been reloaded under it').not.toBeNull()
  expect(isNavigationFault(hard)).toBe(true)
  expect(hard!.message).toMatch(/a whole new document/)
  // The two sentences the message exists for: it names the navigation as the
  // fault, and it refuses the repair the old red invited.
  expect(hard!.message).toMatch(/The navigation is the fault/)
  expect(hard!.message).toMatch(/Do not weaken the assertion/)
  // And it is not the mutant's own red wearing a different hat.
  expect(hard!.message).not.toMatch(/covered measurement hook/)

  // The escape, which is what makes the guard usable rather than a wall: a spec
  // that navigated on purpose says so, in one line, and goes on measuring.
  await pinPage(page)
  await expectDesign(page, 'departments')

  // 2. An in-page history navigation. **This is the half a nonce on `window`
  //    cannot see**: same document, same window, same `<head>` — the injected
  //    stylesheet is still in it — so every nonce, sentinel and global survives.
  //    What does not survive in this application is the screen: react-router
  //    unmounts it and everything a spec planted inside it goes too, which is
  //    the more misleading of the two failures because half the mutation is
  //    still in force.
  await applyMutant(page, scrim)
  await page.evaluate(() => history.pushState({}, '', location.pathname))
  const soft = await expectDesign(page, 'departments').then(() => null, (e: unknown) => e as Error)
  expect(soft, 'a pushState went unnoticed — the SPA half of the guard is not armed').not.toBeNull()
  expect(isNavigationFault(soft)).toBe(true)
  expect(soft!.message).toMatch(/an in-page history navigation/)

  await pinPage(page)
  await undoMutant(page, scrim)
  await expectDesign(page, 'departments')

  // 3. And the camera, which is the one measurement with no value to fold the
  //    check into. A screenshot of a page that moved is a picture of another
  //    screen, filed in `e2e/__shots__/` under this screen's name and compared
  //    by a human against `ui/design/`.
  await page.reload()
  await page.locator(SCREEN).waitFor()
  const camera = await shot(page, 'navigated-away').then(() => null, (e: unknown) => e as Error)
  expect(camera, 'shot() photographed a page that had moved under it').not.toBeNull()
  expect(isNavigationFault(camera)).toBe(true)
  await pinPage(page)
})

/* ------------------------------------------------------------------ *
 * The two guards against grading an empty page
 * ------------------------------------------------------------------ */

/**
 * The two vacuity guards, each with the emptiness that must reach it.
 *
 * Both were added in the last hardening pass and neither was pinned: deleting
 * either one left the suite green, because nothing in it ever produced the
 * empty case. A guard whose failure no test can provoke is furniture — it is
 * the same defect as the four assertions that had never been executed by any
 * screen, one layer down.
 */
test('the two vacuity guards fail when there is nothing to grade', async ({ page }) => {
  await onDepartments(page)

  // 1. `g.items > 0`. An empty grid's gutter is correct about nothing, and
  //    nothing else notices: `grid-template-columns` still resolves to three
  //    used tracks, `column-gap` and `row-gap` still read 18px, and the
  //    geometric census simply has no pair of items to measure. The
  //    `min-height` keeps the grid itself visible, so what fires is the
  //    emptiness and not `hook`'s visibility gate. The fixture that really
  //    produces this is an endpoint serving `[]`.
  const empty = asChange({
    why: 'a grid with nothing in it',
    message: /has no items to arrange/,
    css: `${SCREEN} [data-grid]{min-height:40px}\n${SCREEN} [data-grid]>*{display:none}`,
  })
  await applyMutant(page, empty)
  await expectSamePage(page, 'emptying the grid')
  await failsWith(
    expectDesign(page, 'departments'),
    /the grid has no items to arrange/,
    'an empty grid no longer fails, so every geometric assertion in the grid block — the ' +
    'drawn gutters, the adjacency census — is vacuously true on a screen whose list came ' +
    'back empty',
  )
  await undoMutant(page, empty)

  // 2. `runs.length > 0`. A contrast census that graded nothing, which is how
  //    the census stops being able to fail. The way it really happens is a
  //    waiver that grew: one selector wide enough to cover the screen, every
  //    run of type skipped — and `deadWaivers` is content, because the selector
  //    does match something.
  const row = DESIGN.departments as ScreenDesign
  const waived = row.contrastWaived
  try {
    row.contrastWaived = ['[data-screen]']
    await failsWith(
      expectDesign(page, 'departments'),
      /found no type at all/,
      'a contrast census that graded nothing no longer fails, so the check that notices a ' +
      'title painted in its own background colour can be switched off by widening a waiver',
    )
  } finally {
    row.contrastWaived = waived
  }

  await expectDesign(page, 'departments')
})

/**
 * The navigation guard's own precondition, which is the one that can make every
 * other check in this file silently inert.
 *
 * The stamp those checks compare is written by an init script, and an init
 * script only reaches documents opened after it was installed. `signedIn` and
 * `serve` install it, which is why `expectDesign` on a properly-set-up spec is
 * guarded — but nothing about a page *says* it was stamped, so a spec that
 * navigated before it stubbed would be graded by a navigation guard that can
 * never fire. `about:blank` is that page in its purest form: never stamped, and
 * every `nav` read off it comes back null.
 */
test('a page the harness never stamped cannot be graded at all', async ({ page }) => {
  await failsWith(
    expectDesign(page, 'departments'),
    /carries no harness stamp/,
    'a page with no stamp is graded anyway, so every navigation check in `_harness.ts` passes ' +
    'on it in silence — the guard is furniture on exactly the specs that got the setup wrong',
  )
})
