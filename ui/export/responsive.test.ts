import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Both exports are opened from a link, most often on a staff member's own
 *  phone. This file pins the invariants of that port which can be checked
 *  without a browser; the ones that need a real layout (no page-level
 *  horizontal scrolling at 360/390/430, a 40px target on every primary
 *  control) are measured in Chrome and recorded in `.superpowers/sdd/`.
 *
 *  The single most important invariant here is the *medium*. Both documents'
 *  PDFs were verified page by page — page counts, no node box or edge label
 *  straddling a band boundary, no step row split across a break, no browser
 *  header or footer, exact `@page` margins — and a width query with no medium
 *  is evaluated against the **page box** as well as the window. A bare
 *  `@media (max-width: 560px)` would therefore be one `@page{size}` change away
 *  from silently re-typesetting a signed-off document. Every rule added by the
 *  mobile pass is `@media screen and (…)`, and the tests below refuse anything
 *  else.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(join(HERE, p), 'utf8')

/** The marker that opens the block this pass added. Everything before it is the
 *  byte-identical port of the mockup and is deliberately left alone. */
const MARKER = '─── added after the port: the phone ───'

const SHEETS = [
  { name: 'flowchart/document.module.css', css: read('flowchart/document.module.css') },
  { name: 'steps/steps.module.css', css: read('steps/steps.module.css') },
] as const

/** Source with comments stripped, so a `@media` named in prose is not a rule. */
const bare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Everything after the marker's own comment: the rules this pass is
 *  responsible for. The marker lives *inside* a comment, so the slice starts
 *  past that comment's close — otherwise the unbalanced `/*` would defeat the
 *  comment stripper and the header prose would read as CSS. */
function addedBlock(css: string): string {
  const at = css.indexOf(MARKER)
  expect(at, `the stylesheet carries the "${MARKER}" marker`).toBeGreaterThan(-1)
  const end = css.indexOf('*/', at)
  expect(end, 'the marker comment is closed').toBeGreaterThan(at)
  return bare(css.slice(end + 2))
}

/** The `@media <query> {` preludes in a chunk of CSS. */
const mediaQueries = (css: string) =>
  [...css.matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim())

describe('the mobile rules can never reach the printed page', () => {
  for (const sheet of SHEETS) {
    it(`${sheet.name} declares every added rule under @media screen`, () => {
      const added = addedBlock(sheet.css)
      const queries = mediaQueries(added)
      expect(queries.length, 'the added block declares at least one media query').toBeGreaterThan(0)
      for (const q of queries) expect(q).toMatch(/^screen and \(/)
    })

    it(`${sheet.name} adds no rule outside a media query`, () => {
      // Anything at the top level of the added block would apply to the desktop
      // document and to paper — both of which are ports that must not move.
      const added = addedBlock(sheet.css)
      const topLevel = added.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
      expect(topLevel.trim().replace(/─+/g, '')).not.toMatch(/\{/)
    })

    it(`${sheet.name} names no print medium in the added block`, () => {
      expect(mediaQueries(addedBlock(sheet.css)).join(' ')).not.toMatch(/print/)
    })

    it(`${sheet.name} leaves the ported breakpoints alone`, () => {
      // The mockups' own width queries are unprefixed; they are ported and stay
      // exactly as they are. They must survive this pass untouched, and they
      // must all sit *before* the marker.
      const ported = bare(sheet.css.slice(0, sheet.css.indexOf(MARKER)))
      for (const q of mediaQueries(ported)) expect(q).not.toMatch(/^screen and \(/)
    })
  }
})

describe('the flowchart document’s contents page fits a phone', () => {
  const css = bare(read('flowchart/document.module.css'))

  it('lets a long process name wrap instead of pushing the page sideways', () => {
    // The ported TOC block sets `.toc .toc-t{…flex:none…}`, which re-declares —
    // and, at equal specificity and later in the file, beats — the `.toc .toc-t
    // {flex:1}` above it. Measured on the real dining document at 390px, the
    // longest process name laid out 536px wide in a 350px sheet and
    // `documentElement.scrollWidth` came back 654: because the document is RTL
    // that overflow sits at the scroll origin, so the export *opened* 264px away
    // from its own cover.
    const added = addedBlock(read('flowchart/document.module.css'))
    const rule = added.match(/\.toc \.toc-t\s*\{([^}]*)\}/)
    expect(rule, 'the added block re-declares .toc .toc-t').not.toBeNull()
    expect(rule![1]).toMatch(/flex\s*:\s*1/)
    expect(rule![1]).toMatch(/min-width\s*:\s*0/)
    // and it must be the last word on the property
    expect(css.lastIndexOf('flex:1;min-width:0')).toBeGreaterThan(css.lastIndexOf('flex:none'))
  })
})

describe('the offscreen measuring host never widens the document', () => {
  const printCss = bare(read('print/print.css'))
  const printDiagrams = readFileSync(join(HERE, 'print/PrintDiagrams.tsx'), 'utf8')

  it('wraps the 4000px host in a zero-sized clipper', () => {
    // `.pf-measure` is 4000px wide and used to sit at `left:-99999px`. The
    // document is RTL, so that is 100 000px of *scrollable* overflow: while any
    // diagram was being measured `documentElement.scrollWidth` read 100389 on a
    // 390px phone and Chrome sized the layout viewport to the content it saw.
    expect(printDiagrams).toMatch(/className="pf-clip"/)
    const clipBeforeHost = printDiagrams.indexOf('"pf-clip"') < printDiagrams.indexOf('"pf-measure"')
    expect(clipBeforeHost, 'the clipper encloses the host').toBe(true)
  })

  it('declares the clipper as a 0×0 overflow:hidden box', () => {
    const rule = printCss.match(/\.pf-clip\s*\{([^}]*)\}/)
    expect(rule, 'print.css declares .pf-clip').not.toBeNull()
    const decl = rule![1]
    expect(decl).toMatch(/position\s*:\s*absolute/)
    expect(decl).toMatch(/overflow\s*:\s*hidden/)
    expect(decl).toMatch(/width\s*:\s*0/)
    expect(decl).toMatch(/height\s*:\s*0/)
  })

  it('still lays the host out at its full measuring size', () => {
    // A clipped host is not a collapsed one: every node box `bands.ts` plans
    // against is measured inside it, so it keeps its 4000×900.
    expect(printDiagrams).toMatch(/style=\{\{ width: 4000, height: 900 \}\}/)
  })
})

describe('the flow viewer’s header is usable by thumb', () => {
  const src = readFileSync(join(HERE, 'flowchart/FlowViewer.tsx'), 'utf8')

  it('grows prev, next and close to 40px below the phone breakpoint', () => {
    // Three controls, each 34 or 36px on a desk. The variants are phone-only, so
    // the desktop document — a port of a mockup — is byte-for-byte what it was.
    expect(src.match(/max-\[560px\]:w-10 max-\[560px\]:h-10/g) ?? []).toHaveLength(3)
    expect(src).toMatch(/w-\[34px\] h-\[34px\] max-\[560px\]:w-10/)
    expect(src).toMatch(/w-9 h-9 max-\[560px\]:w-10/)
  })

  it('keeps the close button on the row — on a phone only, so the desk does not move', () => {
    expect(src).toMatch(/ms-auto max-\[560px\]:shrink-0/)
  })
})
