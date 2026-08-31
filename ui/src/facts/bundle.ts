import { isRestricted, type FactBundle, type FactRef } from '../api/types'
import { SCREEN_LABELS, label } from '../lib/factsLabels'
import { toFa } from '../lib/format'

/**
 * Reading the three name maps `GET /api/facts/{fid}` serves beside an entry —
 * `resolved`, `row_titles`, `path_labels` — and the one rule that governs all
 * three: **a neighbour the caller may not open arrives as `{restricted: true}`
 * and has no name at all** (`api/types.ts`'s `Restricted`, the owner's ruling of
 * 2026-08-31). Every reader here narrows before it reads a title, and the
 * masked answer is «خارج از دسترسی شما» — settled copy, in `factsLabels.ts` and
 * in spec Appendix D.
 *
 * Pure functions over the bundle, in their own module rather than inside a
 * component, because conformance note 2 makes them the whole of how the screen
 * gets Persian: nothing on the detail screen may reach for a `KEY_FA`-style
 * dictionary, so *these* are what stand in its place and they are worth a test
 * of their own.
 */

/** One neighbour's name, and whether the caller may open it. */
export interface Named {
  /** The Persian to draw — a title, or «خارج از دسترسی شما». */
  text: string
  /**
   * An item's estate code — `##1`, `#61` — **kept apart from the title**.
   *
   * §17 renders it beside the title, and the design composes the two into one
   * string (`refTitle`, :4747). That string is a latin run inside a Persian text
   * node and the browser reorders it: «پنیر پیتزا ##1» is drawn «پنیر پیتزا
   * 1##». It is conformance note 6's defect in a second place, so the code
   * travels separately and every renderer draws it as its own island.
   */
  code?: string
  /** `true` ⇒ masked: draw the text, never a link (QF-23). */
  restricted: boolean
  /**
   * The `F-…` id to navigate to, when there is one.
   *
   * **Absent for an item key**, and that is the served shape rather than an
   * omission: `facts_store._labels` maps an item's key to `{kind, title, code?}`
   * with **no id** (`facts_store.py:291`), so a `refItems` cell can be *named*
   * and cannot be *opened*. The design navigates from one (`refGo((s.fLabels
   * [raw] || {}).id || raw)`, :4906) because its own fixture carries an `id`
   * the route does not serve.
   */
  id?: string
}

/** An `F-…` id is its own destination; an item key is not (see `Named.id`). */
const FACT_ID = /^F-\d+$/

const masked = (): Named => ({
  text: label(SCREEN_LABELS, 'restricted_neighbour'), restricted: true,
})

/**
 * The Persian title for an id, an item key or a process id — conformance
 * note 2's replacement for the design's `refTitle` (:4742).
 *
 * The estate code rides beside an item's title where there is one, as §17
 * requires — but as a field of its own rather than joined into the string the
 * design joins it into. See `Named.code`.
 *
 * A ref the map does not carry answers `undefined` rather than the raw ref: the
 * store drops a dangling target on purpose (`facts_store.resolved_map`), so the
 * absence *is* the orphan, and the caller draws Appendix D's «ارجاع بی‌مقصد»
 * for it rather than printing a key at a reader.
 */
export function resolvedTitle(bundle: FactBundle, ref: string): Named | undefined {
  const found = bundle.resolved[ref]
  if (found === undefined) return undefined
  if (isRestricted(found)) return masked()
  return {
    text: found.title,
    code: found.code,
    restricted: false,
    id: FACT_ID.test(ref) ? ref : undefined,
  }
}

/** The same, for a `{ref}` edge. `field` and `row` narrow the cell, not the name. */
export const refTitle = (bundle: FactBundle, ref: FactRef | undefined | null) =>
  ref === undefined || ref === null ? undefined : resolvedTitle(bundle, ref.ref)

/**
 * A row key → the row's Persian title (§17). Every row key is in the map, so a
 * miss means the row is not the entry's — never that it has no name.
 */
export function rowTitle(bundle: FactBundle, key: string): Named | undefined {
  const found = bundle.row_titles[key]
  if (found === undefined) return undefined
  return isRestricted(found) ? masked() : { text: found, restricted: false }
}

/** A QF-7 path → «ستون — ردیف» (§17). Used by the accounts card's grouping. */
export function pathLabel(bundle: FactBundle, path: string): Named | undefined {
  const found = bundle.path_labels[path]
  if (found === undefined) return undefined
  return isRestricted(found) ? masked() : { text: found, restricted: false }
}

/**
 * Whether a path is red, and which kind of red — **conformance note 3**.
 *
 * The served `red_paths` and nothing else. The design paints «واحد ثبت نشده» on
 * every numeric column that carries no `unit` (`sfRecFields`, :4978), which
 * reddens a confirmed entry's `day` and `year` columns; an omitted `unit` is
 * "not applicable" and only a present-and-`null` one is «بی‌پاسخ» (QF-6). The
 * server has already made that distinction — `_null_paths` walks the entry for
 * leaves that are literally `null` — so the client makes it again by asking
 * this and by computing nothing.
 */
export function redPath(
  bundle: FactBundle, path: string,
): 'disputed' | 'unknown' | undefined {
  if (bundle.red_paths.disputed.includes(path)) return 'disputed'
  if (bundle.red_paths.unknown.includes(path)) return 'unknown'
  return undefined
}

/**
 * «{n} ردیف», and «{n} فعال از {m} ردیف» when some rows are retired (:4892).
 *
 * `toFa` because these are chrome counts, which is the one thing QF-42 sends
 * through it — the ids and keys beside them stay Latin.
 */
export function rowCount(all: number, live: number): string {
  const n = live === all
    ? toFa(live)
    : label(SCREEN_LABELS, 'row_count_live').replace('{n}', toFa(live)).replace('{m}', toFa(all))
  return label(SCREEN_LABELS, 'row_count').replace('{n}', n)
}
