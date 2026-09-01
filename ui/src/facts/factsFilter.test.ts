import { describe, it, expect } from 'vitest'
import { NO_FILTERS, UNIVERSAL, anyActive, matches, type FactFilters } from './factsFilter'
import type { FactListRow } from '../api/types'

/**
 * One row per case the four predicates and the search have to tell apart.
 *
 * Nothing is shared between them that a predicate reads: the kinds differ, the
 * scopes differ in shape (universal / department-only / department+branch), the
 * confirmation differs, and the searchable fields — title, id, aliases — differ
 * row by row. A filter that returned the wrong row would otherwise pass on a
 * field the two rows happen to agree about.
 */
const row = (over: Partial<FactListRow>): FactListRow => ({
  id: 'F-00001', kind: 'item', key: 'ing_1', title: 'پنیر پیتزا', aliases: [],
  scope: { departments: [], branches: [] },
  status: 'confirmed', retired: false, stub: false,
  red_counts: { unknown: 0, disputed: 0 },
  fingerprint: 'a1', confirmed: true, updated_at: '2026-09-16T14:05:00Z',
  ...over,
})

/** Universal — no department and no branch. `confirmed`. */
const CHEESE = row({})
/** A `record` in one department and one branch, unconfirmed, with an alias. */
const NIGHT = row({
  id: 'F-00011', kind: 'record', key: 'night', title: 'مانده شب فرنگی و برگر',
  aliases: ['شمارش پایان شب'],
  scope: { departments: ['cooking'], branches: ['chalebagh'] },
  status: 'unknown', confirmed: false, red_counts: { unknown: 4, disputed: 0 },
})
/** A `rule` in another department, no branch. */
const TOLERANCE = row({
  id: 'F-00026', kind: 'rule', key: 'tol', title: 'تلورانس هر واحد',
  scope: { departments: ['management'], branches: [] },
})

const ROWS = [CHEESE, NIGHT, TOLERANCE]
const kept = (q: string, f: FactFilters = NO_FILTERS) =>
  ROWS.filter((r) => matches(r, q, f)).map((r) => r.id)

describe('anyActive', () => {
  it('is false with nothing set and no query', () => {
    expect(anyActive(NO_FILTERS, '')).toBe(false)
  })

  it('is true for each filter on its own, and for a query on its own', () => {
    expect(anyActive({ ...NO_FILTERS, kind: 'rule' }, '')).toBe(true)
    expect(anyActive({ ...NO_FILTERS, dept: 'cooking' }, '')).toBe(true)
    expect(anyActive({ ...NO_FILTERS, branch: 'chalebagh' }, '')).toBe(true)
    expect(anyActive({ ...NO_FILTERS, confirmation: 'confirmed' }, '')).toBe(true)
    expect(anyActive(NO_FILTERS, 'پنیر')).toBe(true)
  })

  it('reads a query of nothing but spaces as no query', () => {
    // Otherwise the clear-filters link appears for a stray space in a field
    // that is filtering nothing — `matches` trims, so the two have to agree.
    expect(anyActive(NO_FILTERS, '   ')).toBe(false)
  })
})

describe('matches — the four filters', () => {
  it('keeps every row when nothing is set', () => {
    expect(kept('')).toEqual(['F-00001', 'F-00011', 'F-00026'])
  })

  it('filters by kind', () => {
    expect(kept('', { ...NO_FILTERS, kind: 'rule' })).toEqual(['F-00026'])
    expect(kept('', { ...NO_FILTERS, kind: 'record' })).toEqual(['F-00011'])
  })

  it('filters by department', () => {
    expect(kept('', { ...NO_FILTERS, dept: 'cooking' })).toEqual(['F-00011'])
    expect(kept('', { ...NO_FILTERS, dept: 'management' })).toEqual(['F-00026'])
  })

  it('answers «سراسری» with the entries that name no department at all', () => {
    // `Inja Panel.dc.html:4647` — the `__u` option is not a department code, it
    // is the absence of one, and an entry bound to a department is not universal
    // however many branches it also names.
    expect(kept('', { ...NO_FILTERS, dept: UNIVERSAL })).toEqual(['F-00001'])
  })

  it('filters by branch', () => {
    expect(kept('', { ...NO_FILTERS, branch: 'chalebagh' })).toEqual(['F-00011'])
    expect(kept('', { ...NO_FILTERS, branch: 'naharkhoran' })).toEqual([])
  })

  it('filters by confirmation, which is the served boolean and nothing else', () => {
    expect(kept('', { ...NO_FILTERS, confirmation: 'confirmed' }))
      .toEqual(['F-00001', 'F-00026'])
    expect(kept('', { ...NO_FILTERS, confirmation: 'unconfirmed' })).toEqual(['F-00011'])
  })

  it('reads a scope with neither array as universal rather than throwing', () => {
    // `FactScope`'s two arrays are both optional and the route serves
    // `entry.get("scope") or {}`, so an entry with no scope object reaches the
    // client as `{}` — which is universal, not "matches nothing".
    const bare = row({ id: 'F-00099', scope: {} })
    expect(matches(bare, '', { ...NO_FILTERS, dept: UNIVERSAL })).toBe(true)
    expect(matches(bare, '', { ...NO_FILTERS, dept: 'cooking' })).toBe(false)
    expect(matches(bare, '', { ...NO_FILTERS, branch: 'chalebagh' })).toBe(false)
  })

  it('ANDs the filters together', () => {
    expect(kept('', { ...NO_FILTERS, kind: 'record', dept: 'cooking' })).toEqual(['F-00011'])
    expect(kept('', { ...NO_FILTERS, kind: 'record', dept: 'management' })).toEqual([])
  })
})

describe('matches — the search', () => {
  it('matches a title by substring', () => {
    expect(kept('پیتزا')).toEqual(['F-00001'])
  })

  it('matches an id case-insensitively', () => {
    expect(kept('f-00026')).toEqual(['F-00026'])
    expect(kept('F-00026')).toEqual(['F-00026'])
  })

  it('matches an alias', () => {
    // «نام‌های دیگر» is what the estate's staff called the thing before it was
    // titled; a search that misses them tells a reviewer the entry is not there.
    expect(kept('شمارش پایان شب')).toEqual(['F-00011'])
  })

  it('trims the query, so a trailing space does not empty the list', () => {
    expect(kept('  پیتزا  ')).toEqual(['F-00001'])
  })

  it('is ANDed with the filters', () => {
    expect(kept('پیتزا', { ...NO_FILTERS, kind: 'rule' })).toEqual([])
  })
})
