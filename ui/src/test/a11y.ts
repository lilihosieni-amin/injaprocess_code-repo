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

/**
 * One axis of the box the control PAINTS, read off its own class string.
 *
 * `classes` is already split on whitespace, so `^w-` anchors to a real class
 * boundary: `md:w-pager` is a different box at a different width and is not the
 * base one this helper measures.
 */
function drawnBox(
  classes: string[], axis: 'w' | 'h',
): { klass: string; px: number } | undefined {
  for (const klass of classes) {
    const m = new RegExp(`^${axis}-(.+)$`).exec(klass)
    if (!m) continue
    const arbitrary = /^\[(.+)\]$/.exec(m[1])
    const px = pixels(arbitrary ? arbitrary[1] : SCALES[axis][m[1]])
    if (px !== undefined) return { klass, px }
  }
  return undefined
}

/** The axis names, for a message that says which one is short. */
const AXIS = { w: 'wide', h: 'tall' } as const

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
  const classes = cls.split(/\s+/).filter(Boolean)
  const has = (klass: string) => classes.includes(klass)
  const on = (msg: string) => `${msg}\n  on: <${el.tagName.toLowerCase()} class="${cls}">`

  expect(has('relative'), on(
    'no unconditional `relative` — the hit area is a `::before` overlay, and an absolutely ' +
    'positioned ::before is placed against the nearest POSITIONED ancestor, so without `relative` ' +
    'on the control ITSELF the target grows around some other box entirely, and nothing about ' +
    'that is visible. A variant-prefixed `md:relative` is not this: it leaves the phone, which is ' +
    'the only place a thumb needs the target, growing around the wrong element',
  )).toBe(true)

  expect(has('before:absolute'), on(
    'no unconditional `before:absolute` — a static ::before takes part in the layout, so it moves ' +
    'the glyph instead of overlaying the control. A variant-prefixed one (`max760:before:absolute`) ' +
    'is a static ::before at every other width',
  )).toBe(true)

  expect(classes.some((k) => /^before:content-\[/.test(k)), on(
    'no `before:content-[…]` — a ::before with no content property generates no box at all, so ' +
    'the inset below grows nothing and the control is only as big as it looks',
  )).toBe(true)

  expect(has('before:pointer-events-none'), on(
    '`before:pointer-events-none` — the ::before is the hit area, and this is the one declaration ' +
    'that makes it stop being one. The box still measures 44px and catches nothing',
  )).toBe(false)

  const grow = classes
    .map((k) => /^before:-inset-\[(\d+(?:\.\d+)?)px\]$/.exec(k))
    .find((m): m is RegExpExecArray => m !== null)
  expect(grow, on(
    `no unconditional \`before:-inset-[Npx]\` — nothing grows the hit area past the drawn box, so ` +
    `this control is only as big as it looks and F11's ${TOUCH}px floor is unmet. A variant ` +
    `prefix (\`md:before:-inset-[5px]\`) is the same miss on every width it does not cover`,
  )).toBeTruthy()
  const inset = Number(grow![1])

  // BOTH axes. `-inset-` grows all four sides, but the drawn box has two
  // numbers and only one of them used to be read: `w-pager h-chevron` is 44
  // wide and 25 tall, and a helper that scanned `w-…` alone called that a 44px
  // target. The design's ladder is square today; nothing makes it stay square.
  for (const axis of ['w', 'h'] as const) {
    const box = drawnBox(classes, axis)
    expect(box, on(
      `the drawn box is not stated on the control (no \`${axis}-<key>\` this theme knows on its ` +
      `${axis === 'w' ? 'width' : 'height'} or spacing scale, and no \`${axis}-[Npx]\`), so the hit ` +
      'area can only be pattern-matched, not measured — which is how a 5px inset would come to sit ' +
      'on a 32px box',
    )).toBeDefined()

    const drawn = box!.px
    const reach = drawn + 2 * inset

    expect(drawn, on(
      `the control paints ${drawn}px ${AXIS[axis]} (\`${box!.klass}\`), which already meets the ` +
      `${TOUCH}px floor. The plan's rule is that a drawn control is never inflated to the floor, ` +
      'so either this box is wrong or this is not the helper for it — a control that is genuinely ' +
      '44px is asserted with expectTouchTarget instead',
    )).toBeLessThan(TOUCH)

    expect(reach, on(
      `the drawn box is ${drawn}px ${AXIS[axis]} (\`${box!.klass}\`) and the ::before adds ` +
      `${inset}px on every side, so the hit area is ${reach}px ${AXIS[axis]} where F11 needs ` +
      `${TOUCH}px. ` +
      `A ${drawn}px box takes before:-inset-[${(TOUCH - drawn) / 2}px]`,
    )).toBeGreaterThanOrEqual(TOUCH)
  }
}
