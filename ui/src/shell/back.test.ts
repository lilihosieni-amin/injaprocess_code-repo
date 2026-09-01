import { describe, it, expect, afterEach } from 'vitest'
import { canGoBack, isProcessView, sheetHere, traySection } from './back'

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

describe('traySection', () => {
  // §6.0's `inScreen` is a SECTION test, and this is the assertion that says so
  // — `PanelShell` shipped `pathname === n.to` for one commit, which agrees with
  // the design on `/departments` and disagrees on every other route in the
  // section. It could not be caught through a render: the tray is drawn only on
  // `/departments` (`home ? topBar() : crumbStrip()`), so the one route a
  // rendered test can reach is the one route the two predicates agree on.
  it('lights «دپارتمان‌ها» across the whole department section, not just its list', () => {
    for (const path of [
      '/departments',
      '/departments/dining',
      '/departments/dining/overview',
      '/processes/dining-003',
      '/processes/dining-003/flow',
      '/processes/dining-003/steps',
    ]) {
      expect(traySection(path), path).toBe('/departments')
    }
  })

  it('lights «داده‌های کمّی» on the facts list and on one entry', () => {
    // The second is Task 23's route, and it is pinned here rather than left to
    // that task: a detail screen that arrives with an unlit tray is exactly the
    // defect this function was written for.
    expect(traySection('/facts')).toBe('/facts')
    expect(traySection('/facts/F-00011')).toBe('/facts')
  })

  it('lights neither on an administration screen, where the design lights «مدیریت»', () => {
    for (const path of ['/users', '/users/7', '/visibility', '/profile']) {
      expect(traySection(path), path).toBeNull()
    }
  })

  it('does not read a sibling whose name merely starts the same way', () => {
    // A bare `startsWith` without the separator would put `/factsheet` in the
    // facts section and `/profiles` in administration.
    expect(traySection('/factsheet')).toBe('/departments')
    expect(traySection('/profiles')).toBe('/departments')
  })
})

describe('sheetHere', () => {
  // The mobile sheet is drawn on EVERY route, so unlike the tray this one is
  // reachable — and §6.0 binds its rows with the same `inScreen` the tray uses
  // (`menuItems`, Inja Panel.dc.html:5097), so the two surfaces answer one rule.
  it('carries «دپارتمان‌ها» across the whole section, as the tray does', () => {
    for (const path of [
      '/departments', '/departments/dining', '/departments/dining/overview',
      '/processes/dining-003', '/processes/dining-003/flow', '/processes/dining-003/steps',
    ]) {
      expect(sheetHere(path, '/departments'), path).toBe(true)
      expect(sheetHere(path, '/facts'), path).toBe(false)
    }
  })

  it('lights «داده‌های کمّی» on one entry, not only on the list', () => {
    // Task 23's route. The whole reason this is being fixed now rather than
    // deferred: the sheet is drawn on the detail screen, so an exact match
    // would have shipped that screen with its own row dark.
    expect(sheetHere('/facts', '/facts')).toBe(true)
    expect(sheetHere('/facts/F-00011', '/facts')).toBe(true)
    expect(sheetHere('/facts/F-00011', '/departments')).toBe(false)
  })

  it('lights «کاربران» on one person’s record, which the exact match did not', () => {
    // The pre-existing defect this fix also closes, named rather than found
    // later: `/users/{id}` is the access screen, the sheet draws a «کاربران»
    // row on it, and that row was dark.
    expect(sheetHere('/users', '/users')).toBe(true)
    expect(sheetHere('/users/7', '/users')).toBe(true)
    expect(sheetHere('/users/7', '/visibility')).toBe(false)
    expect(sheetHere('/users/7', '/departments')).toBe(false)
  })

  it('lights the other two administration rows on their own screens only', () => {
    expect(sheetHere('/visibility', '/visibility')).toBe(true)
    expect(sheetHere('/profile', '/profile')).toBe(true)
    expect(sheetHere('/visibility', '/profile')).toBe(false)
    // …and no administration screen lights a tray row, which is §6.0's
    // `inScreen('depts')` being false wherever `inAdmin` is true.
    for (const path of ['/users', '/users/7', '/visibility', '/profile']) {
      expect(sheetHere(path, '/departments'), path).toBe(false)
      expect(sheetHere(path, '/facts'), path).toBe(false)
    }
  })

  it('does not read a sibling whose name merely starts the same way', () => {
    expect(sheetHere('/profiles', '/profile')).toBe(false)
    expect(sheetHere('/factsheet', '/facts')).toBe(false)
  })
})
