import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The printed flowchart document prints colour only where colour carries
 *  meaning.
 *
 *  The server prints with `printBackground: true` (`pdf.print_params`) and has
 *  to: without it every colour in the document vanishes, the junction diamonds
 *  included, and the printed legend maps their hue to a meaning. That flag also
 *  put the mockup's decorative washes onto paper for the first time — Chrome's
 *  own print dialog leaves "Background graphics" unchecked, so a PDF made from a
 *  laptop had always dropped them silently — and measured on the real dining
 *  document they were 42% of all the ink across 25 pages.
 *
 *  Two invariants, and they pull against each other, which is why they are pinned
 *  together in one file:
 *
 *  1. **The flattening is print-only.** Both exported documents on screen are
 *     byte-identical ports of their mockups and must stay pixel-identical. A
 *     background rule that escaped its `@media print` block would repaint the
 *     screen document, and nothing else in the suite would notice.
 *  2. **The colour that distinguishes things is untouched.** Flattening the
 *     junction diamonds, the ICOM chips, the subprocess markers or the diagram
 *     itself would make the flowchart ambiguous on paper — the legend would key
 *     three identical shapes to three different meanings. So the print block is
 *     held to an enumerated list of decoration, and every meaning-bearing
 *     selector is asserted *absent* from it.
 *
 *  The stylesheet is also a deliberate line-by-line port, so the third invariant
 *  is that the ported declarations are still there, unedited, doing their job on
 *  screen. Overriding is allowed; editing the port is not.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CSS = readFileSync(join(HERE, 'document.module.css'), 'utf8')

type Rule = { media: string; selector: string; decls: string }

/** Every rule in a stylesheet, tagged with the medium it sits in.
 *
 *  A hand-rolled walk rather than a regex: the question this file asks is
 *  "which `@media` is this declaration inside", and a regex that answers it for
 *  one nesting level answers it wrongly for the next one added.
 */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Rule[] = []
  let media = ''
  let i = 0
  let head = ''
  while (i < src.length) {
    const ch = src[i]
    if (ch === '{') {
      const prelude = head.trim()
      head = ''
      i++
      if (prelude.startsWith('@media')) {
        media = prelude.slice(6).trim()
        continue
      }
      // a rule: take everything to its closing brace
      const end = src.indexOf('}', i)
      out.push({ media, selector: prelude, decls: src.slice(i, end === -1 ? src.length : end) })
      i = end === -1 ? src.length : end + 1
      continue
    }
    if (ch === '}') {
      media = ''
      head = ''
      i++
      continue
    }
    head += ch
    i++
  }
  return out
}

const ALL = rules(CSS)
const inPrint = ALL.filter((r) => r.media === 'print')
const onScreen = ALL.filter((r) => r.media !== 'print')

/** The decoration this pass flattens: selector → the ported declaration it
 *  overrides. Every one of these repeats on page after page and distinguishes
 *  nothing — every KPI row carries the same green, every role head the same
 *  lavender. */
const FLATTENED: Record<string, string> = {
  '.role-head,.legend-box,.stat': 'var(--v-softer)',
  '.sheet-head .hn,.u-ic,.k-ic': 'var(--v-soft)',
  '.kpi-card .k-target': 'var(--v-soft)',
  '.kpi-role .kr-av': 'var(--ok-s)',
  'ul.kpis li': 'var(--ok-s)',
}

/** Colour that tells the reader something, and therefore may never be flattened.
 *  Each entry is a selector as the stylesheet spells it. */
const MEANINGFUL = [
  // the junction key: coral = XOR, violet = AND, amber = OR, painted from
  // `JUNCTION_COLOR` through an inline style on this element
  '.lg-sym .sq',
  // ICOM: inputs / controls / outputs / mechanisms, told apart by colour alone
  '.chip.in', '.chip.ctl', '.chip.out', '.chip.mech',
  // a process id in white on violet, and the flag that a sheet is a subprocess
  '.id-badge', '.sub-badge', '.subchip',
  // the cover, one page and the document's identity
  '.cover-sheet', '.cover-blob', '.cover-kicker .bar',
  // the section divider and the A-0 box: white type on a violet field
  '.divider-sheet', '.a0-box', '.role-av',
]

describe('the print-colour pass can never reach the screen', () => {
  for (const [selector, ported] of Object.entries(FLATTENED)) {
    it(`flattens ${selector} in print and only in print`, () => {
      const printed = inPrint.filter((r) => r.selector === selector)
      expect(printed, `${selector} is flattened inside @media print`).toHaveLength(1)
      expect(printed[0].decls).toMatch(/background\s*:\s*#fff/)

      // and no rule outside `@media print` flattens it — the screen document is
      // a port of a mockup and must not move by a pixel
      for (const r of onScreen) {
        if (r.selector !== selector) continue
        expect(r.decls, `${selector} is not flattened outside @media print (in "${r.media || 'no medium'}")`)
          .not.toMatch(/background\s*:\s*#fff/)
      }
    })

    it(`leaves the ported ${selector} tint in place for the screen`, () => {
      // The override is an override: the port keeps its own declaration, so
      // deleting the print block restores the mockup exactly.
      const parts = selector.split(',')
      for (const part of parts) {
        const ported_rule = onScreen.filter((r) => r.selector === part && r.media === '')
        expect(ported_rule.length, `${part} is still declared by the port`).toBeGreaterThan(0)
        expect(ported_rule.some((r) => r.decls.includes(ported)),
          `${part} still carries ${ported} on screen`).toBe(true)
      }
    })
  }

  it('adds no bare (medium-less) background rule at all', () => {
    // A rule with no medium applies to the page box as well as the window, so it
    // would flatten the screen document too.
    for (const r of ALL) {
      if (r.media !== '') continue
      if (!(r.selector in FLATTENED)) continue
      expect(r.decls).not.toMatch(/background\s*:\s*#fff/)
    }
  })
})

describe('the printed document keeps the colour that means something', () => {
  /** A declaration that changes what colour something is. Deliberately not "any
   *  declaration": the mockup's own print block already re-*lays out* the cover
   *  and the divider sheet (`.cover-sheet{min-height:auto;padding:0}`,
   *  `.divider-sheet{padding:60px 20px}`), which is the port and is fine. What
   *  must never happen to these selectors on paper is a recolour. */
  const RECOLOUR = /(^|;)\s*(background|color|border-color|fill|stroke)\s*:/

  for (const selector of MEANINGFUL) {
    it(`never recolours ${selector} in print`, () => {
      for (const r of inPrint) {
        const parts = r.selector.split(',').map((s) => s.trim())
        if (!parts.includes(selector)) continue
        expect(r.decls, `${selector} keeps its colour on paper`).not.toMatch(RECOLOUR)
      }
    })
  }

  it('leaves the diagram itself entirely alone', () => {
    // The bands are `../print/print.css`'s, injected as raw SVG that no CSS
    // module hash can reach. This stylesheet must not try — and must not reach
    // for a React Flow internal class to do it, which `parity.test.tsx` bans.
    for (const r of inPrint) {
      expect(r.selector).not.toMatch(/\.pf-/)
      expect(r.selector).not.toMatch(/react-flow__/)
      expect(r.selector).not.toMatch(/data-edge-label|data-subprocess/)
    }
  })

  it('flattens backgrounds to white and never to a new colour', () => {
    // "Flatten" means "let the paper through". A print rule that introduced a
    // *different* fill would be a redesign of the printed document, not a
    // reduction of it, and would not have been verified against the page count.
    for (const r of inPrint) {
      for (const m of r.decls.matchAll(/background\s*:\s*([^;]+)/g)) {
        expect(m[1].trim()).toBe('#fff')
      }
    }
  })
})

describe('the flattening moves nothing on the page', () => {
  // `bands.ts` slices every diagram against a frozen page budget and the PDF is
  // verified page by page, so a print rule that changed a box would re-paginate a
  // signed-off document. Only two kinds of declaration are allowed here:
  // background/box-shadow, which are outside the box model, and a border that is
  // paid for out of the element's own padding.
  const LAYOUT_NEUTRAL = /^(background|box-shadow|border)$/

  it('declares nothing but background, box-shadow, border and the padding that pays for it', () => {
    for (const r of inPrint) {
      if (!(r.selector in FLATTENED) && r.selector !== '.card,.role,.kpi-role,.a0') continue
      for (const decl of r.decls.split(';')) {
        if (!decl.trim()) continue
        const prop = decl.split(':')[0].trim()
        if (prop.startsWith('padding')) continue
        expect(prop, `${r.selector} declares ${prop}`).toMatch(LAYOUT_NEUTRAL)
      }
    }
  })

  it('pays for every added border out of the padding, to the pixel', () => {
    // `*{box-sizing:border-box}` is in force, so a fixed-size tile absorbs a 1px
    // border for free. The two elements sized by their padding do not, and their
    // padding is reduced by exactly the 1px the border adds — 6px 12px → 5px 11px
    // and 10px 13px / 30px → 9px 12px / 29px — so the border box is where the
    // port put it and the KPI section breaks where it broke.
    const target = inPrint.find((r) => r.selector === '.kpi-card .k-target')!
    expect(target.decls).toMatch(/border\s*:\s*1px solid/)
    expect(target.decls).toMatch(/padding\s*:\s*5px 11px/)

    const kpi = inPrint.find((r) => r.selector === 'ul.kpis li')!
    expect(kpi.decls).toMatch(/border\s*:\s*1px solid/)
    expect(kpi.decls).toMatch(/padding\s*:\s*9px 12px/)
    expect(kpi.decls).toMatch(/padding-inline-start\s*:\s*29px/)
    // the ported values these are derived from, so the arithmetic stays checkable
    const portedTarget = onScreen.find((r) => r.selector === '.kpi-card .k-target')!
    expect(portedTarget.decls).toMatch(/padding\s*:\s*6px 12px/)
    const portedKpi = onScreen.find((r) => r.selector === 'ul.kpis li' && r.media === '')!
    expect(portedKpi.decls).toMatch(/padding\s*:\s*10px 13px/)
    expect(portedKpi.decls).toMatch(/padding-inline-start\s*:\s*30px/)
  })

  it('keeps the green marker that a flattened KPI row is now read by', () => {
    // The row loses its wash; the 9px square in front of it is what is left to
    // say "this is a KPI", so it must not be flattened with the row.
    const marker = ALL.find((r) => r.selector === 'ul.kpis li::before')!
    expect(marker.decls).toMatch(/background\s*:\s*var\(--ok\)/)
    for (const r of inPrint) expect(r.selector).not.toBe('ul.kpis li::before')
  })
})

describe('the steps guide is a different document and is not touched here', () => {
  it('carries no print-colour block of its own', () => {
    const steps = readFileSync(join(HERE, '..', 'steps', 'steps.module.css'), 'utf8')
    const printed = rules(steps).filter((r) => r.media === 'print')
    expect(printed, 'the steps stylesheet adds no print rules').toHaveLength(0)
  })
})
