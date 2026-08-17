import { expect, test } from '@playwright/test'
import type { Department } from '../src/api/types'
import type { PerWidth } from './_harness'
import {
  atWidth, CARD_SHADOW, DESIGN, expandPadding, expectDesign, serve, shadowOf, signedIn, WIDTHS,
} from './_harness'

/**
 * The harness's own gate.
 *
 * Every assertion in `_harness.ts` is copied into twenty-one later screen
 * checks, so a rule that is wrong here is wrong twenty-one times. Three of them
 * had never been executed by any screen — the card shadow, the "no shadow"
 * case, and the scoping of the content hooks — which is exactly how a value
 * that can never match sits in a template for a whole rebuild. They are
 * executed here.
 */

const DEPARTMENTS: Department[] = [
  { code: 'management', name: 'مدیریت', count: 4, subs: 1, conflicts: 0 },
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
  { code: 'warehouse', name: 'انبار', count: 5, subs: 2, conflicts: 0 },
]

test('shadowOf strips Tailwind’s ring layers, so CARD_SHADOW is reachable', async ({ page }) => {
  await signedIn(page)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  await page.goto('/departments')
  await page.locator('[data-screen="departments"]').waitFor()

  const measured = await page.evaluate(() => {
    const probe = document.createElement('div')
    document.body.append(probe)
    const read = (className: string) => {
      probe.className = className
      return getComputedStyle(probe).getPropertyValue('box-shadow')
    }
    const out = { card: read('shadow-card'), none: read('shadow-none'), bare: read('') }
    probe.remove()
    return out
  })

  // What the browser actually prints for `shadow-card`: four layers, the first
  // two of them Tailwind's unset ring, which no design document mentions.
  expect(measured.card).toBe(
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, ' +
    'rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px',
  )
  // So a raw comparison against the design's number can never pass …
  expect(measured.card).not.toBe(CARD_SHADOW)
  // … and through `shadowOf` it does. This is the pair that stops the next
  // screen task from "fixing" its red by pasting the browser's string into
  // CARD_SHADOW: doing that turns the line above red.
  expect(shadowOf(measured.card)).toBe(CARD_SHADOW)

  // "No shadow" is answerable for the same reason: Tailwind's `shadow-none` is
  // three transparent layers, not the keyword. Whether that class is emitted in
  // this build or not, the normalised answer is `none`.
  expect(shadowOf(measured.none)).toBe('none')
  expect(shadowOf(measured.bare)).toBe('none')
  expect(shadowOf(
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, ' +
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px',
  )).toBe('none')
})

test('the content hooks are read inside the screen, never document-wide', async ({ page }) => {
  await signedIn(page)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  await page.goto('/departments')
  await page.locator('[data-screen="departments"]').waitFor()

  // Decoys in the shell's topbar — outside `[data-screen]`, wearing every
  // content hook and none of the screen's numbers. This is the shape of the
  // real hazard: twenty-one screens are about to add these attributes, some to
  // overlays and shell chrome that co-exist with a screen, and a decoy whose
  // value happened to match would grade the wrong element in silence.
  await page.evaluate(() => {
    const host = document.querySelector('header')!
    for (const attr of ['data-col', 'data-h1', 'data-body', 'data-card', 'data-grid']) {
      const decoy = document.createElement('div')
      decoy.setAttribute(attr, '')
      decoy.setAttribute('style',
        'font-size:22px;font-weight:400;color:rgb(1,2,3);max-width:11px;width:11px;' +
        'border-top-left-radius:1px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr')
      // Prepended, so a document-wide `.first()` would find the decoy, not the screen.
      host.prepend(decoy)
    }
  })

  await expectDesign(page, 'departments')
})

test('the design table holds at least one width-dependent expectation', () => {
  // R7's gate is only real if something differs between the three projects.
  // Every other property this harness reads — max-width, font-size, padding,
  // radius, transform — computes to its declared value at every viewport, so
  // 1080 and 760 would cost 3× and prove 1×.
  const used = WIDTHS.map((w) => atWidth(w, DESIGN.departments.columnWidth))
  expect(new Set(used).size).toBeGreaterThan(1)
})

test('atWidth resolves a per-width record and refuses an unlisted width', () => {
  const perWidth: PerWidth<string> = { 1440: 'a', 1080: 'b', 760: 'c' }
  expect(atWidth(1440, perWidth)).toBe('a')
  expect(atWidth(1080, perWidth)).toBe('b')
  expect(atWidth(760, perWidth)).toBe('c')
  expect(atWidth(1440, 'flat')).toBe('flat')
  expect(atWidth(999, 'flat')).toBe('flat')
  // A fourth project added without extending the table must not grade nothing.
  expect(() => atWidth(999, perWidth)).toThrow(/not one of 1440 \/ 1080 \/ 760/)
})

test('expandPadding takes the whole 1–4 value shorthand', () => {
  expect(expandPadding('30px')).toEqual({ top: '30px', right: '30px', bottom: '30px', left: '30px' })
  expect(expandPadding('30px 40px'))
    .toEqual({ top: '30px', right: '40px', bottom: '30px', left: '40px' })
  expect(expandPadding('38px 40px 48px'))
    .toEqual({ top: '38px', right: '40px', bottom: '48px', left: '40px' })
  // The four-value form is where the old parser was silently wrong: it
  // destructured `[top, x, bottom]` and then asserted padding-left against `x`,
  // i.e. against the **right** value.
  expect(expandPadding('1px 2px 3px 4px'))
    .toEqual({ top: '1px', right: '2px', bottom: '3px', left: '4px' })
  expect(expandPadding('  38px   40px  ').top).toBe('38px')
  expect(() => expandPadding('')).toThrow(/1 to 4 lengths/)
  expect(() => expandPadding('1px 2px 3px 4px 5px')).toThrow(/1 to 4 lengths/)
})
