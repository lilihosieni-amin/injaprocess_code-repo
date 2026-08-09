import { expect } from 'vitest'

/**
 * F11 — 44px minimum touch target. jsdom reports no layout, so we assert the
 * class contract that produces the size rather than a computed box.
 */
export function expectTouchTarget(el: HTMLElement) {
  expect(el.className).toMatch(/\bmin-h-touch\b/)
  expect(el.className).toMatch(/\bmin-w-touch\b/)
}
