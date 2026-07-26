import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ui/export — this file lives at ui/export/flowchart/parity.test.tsx
const EXPORT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

// Defining any of these inside ui/export/ means the export has forked the
// app's flow rendering — the one thing D2 forbids.
const FORBIDDEN: { rx: RegExp; what: string }[] = [
  { rx: /\b(?:function|const)\s+(?:Activity|Start|End|Junction)Node\b/, what: 'a node component' },
  { rx: /\bfunction\s+LabeledEdge\b/, what: 'an edge component' },
  { rx: /react-flow__node\s*\{/, what: 'node styling' },
]

describe('the export never forks the app’s flow components', () => {
  it('defines no node or edge component of its own', () => {
    const offenders = sourceFiles(EXPORT_DIR).flatMap((file) => {
      const src = readFileSync(file, 'utf8')
      return FORBIDDEN.filter((f) => f.rx.test(src)).map((f) => `${file} defines ${f.what}`)
    })
    expect(offenders).toEqual([])
  })

  it('the flow viewer renders through the app’s Canvas', () => {
    const src = readFileSync(join(EXPORT_DIR, 'flowchart/FlowViewer.tsx'), 'utf8')
    expect(src).toMatch(/import \{ Canvas \} from '\.\.\/\.\.\/src\/flow\/Canvas'/)
    expect(src).toMatch(/import \{ toFlowNodes, toFlowEdges \} from '\.\.\/\.\.\/src\/flow\/adapt'/)
  })
})
