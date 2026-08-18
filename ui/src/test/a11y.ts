/*
 * Test infrastructure, not a component. src/test/theme.test.ts's R11 scan pins
 * that by looking for the marker below in every file it reads: this file lives
 * under src/test/, which that scan excludes by DIRECTORY — a filename-only
 * exclusion (`!/\.test\./`) read it, setup.ts, utils.tsx and reactflow-mock.ts
 * as components, so every class they mentioned counted as consumed.
 *
 *   marker: zz-only-a-test-file-writes-this
 */
import { expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import config from '../../tailwind.config.js'

/**
 * F11 — 44px minimum touch target. jsdom reports no layout, so we assert the
 * class contract that produces the size rather than a computed box.
 */
export function expectTouchTarget(el: HTMLElement) {
  expect(el.className).toMatch(/\bmin-h-touch\b/)
  expect(el.className).toMatch(/\bmin-w-touch\b/)
}

/* -------------------------------------------------------------------------
   The 44px floor against the design's own control ladder.

   F11 wants 44px and the design draws 30/32/34/36/40/42, and no resizing
   satisfies both: growing the drawn control changes every bar it sits in (it is
   what forced every process row from ~22px to 44px), and shrinking the target
   is the thing F11 forbids. The plan's one rule for the whole sub-project is
   therefore: the PAINTED box stays the design's, and a transparent `::before`
   grows the HIT AREA to 44. Nothing about the ::before paints, which is why the
   design has no opinion about it.

   The two halves of that rule are two different numbers, and the second is what
   this file has to measure. `before:-inset-[5px]` is right on the pager's 34px
   button and wrong on the 32px close control in src/ui/Overlay.tsx, which takes
   6px — so a helper that pattern-matched one literal inset would pass the
   control it was written against and reject a correctly built sibling. The
   drawn box is read off the element's own `w-…` AND `h-…` classes, the inset
   off its `before:-inset-…`, and the two are added on each axis separately.
   ------------------------------------------------------------------------- */

/**
 * Every custom property the app declares, in cascade order: the four frozen
 * `_ds` files, then `src/styles/tokens.css`, then the `:root` block of
 * `src/styles/roles.css` — the PANEL end of R3's surface scale, which is the
 * smaller of the two values a `--role-*` size takes, so a floor that holds
 * against it holds on the reader too.
 */
function declaredValues(): Map<string, string> {
  const entry = resolve(process.cwd(), 'src/styles/tokens.css')
  const files = [
    ...[...readFileSync(entry, 'utf8').matchAll(/@import\s+'([^']+)'/g)]
      .map((m) => resolve(dirname(entry), m[1])),
    entry,
  ]
  const values = new Map<string, string>()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
      values.set(m[1], m[2].trim())
    }
  }
  const roles = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  for (const m of (/:root\s*\{([^}]*)\}/.exec(roles)?.[1] ?? '')
    .matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
    if (!values.has(m[1])) values.set(m[1], m[2].trim())
  }
  return values
}

const VALUES = declaredValues()

/**
 * The theme scale a `w-…` / `h-…` utility can be minted from.
 *
 * Two scales, not one: Tailwind derives `width` and `height` from `spacing` as
 * well as from their own keys, so `w-tick-row` — which the theme names only
 * under `spacing` — is a legal, emitting utility. Reading `width` alone rejected
 * it with "no `w-<key>` this theme knows", which is a lie about the theme and
 * sends whoever hits it looking for a key that is already there. The axis' own
 * key wins where both define one, exactly as Tailwind resolves it.
 */
function axisScale(axis: 'width' | 'height'): Record<string, string> {
  const extend = ((config as {
    theme?: { extend?: Record<string, Record<string, string> | undefined> }
  }).theme?.extend ?? {}) as Record<string, Record<string, string> | undefined>
  return { ...(extend.spacing ?? {}), ...(extend[axis] ?? {}) }
}

/** `w-` reads the width scale, `h-` the height scale. Both fall back to spacing. */
const SCALES = { w: axisScale('width'), h: axisScale('height') } as const

/** A length in px, following `var(--x)` back to the number behind it. */
function pixels(value: string | undefined): number | undefined {
  let v = value?.trim()
  for (let hop = 0; v !== undefined && hop < 5; hop++) {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(v)
    if (!m) break
    v = VALUES.get(m[1])?.trim()
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(v ?? '')
  return px ? Number(px[1]) : undefined
}

const TOUCH = (() => {
  const v = pixels('var(--size-touch)')
  if (v === undefined) {
    throw new Error('src/test/a11y.ts: --size-touch is not a px length, so no hit area can be measured against it')
  }
  return v
})()

/* -------------------------------------------------------------------------
   Reading a class STRING is not reading a box.

   Four separate holes were opened by treating the class list as a set of
   literals to pattern-match: `min-w-touch` beside `w-pager` (min-width beats
   width, so the control paints the 44px the plan forbids), `before:content-[none]`
   (matches `before:content-[…]` and generates no box), two `w-…` classes on one
   element (CSS resolves them by EMITTED order, and reading the first in
   CLASS-STRING order is the exact mistake src/ui/table.test.tsx's `paint`/
   `winner` docstring warns about), and a `::before` that is told not to draw.

   So the box is RESOLVED here rather than matched: every class token is split
   into its variants and its utility, the axis is computed the way the used
   value is computed (`max(min-width, min(width, max-width))`), an ambiguous
   double statement is refused instead of guessed at, and anything that removes
   the ::before's box — `hidden`, `invisible`, `scale-0`, a `content` of `none`,
   an `overflow` that clips it — is refused by name.

   Why not compile the class string through Tailwind, as `paint`/`winner` do?
   Because Tailwind's PostCSS plugin is declared `async`, so the whole pipeline
   is a promise, and this helper is called SYNCHRONOUSLY from
   src/ui/fields.test.tsx and will be called from twenty more. Making it async
   would turn every existing call into a floating promise that asserts nothing
   and still exits 0 — the defect this file exists to prevent, introduced by the
   fix for it. The compiled counterpart is asserted on the real controls in
   src/ui/table.test.tsx ("draws the design's 34px box and grows the target
   around it"), which reads width, min-width, overflow, pointer-events and the
   ::before's own display/content/inset out of the emitted sheet.
   ------------------------------------------------------------------------- */

/**
 * One class token, split into its variant prefixes and the utility it ends in.
 *
 * `md:before:-inset-[5px]` is `['md', 'before']` + `-inset-[5px]`. The split
 * ignores a `:` inside `[]` or `()`, so an arbitrary value can hold one without
 * being read as a variant chain.
 */
function parse(raw: string) {
  const pieces: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === ':' && depth === 0) { pieces.push(raw.slice(start, i)); start = i + 1 }
  }
  pieces.push(raw.slice(start))
  const variants = pieces.slice(0, -1)
  return {
    raw,
    variants,
    utility: pieces[pieces.length - 1],
    /** Does this class apply to the ::before rather than to the control? */
    pseudo: variants.includes('before'),
    /** Does it apply only at some widths / in some state? */
    conditional: variants.some((v) => v !== 'before'),
  }
}

type Token = ReturnType<typeof parse>

/** The px length a `w-…`/`h-…`/`min-w-…`/`size-…` utility resolves to, if any. */
function lengthOf(utility: string, prefix: string, axis: 'w' | 'h'): number | undefined {
  const m = new RegExp(`^${prefix}-(.+)$`).exec(utility)
  if (!m) return undefined
  const arbitrary = /^\[(.+)\]$/.exec(m[1])
  return pixels(arbitrary ? arbitrary[1] : SCALES[axis][m[1]])
}

/**
 * Every class on this element that states a length on `axis`, as
 * `{ klass, px }`. `size-…` states both axes at once, so it answers to both.
 */
function boxes(tokens: Token[], prefix: '' | 'min' | 'max', axis: 'w' | 'h') {
  const head = prefix === '' ? axis : `${prefix}-${axis}`
  const out: { klass: string; px: number; conditional: boolean }[] = []
  for (const t of tokens) {
    if (t.pseudo) continue
    const px = lengthOf(t.utility, head, axis) ?? lengthOf(t.utility, `${prefix === '' ? '' : `${prefix}-`}size`, axis)
    if (px !== undefined) out.push({ klass: t.raw, px, conditional: t.conditional })
  }
  return out
}

/** The axis names, for a message that says which one is short. */
const AXIS = { w: 'wide', h: 'tall' } as const
const LONG = { w: 'width', h: 'height' } as const

/**
 * Utilities that leave the ::before with no hittable box, whatever the inset
 * says. Every one of them compiles, and none of them is visible in a jsdom
 * test, a snapshot or a build.
 */
const NO_BOX: Record<string, string> = {
  hidden: 'sets `display: none`, and a ::before that is not displayed is not generated at all',
  invisible: 'sets `visibility: hidden`, which stops the box catching a pointer',
  'scale-0': 'scales the box to nothing',
  'scale-x-0': 'scales the box to nothing on one axis',
  'scale-y-0': 'scales the box to nothing on one axis',
  'w-0': 'overrides the width the inset gives it',
  'h-0': 'overrides the height the inset gives it',
  'size-0': 'overrides the size the inset gives it',
  static: 'takes the ::before out of the overlay and back into the layout',
  relative: 'takes the ::before out of the overlay and back into the layout',
  fixed: 'anchors the ::before to the viewport rather than to the control',
  sticky: 'takes the ::before out of the overlay and back into the layout',
  'pointer-events-none': 'is the one declaration that makes the hit area stop being one',
}

/**
 * `overflow` values on the CONTROL that clip its own `::before` back to the
 * drawn box. The overlay is bigger than its parent by design; anything that
 * clips the parent's paint area cuts the hit area back to what it looks like.
 */
const CLIPS = new Set([
  'overflow-hidden', 'overflow-clip', 'overflow-auto', 'overflow-scroll',
  'overflow-x-hidden', 'overflow-y-hidden', 'overflow-x-clip', 'overflow-y-clip',
  'overflow-x-auto', 'overflow-y-auto', 'overflow-x-scroll', 'overflow-y-scroll',
])

/**
 * Asserts that a control drawn smaller than F11's floor carries a transparent
 * `::before` that brings its hit area up to it — the 34×34 pager button inside
 * a 44×44 target, and the same for every other rung of the design's ladder.
 *
 * It measures the hit area rather than the drawn box: a control whose painted
 * size already meets the floor is a different (and, for this ladder, forbidden)
 * thing, and `expectTouchTarget` is what asserts that one.
 */
export function expectExpandedHitArea(el: HTMLElement) {
  const cls = el.className
  // Split first, and match whole class names from here on. `/\brelative\b/`
  // also matches inside `md:relative`, because `\b` sits between the `:` and
  // the `r` — so a control that is only positioned above 768px, or whose
  // ::before is only absolute below 760, passed a helper that read the raw
  // string. A class is a whitespace-delimited token; so is the assertion.
  const tokens = cls.split(/\s+/).filter(Boolean).map(parse)
  const on = (msg: string) => `${msg}\n  on: <${el.tagName.toLowerCase()} class="${cls}">`
  /** A class that applies to the control itself, at every width and in every state. */
  const base = (utility: string) =>
    tokens.some((t) => !t.pseudo && !t.conditional && t.utility === utility)
  /** The same, on the ::before. */
  const onBefore = (utility: string) =>
    tokens.some((t) => t.pseudo && !t.conditional && t.utility === utility)

  expect(base('relative'), on(
    'no unconditional `relative` — the hit area is a `::before` overlay, and an absolutely ' +
    'positioned ::before is placed against the nearest POSITIONED ancestor, so without `relative` ' +
    'on the control ITSELF the target grows around some other box entirely, and nothing about ' +
    'that is visible. A variant-prefixed `md:relative` is not this: it leaves the phone, which is ' +
    'the only place a thumb needs the target, growing around the wrong element',
  )).toBe(true)

  expect(onBefore('absolute'), on(
    'no unconditional `before:absolute` — a static ::before takes part in the layout, so it moves ' +
    'the glyph instead of overlaying the control. A variant-prefixed one (`max760:before:absolute`) ' +
    'is a static ::before at every other width',
  )).toBe(true)

  // The ::before's content. `before:content-[…]` used to be pattern-matched,
  // which `before:content-[none]` satisfies while setting `content: none` — the
  // one value that defeats the check's own purpose.
  const content = tokens.find((t) => t.pseudo && !t.conditional && /^content-/.test(t.utility))
  expect(content, on(
    'no `before:content-[…]` — a ::before with no content property generates no box at all, so ' +
    'the inset below grows nothing and the control is only as big as it looks',
  )).toBeDefined()
  const value = /^content-\[(.*)\]$/.exec(content?.utility ?? '')?.[1] ?? content?.utility.slice('content-'.length)
  expect(['none', 'normal'].includes(String(value)), on(
    `\`${content?.raw}\` sets \`content: ${value}\`, and that generates no box at all — it is the ` +
    'one value that passes a `before:content-[…]` spelling check and leaves the hit area exactly ' +
    "as big as the control looks. The empty string (`before:content-['']`) is what draws a box",
  )).toBe(false)

  // Anything that removes the ::before's box, at any width, in any state.
  for (const t of tokens) {
    if (!t.pseudo) continue
    const why = NO_BOX[t.utility]
    if (why === undefined) continue
    expect(t.raw, on(
      `\`${t.raw}\` ${why}. The ::before IS the hit area: it measures ${TOUCH}px and catches ` +
      'nothing. A variant-prefixed form is the same hole at the widths it covers',
    )).toBe('')
  }

  // …and the same three, one level up, on the control itself.
  for (const t of tokens) {
    if (t.pseudo) continue
    if (t.utility === 'pointer-events-none') {
      expect(t.raw, on(
        `\`${t.raw}\` on the CONTROL — pointer-events is inherited, so this takes the ::before ` +
        'with it. The strictly weaker `before:pointer-events-none` is refused above; this is that ' +
        'hole with the control included',
      )).toBe('')
    }
    if (CLIPS.has(t.utility)) {
      expect(t.raw, on(
        `\`${t.raw}\` on the CONTROL clips its own ::before back to the drawn box. The overlay is ` +
        'deliberately bigger than the element that generates it, so an overflow that clips the ' +
        'parent cuts the hit area back to exactly what the control looks like',
      )).toBe('')
    }
  }

  // The inset, at EVERY width it is stated for. `md:before:-inset-[1px]` beside
  // a base `[5px]` is a 44px target below 768px and a 36px one above it, and a
  // check that read the unconditional class alone called that correct.
  const insets = tokens
    .filter((t) => t.pseudo)
    .map((t) => ({ t, m: /^-inset-\[(\d+(?:\.\d+)?)px\]$/.exec(t.utility) }))
    .filter((x): x is { t: Token; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ klass: x.t.raw, px: Number(x.m[1]), conditional: x.t.conditional }))
  expect(insets.some((i) => !i.conditional), on(
    `no unconditional \`before:-inset-[Npx]\` — nothing grows the hit area past the drawn box, so ` +
    `this control is only as big as it looks and F11's ${TOUCH}px floor is unmet. A variant ` +
    `prefix (\`md:before:-inset-[5px]\`) is the same miss on every width it does not cover`,
  )).toBe(true)
  const thinnest = insets.reduce((a, b) => (b.px < a.px ? b : a))

  // BOTH axes. `-inset-` grows all four sides, but the drawn box has two
  // numbers and only one of them used to be read: `w-pager h-chevron` is 44
  // wide and 25 tall, and a helper that scanned `w-…` alone called that a 44px
  // target. The design's ladder is square today; nothing makes it stay square.
  for (const axis of ['w', 'h'] as const) {
    const stated = boxes(tokens, '', axis)
    const unconditional = stated.filter((b) => !b.conditional)

    expect(unconditional.length > 0, on(
      `the drawn box is not stated on the control (no \`${axis}-<key>\` this theme knows on its ` +
      `${LONG[axis]} or spacing scale, and no \`${axis}-[Npx]\`), so the hit ` +
      'area can only be pattern-matched, not measured — which is how a 5px inset would come to sit ' +
      'on a 32px box',
    )).toBe(true)

    expect(unconditional.map((b) => b.klass).join(' + '), on(
      `two classes state this control's ${LONG[axis]} at once. Which one wins is decided by ` +
      "Tailwind's EMITTED order and not by the order of the class string, so the drawn box here " +
      'cannot be read, only guessed at — state it once',
    )).toBe(unconditional[0]?.klass ?? '')

    // The USED value, not the `width` declaration: `min-width` beats `width`
    // whenever it is larger, so `w-pager min-w-touch` paints the 44px control
    // the plan forbids while still naming the design's 34.
    const width = unconditional[0]
    const mins = boxes(tokens, 'min', axis).filter((b) => !b.conditional)
    const maxes = boxes(tokens, 'max', axis).filter((b) => !b.conditional)
    let decides = width
    let drawn = width.px
    for (const m of maxes) if (m.px < drawn) { drawn = m.px; decides = m }
    for (const m of mins) if (m.px > drawn) { drawn = m.px; decides = m }

    expect(drawn, on(
      `the control paints ${drawn}px ${AXIS[axis]} (\`${decides.klass}\`), which already meets the ` +
      `${TOUCH}px floor. The plan's rule is that a drawn control is never inflated to the floor, ` +
      'so either this box is wrong or this is not the helper for it — a control that is genuinely ' +
      '44px is asserted with expectTouchTarget instead',
    )).toBeLessThan(TOUCH)

    // The narrowest the box is ever stated, against the thinnest the inset is
    // ever stated: a control that shrinks at one breakpoint and grows at none
    // is unhittable exactly there, and there is nothing to see.
    const narrowest = stated.reduce((a, b) => (b.px < a.px ? b : a), width)
    const reach = narrowest.px + 2 * thinnest.px

    expect(reach, on(
      `the drawn box is ${narrowest.px}px ${AXIS[axis]} (\`${narrowest.klass}\`) and the ::before adds ` +
      `${thinnest.px}px on every side (\`${thinnest.klass}\`), so the hit area is ${reach}px ${AXIS[axis]} where F11 needs ` +
      `${TOUCH}px. ` +
      `A ${narrowest.px}px box takes before:-inset-[${(TOUCH - narrowest.px) / 2}px]`,
    )).toBeGreaterThanOrEqual(TOUCH)
  }
}
