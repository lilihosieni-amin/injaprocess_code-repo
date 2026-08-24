import { describe, it, expect, afterEach } from 'vitest'
import { canGoBack, isProcessView } from './back'

/** Replace `window.history.state` without navigating, which jsdom's own
 *  `pushState` would also have to be given a URL for. */
function state(value: unknown) {
  Object.defineProperty(window.history, 'state', { value, configurable: true })
}

afterEach(() => state(null))

describe('canGoBack', () => {
  it('is false at the first entry of this app’s own history', () => {
    // A deep link and a reload both land here — React Router seeds `idx: 0` on
    // the entry it takes over. `-1` there walks the person out of the
    // application, which is the whole reason this predicate exists.
    state({ idx: 0 })
    expect(canGoBack()).toBe(false)
  })

  it('is true once a navigation has happened inside the app', () => {
    state({ idx: 3 })
    expect(canGoBack()).toBe(true)
  })

  it('is false when nothing wrote an index at all', () => {
    // A `MemoryRouter` (every unit test in this repo), a hash router, an entry
    // pushed by something other than the router. "Not known" has to mean "assume
    // not": the caller then draws the URL-derived link it always drew, which is
    // a destination that exists rather than a press that does nothing.
    state(null)
    expect(canGoBack()).toBe(false)
    state({})
    expect(canGoBack()).toBe(false)
  })

  it('does not trust a non-numeric index', () => {
    // `history.state` is whatever the page before us left there — it survives a
    // same-document navigation and is not ours to assume the shape of. `'3' > 0`
    // is true in JavaScript, and a string that happened to be there would have
    // turned the control into a press that leaves the app.
    state({ idx: '3' })
    expect(canGoBack()).toBe(false)
  })
})

describe('isProcessView', () => {
  it('covers the flowchart and «گام‌به‌گام», with or without a trailing slash', () => {
    expect(isProcessView('/processes/dining-003/flow')).toBe(true)
    expect(isProcessView('/processes/dining-003/steps')).toBe(true)
    expect(isProcessView('/processes/dining-003/flow/')).toBe(true)
  })

  it('covers nothing else', () => {
    // Anchored at both ends. `/flowchart` is the near miss a `startsWith` or an
    // unanchored test would take, and the summary is the screen whose «بازگشت»
    // must go on answering the trail.
    expect(isProcessView('/processes/dining-003')).toBe(false)
    expect(isProcessView('/processes/dining-003/flowchart')).toBe(false)
    expect(isProcessView('/processes/dining-003/flow/extra')).toBe(false)
    expect(isProcessView('/departments/dining')).toBe(false)
    expect(isProcessView('/users')).toBe(false)
  })
})
