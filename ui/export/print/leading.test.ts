import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRINT_CSS = readFileSync(join(HERE, 'print.css'), 'utf8')
const DOC_BASE = readFileSync(join(HERE, '../flowchart/doc-base.css'), 'utf8')

/** The one number this file exists to defend: Tailwind preflight's
 *  `html{line-height:1.5}`, which is what a node on the site inherits. */
const SITE_LEADING = '1.5'

function lineHeightFor(css: string, selector: string): string | undefined {
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue
    const decl = m[2].split(';').map((d) => d.split(':').map((x) => x.trim()))
      .find(([p]) => p.toLowerCase() === 'line-height')
    if (decl) return decl[1]
  }
  return undefined
}

// `doc-base.css` moved the document's typography onto `.doc-root` so it would stop
// reaching the canvas — but the offscreen measuring host and the SVG bands both
// live *inside* `.doc-root`, so they went on inheriting its 1.75 and every printed
// node came out ~5% taller than the same node on the site (measured: 121 px against
// 115). The host cannot move out: the bands are painted inside the document sheets,
// so measuring anywhere else would size each box at one leading and paint it at
// another. It has to declare the site's leading instead — in both contexts, or a box
// measured at 1.5 and painted at 1.75 overflows the space the band reserved.
describe('the printed node carries the site’s leading, not the document’s', () => {
  it('restores the site’s line-height in the measure and the paint context', () => {
    expect(lineHeightFor(PRINT_CSS, '.pf-measure')).toBe(SITE_LEADING)
    expect(lineHeightFor(PRINT_CSS, '.pf-band')).toBe(SITE_LEADING)
  })

  it('leaves the document’s own leading alone', () => {
    expect(lineHeightFor(DOC_BASE, '.doc-root')).not.toBe(SITE_LEADING)
  })
})
