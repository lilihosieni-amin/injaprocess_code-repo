import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ui/export — this file lives at ui/export/flowchart/parity.test.tsx
const EXPORT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

/** The application's frozen colour file. Found rather than spelled: `_ds` holds
 *  exactly one design system and its directory is a uuid, so writing the uuid
 *  here would make a re-export of the system look like a deleted file. */
const DS_DIR = join(dirname(EXPORT_DIR), 'design/_ds')
const DS_COLORS = join(DS_DIR, readdirSync(DS_DIR)[0], 'tokens/colors.css')

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

/**
 * **Both documents are also read inside the application**, at
 * `/departments/{code}/reports/{kind}`, where each is one screen among many and
 * its stylesheet arrives in a lazy chunk that then stays for the session. A rule
 * on a selector no wrapper contains does not stop at the document: it repaints
 * every other screen, permanently, from the moment a reader opens a report.
 *
 * The scan above is the older and narrower half of this — it asks only about
 * *inherited typography*, because its question is what the flow canvas inherits,
 * and it reads only `doc-base.css`. Four things would sail through it and still
 * escape: `body{background}` (not inherited, but it propagates to the canvas and
 * paints the whole viewport), `*{box-sizing}` (not typography), and the bare
 * `::selection` and `a` rules both documents were ported with. So this asks the
 * other question — *may this rule leave the document at all* — of BOTH
 * stylesheets.
 *
 * `:root` is deliberately not on the list. Its custom properties do reach the
 * application and nine of them collide by name with the design system's, but
 * moving them onto a wrapper means moving them onto one that also contains
 * `FlowViewer` — which mounts OUTSIDE `.doc-root` by design, and is pinned so by
 * the test above — and that is a change to the export bundle's DOM with a
 * page-by-page PDF re-verification behind it. Recorded, parked, not smuggled in
 * under a guard — and the last test here is what makes parking it safe: while
 * every colliding name carries the same value in both files, the document's copy
 * winning is a no-op, and the day one of them is re-cut on its own the escape
 * stops being theoretical and this goes red instead of the application quietly
 * changing colour.
 *
 * `print/print.css` is the third stylesheet in the flowchart chunk
 * (`src/reports/FlowchartReport.tsx` imports it) and it is NOT scanned, which is
 * a second deliberate exclusion rather than an oversight. It does escape: `@page`,
 * `body{background:#fff}` and `*{print-color-adjust}` are all global, and all
 * three sit inside `@media print`. It is allowed to stand because the application
 * declares no print styles of its own — there is nothing for them to override,
 * and what they describe (white paper, colours printed as drawn, one page box)
 * is what any of these screens would want on paper anyway. It stops being true
 * the moment a screen grows its own `@media print` block, which is a change
 * whoever writes it will be looking at.
 */
describe('neither document stylesheet can escape the document', () => {
  /** A selector with nothing in front of it — one the application's own screens
   *  match just as readily as the document does. `:root` excluded, above. */
  const GLOBAL = /^(?:html|body|\*|::selection|a(?:[:[].*)?)$/
  /** Declared on such a selector, these leave the document: `background` paints
   *  the app's page, `box-sizing` resets the app's box model. */
  const ESCAPES = ['background', 'background-color', 'box-sizing']
  const SHEETS = ['flowchart/doc-base.css', 'steps/steps-base.css']

  for (const sheet of SHEETS) {
    it(`${sheet} declares none of them on a global selector`, () => {
      const css = readFileSync(join(EXPORT_DIR, sheet), 'utf8')
      const offenders = rules(css).flatMap((r) =>
        r.selectors.filter((s) => GLOBAL.test(s)).flatMap((s) =>
          // `::selection` and `a` are offences by their selector alone: whatever
          // they declare, they declare it on every screen in the application.
          /^(?:::selection|a(?:[:[].*)?)$/.test(s)
            ? [`${s} { … }`]
            : declaredProps(r.body)
              .filter((prop) => ESCAPES.includes(prop))
              .map((prop) => `${s} { ${prop} }`),
        ),
      )
      expect(offenders).toEqual([])
    })
  }

  /** The `:root` custom properties one stylesheet declares, name → value.
   *  Hex is lower-cased and three-digit shorthand expanded, so `#fff` and
   *  `#FFFFFF` are the one colour they both render as rather than two strings. */
  function rootVars(css: string): Map<string, string> {
    const out = new Map<string, string>()
    for (const r of rules(css).filter((x) => x.selectors.includes(':root'))) {
      for (const decl of r.body.split(';')) {
        const at = decl.indexOf(':')
        const name = decl.slice(0, at).trim()
        if (at < 0 || !name.startsWith('--')) continue
        out.set(name, decl.slice(at + 1).trim().toLowerCase()
          .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3'))
      }
    }
    return out
  }

  it('gives every name it shares with the design system the same value', () => {
    const ds = rootVars(readFileSync(DS_COLORS, 'utf8'))
    let shared = 0
    const drift = SHEETS.flatMap((sheet) => {
      const doc = rootVars(readFileSync(join(EXPORT_DIR, sheet), 'utf8'))
      const both = [...doc].filter(([name]) => ds.has(name))
      shared += both.length
      return both
        .filter(([name, value]) => ds.get(name) !== value)
        .map(([name, value]) => `${sheet}: ${name} is ${value}, the app's is ${ds.get(name)}`)
    })
    // Without this the test passes just as happily on a mistyped path, an empty
    // file or a renamed design system — which is the exact shape of a guard that
    // stops guarding without anybody noticing.
    expect(shared, 'no name collides at all — the design system was not read').toBeGreaterThan(0)
    expect(drift).toEqual([])
  })
})
