import { DEPT_CODES } from '../lib/departments'

export interface Crumb {
  label: string
  /** Absent on the last crumb — that is where you already are. */
  to?: string
  /**
   * A latin id. The shell draws it monospaced and pins it left-to-right (§8);
   * the attribute that does the pinning is written in `PanelShell.tsx`, which is
   * the file `guards.test.ts` declares as this sub-project's second island. It
   * is deliberately not spelled here — a comment naming it would make this file
   * an undeclared island too, and the guard reads comments.
   */
  mono?: boolean
}

const HOME = 'دپارتمان‌ها'

const FLAT: Record<string, string> = {
  users: 'کاربران',
  visibility: 'سیاست نمایش محتوا',
  profile: 'پروفایل و گذرواژه',
}

/**
 * The trail the design's crumb strip carries (§6.0), derived from the URL.
 *
 * Deriving rather than publishing — a context each screen pushes its own crumbs
 * into — because every panel route names its subject in the path, and the one
 * label that is not in the path, a department's Persian name, is already in the
 * `['departments']` query the shell holds. `deptName` is a parameter rather than
 * a hook call so this stays a pure function with a test of its own.
 *
 * `/processes/{pid}` has no department segment. The department is recovered from
 * the id, but only via the one thing `allocate-id` guarantees — a process id is
 * `{dept}-{nnn}` — and the prefix is checked against DEPT_CODES before it is
 * trusted. A hand-typed id therefore gets a **shorter** trail, never a wrong one.
 */
export function panelCrumbs(pathname: string, deptName: (code: string) => string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)

  if (parts[0] === 'departments') {
    if (parts.length === 1) return [{ label: HOME }]
    const code = parts[1]
    const home: Crumb = { label: HOME, to: '/departments' }
    if (parts[2] === 'overview') {
      return [
        home,
        { label: `دپارتمان ${deptName(code)}`, to: `/departments/${code}` },
        { label: `خلاصهٔ ${deptName(code)}` },
      ]
    }
    return [home, { label: `دپارتمان ${deptName(code)}` }]
  }

  if (parts[0] === 'processes' && parts[1] !== undefined) {
    const pid = parts[1]
    const code = pid.slice(0, pid.lastIndexOf('-'))
    const trail: Crumb[] = [{ label: HOME, to: '/departments' }]
    if (DEPT_CODES.includes(code)) {
      trail.push({ label: `دپارتمان ${deptName(code)}`, to: `/departments/${code}` })
    }
    if (parts[2] === 'flow') {
      trail.push({ label: pid, to: `/processes/${pid}`, mono: true }, { label: 'فلوچارت' })
    } else {
      trail.push({ label: pid, mono: true })
    }
    return trail
  }

  if (parts[0] === 'users' && parts[1] !== undefined) {
    return [{ label: 'کاربران', to: '/users' }, { label: 'دسترسی' }]
  }

  const flat = FLAT[parts[0] ?? '']
  return flat === undefined ? [{ label: HOME }] : [{ label: flat }]
}
