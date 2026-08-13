/**
 * How a scope is written for a person to read (spec D10, D52).
 *
 * The stored form is a grammar — `*`, `dept:{code}`, `dept:{code}/report:{kind}`
 * — and it is what every check is decided from, here and on the server. This is
 * the *presentation* of one, and nothing decides anything from its output: a
 * department whose Persian name has not arrived (or has been removed from the
 * registry) falls back to the code rather than to a blank, because a scope
 * rendered as nothing reads as "no access" beside a name.
 */

/** What `*` is called. A department list would be wrong: `*` is not "all nine
 *  departments today", it is everything, including whatever is added tomorrow. */
export const EVERY_DEPARTMENT = 'همهٔ دپارتمان‌ها'

/** What an account with no scope row at all reaches. Storable (`may_delegate`
 *  reads an empty list as vacuously covered) and worth saying in words. */
export const NO_DEPARTMENT = 'هیچ دامنه‌ای'

const DEPT = /^dept:([a-z]+)(\/report:[a-z]+)?$/

export function scopeLabel(scope: string, names: Record<string, string>): string {
  if (scope === '*') return EVERY_DEPARTMENT
  const m = DEPT.exec(scope)
  // Anything the grammar refuses is shown verbatim. `user_scopes.scope` is
  // `TEXT NOT NULL` with no CHECK, so a row the grammar refuses is storable
  // today — and such an account is covered by nothing, which is a fact an
  // administrator has to be able to see rather than have prettified away.
  if (m === null) return scope
  const name = names[m[1]] ?? m[1]
  return m[2] === undefined ? name : `${name}${m[2]}`
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
