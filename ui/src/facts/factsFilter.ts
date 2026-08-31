import type { FactListRow } from '../api/types'

/**
 * What the four dropdowns above the list hold, and the one predicate that reads
 * them (§14, `Inja Panel.dc.html:4637-4649`).
 *
 * Pure, and in its own module for the reason `usersFilter.ts` gives: jsdom
 * renders nothing, so the screen's Playwright check is what proves the list
 * *looks* right, and a predicate reachable only through a rendered row is one
 * nobody can put a case to.
 *
 * **Nothing here is ever part of a refusal.** Conformance note 5: the listing is
 * what the server serves, `may_serve`-filtered per row for an admin (QF-23), and
 * the client filters nothing on visibility. These four narrow what a reviewer is
 * looking at; they never decide what a reviewer may see.
 */
export interface FactFilters {
  kind: string | null
  /** A department code, or `UNIVERSAL`. */
  dept: string | null
  branch: string | null
  /** The served `confirmed` boolean, as the two words the chip carries. */
  confirmation: 'confirmed' | 'unconfirmed' | null
}

/**
 * The «سراسری» option in the «دپارتمان» menu (`:4639`).
 *
 * It is not a department code and cannot become one: it asks for the entries
 * that name *no* department, which is what makes an entry universal (§6). The
 * design's own sentinel, kept verbatim so the option and the predicate cannot
 * come to disagree about which string means "no department".
 */
export const UNIVERSAL = '__u'

export const NO_FILTERS: FactFilters =
  { kind: null, dept: null, branch: null, confirmation: null }

/**
 * Is anything narrowing the list — `hasFactFilters` (`:4809`), which counts the
 * search box as a fifth filter because clearing "everything" that left a query
 * behind would be a link that visibly does not do what it says.
 *
 * The query is trimmed here exactly as `matches` trims it, so a field holding
 * one space cannot raise the link over a list it is not filtering.
 */
export function anyActive(f: FactFilters, q: string): boolean {
  return f.kind !== null || f.dept !== null || f.branch !== null
    || f.confirmation !== null || q.trim() !== ''
}

/**
 * **The search is over the title, the id and the aliases.**
 *
 * The title and the id are the design's own two (`:4646`). The aliases are the
 * third because «نام‌های دیگر» is what the estate's staff called the thing before
 * anybody titled it — the served row carries them for this — and a search that
 * misses them answers «با این فیلترها داده‌ای نیست» about an entry that is right
 * there.
 *
 * The id folds case and the Persian fields do not: `F-00011` is stored upper and
 * a reviewer types either, while Persian has no case to fold and
 * `toLocaleLowerCase` on it is work that changes nothing.
 */
export function matches(r: FactListRow, q: string, f: FactFilters): boolean {
  const query = q.trim()
  if (query !== ''
    && !r.title.includes(query)
    && !r.id.toLowerCase().includes(query.toLowerCase())
    && !r.aliases.some((a) => a.includes(query))) {
    return false
  }
  if (f.kind !== null && r.kind !== f.kind) return false
  // Both arrays are optional on `FactScope` — the route serves
  // `entry.get("scope") or {}` — so an entry with no scope object at all is
  // universal here rather than an exception two lines down.
  const departments = r.scope.departments ?? []
  const branches = r.scope.branches ?? []
  if (f.dept !== null) {
    if (f.dept === UNIVERSAL ? departments.length !== 0 : !departments.includes(f.dept)) {
      return false
    }
  }
  if (f.branch !== null && !branches.includes(f.branch)) return false
  // QF-25 — one served boolean, and the client never computes a fingerprint
  // (QF-24). A mark whose print no longer matches arrives here as `false`, which
  // is the point: it reads exactly like an entry nobody has ticked.
  if (f.confirmation !== null && (r.confirmed ? 'confirmed' : 'unconfirmed') !== f.confirmation) {
    return false
  }
  return true
}
