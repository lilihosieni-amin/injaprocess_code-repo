import { isRestricted, type FactBundle, type FactRef } from '../api/types'
import { SCREEN_LABELS, label } from '../lib/factsLabels'
import { toFa } from '../lib/format'

/**
 * Reading the three name maps `GET /api/facts/{fid}` serves beside an entry —
 * `resolved`, `row_titles`, `path_labels` — and the one rule that governs
 * `resolved`: **a neighbour the caller may not open arrives as
 * `{restricted: true}` and has no name at all** (`api/types.ts`'s `Restricted`, the owner's ruling of
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
  /** `true` ⇒ the target is retired — a home link says so instead of pressing
   *  into a table nobody fills in any more. */
  retired?: boolean
  /** `true` ⇒ masked: draw the text, never a link (QF-23). */
  restricted: boolean
  /** The `F-…` id to navigate to. Absent for a process id, which this screen
   *  does not open from here. */
  id?: string
}

/** An `F-…` id is its own destination; a process id is opened elsewhere. */
const FACT_ID = /^F-\d+$/

const masked = (): Named => ({
  text: label(SCREEN_LABELS, 'restricted_neighbour'), restricted: true,
})

/**
 * The Persian title for an id or a process id — conformance note 2's
 * replacement for the design's `refTitle` (:4742).
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
    retired: found.retired,
    restricted: false,
    id: FACT_ID.test(ref) ? ref : undefined,
  }
}

/**
 * The same, for a `{ref}` edge — **and the column, where the edge names one.**
 *
 * A `{ref, field}` reads «<record> — <column>», the join `row_titles`
 * already composes with server-side. The owner's question of 2026-09-08 was
 * *which column* a bound input reads, and the record's title alone does not
 * answer it. The columns are the served `resolved[ref].fields` (a record's
 * `data.fields[]`, title falling back to the key); a masked neighbour has no
 * label at all and keeps «خارج از دسترسی شما», and a `row` still narrows the
 * cell rather than the name.
 */
export function refTitle(
  bundle: FactBundle, ref: FactRef | undefined | null,
): Named | undefined {
  if (ref === undefined || ref === null) return undefined
  const named = resolvedTitle(bundle, ref.ref)
  if (named === undefined || named.restricted || ref.field === undefined) return named
  const found = bundle.resolved[ref.ref]
  const column = isRestricted(found) ? undefined : found.fields?.[ref.field]
  return column === undefined ? named : { ...named, text: `${named.text} — ${column}` }
}

/**
 * The same, for an edge that may carry **words instead of a ref** — a
 * measurement's and a rule output's `of` (`refOrText`, spec 2026-09-16 §3.2).
 *
 * Words are what the unit heard and nothing resolves them: they are drawn as
 * they were written, with no id, so `RefLink` prints them and offers no press.
 * An empty string is no answer at all and reads as absent.
 */
export function refOrText(
  bundle: FactBundle, value: FactRef | string | undefined | null,
): Named | undefined {
  if (typeof value === 'string') {
    return value === '' ? undefined : { text: value, restricted: false }
  }
  return refTitle(bundle, value)
}

/**
 * A row key → the row's Persian title (§17). Every row key is in the map, so a
 * miss means the row is not the entry's — never that it has no name.
 */
export function rowTitle(bundle: FactBundle, key: string): Named | undefined {
  const found = bundle.row_titles[key]
  return found === undefined ? undefined : { text: found, restricted: false }
}

/** A QF-7 path → «ستون — ردیف» (§17). Used by the accounts card's grouping. */
export function pathLabel(bundle: FactBundle, path: string): Named | undefined {
  const found = bundle.path_labels[path]
  return found === undefined ? undefined : { text: found, restricted: false }
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

/**
 * The Persian word for a unit symbol — the units record's `unit_title`, served
 * as `unit_titles` beside the entry. `undefined` for a symbol the record does
 * not declare; the card then draws the symbol as its own island (QF-42).
 */
export const unitTitle = (bundle: FactBundle, symbol: string | null | undefined) =>
  symbol == null ? undefined : bundle.unit_titles[symbol]
