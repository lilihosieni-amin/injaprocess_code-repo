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

const STUBS: Record<string, unknown> = {
  '/api/departments': DEPARTMENTS,
  '/api/pending': [],
  '/api/departments/dining/processes': [PROCESS],
  '/api/confirmations?department=dining': [],
  '/api/processes/dining-003': PROCESS,
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
