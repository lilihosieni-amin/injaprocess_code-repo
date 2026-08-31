import { test, expect } from '@playwright/test'
import type {
  Branch, Department, FactsListResponse, Overview, Process, VisibilityPolicy,
} from '../src/api/types'
import type { AdminUser } from '../src/api/users'
import { FIELD, FONT_SANS, RTL, serve, shot, signedIn, visit } from './_harness'

/**
 * Every screen, three widths, one file.
 *
 * The eight per-screen specs beside this one each assert their own numbers —
 * this one asserts the things that are true of *every* page and were wrong on
 * all nine. Every check here is a defect that actually shipped in this rebuild
 * and that no per-screen spec was looking for:
 *
 *   · the screen wrapper on the cream `--bg` instead of the deep-violet field
 *     (four briefs simply omitted `bg-ink`, and jsdom paints nothing, so every
 *     vitest assertion about those screens passed);
 *   · a page that scrolls sideways at 760, which is what "responsive" has to
 *     mean before any of the rules that mention a breakpoint matter;
 *   · a screen that dropped out of RTL, or out of Vazirmatn;
 *   · a latin digit in reader-visible prose (§2.7);
 *   · a console error nothing in a vitest run would ever surface.
 *
 * NOT the `<body>` background, which the brief for this task asked for and got
 * backwards: `--bg` is `#FBF7F1`, the warm cream, and `base.css` paints the
 * body with it deliberately. The deep violet is `--ink`, and what §9.1 says is
 * that the SCREEN sits on it — `bg-ink` on `[data-screen]`, which is the class
 * the four briefs left out and the thing worth pinning.
 */

const DEPARTMENTS: Department[] = [
  { code: 'dining', name: 'سالن', count: 4, subs: 1, conflicts: 0 },
  { code: 'cooking', name: 'آشپزخانه', count: 2, subs: 0, conflicts: 0 },
]

const PROCESSES: Process[] = [
  { id: 'dining-003', department: 'dining', name: 'پذیرایی از میهمان', parent: null,
    summary: 'میهمان از در ورودی تا میز خود همراهی می‌شود.',
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [], edges: [], pending: [] },
]

/** `summary` and `kpis` are non-empty because the summary screen guards both:
 *  emptied, `[data-body]` and the two-column block never render and the sweep
 *  would be measuring a screen in its withheld state rather than its full one. */
const PROCESS: Process = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از میهمان', parent: null,
  summary: 'میهمان از در ورودی تا میز خود همراهی می‌شود.',
  idef0: {
    inputs: ['سفارش میهمان'], controls: ['دستورالعمل سالن'],
    outputs: ['میهمان نشسته'], mechanisms: ['میزبان'],
  },
  kpis: [{ name: 'زمان انتظار', definition: 'از ورود تا نشستن', target: 'کمتر از سه دقیقه' }],
  nodes: [], edges: [], pending: [],
}

const OVERVIEW: Overview = {
  department: 'dining', name: 'سالن',
  updated_at: '2026-05-01T08:00:00Z',
  description: 'سالن پذیرایی رستوران، از در ورودی تا میز میهمان.',
  sub_units: [{ name: 'میزبانی', description: 'استقبال و راهنمایی' }],
  personnel: [{ role: 'میزبان', duties: ['استقبال'], kpi: ['زمان انتظار'] }],
}

const SAHAR: AdminUser = {
  id: 2, username: '09121111111', displayName: 'سحر بیات',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'manage_users'],
  scopes: ['dept:dining'],
  supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: false },
  canSupervise: false, disabled: false, createdAt: 1_700_000_000,
}

/**
 * §14's list, at the two rows the sweep needs: one universal and confirmed, one
 * scoped and red. The id is the screen's only latin run, and it is pinned
 * `dir="ltr"` — which is exactly what the §2.7 check below is written to admit
 * and what a screen that forgot the attribute would fail on.
 */
const FACTS: FactsListResponse = {
  entries: [
    {
      id: 'F-00001', kind: 'item', key: 'ing_1', title: 'پنیر پیتزا', aliases: [],
      scope: { departments: [], branches: [] },
      status: 'confirmed', retired: false, stub: false,
      red_counts: { unknown: 0, disputed: 0 },
      fingerprint: 'f1', confirmed: true, updated_at: '2026-09-16T14:05:00Z',
    },
    {
      id: 'F-00011', kind: 'record', key: 'mande_shab', title: 'مانده شب فرنگی و برگر',
      aliases: [], scope: { departments: ['cooking'], branches: ['chalebagh'] },
      status: 'unknown', retired: false, stub: false,
      red_counts: { unknown: 4, disputed: 0 },
      fingerprint: 'f2', confirmed: false, updated_at: '2026-09-16T14:05:00Z',
    },
  ],
  coverage: { read: 19, total: 28 },
}

const BRANCHES: Branch[] = [{ code: 'chalebagh', name: 'چاله‌باغ' }]

const POLICY: VisibilityPolicy = {
  version: 'v3_a1b2c3',
  fields: {
    process_summary: true, process_idef0: true, process_kpis: true,
    node_description: true, node_actor: true, node_icom: false,
  },
}

/**
 * One table for all eight routes.
 *
 * `expectEveryEndpointStubbed` — which `shot` calls — aborts anything a screen
 * or a shell asks for that nothing here answered, so an over-broad table costs
 * nothing and a narrow one fails as a defect in whichever screen asked.
 */
const STUBS: Record<string, unknown> = {
  '/api/departments': DEPARTMENTS,
  '/api/pending': [],
  '/api/departments/dining/processes': PROCESSES,
  '/api/departments/dining/overview': OVERVIEW,
  '/api/confirmations?department=dining': [],
  '/api/processes/dining-003': PROCESS,
  '/api/users': [SAHAR],
  '/api/users/2': SAHAR,
  '/api/visibility': POLICY,
  '/api/facts': FACTS,
  '/api/facts/branches': BRANCHES,
}

/**
 * The route, the `[data-screen]` name it must mount, and whether §9.1's field
 * is what it sits on.
 *
 * `signIn` is the ONE screen that is not on the field — it is `bg-login-bg`,
 * the design's own login canvas — and it is swept here rather than exempted,
 * pinned in BOTH directions: it must be `--login-bg` and must NOT be `--ink`.
 * An exception nobody asserts is indistinguishable from a screen somebody
 * forgot.
 */
const FIELD_BG = 'rgb(42, 29, 94)'      // --ink
const LOGIN_BG = 'rgb(46, 22, 104)'     // --login-bg, #2E1668 — the design's own login field

const ROUTES = [
  ['/departments', 'departments'],
  ['/departments/dining', 'processList'],
  ['/processes/dining-003', 'summary'],
  ['/departments/dining/overview', 'overview'],
  ['/users', 'users'],
  ['/users/2', 'access'],
  ['/profile', 'profile'],
  ['/visibility', 'policy'],
  ['/facts', 'facts'],
] as const

for (const [route, name] of ROUTES) {
  test(`sweep — ${name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))

    await signedIn(page, {
      capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm',
        'manage_users', 'manage_peers', 'view_audit', 'set_visibility'],
    })
    await serve(page, STUBS)
    await visit(page, route, name === 'users' ? undefined : name)

    const screen = page.locator(`[data-screen="${name}"]`)
    await expect(screen, 'the screen did not mount at all').toHaveCount(1)

    // §9.1 — both deliverables put the app on the deep-violet field, and the
    // app rendered these on cream. It is the largest area on screen and the
    // single biggest contributor to "this is not my design".
    await expect(screen).toHaveCSS('background-color', FIELD_BG)

    // §2.1 — Vazirmatn and nothing else, actually loaded rather than merely
    // named. `document.fonts.check` answers false for a family the document
    // asks for and never receives.
    await expect(screen).toHaveCSS('font-family', FONT_SANS)
    expect(await page.evaluate(() => document.fonts.check('14px "Vazirmatn Variable"')),
      'the family is declared but no face for it was loaded').toBe(true)

    // §8 — RTL is structural, and no page may quietly drop out of it.
    await expect(page.locator('html')).toHaveCSS('direction', RTL)

    // R7 — nothing scrolls sideways at any width. This is what a page that is
    // "responsive" has to be true of before any of its rules matter.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1)

    // §2.7 — every reader-visible NUMBER is Persian. Latin digits survive in
    // two places and two only: inside a `dir="ltr"` mono run (an id, a phone
    // number, an export URL, a policy digest — the islands `guards.test.ts`
    // declares, recognised here by the attribute they carry so one somebody
    // forgot to pin fails as a stray), and inside a latin WORD.
    //
    // The word half is not a loosening. §2.7 is a rule about numerals, and the
    // design writes «نمای IDEF0 سطح فرآیند (A-0)» verbatim — a standard's name
    // and a diagram's level, neither of which is a quantity anybody reads. A
    // check that flagged them would have had this spec asserting the design is
    // wrong. So the unit is a whitespace-delimited TOKEN: one holding a latin
    // letter is a term, one holding only digits and punctuation is a number,
    // and only the second may not be latin. `2026-05-01` fails; `IDEF0` does
    // not; `۱۲` was never latin.
    const stray = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const bad: string[] = []
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement
        if (el === null || el.closest('[dir="ltr"]') !== null) continue
        if (getComputedStyle(el).display === 'none') continue
        for (const token of (n.textContent ?? '').split(/\s+/)) {
          if (/[0-9]/.test(token) && !/[A-Za-z]/.test(token)) bad.push(token)
        }
      }
      return bad
    })
    expect(stray, 'latin digits outside a declared LTR island').toEqual([])

    // Chrome's own complaints, which no vitest run would ever surface.
    expect(errors).toEqual([])

    await shot(page, `sweep-${name}`)
  })
}

test('sweep — signIn is the one screen off the field, and says so both ways', async ({ page }) => {
  // The deliberate exception, asserted rather than skipped. It is `--login-bg`
  // — the design's own login canvas, a different violet from the field — and a
  // screen that quietly became `bg-ink` would look almost right and be wrong.
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await serve(page, { '/api/auth/me': { status: 401 } })
  await visit(page, '/login')

  const screen = page.locator('[data-screen="signIn"]')
  await expect(screen).toHaveCSS('background-color', LOGIN_BG)
  await expect(screen).not.toHaveCSS('background-color', FIELD)
  await expect(screen).toHaveCSS('font-family', FONT_SANS)
  await expect(page.locator('html')).toHaveCSS('direction', RTL)

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])

  await shot(page, 'sweep-sign-in')
})
