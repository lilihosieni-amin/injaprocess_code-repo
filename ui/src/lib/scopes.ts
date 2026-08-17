import type { ExportKind } from '../api/types'

/**
 * How a scope is written for a person to read (spec D10, D52), and the one place
 * the grammar is taken apart.
 *
 * The stored form is a grammar — `*`, `dept:{code}`, `dept:{code}/report:{kind}`
 * — and it is what every check is decided from, here and on the server. This is
 * the *presentation* of one, and nothing decides anything from its output: a
 * department whose Persian name has not arrived (or has been removed from the
 * registry) falls back to the code rather than to a blank, because a scope
 * rendered as nothing reads as "no access" beside a name.
 *
 * `parseScope` is exported beside the labels because the scope *fieldset* has to
 * ask the same question the labels do — "is this the whole department or one
 * report of it?" — and a second regex there would be a second reading of the
 * grammar, which is the copy that comes to disagree.
 */

/** What `*` is called. A department list would be wrong: `*` is not "all nine
 *  departments today", it is everything, including whatever is added tomorrow. */
export const EVERY_DEPARTMENT = 'همهٔ دپارتمان‌ها'

/** What an account with no scope row at all reaches. Storable (`may_delegate`
 *  reads an empty list as vacuously covered) and worth saying in words. */
export const NO_DEPARTMENT = 'هیچ دامنه‌ای'

/**
 * **The report kinds, learned from the exports surface rather than invented
 * here.** `ExportKind` is this app's registry of them — it is what
 * `useCreateExport` puts in the path, what `ExportMenu` asks `export_pdf` about
 * one kind at a time, and it is pinned to the server's `exports.EXPORT_KINDS`
 * (`test_exports.py` asserts that tuple verbatim). Typed `Record<ExportKind, …>`
 * on purpose: a kind added to the union with no wording here is a **compile
 * error**, not a scope checkbox that silently never appears — which is the very
 * defect this file's other half exists to stop one level up.
 *
 * The wording is the *thing reached*, not the act of exporting it:
 * `ExportMenu`'s «خروجی راهنمای گام‌به‌گام» is a button that builds one, and a
 * scope is what somebody may see.
 */
export const REPORT_KIND_LABELS: Record<ExportKind, string> = {
  flowchart: 'مستندات کامل',
  steps: 'راهنمای گام‌به‌گام',
}

/** The kinds themselves, in the order the labels declare them. Derived rather
 *  than restated, so the list and the wording cannot come apart. */
export const REPORT_KINDS = Object.keys(REPORT_KIND_LABELS) as ExportKind[]

/** The Persian name of a report kind, or `undefined` for one this build has
 *  never heard of. **Not a fallback to the raw kind**: the caller has to be able
 *  to tell "a kind I can draw a control for" from "a kind I can only quote", and
 *  a function that always answers a string cannot say so. */
export function reportLabel(kind: string): string | undefined {
  return (REPORT_KIND_LABELS as Record<string, string>)[kind]
}

const DEPT = /^dept:([a-z]+)(?:\/report:([a-z]+))?$/

/**
 * One scope, taken apart.
 *
 * `refused` is a real answer and not an error: `user_scopes.scope` is `TEXT NOT
 * NULL` with no CHECK, so a row the grammar refuses is storable today, and such
 * an account is covered by nothing — a fact an administrator has to be able to
 * see rather than have prettified away or dropped on the floor.
 */
export type ParsedScope =
  | { shape: 'every' }
  | { shape: 'department'; code: string }
  | { shape: 'report'; code: string; report: string }
  | { shape: 'refused' }

export function parseScope(scope: string): ParsedScope {
  if (scope === '*') return { shape: 'every' }
  const m = DEPT.exec(scope)
  if (m === null) return { shape: 'refused' }
  return m[2] === undefined
    ? { shape: 'department', code: m[1] }
    : { shape: 'report', code: m[1], report: m[2] }
}

export function scopeLabel(scope: string, names: Record<string, string>): string {
  const parsed = parseScope(scope)
  if (parsed.shape === 'every') return EVERY_DEPARTMENT
  // Anything the grammar refuses is shown verbatim — see `ParsedScope`.
  if (parsed.shape === 'refused') return scope
  const name = names[parsed.code] ?? parsed.code
  if (parsed.shape === 'department') return name
  const report = reportLabel(parsed.report)
  // Parenthesised, because `scopesLabel` joins with «، » and «سالن، فقط X، صندوق»
  // cannot be read back as two scopes. A kind with no wording keeps its stored
  // spelling for the same reason a malformed scope does: quoted is legible, and
  // dropped is a person shown as reaching a whole department they do not.
  return report === undefined
    ? `${name}/report:${parsed.report}`
    : `${name} (فقط ${report})`
}

/**
 * Every scope a person holds, never the first of them: a head of two
 * departments shown as covering one is somebody an administrator will believe
 * reaches less than they do, and the single-scope majority makes `scopes[0]`
 * look right everywhere else.
 */
export function scopesLabel(scopes: string[], names: Record<string, string>): string {
  if (scopes.length === 0) return NO_DEPARTMENT
  return scopes.map((s) => scopeLabel(s, names)).join('، ')
}
