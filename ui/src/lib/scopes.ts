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

/** The Persian name of a report kind, or `undefined` for one this deployment
 *  does not serve.
 *
 *  **The wording comes from the backend registry** (D26) — `GET /api/reports`,
 *  through `useReports()` — and not from a table here. A kind added to the
 *  registry must appear in the permission UI with no frontend change, which a
 *  hard-coded `Record` is exactly what prevents: it was the second of the two
 *  hand-synchronised lists the registry exists to retire.
 *
 *  **Not a fallback to the raw id**: the caller has to be able to tell "a kind
 *  I can draw a control for" from "a kind I can only quote", and a function that
 *  always answers a string cannot say so. An empty `reports` — the registry has
 *  not arrived, or the request failed — therefore quotes every kind rather than
 *  silently widening a report-scoped grant into a department-wide one on screen.
 */
export function reportLabel(kind: string, reports: Record<string, string>): string | undefined {
  return reports[kind]
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

export function scopeLabel(scope: string, names: Record<string, string>,
                            reports: Record<string, string>): string {
  const parsed = parseScope(scope)
  if (parsed.shape === 'every') return EVERY_DEPARTMENT
  // Anything the grammar refuses is shown verbatim — see `ParsedScope`.
  if (parsed.shape === 'refused') return scope
  const name = names[parsed.code] ?? parsed.code
  if (parsed.shape === 'department') return name
  const report = reportLabel(parsed.report, reports)
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
export function scopesLabel(scopes: string[], names: Record<string, string>,
                             reports: Record<string, string>): string {
  if (scopes.length === 0) return NO_DEPARTMENT
  return scopes.map((s) => scopeLabel(s, names, reports)).join('، ')
}
