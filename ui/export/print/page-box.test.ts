import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRINT } from './bands'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(join(HERE, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** the flowchart document */
const PRINT_CSS = read('print.css')
/** the step-by-step staff guide — a separate document, its own portrait page */
const STEPS_CSS = read('../steps/print.module.css')

/** The `@page` box, as four millimetre figures. */
function pageMargins(css: string = PRINT_CSS): { top: number; right: number; bottom: number; left: number } {
  const m = css.match(/@page\s*\{([^}]*)\}/)
  expect(m, 'print.css declares an @page box').not.toBeNull()
  const decl = m![1].split(';').map((d) => d.split(':').map((s) => s.trim()))
    .find(([p]) => p.toLowerCase() === 'margin')
  expect(decl, '@page declares a margin').toBeDefined()
  const parts = decl![1].split(/\s+/).map((v) => {
    expect(v, `@page margin component "${v}" is in mm`).toMatch(/^-?[\d.]+mm$/)
    return Number(v.replace('mm', ''))
  })
  const [a, b = a, c = a, d = b] = parts
  return { top: a, right: b, bottom: c, left: d }
}

/** Chrome draws the date/title/URL/page-number chrome itself; a page cannot turn
 *  it off from script or from CSS. What it *can* do is leave the chrome no room:
 *  measured in Chrome 150 (`Page.printToPDF` with `displayHeaderFooter:true`, the
 *  flag the print dialog's "Headers and footers" checkbox sets), a vertical `@page`
 *  margin of 8.8mm or less prints no header and no footer, while 8.9mm and above
 *  prints both. The boundary is a Chromium heuristic — "do not draw what does not
 *  fit" — so this is a ceiling with slack under it, not a value tuned to the edge.
 *
 *  The horizontal margin is unaffected: the chrome is a horizontal band at the top
 *  and the bottom of the sheet, and side margins of 13mm print no chrome at all. */
const HF_SUPPRESSION_CEILING_MM = 8.8

describe('the @page box keeps Chrome’s header and footer off the paper', () => {
  it('leaves the top and bottom margin too small for the chrome to fit', () => {
    const m = pageMargins()
    expect(m.top).toBeLessThanOrEqual(HF_SUPPRESSION_CEILING_MM)
    expect(m.bottom).toBeLessThanOrEqual(HF_SUPPRESSION_CEILING_MM)
  })

  // The alternative reading of "no header or footer" is `@page{margin:0}`, and it
  // works — but `.doc` and `.sheet` are both `padding:0` in print, so with a zero
  // page margin the roles and KPI sheets, which flow across three pages each, would
  // print their interior pages hard against the paper edge. Padding on a container
  // spaces only the first and the last page of a flow, never the ones between.
  it('still keeps every page off the paper edge, interior pages included', () => {
    const m = pageMargins()
    expect(m.top).toBeGreaterThan(0)
    expect(m.bottom).toBeGreaterThan(0)
    expect(m.left).toBeGreaterThan(0)
    expect(m.right).toBeGreaterThan(0)
  })

  // `bands.ts` derives `PRINT.W` from the page width *minus these margins*, and it
  // may not be touched. Narrowing the vertical margin only ever gives a band more
  // room than the budget assumes, which is safe; widening it, or touching the sides,
  // would make the budget wrong and mis-scale or mis-slice every diagram.
  it('does not widen the margins the band budget was derived from', () => {
    const m = pageMargins()
    // the figures PRINT.W/PRINT.H were derived against
    expect(m.left).toBe(13)
    expect(m.right).toBe(13)
    expect(m.top).toBeLessThanOrEqual(14)
    expect(m.bottom).toBeLessThanOrEqual(14)
    const PX_PER_MM = 96 / 25.4
    // A4 portrait is 793.7 CSS px wide — the narrower of the two sheets, so the
    // one the width budget must satisfy. A diagram drawn at PRINT.W would
    // otherwise run off the edge of an A4 print.
    expect(210 * PX_PER_MM - (m.left + m.right) * PX_PER_MM).toBeGreaterThan(PRINT.W)
    // Letter portrait is 1056 CSS px tall — the shorter of the two page heights.
    expect(1056 - (m.top + m.bottom) * PX_PER_MM).toBeGreaterThan(PRINT.H)
    // and the budget is kept a few per cent under the true usable box, not at it
    expect(PRINT.W).toBeLessThan(210 * PX_PER_MM - (m.left + m.right) * PX_PER_MM - 10)
    expect(PRINT.H).toBeLessThan(1056 - (m.top + m.bottom) * PX_PER_MM - 10)
  })

  it('keeps the portrait page size', () => {
    expect(PRINT_CSS).toMatch(/@page\s*\{[^}]*size:\s*portrait/)
  })
})

/** A portrait page box is ~695px wide, and the mockup's own ported breakpoints
 *  are *bare* width queries — no medium — so they are evaluated against the page
 *  box as well as the window. Under the landscape box (~958px) none of them could
 *  ever match on paper; under portrait, `(max-width:760px)` does.
 *
 *  Only one rule inside it reaches an element this document renders: `.g2`, the
 *  sub-unit card grid. The print block re-declares it through `.grid.g2` — one
 *  class more specific — so the cards stay two-up on paper, which is what the
 *  ported print rules intend. This is the check that the orientation change did
 *  not quietly hand that decision to a phone breakpoint. */
describe('the ported phone breakpoints do not re-typeset the portrait page', () => {
  const DOC_CSS = readFileSync(join(HERE, '../flowchart/document.module.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  it('collapses .g2 only through a selector the print block outranks', () => {
    // the ported breakpoint really is bare — that is why this test has to exist
    expect(DOC_CSS).toMatch(/@media\s*\(\s*max-width:\s*760px\s*\)\s*\{[^}]*\.g2[^}]*grid-template-columns:\s*1fr\b/)
    // and the print block wins it back at (0,2,0) against the breakpoint's (0,1,0)
    const printBlock = DOC_CSS.slice(DOC_CSS.indexOf('@media print'))
    expect(printBlock).toMatch(/\.grid\.g2\s*,\s*\.grid\.g3\s*\{\s*grid-template-columns:\s*1fr 1fr/)
  })

  it('has no element for the other rule the breakpoint carries', () => {
    // `.a0*` is transcribed but never rendered (`document.module.css` header, and
    // `Document.tsx` uses only `.grid.g2`). If an A-0 diagram is ever added, the
    // breakpoint's `.a0-*{grid-column:1}` would fire on paper and flatten it.
    const doc = readFileSync(join(HERE, '../flowchart/Document.tsx'), 'utf8')
    expect(doc).not.toMatch(/\ba0\b/)
  })
})

// The steps guide is a second, independent document: portrait, and flowing text
// rather than planned bands, so it has no page budget to invalidate — a narrower
// vertical margin only gives its flow more usable height. The suppression ceiling
// is the same number, and was re-measured on the portrait document rather than
// carried over: at 8.8mm neither header nor footer prints, at 8.9mm the header
// returns and at 9mm both do, on all 46 pages of the real dining guide.
describe('the steps guide’s @page box keeps the chrome off the paper too', () => {
  it('leaves the top and bottom margin too small for the chrome to fit', () => {
    const m = pageMargins(STEPS_CSS)
    expect(m.top).toBeLessThanOrEqual(HF_SUPPRESSION_CEILING_MM)
    expect(m.bottom).toBeLessThanOrEqual(HF_SUPPRESSION_CEILING_MM)
  })

  // Its `.printdoc` is `padding:0` in print and the guide runs to dozens of pages,
  // so `@page{margin:0}` would print every interior page against the paper edge.
  it('still keeps every page off the paper edge, interior pages included', () => {
    const m = pageMargins(STEPS_CSS)
    expect(m.top).toBeGreaterThan(0)
    expect(m.bottom).toBeGreaterThan(0)
    expect(m.left).toBeGreaterThan(0)
    expect(m.right).toBeGreaterThan(0)
  })

  // Both exported documents print from the same department on the same paper; a
  // reader who prints one after the other must not get two different page boxes.
  it('carries the flowchart document’s margins exactly', () => {
    expect(pageMargins(STEPS_CSS)).toEqual(pageMargins(PRINT_CSS))
  })

  it('keeps the portrait page size', () => {
    expect(STEPS_CSS).toMatch(/@page\s*\{[^}]*size:\s*portrait/)
  })
})
