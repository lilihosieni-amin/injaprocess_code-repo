import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const UI = process.cwd()
const DS = join(
  UI,
  'design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens',
)

const roles = readFileSync(join(UI, 'src/styles/roles.css'), 'utf8')

const TOKEN_SOURCES = [
  join(DS, 'colors.css'),
  join(DS, 'spacing.css'),
  join(DS, 'typography.css'),
  join(DS, 'effects.css'),
  join(UI, 'src/styles/tokens.css'),
]

/**
 * Every token declaration the app can see, name -> value, last declaration
 * winning exactly as the cascade resolves it.
 *
 * The scan is deliberately not line-anchored: `colors.css` writes two
 * declarations on one line (`--warn:#B4690E;   --warn-soft:var(--tile-warn);`)
 * and `spacing.css` writes four, so an `^`-anchored regex silently loses about
 * twenty names — including every `*-soft` and every ICOM background.
 */
function tokenValues(): Map<string, string> {
  const values = new Map<string, string>()
  for (const p of TOKEN_SOURCES) {
    for (const m of readFileSync(p, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
      values.set(m[1], m[2].trim().replace(/\s+/g, ' '))
    }
  }
  return values
}

/** Every token name declared anywhere the app can see one. */
function declaredTokens(): Set<string> {
  return new Set(tokenValues().keys())
}

/** Follow `var()` until a literal falls out. '' when the chain breaks. */
function resolve(value: string, tokens = tokenValues()): string {
  let v = value.trim()
  for (let hop = 0; hop < 8; hop++) {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v)
    if (!m) return v
    const next = tokens.get(m[1])
    if (next === undefined) return ''
    v = next
  }
  return ''
}

/** Every `--role-*: <value>;` declaration in roles.css. */
function roleDeclarations(): { name: string; value: string }[] {
  return [...roles.matchAll(/^\s*(--role-[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
  }))
}

function roleValue(name: string): string {
  return roleDeclarations().find((d) => d.name === name)?.value ?? ''
}

/**
 * Every `--role-*` name, grouped by the selector block that declares it.
 *
 * R3 gives this file a second block: `[data-surface='reader']` overrides the
 * thirteen scale roles the ruling's table lists, and the cascade is how it does
 * it — so a name legitimately appears twice in the file, once per surface. A
 * repeat *within* one block is still a defect, because the second declaration
 * wins silently, so uniqueness is checked per block instead of over the file.
 */
function roleBlocks(): { selector: string; names: string[] }[] {
  return [...roles.matchAll(/(?:^|\n)([^\n{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({
      selector: m[1].trim(),
      names: [...m[2].matchAll(/^\s*(--role-[a-z0-9-]+)\s*:/gm)].map((d) => d[1]),
    }))
    .filter((b) => b.names.length > 0)
}

/** Whitespace is not meaningful when comparing a CSS value to prose. */
const squeeze = (s: string) => s.replace(/\s+/g, '')

describe('R8 — one rule per role', () => {
  it('names every role the ledger decides', () => {
    // The floor is the file's real count, not the plan's stale prose. It was
    // `>= 62` against a file of 83, which left room to delete the whole type-role
    // block (17 declarations) and four more with every test still green.
    // Raised to 111 by R3's scale layer: ten new panel rows on :root and the
    // thirteen the reader block overrides. Then to 121 by the single minting
    // pass: nine stacking rungs (L-42..L-47, plus R15's in-canvas rung) and
    // --role-fs-textarea on both surfaces, less the one reader override owner
    // ruling R12 removed.
    expect(roleDeclarations().length).toBeGreaterThanOrEqual(121)
  })

  it('keeps every group of roles the design has, so none can be deleted wholesale', () => {
    // The count floor above only catches a deletion big enough to cross it. This
    // pins the nine groups by name: losing one is a failure even if new roles
    // elsewhere have made up the number.
    const missing = [
      'ground',
      'ink',
      'type on the violet field',
      'roles that carry meaning',
      'borders',
      'interaction',
      'shadows',
      'radii',
      'type roles',
    ].filter((g) => !roles.includes(`---- ${g}`))
    expect(missing).toEqual([])
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

  it('declares no role twice in the same block', () => {
    const repeated = roleBlocks().flatMap((b) =>
      b.names.filter((n, i) => b.names.indexOf(n) !== i).map((n) => `${b.selector} ${n}`),
    )
    expect(repeated).toEqual([])
  })

  it('holds exactly the two blocks R3 allows, so an override cannot hide in a third', () => {
    // The check above is per block, so a role smuggled into some other selector
    // would be "unique" there and never compared with anything. The file's shape
    // is therefore pinned: the shared table on :root, and R3's one scale
    // override. src/ui/surface.test.tsx pins what the second block may contain.
    expect(roleBlocks().map((b) => b.selector)).toEqual([':root', "[data-surface='reader']"])
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

  it('resolves a var() chain to a literal, and returns nothing for a name that is not one', () => {
    // Everything below this point compares a resolved value to the design's.
    // If `resolve()` returned its input unchanged, or resolved anything to the
    // same string, those comparisons would be theatre.
    const t = tokenValues()
    expect(resolve('var(--violet)', t)).toBe('#4A25A9')
    expect(resolve('var(--warn-soft)', t)).toBe('#FBEEDC') // two hops
    expect(resolve('var(--voilet)', t)).toBe('')
    expect(resolve('var(--warn)', t)).not.toBe(resolve('var(--info)', t))
  })
})

const LEDGER_PATH = join(UI, '..', 'docs/superpowers/ui-normalisation-ledger.md')
const ledger = readFileSync(LEDGER_PATH, 'utf8')
const rulings = readFileSync(join(UI, '..', '.superpowers/sdd/ui-owner-rulings.md'), 'utf8')

const ledgerRows = ledger
  .split('\n')
  .filter((l) => /^\| L-\d\d /.test(l))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))

/**
 * Role -> the token it must point at -> the literal that token must resolve to
 * -> the document that decided it. `needle` is the fragment of the value that
 * document quotes, and is itself required to be part of the value, so the chain
 * cannot be faked at either end.
 *
 * Without this table every colour, size and radius assertion in the file was
 * structural: `--role-awaiting: var(--info)` renders the row the owner is being
 * asked to veto in blue, and `--role-field: var(--bg)` puts the app back on the
 * cream page R1 overruled — and both passed.
 */
type Tie = { role: string; token: string; value: string; from: string; needle?: string }

const TIES: Tie[] = [
  // Decided in the ledger — the value must appear in the row that decided it.
  { role: '--role-title-on-field', token: '--card', value: '#FFFFFF', from: 'L-01' },
  { role: '--role-fs-title', token: '--fs-h2', value: '22px', from: 'L-02' },
  {
    role: '--role-shadow-new',
    token: '--shadow-coral',
    value: '0 12px 26px -12px rgba(250,90,82,.9)',
    from: 'L-03',
    needle: '-12px',
  },
  { role: '--role-radius-dialog', token: '--radius-panel', value: '24px', from: 'L-04' },
  { role: '--role-awaiting', token: '--warn-fg', value: '#8A5A00', from: 'L-05' },
  { role: '--role-link-quiet', token: '--violet-mid', value: '#7A52D0', from: 'L-06' },
  { role: '--role-surface', token: '--card', value: '#FFFFFF', from: 'L-14' },
  {
    role: '--role-border-card',
    token: '--border-card',
    value: 'rgba(42, 29, 94, .07)',
    from: 'L-15',
  },
  { role: '--role-border-warm', token: '--warm', value: '#EFE7DC', from: 'L-15' },
  { role: '--role-fs-dialog', token: '--fs-dialog', value: '18px', from: 'L-16' },
  { role: '--role-lh-body', token: '--lh-normal', value: '1.7', from: 'L-17' },
  { role: '--role-lh-prose', token: '--lh-loose', value: '1.9', from: 'L-17' },
  { role: '--role-duration', token: '--duration', value: '.16s', from: 'L-18' },
  { role: '--role-radius-close', token: '--radius-sm', value: '9px', from: 'L-23' },
  { role: '--role-fs-body', token: '--fs-body', value: '14px', from: 'L-27' },
  { role: '--role-fs-menu', token: '--fs-menu', value: '13.5px', from: 'L-27' },
  { role: '--role-fs-dense', token: '--fs-sm', value: '13px', from: 'L-27' },
  { role: '--role-fs-control', token: '--fs-sm2', value: '12.5px', from: 'L-27' },
  {
    role: '--role-subtitle-on-field',
    token: '--violet-on-violet',
    value: '#C9BEEE',
    from: 'L-28',
  },
  {
    role: '--role-shadow-drawer',
    token: '--shadow-drawer',
    value: '20px 0 50px -30px rgba(74,37,169,.5)',
    from: 'L-30',
  },
  { role: '--role-fs-caption', token: '--fs-caption', value: '12px', from: 'L-33' },
  { role: '--role-ink-body', token: '--text-current', value: '#5a5175', from: 'L-35' },
  { role: '--role-radius-control', token: '--radius-control', value: '10px', from: 'L-40' },
  { role: '--role-radius-input', token: '--radius-input', value: '11px', from: 'L-40' },

  // Decided by the owner directly — the value must appear in the rulings file.
  { role: '--role-field', token: '--ink', value: '#2A1D5E', from: 'rulings' },
  { role: '--role-canvas', token: '--bg', value: '#FBF7F1', from: 'rulings' },
  { role: '--role-primary', token: '--violet', value: '#4A25A9', from: 'rulings' },
  { role: '--role-new', token: '--coral', value: '#FA5A52', from: 'rulings' },
  { role: '--role-confirmed', token: '--green', value: '#1F8A5B', from: 'rulings' },
  { role: '--role-confirmed-soft', token: '--tile-ok', value: '#E4F6EC', from: 'rulings' },
  { role: '--role-danger', token: '--conflict', value: '#E23D35', from: 'rulings' },
  { role: '--role-focus', token: '--coral', value: '#FA5A52', from: 'rulings' },
  {
    role: '--role-lift',
    token: '--hover-lift',
    value: 'translateY(-2px)',
    from: 'rulings',
  },
]

describe('R8 — a role carries the value its own ruling decided', () => {
  it('points each named role at the token the ruling names', () => {
    const wrong = TIES.filter((t) => roleValue(t.role) !== `var(${t.token})`)
    expect(wrong.map((t) => `${t.role}: ${roleValue(t.role)} (want var(${t.token}))`))
      .toEqual([])
  })

  it('resolves each named role to the literal the ruling decided', () => {
    const tokens = tokenValues()
    const wrong = TIES.filter((t) => squeeze(resolve(roleValue(t.role), tokens)) !== squeeze(t.value))
    expect(wrong.map((t) => `${t.role} -> ${resolve(roleValue(t.role), tokens)} (want ${t.value})`))
      .toEqual([])
  })

  it('finds that literal in the document that decided it', () => {
    const orphans = TIES.filter((t) => {
      const needle = squeeze(t.needle ?? t.value)
      if (!squeeze(t.value).includes(needle)) return true // the needle must be part of the value
      if (t.from === 'rulings') return !squeeze(rulings).includes(needle)
      const row = ledgerRows.find((r) => r[0] === t.from)
      return !row || !squeeze(row.join(' ')).includes(needle)
    })
    expect(orphans.map((t) => `${t.role} (${t.from})`)).toEqual([])
  })

  it('covers the roles a wrong value would do the most damage to', () => {
    // The table is a list, and a list can be emptied. These four are the ones
    // the review named: the field the whole app sits on, the status colour the
    // owner is being asked to veto, the design's most-used border, and the three
    // semantic hues. If any drops out of TIES, this fails before the mutant does.
    const covered = new Set(TIES.map((t) => t.role))
    const required = [
      '--role-field',
      '--role-awaiting',
      '--role-border-card',
      '--role-new',
      '--role-primary',
      '--role-confirmed',
      '--role-danger',
    ]
    expect(required.filter((r) => !covered.has(r))).toEqual([])
    expect(TIES.length).toBeGreaterThanOrEqual(33)
  })

  it('leaves the roles Task 3 still owes pointing at the token it will correct', () => {
    // These five resolve to a value the design contradicts, on purpose: the
    // token is corrected in Task 3 and the correction lands through the role.
    // Pinned so the correction cannot miss by being re-pointed here instead.
    //
    // It was seven. Two of the seven were wrong about which treatment Task 3
    // used, and the test below is what replaces them — see its comment.
    const pending: Record<string, string> = {
      '--role-confirmed-edge': '--border-ok',
      '--role-shadow-card-hover': '--shadow-card-hover',
      '--role-shadow-dialog': '--shadow-modal',
      '--role-shadow-pop': '--shadow-pop',
      '--role-radius-pill': '--radius-pill',
    }
    const wrong = Object.entries(pending).filter(
      ([role, token]) => roleValue(role) !== `var(${token})`,
    )
    expect(wrong.map(([role, token]) => `${role}: ${roleValue(role)} (want var(${token}))`))
      .toEqual([])
  })

  it('points the two roles Task 3 minted a NEW token for at that token', () => {
    // Task 3 had two treatments available and used both. Where the nearest token
    // had no other role it re-valued it in place, and the correction reaches the
    // role for free — that is the five rows above. Where it did (--tile-v4 is
    // the hover tint, --lh-relaxed is 1.75) it minted a new token instead, and
    // then the role has to be re-pointed or it keeps resolving to the old value.
    // Both of these did, for months: --role-surface-sub rendered #F8F4FE where
    // the design says #FBF9FE, and --role-lh-subcopy 1.75 where ledger L-17 says
    // 1.8. This is the assertion that would have caught them.
    expect(roleValue('--role-surface-sub')).toBe('var(--surface-sub)')
    expect(resolve(roleValue('--role-surface-sub'))).toBe('#FBF9FE')
    expect(roleValue('--role-lh-subcopy')).toBe('var(--lh-sub)')
    expect(resolve(roleValue('--role-lh-subcopy'))).toBe('1.8')
    // The third correction's pair render identically today (both #C9B8EC) so
    // nothing moves on screen — but the role must name the token minted for it,
    // or the day either value moves, the wrong one moves.
    expect(roleValue('--role-border-pick')).toBe('var(--border-pick)')
    expect(resolve(roleValue('--role-border-pick'))).toBe('#C9B8EC')
    // …and the three tokens they used to point at keep their own roles.
    expect(resolve('var(--tile-v4)')).toBe('#F8F4FE')
    expect(resolve('var(--lh-relaxed)')).toBe('1.75')
    expect(resolve('var(--line-dashed)')).toBe('#C9B8EC')
  })

  it('gives the stacking ladder a rung per role, and keeps them in the order they stack', () => {
    // L-42..L-47 adopt Bootstrap 5's published $zindex-* scale as a standard
    // rather than reverse-engineering the deliverables' 26 values. Nothing else
    // in this file would catch a rung being re-pointed at its neighbour: TIES is
    // a table of ledger and ruling values and the ladder is neither.
    const ladder = [
      ['--role-z-canvas-overlay', '--z-canvas-overlay', '15'],
      ['--role-z-dropdown', '--z-dropdown', '1000'],
      ['--role-z-chrome', '--z-chrome', '1020'],
      ['--role-z-floating', '--z-floating', '1030'],
      ['--role-z-drawer', '--z-drawer', '1045'],
      ['--role-z-modal', '--z-modal', '1055'],
      ['--role-z-popover', '--z-popover', '1070'],
      ['--role-z-tooltip', '--z-tooltip', '1080'],
      ['--role-z-toast', '--z-toast', '1090'],
    ]
    const wrong = ladder.filter(
      ([role, token, value]) =>
        roleValue(role) !== `var(${token})` || resolve(roleValue(role)) !== value,
    )
    expect(wrong.map(([role]) => `${role} -> ${resolve(roleValue(role))}`)).toEqual([])
    // A ladder is an ORDER, not a set of numbers: two rungs that swapped values
    // would satisfy every line above and stack the app upside down.
    const numbers = ladder.map(([role]) => Number(resolve(roleValue(role))))
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
    expect(new Set(numbers).size).toBe(ladder.length)
  })
})

describe('R8 — every normalisation is recorded', () => {
  const rows = ledgerRows

  it('records every contradiction R8 catalogued, and the ones found since', () => {
    expect(rows.length).toBeGreaterThanOrEqual(41)
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

  it('states its own totals, so the tail of the table cannot be cut off', () => {
    // `expected` above is built from `ids.length`, so truncation stays
    // consistent: deleting L-25..L-41 leaves L-01..L-24 green — and that tail
    // holds all four owner-ruling rows and five of the seven referred ones.
    // The ledger therefore states its totals in prose and they are checked here.
    const decided = rows.filter((r) => r[4].includes('**Decided'))
    const referred = rows.filter((r) => r[4].includes('**Owner veto'))
    expect(ledger).toContain(
      `**${rows.length} rows: ${decided.length} decided, ${referred.length} referred.**`,
    )
    expect(decided.length + referred.length).toBe(rows.length)
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
