import { toLatinDigits } from '../lib/digits'
import { roleLabel } from '../lib/roles'
import { parseScope } from '../lib/scopes'
import type { AdminUser } from '../api/users'

/**
 * What the four dropdowns above the table hold, and the one predicate that
 * reads them (§6.7).
 *
 * Pure, and in its own module deliberately: jsdom renders nothing, so the
 * screen's Playwright check is what proves the table *looks* right — and a
 * predicate tested only through a rendered row is a predicate nobody can put
 * a case to. Everything decidable without a browser is decided here.
 *
 * **The search is over the name and the number only.** It used to be over the
 * role as well, which was right while the role was the one thing on the row
 * you could not otherwise narrow by; it now has a dropdown of its own, and a
 * query that silently matches a column with its own control is a filter that
 * disagrees with the filter beside it.
 *
 * **Nothing here is ever the whole of a refusal.** The listing this filters is
 * the one the server already decided the caller may read — `manage_users` at
 * `*`, so every account in it — and NFR-12 is answered upstairs, by the screen
 * not being reachable at all (`administrationRefusal`, 404 before 403 per D56).
 * A filter that hid rows the caller may not see would be exactly the defect
 * NFR-12 names: data sent and then withheld by the screen.
 */
export interface UserFilters {
  role: string | null
  supervisor: string | null
  status: 'active' | 'disabled' | null
  dept: string | null
}

export const NO_FILTERS: UserFilters =
  { role: null, supervisor: null, status: null, dept: null }

export function anyActive(f: UserFilters): boolean {
  return f.role !== null || f.supervisor !== null || f.status !== null || f.dept !== null
}

/** Every department code an account reaches, `*` answered as "all of them". */
export function reachedCodes(u: AdminUser): string[] {
  return u.scopes.flatMap((s) => {
    const p = parseScope(s)
    return p.shape === 'department' || p.shape === 'report' ? [p.code] : []
  })
}

export function matches(
  u: AdminUser, q: string, f: UserFilters,
  deptCodes: (u: AdminUser) => string[] = reachedCodes,
): boolean {
  const query = q.trim()
  const digits = toLatinDigits(query)
  if (query !== '' && !u.displayName.includes(query) && !u.username.includes(digits)) {
    return false
  }
  if (f.role !== null && u.role !== f.role) return false
  if (f.supervisor !== null && String(u.supervisor?.id ?? '') !== f.supervisor) return false
  if (f.status !== null && (f.status === 'disabled') !== !!u.disabled) return false
  if (f.dept !== null) {
    // `*` is not "the nine departments there are today" — it is everything,
    // including whatever is added tomorrow — so it satisfies any department
    // asked for rather than dropping the account out of the list.
    if (u.scopes.includes('*')) return true
    if (!deptCodes(u).includes(f.dept)) return false
  }
  return true
}

/**
 * The options each dropdown offers — **derived from the listing, never from a
 * registry**. A role nobody holds, or a department nobody reaches, is a filter
 * that can only ever produce «کاربری با این نام پیدا نشد»: R5's rule about
 * controls, applied to the contents of a menu.
 *
 * The design derives its role menu from the role registry instead
 * (`Inja Panel.dc.html:3727`, `this.ROLES.filter(canDelegateRole …)`), which is
 * the one place this differs from it and is reported as such.
 */
export function filterOptions(users: AdminUser[], names: Record<string, string>) {
  const roles = [...new Set(users.map((u) => u.role).filter((r): r is string => !!r))]
    .sort().map((value) => ({ value, label: roleLabel(value) }))
  const sup = new Map<string, string>()
  for (const u of users) if (u.supervisor) sup.set(String(u.supervisor.id), u.supervisor.displayName)
  const supervisors = [...sup].sort((a, b) => a[1].localeCompare(b[1], 'fa'))
    .map(([value, label]) => ({ value, label }))
  const depts = [...new Set(users.flatMap(reachedCodes))].sort()
    .map((value) => ({ value, label: names[value] ?? value }))
  return { roles, supervisors, depts }
}
