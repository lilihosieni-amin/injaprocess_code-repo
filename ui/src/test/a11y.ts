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
   drawn box is read off the element's own `w-…` class, the inset off its
   `before:-inset-…`, and the two are added.
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

/** The theme's `width` scale — where `w-pager` is `var(--size-pager)`. */
const WIDTHS = ((config as {
  theme?: { extend?: { width?: Record<string, string> } }
}).theme?.extend?.width ?? {}) as Record<string, string>

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

/** The box the control PAINTS, read off its own class string. */
function drawnBox(className: string): { klass: string; px: number } | undefined {
  for (const klass of className.split(/\s+/)) {
    const m = /^w-(.+)$/.exec(klass)
    if (!m) continue
    const arbitrary = /^\[(.+)\]$/.exec(m[1])
    const px = pixels(arbitrary ? arbitrary[1] : WIDTHS[m[1]])
    if (px !== undefined) return { klass, px }
  }
  return undefined
}

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
  const on = (msg: string) => `${msg}\n  on: <${el.tagName.toLowerCase()} class="${cls}">`

  expect(cls, on(
    'the hit area is a `::before` overlay, and an absolutely positioned ::before is placed against ' +
    'the nearest POSITIONED ancestor — without `relative` on the control itself the target grows ' +
    'around some other box entirely, and nothing about that is visible',
  )).toMatch(/\brelative\b/)

  expect(cls, on(
    'no `before:absolute` — a static ::before takes part in the layout, so it moves the glyph ' +
    'instead of overlaying the control',
  )).toMatch(/\bbefore:absolute\b/)

  const grow = /\bbefore:-inset-\[(\d+(?:\.\d+)?)px\]/.exec(cls)
  expect(grow, on(
    `no \`before:-inset-[Npx]\` — nothing grows the hit area past the drawn box, so this control is ` +
    `only as big as it looks and F11's ${TOUCH}px floor is unmet`,
  )).not.toBeNull()

  const box = drawnBox(cls)
  expect(box, on(
    'the drawn box is not stated on the control (no `w-<key>` this theme knows, and no `w-[Npx]`), ' +
    'so the hit area can only be pattern-matched, not measured — which is how a 5px inset would ' +
    'come to sit on a 32px box',
  )).toBeDefined()

  const drawn = box!.px
  const inset = Number(grow![1])
  const reach = drawn + 2 * inset

  expect(drawn, on(
    `the control paints ${drawn}px (\`${box!.klass}\`), which already meets the ${TOUCH}px floor. ` +
    'The plan\'s rule is that a drawn control is never inflated to the floor, so either this box is ' +
    'wrong or this is not the helper for it — a control that is genuinely 44px is asserted with ' +
    'expectTouchTarget instead',
  )).toBeLessThan(TOUCH)

  expect(reach, on(
    `the drawn box is ${drawn}px (\`${box!.klass}\`) and the ::before adds ${inset}px on every side, ` +
    `so the hit area is ${reach}px where F11 needs ${TOUCH}px. A ${drawn}px box takes ` +
    `before:-inset-[${(TOUCH - drawn) / 2}px]`,
  )).toBeGreaterThanOrEqual(TOUCH)
}
