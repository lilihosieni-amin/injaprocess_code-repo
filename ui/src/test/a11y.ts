import { expect } from 'vitest'

/**
 * F11 — 44px minimum touch target. jsdom reports no layout, so we assert the
 * class contract that produces the size rather than a computed box.
 */
export function expectTouchTarget(el: HTMLElement) {
  expect(el.className).toMatch(/min-h-touch/)
  expect(el.className).toMatch(/min-w-touch/)
}
