import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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

/** The files that declare tokens: tokens.css and, first, its four _ds imports.
 *  Followed rather than hard-coded so the hashed directory name stays in one
 *  place, and in cascade order so a later declaration wins, as in CSS. */
function tokenFiles(): string[] {
  const entry = resolve(process.cwd(), 'src/styles/tokens.css')
  const src = readFileSync(entry, 'utf8')
  return [
    ...[...src.matchAll(/@import\s+'([^']+)'/g)].map((m) => resolve(dirname(entry), m[1])),
    entry,
  ]
}

/** Every custom property tokens.css declares, following its own @imports into
 *  the frozen _ds set rather than hard-coding that directory's hashed name. */
function declaredTokens(): Set<string> {
  const names = new Set<string>()
  for (const f of tokenFiles()) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)) names.add(m[1])
  }
  return names
}

/** The value declared for one custom property. Last declaration wins. */
function tokenValue(name: string): string {
  let value: string | undefined
  for (const f of tokenFiles()) {
    const re = new RegExp(`(?<![-\\w])${name}\\s*:\\s*([^;]+);`, 'g')
    for (const m of readFileSync(f, 'utf8').matchAll(re)) value = m[1].trim()
  }
  if (value === undefined) throw new Error(`${name} is not declared in tokens.css or its imports`)
  return value
}

/** The single length inside a one-argument CSS function: translateY(-2px) → 2px. */
function lengthIn(name: string): string {
  const m = tokenValue(name).match(/\(\s*-?([\d.]+[a-z%]*)\s*\)/)
  if (!m) throw new Error(`${name} is \`${tokenValue(name)}\`, not a one-length function`)
  return m[1]
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
 * The whole vocabulary, written out: which token each utility must carry.
 *
 * The rest of this file proves two set-memberships — every token is referenced
 * *somewhere*, every probe class emits *something*. Neither says which class
 * carries which token, and a theme is a pairing: swap `fs-h4`/`fs-h5`, or
 * `rounded-tool`/`rounded-input`, and both sets are untouched while every screen
 * built on them is wrong. Twenty-three later tasks write classes from this list
 * and none of them re-derives it, so the pairing is asserted here, once, by
 * hand. Add a probe line and this map must gain the same key: the two are
 * checked against each other below, so neither can drift alone.
 *
 * The value is the substring the emitted declaration must contain — including
 * the closing paren, which is what keeps `var(--space-1)` from matching
 * `var(--space-10)`. An array means the declaration must carry both, which is
 * how the five type roles pin their line-height as well as their size.
 */
const EXPECTED: Record<string, string | string[]> = {
  'bg-bg': 'var(--bg)',
  'bg-card': 'var(--card)',
  'bg-ink': 'var(--ink)',
  'bg-violet': 'var(--violet)',
  'bg-coral': 'var(--coral)',
  'bg-green': 'var(--green)',
  'bg-conflict': 'var(--conflict)',
  'bg-muted': 'var(--text-muted)',
  'bg-faint': 'var(--text-faint)',
  'bg-warm': 'var(--warm)',
  'bg-line': 'var(--line)',
  'bg-tile-v': 'var(--tile-v)',
  'bg-tile-v2': 'var(--tile-v2)',
  'bg-tile-c': 'var(--tile-c)',
  'bg-tile-ok': 'var(--tile-ok)',
  'bg-tile-warn': 'var(--tile-warn)',
  'bg-tile-dead': 'var(--tile-dead)',
  'bg-login-bg': 'var(--login-bg)',
  'bg-login-orb': 'var(--login-orb)',
  'bg-scrim': 'var(--scrim)',
  'bg-warn': 'var(--warn)',
  'bg-info': 'var(--info)',
  'bg-tile-info': 'var(--tile-info)',
  'bg-icom-input': 'var(--icom-input-bg)',
  'bg-icom-control': 'var(--icom-control-bg)',
  'bg-icom-output': 'var(--icom-output-bg)',
  'bg-icom-mech': 'var(--icom-mech-bg)',
  'bg-violet-mid': 'var(--violet-mid)',
  'bg-violet-edge': 'var(--violet-edge)',
  'bg-violet-on-dark': 'var(--violet-on-dark)',
  'bg-violet-on-dark-body': 'var(--violet-on-dark-body)',
  'bg-violet-on-violet': 'var(--violet-on-violet)',
  'bg-desk': 'var(--desk)',
  'bg-tile-v3': 'var(--tile-v3)',
  'bg-tile-v4': 'var(--tile-v4)',
  'bg-tile-c2': 'var(--tile-c2)',
  'bg-tile-ctl': 'var(--tile-ctl)',
  'bg-value-current': 'var(--value-current)',
  'bg-hair': 'var(--hair)',
  'bg-line-soft': 'var(--line-soft)',
  'bg-line-dashed': 'var(--line-dashed)',
  'bg-border-danger': 'var(--border-danger)',
  'bg-border-dead': 'var(--border-dead)',
  'bg-border-current': 'var(--border-current)',
  'bg-border-ok': 'var(--border-ok)',
  'bg-strong': 'var(--text-strong)',
  'bg-body-ink': 'var(--text-body)',
  'bg-ghost': 'var(--text-ghost)',
  'bg-dialog-ghost': 'var(--text-dialog-ghost)',
  'bg-ink-current': 'var(--text-current)',
  'bg-ink-proposed': 'var(--text-proposed)',
  'bg-on-dark': 'var(--text-on-dark)',
  'bg-disabled': 'var(--text-disabled)',
  'bg-ok': 'var(--ok)',
  'bg-danger': 'var(--danger)',
  'bg-warn-soft': 'var(--warn-soft)',
  'bg-info-soft': 'var(--info-soft)',
  'bg-ok-soft': 'var(--ok-soft)',
  'bg-danger-soft': 'var(--danger-soft)',
  'bg-toast-check': 'var(--toast-check)',
  'bg-junction-xor': 'var(--junction-xor)',
  'bg-junction-and': 'var(--junction-and)',
  'bg-junction-or': 'var(--junction-or)',
  'bg-dept-numeral-violet': 'var(--dept-numeral-violet)',
  'bg-dept-numeral-coral': 'var(--dept-numeral-coral)',
  'bg-steps-sub': 'var(--steps-sub-bg)',
  'bg-steps-sub-border': 'var(--steps-sub-border)',
  'bg-steps-sub-hover': 'var(--steps-sub-hover)',
  'bg-steps-group': 'var(--steps-group-bg)',
  'bg-steps-group-border': 'var(--steps-group-border)',
  'bg-link': 'var(--link)',
  'bg-link-hover': 'var(--link-hover)',
  'text-violet-on-dark': 'var(--violet-on-dark)',
  'text-violet-on-dark-body': 'var(--violet-on-dark-body)',
  'text-violet-on-violet': 'var(--violet-on-violet)',
  'text-strong': 'var(--text-strong)',
  'text-body-ink': 'var(--text-body)',
  'text-ghost': 'var(--text-ghost)',
  'text-dialog-ghost': 'var(--text-dialog-ghost)',
  'text-ink-current': 'var(--text-current)',
  'text-ink-proposed': 'var(--text-proposed)',
  'text-on-dark': 'var(--text-on-dark)',
  'text-disabled': 'var(--text-disabled)',
  'text-ok': 'var(--ok)',
  'text-danger': 'var(--danger)',
  'text-toast-check': 'var(--toast-check)',
  'text-link': 'var(--link)',
  'text-link-hover': 'var(--link-hover)',
  'text-icom-input': 'var(--icom-input-fg)',
  'text-icom-control': 'var(--icom-control-fg)',
  'text-icom-output': 'var(--icom-output-fg)',
  'text-icom-mech': 'var(--icom-mech-fg)',
  'border-warm': 'var(--warm)',
  'border-line': 'var(--line)',
  'border-line-soft': 'var(--line-soft)',
  'border-line-dashed': 'var(--line-dashed)',
  'border-border-danger': 'var(--border-danger)',
  'border-border-dead': 'var(--border-dead)',
  'border-border-current': 'var(--border-current)',
  'border-border-ok': 'var(--border-ok)',
  'border-hair': 'var(--hair)',
  'border-steps-sub-border': 'var(--steps-sub-border)',
  'border-steps-group-border': 'var(--steps-group-border)',
  'border-coral': 'var(--coral)',
  'border-violet': 'var(--violet)',
  // The pair the naming rule turns on. `--border-card` is the fifth of the
  // --border-* family and takes the family's long form; `border-card` is the
  // white --card, the cut-out ring §8's coral count badge draws round itself.
  // Move `--border-card` back onto `borderColor` as `card` and this line goes
  // red, because that ring would silently become a 7%-alpha violet hairline.
  'border-border-card': 'var(--border-card)',
  'border-card': 'var(--card)',
  'text-fs-display': ['var(--fs-display)', 'var(--lh-tight)'],
  'text-fs-h1': 'var(--fs-h1)',
  'text-fs-h2': 'var(--fs-h2)',
  'text-fs-h3': 'var(--fs-h3)',
  'text-fs-h4': 'var(--fs-h4)',
  'text-fs-h5': 'var(--fs-h5)',
  'text-fs-lg': 'var(--fs-lg)',
  'text-fs-body': 'var(--fs-body)',
  'text-fs-sm': 'var(--fs-sm)',
  'text-fs-sm2': 'var(--fs-sm2)',
  'text-fs-xs': 'var(--fs-xs)',
  'text-fs-xxs': 'var(--fs-xxs)',
  'text-fs-micro': 'var(--fs-micro)',
  'text-fs-doc-base': 'var(--fs-doc-base)',
  'text-fs-doc-h1': 'var(--fs-doc-h1)',
  'text-fs-doc-title': 'var(--fs-doc-title)',
  'text-fs-doc-step': 'var(--fs-doc-step)',
  'text-fs-doc-body': 'var(--fs-doc-body)',
  'text-fs-dialog': 'var(--fs-dialog)',
  'text-fs-menu': 'var(--fs-menu)',
  'text-fs-caption': 'var(--fs-caption)',
  'text-body': ['var(--fs-role-body)', 'var(--lh-role-body)'],
  'text-caption': ['var(--fs-role-caption)', 'var(--lh-role-body)'],
  'text-subtitle': ['var(--fs-role-subtitle)', 'var(--lh-role-body)'],
  'text-title': ['var(--fs-role-title)', 'var(--lh-tight)'],
  'text-prose': ['var(--fs-role-body)', 'var(--lh-role-prose)'],
  'font-sans': 'var(--font-sans)',
  'font-mono': 'var(--font-mono)',
  'font-regular': 'var(--fw-regular)',
  'font-semibold': 'var(--fw-semibold)',
  'font-bold': 'var(--fw-bold)',
  'font-extrabold': 'var(--fw-extrabold)',
  // These six names already existed in Tailwind's own ladder and are redefined,
  // not added — see the config's lineHeight comment. Deleting one leaves the
  // token still reached by fontSize.title and the class still emitting, at
  // Tailwind's number: only this pairing notices.
  'leading-tight': 'var(--lh-tight)',
  'leading-snug': 'var(--lh-snug)',
  'leading-normal': 'var(--lh-normal)',
  'leading-relaxed': 'var(--lh-relaxed)',
  'leading-loose': 'var(--lh-loose)',
  'leading-looser': 'var(--lh-looser)',
  'tracking-eyebrow': 'var(--tracking-eyebrow)',
  'tracking-display': 'var(--tracking-display)',
  'rounded-badge': 'var(--radius-badge)',
  'rounded-chip': 'var(--radius-chip)',
  'rounded-control': 'var(--radius-control)',
  'rounded-card': 'var(--radius-card)',
  'rounded-doc': 'var(--radius-doc)',
  'rounded-panel': 'var(--radius-panel)',
  'rounded-button': 'var(--radius-md)',
  'rounded-tool': 'var(--radius-sm)',
  'rounded-input': 'var(--radius-input)',
  'rounded-search': 'var(--radius-lg)',
  'rounded-tile': 'var(--radius-tile)',
  'rounded-feature': 'var(--radius-card-lg)',
  'rounded-pill': 'var(--radius-pill)',
  'rounded-round': 'var(--radius-round)',
  'shadow-card': 'var(--shadow-card)',
  'shadow-card-hover': 'var(--shadow-card-hover)',
  'shadow-coral': 'var(--shadow-coral)',
  'shadow-violet': 'var(--shadow-violet)',
  'shadow-green': 'var(--shadow-green)',
  'shadow-modal': 'var(--shadow-modal)',
  'shadow-pop': 'var(--shadow-pop)',
  'shadow-sheet': 'var(--shadow-sheet)',
  'shadow-drawer': 'var(--shadow-drawer)',
  'shadow-card-dark': 'var(--shadow-card-dark)',
  'shadow-stat-dark': 'var(--shadow-stat-dark)',
  'shadow-guide-hover': 'var(--shadow-guide-hover)',
  'shadow-ring-flash': 'var(--ring-flash)',
  'shadow-conflict-dot': 'var(--ring-conflict-dot)',
  'p-screen-x': 'var(--pad-screen-x)',
  'p-screen-y': 'var(--pad-screen-y)',
  'p-topbar': 'var(--pad-topbar)',
  'p-half': 'var(--space-half)',
  'px-screen-x': 'var(--pad-screen-x)',
  'py-screen-y': 'var(--pad-screen-y)',
  'gap-topbar': 'var(--pad-topbar)',
  'p-s1': 'var(--space-1)',
  'p-s2': 'var(--space-2)',
  'p-s3': 'var(--space-3)',
  'p-s4': 'var(--space-4)',
  'p-s5': 'var(--space-5)',
  'p-s6': 'var(--space-6)',
  'p-s7': 'var(--space-7)',
  'p-s8': 'var(--space-8)',
  'p-s9': 'var(--space-9)',
  'p-s10': 'var(--space-10)',
  'p-s11': 'var(--space-11)',
  'p-s12': 'var(--space-12)',
  'p-s14': 'var(--space-14)',
  'p-s16': 'var(--space-16)',
  'w-tile': 'var(--size-tile)',
  'h-tile': 'var(--size-tile)',
  'w-tool': 'var(--size-tool)',
  'h-tool': 'var(--size-tool)',
  'w-avatar': 'var(--size-avatar)',
  'h-avatar': 'var(--size-avatar)',
  'w-logo-bar': 'var(--size-logo-bar)',
  'h-logo-bar': 'var(--size-logo-bar)',
  'w-logo-login': 'var(--size-logo-login)',
  'h-logo-login': 'var(--size-logo-login)',
  'w-touch': 'var(--size-touch)',
  'h-touch': 'var(--size-touch)',
  'min-h-touch': 'var(--size-touch)',
  'min-w-touch': 'var(--size-touch)',
  // The one utility in the theme with no token behind it: the menu's minimum
  // width predates this branch and §6 gives it no name.
  'min-w-menu': '220px',
  'max-w-departments': 'var(--width-departments)',
  'max-w-list': 'var(--width-list)',
  'max-w-summary': 'var(--width-summary)',
  'max-w-doc': 'var(--width-doc)',
  'max-w-drawer': 'var(--width-drawer)',
  'border-hairline': 'var(--border-hairline)',
  transition: 'var(--duration)',
  'duration-fast': 'var(--duration-fast)',
  'duration-chev': 'var(--duration-chev)',
  // The two tokens that are whole CSS functions, so their utility can only be
  // named by the length inside. Read from the token rather than written out
  // again, here and in the config, so editing effects.css moves both.
  '-translate-y-lift': `-${lengthIn('--hover-lift')}`,
  'backdrop-blur-scrim': tokenValue('--blur-scrim'),
  // Media query, not token — asserted by the breakpoint tests below.
  'max1080:hidden': 'display: none',
  'max760:hidden': 'display: none',
}

/** The (name, definition) pairs the config's plugins register as variants. */
function registeredVariants(): [string, string][] {
  const got: [string, string][] = []
  const api = { addVariant: (name: string, definition: string) => { got.push([name, definition]) } }
  for (const plugin of config.plugins ?? []) (plugin as (a: typeof api) => void)(api)
  return got
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
  /** class name -> every declaration emitted for it, in cascade order. */
  const decls = new Map<string, string>()
  result.root.walkRules((rule) => {
    // A rule with no declarations is the failure this file exists to catch:
    // the selector exists and sets nothing.
    if (!rule.nodes || rule.nodes.length === 0) return
    const at = rule.parent && 'name' in rule.parent ? `@${rule.parent.name} ${rule.parent.params}` : ''
    const body = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${n.prop}: ${n.value}`)
      .join('; ')
    for (const sel of rule.selectors) {
      for (const m of sel.matchAll(/\.((?:\\.|[^\s.:>~+,(){}[\]])+)/g)) {
        const name = m[1].replace(/\\/g, '')
        emitted.set(name, at)
        decls.set(name, decls.has(name) ? `${decls.get(name)}; ${body}` : body)
      }
    }
  })
  return { css: result.css, emitted, decls }
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
    //
    // 192 is what the theme reads today, not a floor with room under it: later
    // tasks only add names, so a drop below it means keys were removed.
    expect(referencedList.length).toBeGreaterThanOrEqual(192)
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
    // Read out of effects.css, never written here or in the config: a repeated
    // `'2px'` would let the token move to translateY(-3px) with config, test
    // and build all green and the lift still 2px.
    expect(lengthIn('--hover-lift')).toBe(theme.translate?.lift)
    const { css } = await build(['-translate-y-lift'])
    expect(css).toContain(`--tw-translate-y: -${lengthIn('--hover-lift')}`)
  })

  it('names --blur-scrim by its radius, for the same reason', async () => {
    expect(lengthIn('--blur-scrim')).toBe(theme.backdropBlur?.scrim)
    const { css } = await build(['backdrop-blur-scrim'])
    expect(css).toContain(`--tw-backdrop-blur: ${tokenValue('--blur-scrim')}`)
  })

  it('keeps the probe in the content set, so every named utility is built', () => {
    expect(config.content).toContain('./tailwind-probe.txt')
  })
})

describe('R1 (structural) — every named utility reaches the stylesheet', () => {
  it('emits a rule with a non-empty body for every class in tailwind-probe.txt', async () => {
    const classes = probeClasses()
    const { emitted } = await build(classes)
    expect(classes.filter((c) => !emitted.has(c))).toEqual([])
  })

  it('carries every token the theme names into that stylesheet', async () => {
    // Emission alone is not enough. `border-border-card` compiles either way:
    // drop the colours key and it quietly falls back to nothing at all, or to a
    // neighbouring value. The check that catches it is the value, not the
    // selector — so this asserts every var() the theme names actually appears
    // in the compiled output, which also makes the probe answerable for staying
    // complete.
    const { css } = await build(probeClasses())
    const inCss = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
    expect([...referenced].filter((t) => !inCss.has(t)).sort()).toEqual([])
  })
})

describe('R1 (structural) — every utility carries the token it is named for', () => {
  it('has exactly one expectation per probe class, and no orphan on either side', () => {
    // The probe and the table above are two halves of one inventory. Adding a
    // line to one without the other is the drift this pairs against, so it
    // fails here rather than silently narrowing the check below. This also
    // replaces the old size floor: a truncated probe cannot pass.
    const classes = probeClasses()
    expect(classes.filter((c, i) => classes.indexOf(c) !== i)).toEqual([])
    expect([...classes].sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('emits, for every probe class, a declaration carrying that exact token', async () => {
    // The assertion 23 later tasks depend on. Swapping any two theme values —
    // fs-h4/fs-h5, tile-v3/tile-v4, rounded-tool/rounded-input,
    // shadow-drawer/shadow-card-dark — leaves both the token set and the class
    // set untouched, so every other test in this file stays green while the
    // vocabulary means something different. This is the one that goes red.
    const classes = probeClasses()
    const { decls } = await build(classes)
    const wrong = classes.flatMap((c) => {
      const body = decls.get(c) ?? '(no rule emitted)'
      const want = EXPECTED[c]
      return (Array.isArray(want) ? want : [want])
        .filter((w) => !body.includes(w))
        .map((w) => `${c}: expected \`${w}\`, got \`${body}\``)
    })
    expect(wrong).toEqual([])
  })
})

describe('R7 (§6.16) — the design’s two breakpoints', () => {
  it('puts max1080 and max760 utilities inside the right media queries', async () => {
    const { emitted } = await build(['max1080:hidden', 'max760:hidden'])
    expect(emitted.get('max1080:hidden')).toBe('@media (max-width: 1080px)')
    expect(emitted.get('max760:hidden')).toBe('@media (max-width: 760px)')
  })

  it('registers those two variants and no third', () => {
    // "and no others" is a claim about what the theme *declares*, and a
    // breakpoint nothing references emits nothing — so a third addVariant is
    // invisible to any assertion made against compiled CSS. Asked of the
    // plugin directly instead, which is the only place it can be seen.
    expect(registeredVariants()).toEqual([
      ['max1080', '@media (max-width: 1080px)'],
      ['max760', '@media (max-width: 760px)'],
    ])
  })

  it('introduces no other max-width query across the whole inventory', async () => {
    // Compiled over every class the theme names, not a hand-picked three, so
    // the claim covers the real stylesheet. Also checks the widest-first order
    // the cascade depends on: at 700px both fire, and 760 must win.
    const { css } = await build(probeClasses())
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
    // covers both. Both classes asked for here are deliberately ones the app
    // already ships — DetailDrawer's `max-[560px]:w-10`, Overlay's `md:h-full`:
    // every string in this file is itself scanned by the real `content` globs,
    // and a novel one would mint a rule in dist/ that no component asked for.
    const { emitted } = await build(['max-[560px]:w-10', 'md:h-full'])
    expect(emitted.get('max-[560px]:w-10')).toBe('@media (max-width: 560px)')
    expect(emitted.get('md:h-full')).toBe('@media (min-width: 768px)')
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
