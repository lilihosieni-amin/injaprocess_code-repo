import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'

/* tailwind.config.js carries `@type {import('tailwindcss').Config}`, which types
   every theme scale as `ResolvableTo<…>` — a union with a resolver function this
   config never uses. Read it back as the plain nested object it literally is. */
const theme = (config.theme?.extend ?? {}) as Record<string, Record<string, unknown> | undefined>
const flat = (o: unknown): string[] =>
  typeof o === 'string' ? [o]
    : Array.isArray(o) ? o.flatMap(flat)
      : o && typeof o === 'object' ? Object.values(o).flatMap(flat)
        : []

/** Every custom property tokens.css declares, following its own @imports into
 *  the frozen _ds set rather than hard-coding that directory's hashed name. */
function declaredTokens(): Set<string> {
  const entry = resolve(process.cwd(), 'src/styles/tokens.css')
  const src = readFileSync(entry, 'utf8')
  const imports = [...src.matchAll(/@import\s+'([^']+)'/g)].map((m) => join(dirname(entry), m[1]))
  const names = new Set<string>()
  for (const f of [entry, ...imports]) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)) names.add(m[1])
  }
  return names
}

const declared = declaredTokens()

/** Every custom property the theme reads, in order, one entry per var() site. */
const referencedList = flat(theme).flatMap((v) =>
  [...v.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]),
)
const referenced = new Set(referencedList)

/** The class names in tailwind-probe.txt, which is the theme's own inventory. */
function probeClasses(): string[] {
  return readFileSync(resolve(process.cwd(), 'tailwind-probe.txt'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Run the real theme through Tailwind over a synthetic content set.
 *
 * This is the whole point of the file. A theme key is only a promise: an
 * invented, misspelt or structurally-illegal one produces no rule at all while
 * `npm run build` still exits 0, so a config-shape assertion proves nothing
 * about whether the class exists. Everything below is asserted against emitted
 * CSS instead.
 */
async function build(classes: string[]) {
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  /** class name -> the media query it was emitted under ('' when unwrapped). */
  const emitted = new Map<string, string>()
  result.root.walkRules((rule) => {
    // A rule with no declarations is the failure this file exists to catch:
    // the selector exists and sets nothing.
    if (!rule.nodes || rule.nodes.length === 0) return
    const at = rule.parent && 'name' in rule.parent ? `@${rule.parent.name} ${rule.parent.params}` : ''
    for (const sel of rule.selectors) {
      for (const m of sel.matchAll(/\.((?:\\.|[^\s.:>~+,(){}[\]])+)/g)) {
        emitted.set(m[1].replace(/\\/g, ''), at)
      }
    }
  })
  return { css: result.css, emitted }
}

describe('R1 (structural) — every design token has a utility name', () => {
  it('names the tokens the older screens had to write as literals', () => {
    const mustReach = [
      '--fs-display', '--fs-h1', '--fs-h2', '--fs-h3', '--fs-h4', '--fs-h5',
      '--fs-lg', '--fs-body', '--fs-sm', '--fs-sm2', '--fs-xs', '--fs-xxs',
      '--fs-micro', '--fs-doc-base', '--fs-doc-h1', '--fs-doc-title',
      '--fs-doc-step', '--fs-doc-body',
      '--radius-sm', '--radius-input', '--radius-lg', '--radius-tile',
      '--radius-card-lg', '--radius-pill', '--radius-round',
      '--shadow-drawer', '--shadow-card-dark', '--shadow-stat-dark',
      '--shadow-guide-hover', '--ring-flash', '--ring-conflict-dot',
      '--pad-screen-x', '--pad-screen-y', '--pad-topbar', '--space-half',
      // --hover-lift is deliberately NOT here; it is asserted on its own below,
      // because it is the one token no var() in this config can carry.
      '--duration', '--duration-fast', '--duration-chev',
      '--text-disabled', '--text-current', '--text-proposed', '--text-ghost',
      '--text-dialog-ghost', '--text-body', '--text-strong', '--text-on-dark',
      '--border-danger', '--border-current', '--border-dead', '--border-ok',
      '--line-dashed', '--line-soft', '--hair', '--tile-v3', '--tile-v4',
      '--tile-c2', '--tile-ctl', '--value-current', '--desk',
      '--violet-mid', '--violet-edge', '--violet-on-dark',
      '--violet-on-dark-body', '--violet-on-violet',
      '--dept-numeral-violet', '--dept-numeral-coral',
      '--junction-xor', '--junction-and', '--junction-or',
      '--steps-sub-bg', '--steps-sub-border', '--steps-sub-hover',
      '--steps-group-bg', '--steps-group-border',
      '--toast-check', '--ok', '--danger', '--warn-soft', '--info-soft',
      '--ok-soft', '--danger-soft', '--link', '--link-hover',
      '--fw-regular', '--fw-semibold', '--fw-bold', '--fw-extrabold',
      '--lh-tight', '--lh-snug', '--lh-normal', '--lh-relaxed',
      '--lh-loose', '--lh-looser', '--tracking-display',
      '--size-logo-bar', '--size-logo-login',
    ]
    expect(mustReach.filter((t) => !referenced.has(t))).toEqual([])
    // The list above is the point of this test, so a truncated one must fail
    // rather than pass over a shorter set. 96 is the whole list, not a floor
    // with room under it: deleting any single entry turns this red.
    expect(mustReach.length).toBe(96)
    expect(new Set(mustReach).size).toBe(96)
  })

  it('names the four tokens Task 1 minted after that list was drawn up', () => {
    // These reached tokens.css in Task 1's fix pass, so the inventory above —
    // written before it — cannot mention them. They are not optional extras:
    // --fs-menu has 48 uses in the design, --fs-caption 38, --border-card 46,
    // and guards.test.ts bans `text-[` outright, so a step with no utility name
    // cannot be written legally at all once src/screens/ leaves PENDING_REBUILD.
    const late = ['--border-card', '--fs-dialog', '--fs-menu', '--fs-caption']
    expect(late.filter((t) => !referenced.has(t))).toEqual([])
  })

  it('points every utility at a custom property that is actually declared', () => {
    // The trap this task exists to avoid: a misspelt token name compiles to
    // `var(--typo)`, which resolves to nothing, while the build still exits 0
    // and the tests above still pass (they only check the names they asked for).
    // This checks the other direction — every var() the theme emits, including
    // the ones no list above covers — against the declared set.
    expect(referencedList.length).toBeGreaterThan(140)
    expect([...referenced].filter((t) => !declared.has(t)).sort()).toEqual([])
  })

  // --hover-lift is `translateY(-2px)` — a whole transform function, not a
  // length. Tailwind 3.4 ships no themeable `transform` namespace (its
  // defaultTheme has rotate/scale/skew/translate and nothing that takes a raw
  // `transform:` value), and the translate scale sets `--tw-translate-y`, so
  // `var(--hover-lift)` cannot legally appear anywhere in this config. The
  // distance is named instead — `-translate-y-lift` — and src/styles/roles.css
  // keeps `--role-lift: var(--hover-lift)` as the record of the token itself.
  // Asserted separately, and by name, so the omission above is a decision on
  // the page rather than a token that quietly fell off a list.
  it('names --hover-lift by its distance, the only form the translate scale takes', async () => {
    expect(theme.translate?.lift).toBe('2px')
    const { css } = await build(['-translate-y-lift'])
    expect(css).toContain('--tw-translate-y: -2px')
  })

  it('keeps the probe in the content set, so every named utility is built', () => {
    expect(config.content).toContain('./tailwind-probe.txt')
  })
})

describe('R1 (structural) — every named utility reaches the stylesheet', () => {
  it('emits a rule with a non-empty body for every class in tailwind-probe.txt', async () => {
    const classes = probeClasses()
    // The probe is the inventory later tasks read. A truncated or emptied file
    // would make every check below pass over nothing.
    expect(classes.length).toBeGreaterThan(200)
    const { emitted } = await build(classes)
    expect(classes.filter((c) => !emitted.has(c))).toEqual([])
  })

  it('carries every token the theme names into that stylesheet', async () => {
    // Emission alone is not enough. `border-card` compiles either way: drop the
    // borderColor key and it quietly falls back to `colors.card`, emitting a
    // perfectly valid rule that paints the hairline white. The check that
    // catches it is the value, not the selector — so this asserts every var()
    // the theme names actually appears in the compiled output, which also makes
    // the probe answerable for staying complete.
    const { css } = await build(probeClasses())
    const inCss = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    expect([...referenced].filter((t) => !inCss.has(t)).sort()).toEqual([])
  })
})

describe('R7 (§6.16) — the design’s two breakpoints', () => {
  it('puts max1080 and max760 utilities inside the right media queries', async () => {
    const { emitted } = await build(['max1080:hidden', 'max760:hidden'])
    expect(emitted.get('max1080:hidden')).toBe('@media (max-width: 1080px)')
    expect(emitted.get('max760:hidden')).toBe('@media (max-width: 760px)')
  })

  it('adds those two and no other max-width query', async () => {
    // "and no others" is about what the theme introduces, so this compiles a
    // content set that asks for nothing responsive and checks the breakpoints
    // are not leaking into every build, then checks the widest-first order the
    // cascade depends on: at 700px both fire, and 760 must win.
    const { css } = await build(['max1080:hidden', 'max760:hidden', 'p-half'])
    expect([...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => m[1])).toEqual([
      '1080', '760',
    ])
  })

  it('does not compile away the max-[…] variants two shipped files depend on', async () => {
    // Registering the breakpoints as `theme.screens` objects instead of
    // variants silently disables Tailwind's whole `min-*`/`max-*` family, which
    // deletes the phone layout of src/flow/DetailDrawer.tsx (8 uses) and
    // export/flowchart/FlowViewer.tsx (22) with the build still exiting 0.
    // Neither file is in this branch's scope, so nothing else would catch it.
    // Tailwind kills `min-*` and `max-*` with one switch, so the max side
    // covers both. The class asked for here is deliberately one DetailDrawer
    // already ships: every string in this file is itself scanned by the real
    // `content` globs, and a novel one would mint a media query in dist/ that
    // no component asked for.
    const { emitted } = await build(['max-[560px]:w-10', 'md:w-10'])
    expect(emitted.get('max-[560px]:w-10')).toBe('@media (max-width: 560px)')
    expect(emitted.get('md:w-10')).toBe('@media (min-width: 768px)')
  })
})

describe('R1 (structural) — motion', () => {
  it('makes a bare `transition` last .16s, not Tailwind’s 150ms', async () => {
    expect(theme.transitionDuration?.DEFAULT).toBe('var(--duration)')
    const { css } = await build(['transition'])
    expect(css).toContain('transition-duration: var(--duration)')
    expect(css).not.toContain('150ms')
  })

  it('names the other two durations', async () => {
    const { css } = await build(['duration-fast', 'duration-chev'])
    expect(css).toContain('transition-duration: var(--duration-fast)')
    expect(css).toContain('transition-duration: var(--duration-chev)')
  })
})
