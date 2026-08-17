import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const UI = process.cwd()
const DS = join(
  UI,
  'design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens',
)

const roles = readFileSync(join(UI, 'src/styles/roles.css'), 'utf8')

/** Every token name declared anywhere the app can see one. */
function declaredTokens(): Set<string> {
  const sources = [
    join(DS, 'colors.css'),
    join(DS, 'spacing.css'),
    join(DS, 'typography.css'),
    join(DS, 'effects.css'),
    join(UI, 'src/styles/tokens.css'),
  ]
  const names = new Set<string>()
  for (const p of sources) {
    for (const m of readFileSync(p, 'utf8').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
      names.add(m[1])
    }
  }
  return names
}

/** Every `--role-*: <value>;` declaration in roles.css. */
function roleDeclarations(): { name: string; value: string }[] {
  return [...roles.matchAll(/^\s*(--role-[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
  }))
}

describe('R8 — one rule per role', () => {
  it('names every role the ledger decides', () => {
    expect(roleDeclarations().length).toBeGreaterThanOrEqual(62)
  })

  it('holds no literal value — every role points at a token', () => {
    const literal = roleDeclarations().filter(
      (d) => !/^var\(--[a-z0-9-]+\)$/.test(d.value),
    )
    expect(literal.map((d) => `${d.name}: ${d.value}`)).toEqual([])
  })

  it('points only at tokens that exist', () => {
    const known = declaredTokens()
    const dangling = roleDeclarations()
      .map((d) => ({ ...d, token: /var\((--[a-z0-9-]+)\)/.exec(d.value)?.[1] ?? '' }))
      .filter((d) => !known.has(d.token))
    expect(dangling.map((d) => `${d.name} -> ${d.token}`)).toEqual([])
  })

  it('declares no role twice', () => {
    const names = roleDeclarations().map((d) => d.name)
    expect(names.length).toBe(new Set(names).size)
  })

  it('reads a real token set, so "points only at tokens that exist" can fail', () => {
    // The three assertions above compare a derived list to `[]`. If
    // `declaredTokens()` ever returned everything (or `roleDeclarations()`
    // returned nothing) they would all pass while checking nothing. This pins
    // both ends: the token set is the real, finite one, and it does NOT contain
    // a name roles.css could plausibly mistype.
    const known = declaredTokens()
    expect(known.size).toBeGreaterThan(100)
    expect(known.has('--violet')).toBe(true)
    expect(known.has('--role-primary')).toBe(false)
    expect(known.has('--voilet')).toBe(false)
    expect(roleDeclarations().length).toBeGreaterThan(0)
  })
})
