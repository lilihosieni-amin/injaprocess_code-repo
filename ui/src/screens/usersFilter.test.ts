import { describe, it, expect } from 'vitest'
import { NO_FILTERS, anyActive, matches, filterOptions, reachedCodes } from './usersFilter'
import type { AdminUser } from '../api/users'

const base: AdminUser = {
  id: 1, username: '09120000001', displayName: 'سحر بیات', roleId: 3, role: 'admin',
  capabilities: [], scopes: ['dept:dining'], supervisor: null, canSupervise: false,
  disabled: false, createdAt: 1700000000,
}

/**
 * The test's own reading of a row's departments, and deliberately **not**
 * `reachedCodes`.
 *
 * The plan's fixture was `(u) => u.scopes` — the raw stored keys — against a
 * `matches` that compares bare codes, so `dept:dining` never equalled `dining`
 * and its own first assertion could not pass. Worse, a fixture that agrees with
 * the default answers nothing about the seam: a `matches` that ignored its
 * fourth argument and called `reachedCodes` itself would be green either way.
 * This one answers a code the default cannot produce, so the injection is
 * proved rather than assumed.
 */
const codes = (u: AdminUser) =>
  u.scopes.flatMap((s) => (s.startsWith('dept:') ? [s.slice(5), `${s.slice(5)}-alias`] : []))

const names = { dining: 'سالن', cashier: 'صندوق' }

describe('usersFilter', () => {
  it('searches the name and the number and nothing else', () => {
    expect(matches(base, 'سحر', NO_FILTERS, codes)).toBe(true)
    // Persian keyboards emit ۰۹…; the stored number is ASCII (D57).
    expect(matches(base, '۰۹۱۲۰۰۰۰۰۰۱', NO_FILTERS, codes)).toBe(true)
    // The role moved to its own dropdown; typing it must no longer match.
    expect(matches(base, 'مدیر', NO_FILTERS, codes)).toBe(false)
    // …nor the stored identifier, which is the other half of the search this
    // screen used to offer and the half a partial rewrite would leave behind.
    expect(matches(base, 'admin', NO_FILTERS, codes)).toBe(false)
  })

  it('treats a query of nothing but spaces as no query at all', () => {
    // `q.trim()`, and it is not decoration: a filter bar whose field holds a
    // stray space would otherwise match nobody and read as «this installation
    // has no users».
    expect(matches(base, '   ', NO_FILTERS, codes)).toBe(true)
  })

  it('ANDs the four dropdowns with the query', () => {
    const f = { ...NO_FILTERS, role: 'admin', status: 'disabled' as const }
    expect(matches(base, '', { ...NO_FILTERS, role: 'admin' }, codes)).toBe(true)
    expect(matches(base, '', { ...NO_FILTERS, role: 'editor' }, codes)).toBe(false)
    expect(matches(base, '', f, codes)).toBe(false)
    expect(matches({ ...base, disabled: true }, '', f, codes)).toBe(true)
    // …and the query is ANDed with them rather than replaced by them: this row
    // satisfies the dropdown and not the text.
    expect(matches(base, 'نادر', { ...NO_FILTERS, role: 'admin' }, codes)).toBe(false)
  })

  it('reads `active` as the opposite of `disabled`, not as "any"', () => {
    // The status filter is one field carrying two values, so a predicate that
    // only ever implemented the `disabled` half passes every assertion above.
    expect(matches(base, '', { ...NO_FILTERS, status: 'active' }, codes)).toBe(true)
    expect(matches({ ...base, disabled: true }, '', { ...NO_FILTERS, status: 'active' }, codes))
      .toBe(false)
  })

  it('matches a supervisor by their id, and nobody else\'s', () => {
    const under = {
      ...base,
      supervisor: { id: 9, username: '09129', displayName: 'مریم', disabled: false },
    }
    expect(matches(under, '', { ...NO_FILTERS, supervisor: '9' }, codes)).toBe(true)
    expect(matches(under, '', { ...NO_FILTERS, supervisor: '21' }, codes)).toBe(false)
    // Somebody with no supervisor at all is not swept in by an empty-string
    // comparison, which is what `String(u.supervisor?.id ?? '')` is guarding.
    expect(matches(base, '', { ...NO_FILTERS, supervisor: '9' }, codes)).toBe(false)
  })

  it('filters on a department the account actually reaches, `*` included', () => {
    expect(matches(base, '', { ...NO_FILTERS, dept: 'dining' }, codes)).toBe(true)
    expect(matches(base, '', { ...NO_FILTERS, dept: 'cashier' }, codes)).toBe(false)
    // The injected reading is the one that decides, not `reachedCodes`.
    expect(matches(base, '', { ...NO_FILTERS, dept: 'dining-alias' }, codes)).toBe(true)
    const every = { ...base, scopes: ['*'] }
    // `*` is every department, including any added tomorrow — so it matches
    // whichever one is asked for rather than none of them.
    expect(matches(every, '', { ...NO_FILTERS, dept: 'cashier' }, codes)).toBe(true)
  })

  it('reads the scopes itself when nobody hands it a reading', () => {
    // The screen calls `matches(u, q, filters)` with three arguments, so the
    // default parameter is the code path the product actually runs and every
    // assertion above steps over it.
    expect(matches(base, '', { ...NO_FILTERS, dept: 'dining' })).toBe(true)
    expect(matches(base, '', { ...NO_FILTERS, dept: 'cashier' })).toBe(false)
  })

  it('reads a report-narrowed scope as reaching its department', () => {
    // `dept:cashier/report:steps` is a scope over one report of one department.
    // Dropped, a head narrowed to a report vanishes from their own department's
    // filter; widened to `*`, they appear under every department there is.
    expect(reachedCodes({ ...base, scopes: ['dept:cashier/report:steps'] })).toEqual(['cashier'])
    // A stored scope the grammar refuses reaches nothing, and is not a crash.
    expect(reachedCodes({ ...base, scopes: [''] })).toEqual([])
    expect(reachedCodes({ ...base, scopes: ['*'] })).toEqual([])
  })

  it('offers only options the listing actually contains, each once', () => {
    /*
     * **Every list below is in an order the listing cannot produce by
     * accident.** The three rows are handed over role-`editor` first, scope
     * `dining` first and supervisor `9` first — so on all three fields the
     * order a `Set` or a `Map` preserves is NOT the order asserted, and a
     * dropped `.sort()` fails rather than agreeing by coincidence. Two rows
     * share a role, two share a department and two share a supervisor, so a
     * dropped de-duplication fails as well.
     */
    const مریم = { id: 9, username: '09129', displayName: 'مریم', disabled: false }
    const آرش = { id: 4, username: '09124', displayName: 'آرش', disabled: false }
    const listing = [
      { ...base, id: 1, role: 'editor', scopes: ['dept:dining'], supervisor: مریم },
      { ...base, id: 2, role: 'admin', scopes: ['dept:cashier'], supervisor: مریم },
      { ...base, id: 3, role: 'admin', scopes: ['dept:dining'], supervisor: آرش },
    ]
    const o = filterOptions(listing, names)
    expect(o.roles.map((r) => r.value)).toEqual(['admin', 'editor'])
    expect(o.roles[0].label).toBe('مدیر')
    expect(o.supervisors).toEqual([{ value: '4', label: 'آرش' },
                                   { value: '9', label: 'مریم' }])
    expect(o.depts).toEqual([{ value: 'cashier', label: 'صندوق' },
                             { value: 'dining', label: 'سالن' }])
  })

  it('names a department the registry has not answered for by its stored code', () => {
    // `useDepartments` is a second request, and it lands after the listing. A
    // dropdown that dropped the unnamed ones would lose options for a frame;
    // one that printed «undefined» would print it for a frame.
    const o = filterOptions([base], {})
    expect(o.depts).toEqual([{ value: 'dining', label: 'dining' }])
  })

  it('knows when the clear-filters link belongs on screen', () => {
    expect(anyActive(NO_FILTERS)).toBe(false)
    expect(anyActive({ ...NO_FILTERS, dept: 'dining' })).toBe(true)
    // Every one of the four, because a link drawn off `role` alone leaves the
    // other three unclearable — and R5's rule is about the control being there
    // exactly when there is something for it to do.
    expect(anyActive({ ...NO_FILTERS, role: 'admin' })).toBe(true)
    expect(anyActive({ ...NO_FILTERS, supervisor: '9' })).toBe(true)
    expect(anyActive({ ...NO_FILTERS, status: 'active' })).toBe(true)
  })
})
