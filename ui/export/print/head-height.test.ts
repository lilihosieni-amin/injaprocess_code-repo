import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HEAD_H, PRINT_HEAD_BLOCK } from './PrintDiagrams'
import { PRINT } from './bands'

// ui/export — this file lives at ui/export/print/head-height.test.ts
const EXPORT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (p: string) => readFileSync(join(EXPORT_DIR, p), 'utf8')

/** The value a declaration gives a property, from the first rule whose selector
 *  text matches `selector` exactly. Comments are stripped first so a number
 *  quoted in prose can never be mistaken for a declaration. */
function decl(css: string, selector: string, prop: string): string | undefined {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(selector)) {
      for (const d of m[2].split(';')) {
        const [k, ...v] = d.split(':')
        if (k.trim().toLowerCase() === prop) return v.join(':').trim()
      }
    }
  }
  return undefined
}

const px = (v: string | undefined) => Number(String(v).replace(/!important/, '').trim().replace('px', ''))

// `PrintDiagrams` cannot measure this block: it lives inside `ProcessSheets`'
// print-only container, which is `display:none` on screen — and the emit path
// only ever runs on screen, where a `display:none` subtree measures as zero.
// The height is therefore *derived* from the print stylesheet. This test is what
// keeps the derivation honest: change any constant it is built from and the
// arithmetic here stops matching the constant in the code.
describe('the derived print heading height', () => {
  const mod = read('flowchart/document.module.css')
  const base = read('flowchart/doc-base.css')
  const print = read('print/print.css')

  it('is built from the numbers the stylesheets actually declare', () => {
    // unitless leading on `.doc-root`, so every un-`line-height`d row in a sheet
    // is `font-size × lead`
    const lead = Number(decl(base, '.doc-root', 'line-height'))
    expect(lead).toBe(1.75)

    const h2 = px(decl(mod, '.view.print-only .sheet-head h2', 'font-size'))
    const headGap = px(decl(mod, '.sheet-head', 'margin-bottom'))
    const badge = px(decl(mod, '.id-badge', 'font-size'))
    const badgePad = px(String(decl(mod, '.id-badge', 'padding')).split(/\s+/)[0])
    const stripGap = px(decl(mod, '.view.print-only .proc-num-strip', 'margin-bottom'))
    const metaGap = px(decl(mod, '.view.print-only .proc-meta', 'margin-top'))
    const pm = px(decl(mod, '.pm', 'font-size'))

    expect([h2, headGap, badge, badgePad, stripGap, metaGap, pm])
      .toEqual([18, 8, 11.5, 3, 6, 8, 12])

    // heading row + collapsed gap + id strip + collapsed gap + meta row
    const derived = h2 * lead
      + Math.max(headGap, 0)
      + (badge * lead + 2 * badgePad)
      + Math.max(stripGap, metaGap)
      + pm * lead
    expect(derived).toBeCloseTo(PRINT_HEAD_BLOCK, 5)
  })

  it('adds the gap the diagram itself keeps, and never claims to be measured', () => {
    // HEADGAP already stands for `.pf-wrap`'s printed margin-top plus slack, so
    // the derived block must not count that margin a second time.
    expect(px(decl(print, '.pf-wrap', 'margin-top'))).toBe(14)
    expect(PRINT.HEADGAP).toBeGreaterThanOrEqual(14)
    expect(HEAD_H).toBe(Math.ceil(PRINT_HEAD_BLOCK) + PRINT.HEADGAP)

    // the whole point of the fix: a real number, not the 0-height rect a
    // `display:none` subtree returns (which pinned this at 106 forever)
    expect(HEAD_H).toBeGreaterThan(106)
    expect(HEAD_H).toBeLessThan(PRINT.H)
  })
})
