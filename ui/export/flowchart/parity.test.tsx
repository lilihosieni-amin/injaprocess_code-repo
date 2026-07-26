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
