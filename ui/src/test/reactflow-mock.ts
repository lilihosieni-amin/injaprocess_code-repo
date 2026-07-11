import { vi } from 'vitest'

// Minimal shims so <ReactFlow> mounts and measures nodes under jsdom.
export function installReactFlowMocks() {
  // Fire the callback asynchronously on observe() so ReactFlow measures nodes after effects settle.
  class RO {
    private cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) { this.cb = cb }
    observe(target: Element) {
      Promise.resolve().then(() => {
        this.cb([{ target, contentRect: { width: 100, height: 40 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      })
    }
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
  ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
    m22 = 1
    constructor(_t?: string) {}
  }
  if (!HTMLElement.prototype.getBoundingClientRect.toString().includes('mock')) {
    HTMLElement.prototype.getBoundingClientRect = function mock() {
      return { x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, toJSON() {} } as DOMRect
    }
  }
  // jsdom always returns 0 for offsetWidth/offsetHeight; ReactFlow uses these to measure nodes.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 100 } })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 40 } })
  // jsdom lacks SVGElement.getBBox; ReactFlow's EdgeText uses it to size the label background.
  if (typeof SVGElement !== 'undefined') {
    ;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = function () {
      return { x: 0, y: 0, width: 40, height: 14, toJSON() {} } as DOMRect
    }
  }
  ;(window as unknown as { matchMedia: unknown }).matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}
