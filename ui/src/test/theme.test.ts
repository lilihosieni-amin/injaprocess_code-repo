import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
// R11's condition is that the three minted templates are USED, and "used" is a
// claim about a rendered element — so the guard at the foot of this file
// renders the component that consumes them rather than grepping its source.
import { DataTable, type TemplatedColumn } from '../ui/DataTable'

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

/** The declaration block of one rule in src/styles/base.css, by selector.
 *  Comments are stripped first: base.css explains L-08 by quoting the
 *  deliverables' own `::-webkit-scrollbar{…}` block, and a matcher that reads
 *  prose would assert against the quotation instead of the rule. */
function baseRule(selector: string): string {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const m = css.match(new RegExp(`${selector.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`src/styles/base.css declares no \`${selector}\` rule`)
  return m[1]
}

/** The single length inside a one-argument CSS function: translateY(-2px) → 2px. */
function lengthIn(name: string): string {
  const m = tokenValue(name).match(/\(\s*-?([\d.]+[a-z%]*)\s*\)/)
  if (!m) throw new Error(`${name} is \`${tokenValue(name)}\`, not a one-length function`)
  return m[1]
}

/**
 * R3's scale layer — `src/styles/roles.css`, which src/index.css imports right
 * after tokens.css.
 *
 * Every `--role-*` property, mapped to every token it points at across BOTH of
 * that file's blocks (`:root` and `[data-surface='reader']`), because a role
 * that resolves to two tokens is the entire point of the layer.
 *
 * This is a second declaration site, not a second token file: the four `_ds`
 * imports and tokens.css still hold every literal, and `tokenFiles()` above is
 * deliberately left alone so "a token must have a utility name" keeps asking
 * about tokens and not about roles.
 */
function roleTargets(
  css = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8'),
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const m of css.matchAll(/(--role-[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)/g)) {
    if (!map.has(m[1])) map.set(m[1], new Set())
    map.get(m[1])!.add(m[2])
  }
  return map
}

const declared = declaredTokens()
const roles = roleTargets()

/** Every custom property the theme reads, in order, one entry per var() site. */
const referencedList = flat(theme).flatMap((v) =>
  [...v.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]),
)
const referenced = new Set(referencedList)

/**
 * Every token a utility reaches, directly or through one role.
 *
 * `w-tile` names `--role-tile`, which is `--size-tile` in the panel and
 * `--size-tile-reader` in the reader — so both tokens have a utility name, and
 * the chain that gives them one is token <- role <- utility. A role no utility
 * names carries nothing here, which is what keeps this from being a way to
 * launder an unreachable token.
 */
const reachable = new Set([
  ...referenced,
  ...[...referenced].flatMap((r) => [...(roles.get(r) ?? [])]),
])

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
  // Task 3's colours. `--border-pick` is the sixth of the --border-* family, so
  // it takes the family's long form here too: name it `pick` on `borderColor`
  // instead and `border-border-pick` emits nothing while `border-pick` starts
  // painting a lilac hairline — the same split F2 undid for `--border-card`.
  'bg-tile-v5': 'var(--tile-v5)',
  'bg-surface-sub': 'var(--surface-sub)',
  'bg-disc-coral': 'var(--disc-coral)',
  'bg-disc-violet': 'var(--disc-violet)',
  'bg-line-divider': 'var(--line-divider)',
  'border-line-divider': 'var(--line-divider)',
  'bg-line-row': 'var(--line-row)',
  'border-line-row': 'var(--line-row)',
  'bg-line-filter': 'var(--line-filter)',
  'border-line-filter': 'var(--line-filter)',
  'bg-border-pick': 'var(--border-pick)',
  'border-border-pick': 'var(--border-pick)',
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
  // The nine panel steps Task 3 added, and R3's four reader steps. Each is a
  // plain string, not a pair: unlike the five semantic roles below, a literal
  // step sets a size and leaves the line-height to whatever the caller chose.
  'text-fs-numeral': 'var(--fs-numeral)',
  'text-fs-stat': 'var(--fs-stat)',
  'text-fs-steps-title': 'var(--fs-steps-title)',
  'text-fs-display-hand': 'var(--fs-display-hand)',
  'text-fs-stat-sm': 'var(--fs-stat-sm)',
  'text-fs-body-lead': 'var(--fs-body-lead)',
  'text-fs-nano': 'var(--fs-nano)',
  'text-fs-badge-sm': 'var(--fs-badge-sm)',
  'text-fs-tag': 'var(--fs-tag)',
  'text-fs-h1-reader-home': 'var(--fs-h1-reader-home)',
  'text-fs-h1-reader-list': 'var(--fs-h1-reader-list)',
  'text-fs-h1-reader-dept': 'var(--fs-h1-reader-dept)',
  'text-fs-body-reader': 'var(--fs-body-reader)',
  // R3's scale layer. These four are the ONLY utilities that name a --role-*
  // property rather than a token, which is what makes one class two sizes.
  'text-role-body': 'var(--role-fs-body)',
  'text-role-dense': 'var(--role-fs-dense)',
  'text-role-title': 'var(--role-fs-title)',
  'text-role-hero': 'var(--role-fs-hero)',
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
  // L-17's third prose value, 1.8 — sub-copy under a control.
  'leading-sub': 'var(--lh-sub)',
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
  'shadow-fab': 'var(--shadow-fab)',
  'p-screen-x': 'var(--pad-screen-x)',
  'p-screen-y': 'var(--pad-screen-y)',
  'p-topbar': 'var(--pad-topbar)',
  'p-half': 'var(--space-half)',
  'px-screen-x': 'var(--pad-screen-x)',
  'py-screen-y': 'var(--pad-screen-y)',
  'gap-topbar': 'var(--pad-topbar)',
  // R3's screen padding. `departments` needs both halves of its name because it
  // is two different values, 38 at the top and 48 at the bottom.
  'px-reader-x': 'var(--pad-reader-x)',
  'pb-reader-bottom': 'var(--pad-reader-bottom)',
  'pt-departments-top': 'var(--pad-departments-top)',
  'pb-departments-bottom': 'var(--pad-departments-bottom)',
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
  'w-tile': 'var(--role-tile)',
  'h-tile': 'var(--role-tile)',
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
  // This was the one utility in the theme with no token behind it — a raw
  // `'220px'` in tailwind.config.js, a value neither deliverable draws anywhere
  // (`220px` appears zero times in both). The shell mint gave it --width-menu,
  // 265px, the width of the panel's own «مدیریت» popover and the only menu
  // popover either shell draws. If this line ever reads a bare length again, the
  // theme has grown a second place where a value lives.
  'min-w-menu': 'var(--width-menu)',
  // R3's ten square control boxes, one name each carried on both scales.
  'w-tile-reader': 'var(--size-tile-reader)',
  'h-tile-reader': 'var(--size-tile-reader)',
  'w-glyph': 'var(--size-glyph)',
  'h-glyph': 'var(--size-glyph)',
  'w-glyph-reader': 'var(--size-glyph-reader)',
  'h-glyph-reader': 'var(--size-glyph-reader)',
  'w-iconbtn': 'var(--role-iconbtn)',
  'h-iconbtn': 'var(--role-iconbtn)',
  'w-iconbtn-reader': 'var(--size-iconbtn-reader)',
  'h-iconbtn-reader': 'var(--size-iconbtn-reader)',
  'w-fab': 'var(--role-fab)',
  'h-fab': 'var(--role-fab)',
  'w-fab-reader': 'var(--size-fab-reader)',
  'h-fab-reader': 'var(--size-fab-reader)',
  'w-tick': 'var(--size-tick)',
  'h-tick': 'var(--size-tick)',
  'w-tick-nested': 'var(--size-tick-nested)',
  'h-tick-nested': 'var(--size-tick-nested)',
  'w-close': 'var(--size-close)',
  'h-close': 'var(--size-close)',
  'max-w-departments': 'var(--width-departments)',
  'max-w-list': 'var(--width-list)',
  'max-w-summary': 'var(--width-summary)',
  'max-w-doc': 'var(--width-doc)',
  'max-w-drawer': 'var(--width-drawer)',
  'max-w-reader': 'var(--width-reader)',
  'max-w-profile': 'var(--width-profile)',
  'max-w-steps': 'var(--width-steps)',
  'max-w-access': 'var(--width-access)',
  'max-w-audit': 'var(--width-audit)',
  // The closing paren in every expectation is what keeps `var(--width-dialog)`
  // from matching `var(--width-dialog-wide)` — five widths, one stem.
  'max-w-dialog-wide': 'var(--width-dialog-wide)',
  'max-w-dialog-lg': 'var(--width-dialog-lg)',
  'max-w-dialog': 'var(--width-dialog)',
  'max-w-dialog-sm': 'var(--width-dialog-sm)',
  'max-w-dialog-xs': 'var(--width-dialog-xs)',
  // On the `inset` scale, so the class is logical (inset-inline-start) and RTL
  // needs no exception. On `spacing` it would only ever have been a padding.
  'start-search-icon': 'var(--inset-search-icon)',
  'start-search-icon-dialog': 'var(--inset-search-icon-dialog)',
  'start-search-icon-menu': 'var(--inset-search-icon-menu)',
  'p-modal': 'var(--pad-modal)',
  'py-search-y': 'var(--pad-search-y)',
  'px-search-x': 'var(--pad-search-x)',
  'px-search-x-dialog': 'var(--pad-search-x-dialog)',
  'py-search-y-menu': 'var(--pad-search-y-menu)',
  'ps-search-x-menu': 'var(--pad-search-x-menu)',
  'w-search-glyph': 'var(--size-search-glyph)',
  'h-search-glyph': 'var(--size-search-glyph)',
  // §5.2 — the empty-state card's two axes. Two keys, because `48px 20px` is
  // two numbers and the ladder has a rung for neither.
  'py-empty-y': 'var(--pad-empty-y)',
  'px-empty-x': 'var(--pad-empty-x)',
  'border-hairline': 'var(--border-hairline)',
  transition: 'var(--duration)',
  'duration-fast': 'var(--duration-fast)',
  'duration-chev': 'var(--duration-chev)',
  // The two tokens that are whole CSS functions, so their utility can only be
  // named by the length inside. Read from the token rather than written out
  // again, here and in the config, so editing effects.css moves both.
  '-translate-y-lift': `-${lengthIn('--hover-lift')}`,
  'backdrop-blur-scrim': tokenValue('--blur-scrim'),
  // §5.2 — the twelve primitives. Minted in one pass, before the five tasks
  // that build them run in parallel, so none of them appends to tokens.css
  // while another is holding the same working tree. Grouped here in the order
  // the report's table is; `SectionCard` is absent because it mints nothing.
  //
  // Six keys are carried on two properties (`w-`/`h-`), which is one name on
  // two scales — the arrangement `tile`, `glyph` and `close` already have — and
  // `count` is on `h-`/`min-w-` because the FAB badge fixes one axis and floors
  // the other. Every `spacing` key here is ALSO reachable as `w-`, `min-w-`,
  // `start-` and `end-`: that is Tailwind deriving those scales from `spacing`,
  // not five names for one token.
  'py-textarea-y': 'var(--pad-textarea-y)',
  'p-compose': 'var(--pad-compose)',
  'ps-reveal': 'var(--pad-reveal)',
  'w-reveal': 'var(--size-reveal)',
  'h-reveal': 'var(--size-reveal)',
  'w-reveal-glyph': 'var(--size-reveal-glyph)',
  'h-reveal-glyph': 'var(--size-reveal-glyph)',
  'rounded-reveal': 'var(--radius-reveal)',
  // The pair ledger L-10 turns on: the two tick BOXES are --size-tick /
  // --size-tick-nested, and each has a radius and a check glyph of its own.
  // Swap `rounded-tick` and `rounded-tick-nested` and both the token set and
  // the class set are untouched — this line is what goes red.
  'rounded-tick': 'var(--radius-tick)',
  'rounded-tick-nested': 'var(--radius-tick-nested)',
  'w-tick-glyph': 'var(--size-tick-glyph)',
  'h-tick-glyph': 'var(--size-tick-glyph)',
  'w-tick-glyph-nested': 'var(--size-tick-glyph-nested)',
  'h-tick-glyph-nested': 'var(--size-tick-glyph-nested)',
  'gap-tick-row': 'var(--gap-tick-row)',
  'py-tick-row-y': 'var(--pad-tick-row-y)',
  'py-tick-nested-y': 'var(--pad-tick-nested-y)',
  'px-radio-x': 'var(--pad-radio-x)',
  'py-dropdown-y-dialog': 'var(--pad-dropdown-y-dialog)',
  'py-dropdown-y-filter': 'var(--pad-dropdown-y-filter)',
  'px-dropdown-x-filter': 'var(--pad-dropdown-x-filter)',
  'p-popover': 'var(--pad-popover)',
  'gap-option': 'var(--gap-option)',
  'py-option-y': 'var(--pad-option-y)',
  'w-chevron': 'var(--size-chevron)',
  'h-chevron': 'var(--size-chevron)',
  'max-h-popover': 'var(--height-popover)',
  'grid-cols-users': 'var(--grid-users)',
  'grid-cols-audit': 'var(--grid-audit)',
  'grid-cols-activity': 'var(--grid-activity)',
  'py-table-row-y': 'var(--pad-table-row-y)',
  // …and NOT --pad-empty-y, which is the 48px card variant. One stem, two
  // values, and the closing paren is what tells them apart.
  'py-empty-y-inline': 'var(--pad-empty-y-inline)',
  'w-pager': 'var(--size-pager)',
  'h-pager': 'var(--size-pager)',
  'min-w-page-label': 'var(--width-page-label)',
  // A seventh redefinition of one of Tailwind's own leadings, for the same
  // reason as the six above: delete the key and `leading-none` still emits, at
  // Tailwind's `1` rather than the token's, and only this line notices.
  'leading-none': 'var(--lh-none)',
  'px-stat-x': 'var(--pad-stat-x)',
  'min-w-stat': 'var(--width-stat)',
  'py-stat-y-grid': 'var(--pad-stat-y-grid)',
  'px-stat-x-grid': 'var(--pad-stat-x-grid)',
  'my-stat-grid': 'var(--space-stat-grid)',
  'mt-stat-label': 'var(--space-stat-label)',
  'py-tab-y-audit': 'var(--pad-tab-y-audit)',
  'min-w-tab': 'var(--width-tab)',
  'gap-tab-flow': 'var(--gap-tab-flow)',
  'py-note-y': 'var(--pad-note-y)',
  'px-note-x': 'var(--pad-note-x)',
  'h-count': 'var(--size-count)',
  'min-w-count': 'var(--size-count)',
  // The single minting pass. The stacking ladder reads the ROLE and not the
  // token — the same shape `w-tile -> --role-tile -> --size-tile` has — so the
  // ladder's semantic layer stays in roles.css, which is the file that IS the
  // semantic layer, and `reachable` follows the hop.
  'z-canvas-overlay': 'var(--role-z-canvas-overlay)',
  'z-dropdown': 'var(--role-z-dropdown)',
  'z-chrome': 'var(--role-z-chrome)',
  'z-floating': 'var(--role-z-floating)',
  'z-drawer': 'var(--role-z-drawer)',
  'z-modal': 'var(--role-z-modal)',
  'z-popover': 'var(--role-z-popover)',
  'z-tooltip': 'var(--role-z-tooltip)',
  'z-toast': 'var(--role-z-toast)',
  'ease-css': 'var(--ease-css)',
  'duration-row': 'var(--duration-row)',
  'rounded-bar': 'var(--radius-bar)',
  'shadow-feature': 'var(--shadow-feature)',
  'max-w-subtitle': 'var(--width-subtitle)',
  'max-w-intro': 'var(--width-intro)',
  'min-h-chiprow': 'var(--size-chiprow)',
  // One key on `colors`, two classes — and `text-warn-fg` below is a SECOND
  // token on `textColor`, not the same one seen twice. The two are pinned apart
  // here and again in the regression test at the foot of this describe.
  'bg-warn-edge': 'var(--warn-edge)',
  'border-warn-edge': 'var(--warn-edge)',
  'text-warn-fg': 'var(--warn-fg)',
  'text-role-textarea': 'var(--role-fs-textarea)',
  // §6.0 / §9.7k — the type-on-the-violet-field group. These read the ROLE and
  // not the token on purpose: the tokens are decoys, and the test below pins
  // each against the decoy it is most likely to be swapped for.
  'text-role-title-on-field': 'var(--role-title-on-field)',
  'text-role-subtitle-on-field': 'var(--role-subtitle-on-field)',
  'text-role-eyebrow': 'var(--role-eyebrow)',
  // §5.2 StatTile — the third 7px role. `gap-stat-label` and `gap-popover` hold
  // the same number for the other two, and this line is what keeps them apart.
  'gap-stat-dot': 'var(--gap-stat-dot)',
  'gap-table-row-mobile': 'var(--gap-table-row-mobile)',
  'w-menu-more': 'var(--size-menu-more)',
  'h-menu-more': 'var(--size-menu-more)',
  'w-login': 'var(--width-login)',
  'w-dot': 'var(--size-dot)',
  'h-dot': 'var(--size-dot)',
  'w-chev': 'var(--size-chev)',
  'h-chev': 'var(--size-chev)',
  'w-glyph-tile': 'var(--size-glyph-tile)',
  'h-glyph-tile': 'var(--size-glyph-tile)',
  // The shell mint. Nine classes, and the pairing is the whole point of half of
  // them: four of these numbers already had an owner at the same value, and this
  // block is what says which class carries which of the two.
  //   · `mt-hint` is --space-hint 3px, NOT --gap-tab-flow's 3px (the flow nav
  //     group's gap).
  //   · `py-back-y` is --pad-back-y 7px, NOT --pad-popover, --space-stat-label
  //     or --gap-stat-dot, which are the other three 7px roles.
  //   · `px-inbox-x` is --pad-inbox-x 13px, one of six 13px roles.
  //   · `py-crumb-y` is --pad-crumb-y 9px, one of six 9px roles.
  //   · `px-topbar-reader` is --pad-topbar-reader 20px — the reader's CHROME
  //     gutter — and is four pixels off `px-reader-x`, which is its CONTENT
  //     gutter. Swapping those two is invisible in every set-membership test in
  //     this file and wrong on screen, which is what a pairing table is for.
  'mt-hint': 'var(--space-hint)',
  // Reads the ROLE — the one leading that differs by surface. If this line ever
  // reads `--lh-lockup` again, `leading-lockup` paints 1.25 inside the reader
  // and every set-membership test in this file still passes.
  'leading-lockup': 'var(--role-lh-lockup)',
  'min-w-count-chrome': 'var(--size-count-chrome)',
  'h-count-chrome': 'var(--size-count-chrome)',
  'px-inbox-x': 'var(--pad-inbox-x)',
  'py-crumb-y': 'var(--pad-crumb-y)',
  'py-back-y': 'var(--pad-back-y)',
  'px-topbar-reader': 'var(--pad-topbar-reader)',
  'grid-cols-idef0': 'var(--grid-idef0)',
  // The reader-chrome mint, and three more pairings that a set test cannot see:
  //   · `gap-button-icon` is --gap-button-icon 7px, the FIFTH 7px role in the
  //     theme and the first that is a button's icon gap. `gap-popover`,
  //     `mt-stat-label`, `gap-stat-dot` and `py-back-y` are the other four.
  //   · `px-button-x` is --pad-button-x 15px, NOT --pad-radio-x, which is the
  //     same number for a radio CARD's inline padding.
  //   · `w-menu-more-reader` is 38px and is a BUTTON; --size-logo-bar is also
  //     38px and is the logo IMAGE on the same bar. Swapping those two compiles,
  //     paints, and is wrong the day either moves.
  'gap-button-icon': 'var(--gap-button-icon)',
  'px-button-x': 'var(--pad-button-x)',
  'w-menu-more-reader': 'var(--size-menu-more-reader)',
  'h-menu-more-reader': 'var(--size-menu-more-reader)',
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
    // 344 is what the theme reads today, not a floor with room under it: later
    // tasks only add names, so a drop below it means keys were removed. (Was
    // 192 before Task 3's 48 tokens were named, on 58 var() sites, then 250, then
    // 315 — the ten square `--size-*` boxes are read twice each, once on width
    // and once on height, which is one name on two properties, not two names.
    // The single minting pass added 29 sites for 30 classes — `--warn-edge` is
    // one key on `colors` that Tailwind spends on both `bg-` and `border-` — and
    // then 3 more for the type-on-the-violet-field group, then --gap-stat-dot.)
    expect(referencedList.length).toBeGreaterThanOrEqual(348)
    // Two declaration sites, because the app has two: tokens.css holds every
    // literal, and roles.css holds R3's scale layer, which is the only thing a
    // utility may name that is not a token. Both are read from disk; neither is
    // a list kept here.
    expect(
      [...referenced].filter((t) => !declared.has(t) && !roles.has(t)).sort(),
    ).toEqual([])
  })

  it('reads a real role layer, so the line above cannot pass by knowing nothing', () => {
    // `roles` is the escape hatch the assertion above leans on. If roleTargets()
    // ever returned an empty map — a renamed file, a regex that stopped
    // matching — the filter would go back to catching every --role-* and this
    // file would fail loudly rather than quietly; but if it returned everything,
    // it would launder any misspelling. This pins both ends: the layer is real,
    // finite, and does NOT contain a name the config could plausibly mistype.
    expect(roles.size).toBeGreaterThanOrEqual(121 - 13)
    expect(roles.has('--role-tile')).toBe(true)
    expect(roles.has('--role-nonesuch')).toBe(false)
    // …and it reads a ROLE layer, not "every property that points at a token".
    // Asked against a synthetic block rather than against `roles`, because
    // roles.css declares nothing but `--role-*` today: `expect(roles.has(
    // '--size-tile')).toBe(false)` — which stood here — could never fail,
    // since --size-tile appears in that file only as a var() TARGET and no
    // widening of the key pattern can make it a key. Two lines of synthetic
    // CSS can: broaden `--role-[a-z0-9-]+` to `--[a-z0-9-]+` and this goes red,
    // which is the mutation the paragraph above is about.
    const synthetic = roleTargets('--size-tile: var(--x);\n--role-real: var(--y);')
    expect([...synthetic.keys()]).toEqual(['--role-real'])
    // The scale roles the theme names must each resolve to TWO different
    // tokens, or `text-role-textarea` would be one size on both surfaces and the
    // utility would be a lie.
    //
    // --role-fs-dense is deliberately NOT in this list any more. Owner ruling
    // R12 dropped its reader override — a matched-element comparison over 70
    // pairs found the reader draws the panel's five 13px elements at 13px and
    // 13.5px and at 14.5px never — so it is one size on both surfaces on
    // purpose, and asserting two tokens for it would defend the number the
    // ruling removed. --role-fs-textarea is the role that carries the genuine
    // per-surface difference the dense role was being asked to express.
    for (const role of ['--role-fs-body', '--role-fs-textarea', '--role-fs-title',
      '--role-fs-hero', '--role-tile', '--role-iconbtn', '--role-fab']) {
      expect([...(roles.get(role) ?? [])].length, role).toBe(2)
    }
    // …and the role R12 collapsed resolves to exactly one, so a reader override
    // cannot creep back in unnoticed.
    expect([...(roles.get('--role-fs-dense') ?? [])].length).toBe(1)
  })

  it('leaves no declared token without a utility name', () => {
    // The structural defect this whole file exists to end, asked as a closure
    // rather than as a list. Task 2 named 106 tokens the screens had been unable
    // to reach; Task 3 then declared 48 more with no utility, reopening the same
    // gap — and it is a real gap, not a tidiness one, because guards.test.ts
    // bans `text-[…]`, `rounded-[…]` and `shadow-[…]` outright, so a token with
    // no name cannot legally be written at all once src/screens/ leaves
    // PENDING_REBUILD.
    //
    // A hand-kept list of those 48 would go stale the next time tokens.css
    // grows. This asks the question the other way round, so the *next* unnamed
    // token fails here on the day it is declared, whoever declares it.
    const NAMED_ELSEWHERE = [
      // The alias block at the foot of colors.css: each is `var()` of a token
      // that already has a utility, so naming them would be a second word for
      // something that has one. --selection-bg is consumed by ::selection in
      // base.css and is never written as a class.
      '--color-primary', '--color-accent', '--surface-app', '--surface-card',
      '--text-heading', '--selection-bg',
      '--dept-violet-tile', '--dept-violet-fg', '--dept-coral-tile', '--dept-coral-fg',
      // The two whole CSS functions, named by the length inside them — see the
      // two tests below, which assert exactly that.
      '--hover-lift', '--blur-scrim',
    ]
    // `reachable`, not `referenced`: R3 re-pointed w-tile/w-iconbtn/w-fab at the
    // roles, so --size-tile, --size-iconbtn and --size-fab are now named through
    // one hop rather than directly. A hop through a role a utility names is
    // still a utility name; a token behind an UNNAMED role is not, and still
    // fails here.
    expect(
      [...declared].filter((t) => !reachable.has(t) && !NAMED_ELSEWHERE.includes(t)).sort(),
    ).toEqual([])
    // The list is the escape hatch, so it may not quietly grow to make the line
    // above pass. Twelve is what Task 2 justified, one by one, in its report.
    expect(NAMED_ELSEWHERE.length).toBe(12)
    expect(new Set(NAMED_ELSEWHERE).size).toBe(12)
  })

  it('leaves no role that can only be written by naming something else', () => {
    // The closure test above walks TOKENS, so it can say nothing about a ROLE:
    // a role no utility names carries nothing into `reachable`. This asks the
    // other question — is every role writable AT ALL?
    //
    // The bar is deliberately NOT "every role has a key". 90 of the 108 do not,
    // and they do not need one: --role-primary is --violet and `bg-violet`
    // writes it, so the value is reachable and the role is a record rather than
    // a vocabulary word. The bar is that a role must be writable SOMEHOW: by its
    // own name, or by the name of every token it points at.
    //
    // This is a FLOOR, and it is worth knowing what it does not catch. It did
    // not catch the L-01 defect: --role-title-on-field is --card, and --card has
    // `text-card`, so by this test the white was always writable. What made it a
    // defect is that `text-card` says SURFACE while the class that reads like the
    // answer on a dark field — `text-on-dark` — is a different colour, the cream
    // L-01 retired, and the plan wrote it on 19 screen titles. A value you can
    // only reach by writing a word that means something else is not reachable in
    // any sense that matters. The test below this one is the sharp one for that,
    // and it names the decoys; this one stops the weaker failure where a role's
    // value has no class of any kind.
    const NAMED_BY_ITS_LENGTH = [
      // --role-lift is translateY(-2px), a whole transform function. Tailwind
      // 3.4 has no themeable `transform` namespace, so neither the role nor the
      // token can be a var() anywhere in this config; the DISTANCE is named
      // instead (`-translate-y-lift`) and the test below this one asserts it.
      '--role-lift',
    ]
    const unwritable = [...roles]
      .filter(([role, tokens]) =>
        !referenced.has(role) &&
        !NAMED_BY_ITS_LENGTH.includes(role) &&
        [...tokens].some((t) => !referenced.has(t)))
      .map(([role]) => role)
      .sort()
    expect(
      unwritable,
      'these roles have no utility of their own AND point at a token that has ' +
      'none either, so the value they decide cannot be written at all',
    ).toEqual([])
    // …and the check can fail: a role whose token is a typo is unwritable both
    // ways, and must be caught. Asked against a synthetic map, because `roles`
    // is currently clean and a clean input can never prove a filter runs.
    const synthetic = new Map([['--role-invented', new Set(['--not-a-token'])]])
    expect(
      [...synthetic].filter(([r, ts]) =>
        !referenced.has(r) && [...ts].some((t) => !referenced.has(t))).length,
    ).toBe(1)
  })

  it('gives the type-on-the-violet-field group its own words, and keeps the decoys apart', () => {
    // The three roles §6.0 / §9.7k decides, and the sharp end of the test above.
    //
    // Every other unkeyed role can be written by naming its token and getting
    // the right thing. These three could not: the classes a screen reaches for
    // are `text-on-dark` (a DIFFERENT colour — the cream ledger L-01 retired,
    // which the plan writes on 19 screen titles today), `text-card` (the right
    // colour under a word that means "surface"), and `text-violet-on-violet`
    // (the right colour under a role that is "mono id inside a violet box").
    // So the group gets its own words, and each is pinned here against the exact
    // class it is most likely to be swapped for.
    const literal = (role: string) => tokenValue([...(roles.get(role) ?? [])][0])
    // L-01, decided 10 against 1. The decoy is `text-on-dark`, which READS like
    // the answer on a dark field and is the cream the ruling retired.
    expect(referenced.has('--role-title-on-field')).toBe(true)
    expect(literal('--role-title-on-field')).toBe('#FFFFFF')
    expect(tokenValue('--text-on-dark')).toBe('#FBF7F1')
    expect(literal('--role-title-on-field')).not.toBe(tokenValue('--text-on-dark'))
    // L-28, decided 13 against 1. The decoy is `text-violet-on-dark-body`, one
    // letter away and the token the ruling decided AGAINST — and it holds the
    // right value today only because Task 3 corrected it, which is why the role
    // must not be written through it.
    expect(referenced.has('--role-subtitle-on-field')).toBe(true)
    expect(literal('--role-subtitle-on-field')).toBe('#C9BEEE')
    // The third of the group. Its token is honestly named, so this one is cheap
    // — but a group written two ways is how the other two went wrong.
    expect(referenced.has('--role-eyebrow')).toBe(true)
    expect(literal('--role-eyebrow')).toBe('#B79FE6')
    // The three are three different colours, so a key pointed at its neighbour
    // fails here rather than rendering a plausible screen.
    const group = ['--role-title-on-field', '--role-subtitle-on-field', '--role-eyebrow']
    expect(new Set(group.map(literal)).size).toBe(3)
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

describe('Ledger L-08 — the scrollbar is 10px, and reads it from a token', () => {
  // The one ledger row Task 3 was meant to close and could not: base.css was
  // outside its file boundary, so `::-webkit-scrollbar` kept the token file's
  // 12px against the 10px both deliverables' own style blocks write, which R3
  // then lists among the foundations the panel and the reader share.
  //
  // base.css is NOT on guards.test.ts's literal allow-list — only tokens.css is
  // — so the assertion is deliberately two-sided: the declaration must be a
  // var(), and the token behind it must be worth 10px. Hard-coding `10px` gets
  // the right pixels and fails here, which is the point; pointing at the wrong
  // token compiles and fails here too.
  it('sizes it from a token declared as the ledger’s 10px, not from a literal', () => {
    const rule = baseRule('::-webkit-scrollbar')
    for (const prop of ['width', 'height']) {
      const m = rule.match(new RegExp(`\\b${prop}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`))
      expect(
        m,
        `base.css: ::-webkit-scrollbar sets no \`${prop}: var(--…)\` — got \`${rule.trim()}\``,
      ).toBeTruthy()
      expect(tokenValue(m![1]), `${prop} reads ${m![1]}, which is not the ledger’s 10px`).toBe('10px')
    }
  })

  it('cuts the thumb with a token too, so no px literal is left in the block', () => {
    const m = baseRule('::-webkit-scrollbar-thumb').match(/\bborder\s*:\s*var\((--[a-z0-9-]+)\)/)
    expect(m, 'base.css: the thumb’s cut-out border is not a var()').toBeTruthy()
    expect(tokenValue(m![1])).toBe('2px')
  })

  it('paints the track and thumb the two colours the deliverables write', () => {
    // #F0E9FB and #7A52D0 in both deliverables' blocks; base.css reaches them
    // through --tile-v and --violet-mid, so both halves are checked — the class
    // that is written, and what that token is currently worth.
    expect(baseRule('::-webkit-scrollbar-track')).toMatch(/background:\s*var\(--tile-v\)/)
    expect(baseRule('::-webkit-scrollbar-thumb')).toMatch(/background:\s*var\(--violet-mid\)/)
    expect(tokenValue('--tile-v')).toBe('#F0E9FB')
    expect(tokenValue('--violet-mid')).toBe('#7A52D0')
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


/* ---------------------------------------------------------------------------
   Owner ruling R11 — a minted utility is USED, or it is on a list a later task
   must empty.

   The three grid templates (`grid-cols-users`, `-audit`, `-activity`) were
   minted with no consumer, and the reviewer's recommendation was to delete
   them. The owner ruled the opposite — use them — on one condition: that the
   test which proved they EXIST is rewritten to prove they are USED. The reason
   given was "otherwise we'll be right back here in six months."

   Neither check this file already had can answer that question:

     · the reachability guard above computes reachability from the THEME's own
       var() sites, so it proves a token has a NAME, never that anything writes
       it; and
     · "does the class emit" cannot tell used from unused either, because
       Tailwind's `content` globs include this very file — the max-[560px] test
       above says so in as many words — so a class mentioned only in a test is
       emitted like any other.

   The first answer to that was a text scan of src/**, and it proved something
   weaker than it claimed. All four of these were green on a clean tree:

     · `// TODO(task-14): … bg-muted.`, with `bg-muted` off PENDING — a class
       "used" by a comment;
     · `const UNUSED = ['bg-muted','bg-faint','bg-warm'] as const; void UNUSED`
       — a class "used" by a declaration nothing renders;
     · the same mention placed in src/test/a11y.ts, because the exclusion was
       `!/\.test\./` against the FILENAME and src/test/ holds four files that do
       not carry it; and
     · the `TEMPLATE` map assembled from its key, with the three literals left
       in a comment — where `grid-cols-users` read as consumed off the DOCSTRING
       that explains this guard.

   So this block asks the question twice, in the two forms that can answer it:

     · RENDERED — the component is rendered and the class is read off the
       element, which is what "used" means and what no text scan can fake. That
       is the R11 condition, and it is the check the three templates answer to.
     · SCANNED — for the other 348 utilities, which no single test can render,
       the source is scanned; but it is scanned with the comments removed, with
       src/test/** out by DIRECTORY, and with only the class strings a
       `className` can actually reach. That is bookkeeping for the PENDING
       ledger, and it is documented as bookkeeping.
   --------------------------------------------------------------------------- */

/** Test infrastructure. Excluded by DIRECTORY: `a11y.ts`, `setup.ts`,
 *  `utils.tsx` and `reactflow-mock.ts` carry no `.test.` in their names, and a
 *  filename-only exclusion read all four of them as components. */
const TEST_DIR = resolve(process.cwd(), 'src/test')

interface Source { path: string; text: string }

/** Every file a component could be written in, minus the tests. */
function componentSources(dir = resolve(process.cwd(), 'src'), out: Source[] = []): Source[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (p !== TEST_DIR) componentSources(p, out) }
    else if (/\.(tsx?|jsx?|css|html)$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name)) {
      out.push({ path: p, text: readFileSync(p, 'utf8') })
    }
  }
  return out
}

/**
 * The source with `//` and block comments removed and every string literal left
 * exactly as written.
 *
 * A class name in prose is not a consumer. It is the most natural thing in the
 * world to write — this repo's components explain themselves at length, and one
 * of those explanations was what made `grid-cols-users` look consumed.
 */
function stripComments(src: string): string {
  let out = ''
  for (let i = 0; i < src.length;) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      out += c
      i++
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue }
        if (src[i] === c) { out += c; i++; break }
        out += src[i]
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** A top-level declaration, and the name it binds. */
const TOP_LEVEL =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/

/**
 * A file cut at its top-level declarations, so each piece can be asked whether
 * anything reaches it. Cut by INDENTATION rather than by parsing: a top-level
 * declaration starts at column 0, everything nested is indented, and this
 * codebase is formatted. A parser would be the honest tool and a much larger
 * one; the failure mode of this cut is that a piece is too BIG, which can only
 * make the scan more generous, never less.
 */
function chunk(src: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  let cur = { name: '', text: '' }
  for (const line of src.split('\n')) {
    const m = TOP_LEVEL.exec(line)
    if (m) { out.push(cur); cur = { name: m[1], text: '' } }
    cur.text += `${line}\n`
  }
  out.push(cur)
  return out
}

/**
 * The part of the source a `className` can actually reach.
 *
 * A class is written by a component when it lands in a class attribute — either
 * spelled there, or held in something the attribute reads. `const UNUSED =
 * ['bg-muted'] as const` is neither, and a scan of the raw text called it a
 * consumer. So: every declaration holding a `className=`/`class=` seeds the
 * set, every identifier those pieces name pulls its own declaration in, and
 * that repeats to a fixed point. A `.css` or `.html` file is taken whole — a
 * class name in `@apply` or in a `class` attribute is already at its use site.
 */
function consumedSource(sources: Source[]): string {
  const chunks: { name: string; text: string; seed: boolean }[] = []
  for (const { path, text } of sources) {
    const stripped = stripComments(text)
    if (/\.(css|html)$/.test(path)) chunks.push({ name: '', text: stripped, seed: true })
    else for (const c of chunk(stripped)) chunks.push({ ...c, seed: /\b(?:className|class)\s*=/.test(c.text) })
  }
  const byName = new Map<string, typeof chunks>()
  for (const c of chunks) if (c.name) byName.set(c.name, [...(byName.get(c.name) ?? []), c])

  const reached = new Set(chunks.filter((c) => c.seed))
  let frontier = [...reached]
  while (frontier.length > 0) {
    const names = new Set<string>()
    for (const c of frontier) for (const m of c.text.matchAll(/[A-Za-z_$][\w$]*/g)) names.add(m[0])
    const next: typeof chunks = []
    for (const name of names) {
      for (const c of byName.get(name) ?? []) if (!reached.has(c)) { reached.add(c); next.push(c) }
    }
    frontier = next
  }
  return [...reached].map((c) => c.text).join('\n')
}

const COMPONENTS = componentSources()
/** Every byte of every scanned file, comments and all — for the pins below. */
const COMPONENT_TEXT = COMPONENTS.map((f) => f.text).join('\n')
const CONSUMED = consumedSource(COMPONENTS)

/**
 * Does a component write this class?
 *
 * The boundary is a word character or a hyphen on either side, and deliberately
 * NOT a colon: `disabled:text-disabled` and `max760:p-s7` write `text-disabled`
 * and `p-s7`, in a state and at a width. A matcher that refused a leading colon
 * would call both of those unconsumed and send someone deleting a utility two
 * shipped components depend on.
 */
function written(klass: string, source: string = CONSUMED): boolean {
  return new RegExp(`(?<![\\w-])${klass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)
    .test(source)
}

/* --- the other half: what the components actually put on an element -------- */

interface TRow { id: string }
const T_ROWS: TRow[] = [{ id: '1' }, { id: '2' }]
/** Six columns, because all three minted templates name six tracks. */
const T_COLUMNS: TemplatedColumn<TRow>[] = ['a', 'b', 'c', 'd', 'e', 'f']
  .map((key) => ({ key, head: key, cell: () => key }))

const GRID_TEMPLATES = [
  ['users', 'grid-cols-users', '--grid-users'],
  ['audit', 'grid-cols-audit', '--grid-audit'],
  ['activity', 'grid-cols-activity', '--grid-activity'],
] as const

/**
 * Every class `DataTable` puts on a real element when it is asked for each of
 * the three minted templates.
 *
 * This is the R11 answer. A comment cannot render, an unreferenced array cannot
 * render, and a name assembled from its key renders exactly as well as one
 * written out — which is the point: the question R11 asked is whether the
 * template REACHES an element, and that is a question about the DOM.
 */
function renderedClasses(template: (typeof GRID_TEMPLATES)[number][0]): Set<string> {
  const { container, unmount } = render(createElement(DataTable<TRow>, {
    label: 'کاربران', columns: T_COLUMNS, rows: T_ROWS,
    rowKey: (r: TRow) => r.id, empty: 'خالی', template,
  }))
  const out = new Set<string>()
  for (const el of Array.from(container.querySelectorAll('[class]'))) {
    for (const k of Array.from(el.classList)) out.add(k)
  }
  unmount()
  return out
}

let renderedOnce: Set<string> | undefined
/** The union of the three, memoised — the PENDING ledger below reads it too. */
function rendered(): Set<string> {
  if (renderedOnce === undefined) {
    renderedOnce = new Set(GRID_TEMPLATES.flatMap(([t]) => [...renderedClasses(t)]))
  }
  return renderedOnce
}

/**
 * Used, by either proof: rendered onto an element, or written into a class
 * string a `className` reaches. The two are one question with two answers, and
 * the ledger below must accept both — otherwise a component that assembles a
 * class name would be reported as an orphan while visibly using it.
 */
const consumed = (klass: string) => rendered().has(klass) || written(klass)

/**
 * The utilities the theme names that NO component uses yet.
 *
 * This is the list R11 turns on. A promise to use a utility later is what
 * minted three templates nothing could reach; a list that a named task must
 * mechanically empty is not a promise, it is a receipt. Every line here is a
 * screen or a primitive that has not been rebuilt yet — Tasks 13–24 — and every
 * one of them deletes its own lines as it lands.
 *
 * ** TASK 25 MUST TURN THE TEST BELOW INTO `expect(PENDING).toEqual([])`. **
 * That is the whole point of keeping the list rather than deleting the classes:
 * by Task 25 every screen exists, so a utility still on this list at that point
 * has no consumer and never will, and the theme should lose it. Until then the
 * list is asserted to be exactly accurate in BOTH directions, so it can neither
 * hide a newly orphaned utility nor keep a stale line after a screen starts
 * using one.
 */
// In tailwind-probe.txt's own order, which groups them by the scale each is
// minted on, so a whole family landing at once deletes contiguous lines.
const PENDING: string[] = [
  'bg-muted', 'bg-faint', 'bg-warm', 'bg-line',
  'bg-login-orb', 'bg-warn', 'bg-info', 'bg-violet-mid',
  'bg-violet-edge', 'bg-violet-on-dark', 'bg-violet-on-dark-body', 'bg-violet-on-violet',
  'bg-desk', 'bg-tile-v3', 'bg-tile-ctl', 'bg-value-current',
  'bg-hair', 'bg-line-soft', 'bg-line-dashed', 'bg-border-danger',
  'bg-border-dead', 'bg-border-ok', 'bg-strong',
  'bg-body-ink', 'bg-ghost', 'bg-dialog-ghost', 'bg-ink-current',
  'bg-ink-proposed', 'bg-on-dark', 'bg-disabled', 'bg-ok',
  'bg-danger', 'bg-warn-soft', 'bg-info-soft', 'bg-ok-soft',
  'bg-danger-soft', 'bg-toast-check', 'bg-junction-xor', 'bg-junction-and',
  'bg-junction-or', 'bg-dept-numeral-violet', 'bg-dept-numeral-coral', 'bg-steps-sub',
  'bg-steps-sub-border', 'bg-steps-sub-hover', 'bg-steps-group', 'bg-steps-group-border',
  'bg-link', 'bg-link-hover', 'text-violet-on-dark', 'text-violet-on-dark-body',
  'text-violet-on-violet', 'text-strong', 'text-ghost', 'text-dialog-ghost',
  'text-ink-current', 'text-ink-proposed', 'text-on-dark', 'text-ok',
  'text-danger', 'text-toast-check', 'text-link', 'text-link-hover',
  'border-line-soft', 'border-line-dashed', 'border-border-dead', 'border-border-ok',
  'border-hair', 'border-steps-sub-border', 'border-steps-group-border', 'border-card',
  'bg-tile-v5', 'bg-disc-coral', 'bg-disc-violet', 'bg-line-divider',
  'border-line-divider', 'bg-line-row', 'bg-line-filter', 'border-line-filter',
  'bg-border-pick', 'text-fs-display', 'text-fs-h1', 'text-fs-h2',
  'text-fs-h3', 'text-fs-h4', 'text-fs-h5',
  'text-fs-micro', 'text-fs-doc-base', 'text-fs-doc-h1',
  'text-fs-doc-title', 'text-fs-doc-step', 'text-fs-doc-body',
  'text-fs-numeral', 'text-fs-steps-title', 'text-fs-display-hand',
  'text-fs-body-lead', 'text-fs-nano', 'text-fs-badge-sm',
  'text-fs-tag', 'text-fs-h1-reader-home', 'text-fs-h1-reader-list', 'text-fs-h1-reader-dept',
  'text-fs-body-reader', 'text-prose',
  // Named only in a docstring in src/ui/fieldFrame.ts, which explains why the
  // field's type is a FIXED step and not this role. The scan above stopped
  // reading comments, and prose stopped counting as a consumer.
  'text-role-body',
  'text-role-title', 'text-role-hero',
  'font-sans', 'font-regular', 'leading-snug', 'leading-looser',
  'tracking-eyebrow', 'tracking-display', 'rounded-badge',
  'shadow-sheet', 'shadow-drawer',
  'shadow-card-dark', 'shadow-stat-dark', 'shadow-guide-hover', 'shadow-ring-flash',
  'p-screen-x', 'p-screen-y',
  'p-topbar', 'p-half', 'gap-topbar', 'px-reader-x',
  'pb-reader-bottom', 'pt-departments-top', 'pb-departments-bottom', 
  'p-s2', 'p-s3', 'p-s4', 'p-s5',
  'p-s6', 'p-s14', 'p-s16',
  // `w-tile`/`h-tile` and the two glyph pairs came off here when Task 11's
  // src/ui/IconTile.tsx landed: R3 declares the tile as a role trio
  // (--role-tile 48/54, --role-tile-radius 14/16, --role-tile-glyph 24/26) and
  // the component writes the class rather than the number. `w-tile-reader` and
  // `h-tile-reader` stay: the BOX reads the role and needs no per-surface name,
  // which is what tailwind.config.js's own comment says the `-reader` keys are
  // for — "still writable when a screen genuinely needs one". If nothing ever
  // does, Task 25 takes them off the theme rather than off this list.
  'w-tool', 'h-tool', 'w-avatar',
  'h-avatar', 'w-logo-bar', 'h-logo-bar', 'w-logo-login',
  'h-logo-login', 'w-touch', 'h-touch', 'w-tile-reader',
  'h-tile-reader', 'w-iconbtn', 'h-iconbtn', 'w-iconbtn-reader',
  'h-iconbtn-reader', 'w-fab-reader',
  'h-fab-reader', 'w-tick-nested',
  'h-tick-nested', 'max-w-departments', 'max-w-summary', 'max-w-doc',
  'max-w-drawer', 'max-w-reader', 'max-w-profile', 'max-w-steps',
  'max-w-access', 'max-w-audit', 'duration-fast', 'duration-chev',
  'p-compose', 'rounded-tick-nested',
  'w-tick-glyph-nested', 'h-tick-glyph-nested',
  'py-tick-nested-y', 'py-dropdown-y-dialog',
  'py-dropdown-y-filter', 'px-dropdown-x-filter',
  'py-option-y', 
  'my-stat-grid', 
  'gap-tab-flow', 
  'max1080:hidden',
  // The single minting pass — 29 of its 30 classes. `z-canvas-overlay` is the
  // thirtieth and is NOT here: owner ruling R15 minted the rung and pointed its
  // one consumer at it in the same change, so src/flow/DetailDrawer.tsx writes
  // it today and the `stale` assertion below would fail if it were listed.
  //
  // Two of the 29 will still be here at Task 25 and should be DELETED from the
  // theme rather than consumed: `z-popover` and `z-tooltip` are the adopted
  // scale's reserved rungs (L-42) and nothing in this plan portals a popover or
  // draws a tooltip. That is a decision for whoever empties the list, not a
  // surprise for them to discover.
  //
  // `z-dropdown` and `text-role-textarea` are already gone from this list:
  // Task 8's Dropdown and TextField landed and consumed them, which is the
  // mechanism working — a line comes off when its consumer arrives.
  'z-chrome', 'z-drawer',
  'z-modal', 'z-popover', 'z-tooltip', 'z-toast',
  'ease-css', 'duration-row', 'rounded-bar', 'shadow-feature',
  'max-w-subtitle', 'max-w-intro', 'min-h-chiprow',
  'bg-warn-edge', 'border-warn-edge', 'text-warn-fg',
  'gap-table-row-mobile',
  'w-menu-more', 'h-menu-more', 'w-login',
  'w-dot', 'h-dot', 'w-chev', 'h-chev', 'w-glyph-tile', 'h-glyph-tile',
  // …and the type-on-the-violet-field group. Unconsumed only because Tasks 15,
  // 17, 19 and 20 have not landed: those four screens are the ones that write a
  // title on the field, and they currently write `text-on-dark`, which is the
  // colour ledger L-01 retired. These three lines come off as those tasks land.
  'text-role-title-on-field', 'text-role-subtitle-on-field', 'text-role-eyebrow',
  // …and StatTile's numeral-to-dot gap, unconsumed until Task 10 builds it.

  // The shell mint. Nine names for the values Tasks 12, 13 and 16 were still
  // writing out, minted for the same reason the pass before it was: guards.test.ts
  // makes an unnamed value unwritable, so the name has to exist before its
  // consumer. Task 12 deletes `mt-hint`, `leading-lockup`, `min-w-count-chrome`,
  // `h-count-chrome`, `px-inbox-x`, `py-crumb-y` and `py-back-y`; Task 13 deletes
  // `px-topbar-reader` and shares four of Task 12's, so it deletes nothing on its
  // own; Task 16 deletes `grid-cols-idef0`.
  //
  // `min-w-menu` is deliberately NOT here. The mint gave it a token instead of a
  // new name, and src/ui/Menu.tsx already writes it, so it has a consumer today.
  'mt-hint', 'leading-lockup', 'min-w-count-chrome', 'h-count-chrome',
  'px-inbox-x', 'py-crumb-y', 'py-back-y', 'px-topbar-reader',
  'grid-cols-idef0',

  // The reader-chrome mint. The owner's ruling that ReaderShell takes the
  // READER's numbers — it writes the panel's in eleven places — needs three
  // names the mint above had no reason to look for. All four lines are Task 13's
  // and come off with it.
  'px-button-x', 'w-menu-more-reader', 'h-menu-more-reader',
]

/**
 * The high-water mark PENDING may not pass.
 *
 * `PENDING.length <= 220` was not a ratchet; it was a ceiling resting exactly on
 * the count. A task that legitimately STOPS using a utility has to put its line
 * back, and doing the right thing failed with `expected 221 to be less than or
 * equal to 220` — whose only available fix is to edit the number upward, which
 * is the one edit a ratchet exists to forbid. It happened on that commit's own
 * first run: `text-role-body` turned out to be "used" by a docstring.
 *
 * A ratchet needs slack in the direction that may move and none in the
 * direction that may not. So the number carries headroom and states the count
 * it was set against, and the rule is written here rather than implied: it may
 * be LOWERED by any task that empties lines. The slack hides nothing — the
 * accuracy test below forces every line on the list to be a genuine orphan and
 * every genuine orphan to be on the list — it only stops the list growing
 * without bound.
 *
 * ---------------------------------------------------------------------------
 * IT HAS BEEN RAISED TWICE, AND BOTH WERE THE EVENT IT IS RAISED FOR.
 *
 * 231 -> 260, on 2026-08-18, by the single minting pass; 218 -> 235 the same day
 * by the shell mint that followed it; and 235 -> 239 by the reader-chrome mint
 * the owner's ruling on ReaderShell required, in the same session. Read the
 * distinction before you touch this number again, because it is the whole point:
 *
 *   · MINTING a utility legitimately adds an unconsumed line. The theme is
 *     named ahead of the screens on purpose — guards.test.ts bans `text-[…]`,
 *     `rounded-[…]` and `shadow-[…]`, so a value with no name cannot be written
 *     at all, and the name therefore has to exist before its consumer does. The
 *     first mint added 33 such lines — 29 from the spec, then 3 for the
 *     type-on-the-violet-field group and StatTile's numeral-to-dot gap. The
 *     shell mint added 9 more, for the reason the first one missed them: it
 *     minted from the SCREENS, and the two shells and the summary screen were
 *     left writing fourteen values out by hand. The reader-chrome mint added 4,
 *     which is a ruling landing and not a screen slipping: ReaderShell was
 *     written from the PANEL's numbers, and three of the eleven values the
 *     design draws instead had no name at all.
 *   · CONSUMING a utility, or failing to, may never add one. A screen that lands
 *     without writing the classes it was minted for is a screen that is not
 *     finished, and the number below is what says so.
 *
 * So: a raise is legal only in the same commit as a deliberate mint of the
 * theme, and BOTH mints have now happened — tailwind.config.js, tokens.css and
 * roles.css are re-frozen behind the second, and no third is planned. If you are
 * here because a task you are writing has pushed PENDING past the number below,
 * the answer is not this line — either the task has stopped consuming something
 * it should still consume, or it has added a theme key it has no consumer for,
 * and R11 forbids the second.
 *
 * The number is the count plus ten, which is the headroom rule the 231 was set
 * by, kept so a task that legitimately STOPS using a utility can put its line
 * back without needing this edit.
 * ---------------------------------------------------------------------------
 */
// RAISED 2026-08-18 against PENDING.length === 229 — the shell mint's 9 names
// and the reader-chrome mint's 4, all unconsumed until Tasks 12, 13 and 16 land.
// The count before the two mints was 216, under a ceiling of 218 that had been
// LOWERED the same day against a then-count of 218; two of those lines were
// consumed between that edit and this one.
const CEILING = 239

describe('Owner ruling R11 — a named utility has a component that uses it', () => {
  it('reads a real, sizeable set of component files — tests AND test helpers excluded', () => {
    // Both ledger assertions compare a derived list to a list, so a scan that
    // read nothing would report every class as unconsumed and a scan that read
    // the tests would report almost none. Pin both ends of it.
    expect(COMPONENTS.length).toBeGreaterThan(50)
    expect(COMPONENTS.some((f) => f.path.endsWith('/src/ui/DataTable.tsx'))).toBe(true)

    const byName = COMPONENTS.filter((f) => /\.test\./.test(f.path)).map((f) => f.path)
    expect(byName, 'a `.test.` file is being read as a component').toEqual([])

    const byDir = COMPONENTS.filter((f) => f.path.includes(`${TEST_DIR}/`)).map((f) => f.path)
    expect(
      byDir,
      'src/test/ is test infrastructure, not components: a11y.ts, setup.ts, utils.tsx and ' +
      'reactflow-mock.ts carry no `.test.` in their names, and a filename-only exclusion read ' +
      'all four of them as consumers of whatever they happened to mention.',
    ).toEqual([])
    // …and the exclusion is load-bearing, not decorative. Its predecessor
    // pinned that with `expect(written('w-touch')).toBe(false)` — and `w-touch`
    // is F11's 44px floor utility, on PENDING, which Task 11 onward will
    // legitimately write. Its first honest use turned two tests red, one of
    // them with a bare `expected true to be false`. This marker is a string no
    // component can ever want, and it is matched against the RAW text of every
    // scanned file, so it cannot be defused by comment-stripping either.
    const MARKER = 'zz-only-a-test-file-writes-this'
    for (const f of ['src/ui/table.test.tsx', 'src/test/a11y.ts']) {
      expect(
        readFileSync(resolve(process.cwd(), f), 'utf8'),
        `${f} no longer carries the marker this pin needs, so the pin proves nothing. Put ` +
        `\`${MARKER}\` back, or move it to another file this scan must not read.`,
      ).toContain(MARKER)
    }
    expect(
      COMPONENT_TEXT.includes(MARKER),
      'a file that only a test writes has entered the component set, so every class those tests ' +
      'mention now reads as consumed and the ledger below is worthless.',
    ).toBe(false)
    // The matcher itself, both ways round, so neither test below can pass by
    // saying "yes" or "no" to everything.
    expect(written('rounded-doc')).toBe(true)
    expect(written('rounded-nonesuch')).toBe(false)
  })

  it('counts a class a component WRITES, and not one it merely mentions', () => {
    // The scan, against the three shapes that defeated its predecessor — run on
    // synthetic sources so this states the rule rather than depending on which
    // file happens to contain what today.
    const scan = (text: string) => consumedSource([{ path: '/src/ui/Synthetic.tsx', text }])
    const holds = (text: string, klass = 'bg-warm') => written(klass, scan(text))
    const render_ = 'export function A() { return <i className="p-s4" /> }'
    // Written — in the attribute, and in anything the attribute reads.
    expect(holds('export function A() { return <i className="bg-warm" /> }')).toBe(true)
    expect(holds(`const K = 'bg-warm'\nexport function A() { return <i className={K} /> }`)).toBe(true)
    expect(holds(`const M = { a: 'bg-warm' }\nexport function A() { return <i className={M.a} /> }`)).toBe(true)
    expect(holds(`const L = 'bg-warm'\nconst K = \`\${L} p-s4\`\nexport function A() { return <i className={K} /> }`)).toBe(true)
    // Not written — a line comment, a block comment, and a declaration that
    // nothing renders. All three were green.
    expect(holds(`// TODO(task-14): this row will want bg-warm.\n${render_}`)).toBe(false)
    expect(holds(`/** …until then, bg-warm has no consumer. */\n${render_}`)).toBe(false)
    expect(holds(`const UNUSED = ['bg-warm'] as const\nvoid UNUSED\n${render_}`)).toBe(false)
  })

  it('RENDERS each of the three minted grid templates onto a real element', async () => {
    // The assertion R11 asked for, in the only form that can answer it. Its
    // predecessor asked whether src/ui/DataTable.tsx CONTAINED the three
    // strings, which a docstring satisfies — and the reason it gave for
    // demanding a literal ("an assembled `grid-cols-${key}` is invisible to
    // Tailwind's scanner and would emit nothing") was false for this repo:
    // tailwind.config.js has ./tailwind-probe.txt in `content` and all 351
    // utilities live there, built from a file that spells no literal anywhere.
    //
    // So this renders the component instead and reads the class off the
    // element, then compiles that class and checks it carries the minted track
    // list. Delete the `template` prop and all three go red; assemble the name
    // from its key and all three stay green, which is correct — the class
    // reaches the element either way.
    for (const [template, klass, token] of GRID_TEMPLATES) {
      const { container, unmount } = render(createElement(DataTable<TRow>, {
        label: 'کاربران', columns: T_COLUMNS, rows: T_ROWS,
        rowKey: (r: TRow) => r.id, empty: 'خالی', template,
      }))
      const lines = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
      expect(lines, `${template}: the table rendered no head and no rows`)
        .toHaveLength(1 + T_ROWS.length)
      for (const line of lines) {
        expect(
          Array.from(line.classList),
          `${template}: the rendered element does not carry \`${klass}\`, so nothing in the app ` +
          `reaches ${token} — which is the whole of what R11 asked.`,
        ).toContain(klass)
        // An inline `gridTemplateColumns` beats a class unconditionally, so a
        // template that sat BESIDE one would be named on the element and
        // ignored by the browser. Naming it is not using it.
        expect(line.style.gridTemplateColumns, `${template}: an inline template overrides the class`)
          .toBe('')
      }
      unmount()

      const { decls } = await build([klass])
      expect(decls.get(klass), `${klass} emits no rule`).toBeDefined()
      expect(decls.get(klass)).toContain(`grid-template-columns: var(${token})`)
    }
  })

  it('keeps PENDING exactly accurate — no orphan off the list, no stale line on it', () => {
    const orphans = probeClasses().filter((c) => !consumed(c) && !PENDING.includes(c))
    expect(
      orphans,
      `${orphans.length} utilities the theme names have no consumer and are not on PENDING. ` +
      'Either write them into the component they were minted for, or add them to the list in ' +
      'src/test/theme.test.ts with the task that will consume them. A mention in a comment, and ' +
      'a declaration nothing renders, are not consumers.',
    ).toEqual([])

    const stale = PENDING.filter((c) => consumed(c))
    expect(
      stale,
      `${stale.length} utilities on PENDING now HAVE a consumer. Delete these lines from the ` +
      'list — that is how it empties, and Task 25 asserts it is empty.',
    ).toEqual([])
    // The list may only ever name utilities this theme actually has, or it
    // becomes a place to park typos where nothing else looks.
    const ghosts = PENDING.filter((c) => !probeClasses().includes(c))
    expect(ghosts, 'PENDING names classes the theme does not').toEqual([])
    expect(PENDING.filter((c, i) => PENDING.indexOf(c) !== i)).toEqual([])
  })

  it('is a list that shrinks — Task 25 asserts it is empty', () => {
    expect(
      PENDING.length,
      `PENDING is ${PENDING.length} lines against a ceiling of ${CEILING}. The ceiling is not a ` +
      'budget to spend: the accuracy test above already forces every line to be a genuine orphan. ' +
      'If a task has genuinely orphaned this many utilities, the theme should lose them rather ' +
      'than the number go up — this line may be LOWERED, never raised.',
    ).toBeLessThanOrEqual(CEILING)
  })
})
