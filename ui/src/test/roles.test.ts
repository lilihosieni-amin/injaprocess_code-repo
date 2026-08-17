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

const ledger = readFileSync(
  join(UI, '..', 'docs/superpowers/ui-normalisation-ledger.md'),
  'utf8',
)

describe('R8 — every normalisation is recorded', () => {
  const rows = ledger
    .split('\n')
    .filter((l) => /^\| L-\d\d /.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))

  it('records every contradiction R8 catalogued, and the ones found since', () => {
    expect(rows.length).toBeGreaterThanOrEqual(24)
  })

  it('gives every row all five columns, none of them empty', () => {
    const broken = rows.filter((r) => r.length !== 5 || r.some((c) => c === ''))
    expect(broken.map((r) => r.join(' | '))).toEqual([])
  })

  it('rules on action versus state once, and says which', () => {
    expect(ledger).toContain('## Action versus state')
    expect(ledger).toContain('share the role’s hue and never its treatment')
  })

  it('names what it could not settle rather than choosing silently', () => {
    expect(ledger).toContain('## Referred to the owner')
  })

  it('numbers its rows without a gap or a repeat, so none can be quietly dropped', () => {
    // The row scan is a regex over markdown. A row whose id is mistyped, or a
    // whole row deleted in an edit, drops out of `rows` silently and every
    // assertion above still passes. Ids must therefore run L-01..L-nn exactly
    // once each, which makes a dropped row a failure rather than a smaller list.
    const ids = rows.map((r) => r[0])
    const expected = ids.map((_, i) => `L-${String(i + 1).padStart(2, '0')}`)
    expect(ids).toEqual(expected)
  })

  it('marks each row as decided or referred, and refers the ones it says it does', () => {
    // Without this, "Chosen, and why" could be filled with a hedge on every row
    // and the owner would have no way to see which rows are actually waiting on
    // them. Every row declares one or the other, and a row marked for veto must
    // also be named in the Referred section.
    const MARK = /\*\*(Decided|Owner veto)/
    const unmarked = rows.filter((r) => !MARK.test(r[4]))
    expect(unmarked.map((r) => r[0])).toEqual([])

    const referredSection = ledger.slice(ledger.indexOf('## Referred to the owner'))
    const vetoed = rows.filter((r) => r[4].includes('**Owner veto')).map((r) => r[0])
    expect(vetoed.length).toBeGreaterThan(0)
    const missing = vetoed.filter((id) => !referredSection.includes(id))
    expect(missing).toEqual([])
  })
})
