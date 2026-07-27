import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRINT } from './bands'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRINT_CSS = readFileSync(join(HERE, 'print.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The `@page` box, as four millimetre figures. */
function pageMargins(): { top: number; right: number; bottom: number; left: number } {
  const m = PRINT_CSS.match(/@page\s*\{([^}]*)\}/)
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
    // Letter landscape is 1056 CSS px wide; the usable width must still exceed the
    // budget, or a diagram drawn at PRINT.W would run off the sheet.
    const PX_PER_MM = 96 / 25.4
    expect(1056 - (m.left + m.right) * PX_PER_MM).toBeGreaterThan(PRINT.W)
    // A4 landscape is 794 CSS px tall — the smaller of the two page heights.
    expect(794 - (m.top + m.bottom) * PX_PER_MM).toBeGreaterThan(PRINT.H)
  })

  it('keeps the landscape page size', () => {
    expect(PRINT_CSS).toMatch(/@page\s*\{[^}]*size:\s*landscape/)
  })
})
