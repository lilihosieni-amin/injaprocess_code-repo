import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ui/export — this file lives at ui/export/flowchart/parity.test.tsx
const EXPORT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

// Stylesheets are scanned too: a CSS file cannot define a React component, but it
// is exactly where a restyled diagram would land — and a print stylesheet that
// resizes .react-flow__node forks the rendering just as surely as a copied component.
const SCANNED = /\.(?:tsx?|css)$/
const TS_ONLY = /\.tsx?$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return SCANNED.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

// Defining any of these inside ui/export/ means the export has forked the
// app's flow rendering — the one thing D2 forbids. `where` keeps the
// component-definition rules on TypeScript, where components are actually
// written, so a stylesheet can never trip them.
//
// The name patterns are deliberately unanchored at the start (`\w*`): a fork is
// at least as likely to be renamed (`ExportActivityNode`) as to keep the exact
// name. `function`/`const` in front is what separates a definition from a
// legitimate `import { ActivityNode } from '../../src/flow/nodes/ActivityNode'`.
const FORBIDDEN: { rx: RegExp; what: string; where: RegExp }[] = [
  { rx: /\b(?:function|const|class)\s+\w*(?:Activity|Start|End|Junction)Node\w*\b/, what: 'a node component', where: TS_ONLY },
  { rx: /\b(?:function|const|class)\s+\w*LabeledEdge\w*\b/, what: 'an edge component', where: TS_ONLY },
  { rx: /react-flow__(?:node|edge)/, what: 'node or edge styling', where: SCANNED },
]

describe('the export never forks the app’s flow components', () => {
  it('defines no node or edge component of its own, and restyles none', () => {
    const offenders = sourceFiles(EXPORT_DIR).flatMap((file) => {
      const src = readFileSync(file, 'utf8')
      return FORBIDDEN
        .filter((f) => f.where.test(file) && f.rx.test(src))
        .map((f) => `${file} defines ${f.what}`)
    })
    expect(offenders).toEqual([])
  })

  it('the flow viewer renders through the app’s Canvas', () => {
    const src = readFileSync(join(EXPORT_DIR, 'flowchart/FlowViewer.tsx'), 'utf8')
    expect(src).toMatch(/import \{ Canvas \} from '\.\.\/\.\.\/src\/flow\/Canvas'/)
    expect(src).toMatch(/import \{ toFlowNodes, toFlowEdges \} from '\.\.\/\.\.\/src\/flow\/adapt'/)
  })
})

// Reusing the app's node components only guarantees identical rendering while
// nothing changes the values they inherit. The flowchart bundle loads
// `src/index.css` *and* the mockup's document CSS; a document rule on `html`,
// `body` or `*` cascades straight into the canvas, and because this bundle's
// stylesheet is imported last it beats Tailwind's preflight at equal
// specificity. `line-height` is the concrete one: the mockup's document is
// 1.75, the site is preflight's 1.5, and `ActivityNode`'s id badge, actor row
// and subprocess pill declare no leading of their own — so a global body rule
// makes an exported node measurably taller than the same node on the site.
//
// Properties listed here are the inherited ones that move text or change its
// box. Non-inherited page paint (`background`, `margin`) is fine on `body`:
// it cannot reach a descendant.
const INHERITED_TYPOGRAPHY = [
  'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform',
  'text-indent', 'white-space', 'color', 'direction', 'tab-size',
]

// A bare element/universal selector — anything the canvas is a descendant of.
const REACHES_EVERYTHING = /^(?:html|body|\*)$/

function rules(css: string): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = []
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selectors: m[1].split(',').map((s) => s.trim()), body: m[2] })
  }
  return out
}

function declaredProps(body: string): string[] {
  return body.split(';').map((d) => d.split(':')[0].trim().toLowerCase()).filter(Boolean)
}

describe('the exported document never changes the metrics the canvas inherits', () => {
  const base = readFileSync(join(EXPORT_DIR, 'flowchart/doc-base.css'), 'utf8')

  it('declares no inherited typography on html, body or *', () => {
    const offenders = rules(base)
      .filter((r) => r.selectors.some((s) => REACHES_EVERYTHING.test(s)))
      .flatMap((r) =>
        declaredProps(r.body)
          .filter((p) => INHERITED_TYPOGRAPHY.includes(p))
          .map((p) => `${r.selectors.join(', ')} { ${p} }`),
      )
    expect(offenders).toEqual([])
  })

  it('puts the document’s own typography on the .doc-root wrapper instead', () => {
    const wrapper = rules(base).find((r) => r.selectors.includes('.doc-root'))
    expect(wrapper).toBeDefined()
    expect(declaredProps(wrapper!.body)).toEqual(
      expect.arrayContaining(['font-family', 'color', 'line-height']),
    )
  })

  it('wraps the sheets in .doc-root and leaves the flow viewer outside it', () => {
    const src = readFileSync(join(EXPORT_DIR, 'flowchart/Document.tsx'), 'utf8')
    const open = src.indexOf('className="doc-root"')
    const close = src.lastIndexOf('</div>')
    const viewer = src.indexOf('<FlowViewer')
    expect(open).toBeGreaterThan(-1)
    expect(src.indexOf('<ProcessSheets')).toBeGreaterThan(open)
    expect(viewer).toBeGreaterThan(close)
  })

  it('opens no global escape hatch out of the hashed module', () => {
    const mod = readFileSync(join(EXPORT_DIR, 'flowchart/document.module.css'), 'utf8')
    expect(mod).not.toMatch(/:global/)
  })
})
