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

/** The two views a process has of its own, and what the trail calls each. */
const VIEW: Record<string, string> = {
  flow: 'فلوچارت',
  steps: 'گام‌به‌گام',
}

/**
 * The flat routes — one label each, under the leading «دپارتمان‌ها».
 *
 * `facts` is here rather than as a branch of its own, and that is a **deliberate
 * departure from the design**: `Inja Panel.dc.html:4764` does `crumbs.length = 0`
 * before pushing «داده‌های کمّی», so the facts trail is a single crumb with no
 * home ahead of it. `PanelShell` draws «بازگشت» only on a trail of more than
 * one, so a one-crumb facts screen is a screen with no way back in its chrome —
 * which is exactly the "some pages don't have it at all" that owner ruling R41
 * fixed by seeding every trail with «دپارتمان‌ها».
 */
const FLAT: Record<string, string> = {
  users: 'کاربران',
  visibility: 'سیاست نمایش محتوا',
  profile: 'پروفایل و گذرواژه',
  facts: 'داده‌های کمّی',
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
    // The two ways of reading one document — the canvas and «گام‌به‌گام» — take
    // the same shape of trail, with the process summary as their parent. Written
    // as a lookup rather than two branches so the pair cannot drift: a third
    // view added to `routes.tsx` and not to this map gets the SHORTER trail,
    // which is a correct trail that stops early, never a wrong one.
    const view = VIEW[parts[2] ?? '']
    if (view !== undefined) {
      trail.push({ label: pid, to: `/processes/${pid}`, mono: true }, { label: view })
    } else {
      trail.push({ label: pid, mono: true })
    }
    return trail
  }

  if (parts[0] === 'users' && parts[1] !== undefined) {
    return [{ label: 'کاربران', to: '/users' }, { label: 'دسترسی' }]
  }

  /*
   * **R41.** The three flat administration screens, and the fix for "some pages
   * don't have it at all".
   *
   * `Inja Panel.dc.html:3407` opens EVERY trail with «دپارتمان‌ها» and a `go`
   * that returns there — the array is seeded with it before a single branch
   * runs, and `users`, `policy` and `profile` each push one label onto it
   * (:3413, through `ADMIN_LABEL`). So the deliverable's trail here is two
   * crumbs, and `canBack: s.hist.length > 0 && screen !== 'depts'` (:3451) draws
   * «بازگشت» on all three. Every transition to a screen other than `depts` goes
   * through the prototype's `go()`, which pushes history, and the three that
   * reach `depts` reset it — so that predicate is exactly "not the home screen",
   * and the panel deliverable has a back control on all eight inner routes.
   *
   * This function used to answer a SINGLE crumb with no `to` for these three,
   * and `PanelShell`'s `crumbs.length > 1` therefore left «بازگشت» undrawn on
   * `/users`, `/visibility` and `/profile`. It is one omission and not three:
   * the leading crumb was simply missing, and with it back the strip's existing
   * rule draws the design's control without a special case for a "flat" route.
   *
   * The unknown-route arm keeps its lone crumb, and deliberately: `routes.tsx`'s
   * catch-all redirects an unknown path to `/departments`, so the only caller
   * that reaches it is the home screen itself — where §6.0 draws no strip at all.
   */
  const flat = FLAT[parts[0] ?? '']
  return flat === undefined
    ? [{ label: HOME }]
    : [{ label: HOME, to: '/departments' }, { label: flat }]
}

/** `/a//b/` and `/a/b` are the same route; `pathname === root` is a string compare. */
function normalise(path: string): string {
  return `/${path.split('/').filter(Boolean).join('/')}`
}

/**
 * Where the reader's back bar goes, and `undefined` when they are at their root.
 *
 * The reader's chrome off home is a back bar, not the panel's trail (§9.12), so
 * this answers one path rather than a list. `root` is passed in because R4 makes
 * it a property of the person: a reader who can reach exactly one department has
 * that department's process list as their root, and a bar offering to take them
 * "back" to a list they may never see would be a control leading nowhere.
 *
 * `/processes/{pid}` has no department segment, and the department is recovered
 * from the id by the one thing `allocate-id` guarantees — `{dept}-{nnn}` — with
 * the prefix checked against DEPT_CODES before it is trusted. A hand-typed id
 * therefore falls back to the root rather than pointing at a department that
 * does not exist, which is `panelCrumbs`'s own rule stated for one answer.
 */
export function readerBack(pathname: string, root: string): string | undefined {
  const here = normalise(pathname)
  const home = normalise(root)
  if (here === home) return undefined
  const parts = here.split('/').filter(Boolean)

  if (parts[0] === 'departments' && parts[1] !== undefined) {
    if (parts[2] === 'overview') return `/departments/${parts[1]}`
    // `home`, not the literal `/departments`. For a many-department reader the
    // two are the same string, which is why the plan's spelling passes every
    // case; for an R4 reader they are not, and the literal hands them a control
    // whose destination is a redirect back to where they already were.
    return home
  }

  if (parts[0] === 'processes' && parts[1] !== undefined) {
    const pid = parts[1]
    // **The flowchart goes up to the summary; «گام‌به‌گام» goes up to the
    // department, and the difference is R4 rather than an inconsistency.** A
    // reader is sent to the steps view from the process list — it is the violet
    // button on their row (`Inja Reader.dc.html:222`) and their lead sentence
    // promises it — so the list is what "up" means from there. The summary is
    // the flowchart's parent because the flowchart is what that screen's own
    // «مشاهدهٔ فلوچارت» opens.
    //
    // Either way this is only the FALLBACK now: `canGoBack` puts the entry the
    // person actually came from ahead of it on both process views.
    if (parts[2] === 'flow') return `/processes/${pid}`
    const code = pid.slice(0, pid.lastIndexOf('-'))
    return DEPT_CODES.includes(code) ? `/departments/${code}` : home
  }

  return home
}

/**
 * What the reader's back bar calls the screen it is on — `hereTitle` in
 * `Inja Reader.dc.html:2681`, which derives it from the route and nothing else.
 *
 * Two of the four screens name themselves outright; the other two are named
 * after the DEPARTMENT, never a process, so this returns the code and the caller
 * resolves it against the `useDepartments()` list it already holds. That is what
 * keeps this function pure and testable beside `readerBack`, which it
 * deliberately does not touch: one answers where back goes, this answers what
 * here is called, and a screen can need either without the other.
 *
 * `/comments` is the one row of the deliverable's table this app has no route
 * for — `src/routes.tsx` has no entry and the catch-all sends it to
 * `/departments` — and it is transcribed here whole rather than dropped, so the
 * table is not re-derived from the mockup the day the comments inbox lands.
 */
export function readerHere(pathname: string, root: string): {
  title?: string; deptCode?: string; about?: boolean
} {
  const here = normalise(pathname)
  if (here === normalise(root)) return {}
  const parts = here.split('/').filter(Boolean)

  if (parts[0] === 'comments') return { title: 'کامنت‌ها' }
  if (parts[0] === 'profile') return { title: 'پروفایل من' }

  if (parts[0] === 'departments' && parts[1] !== undefined) {
    // `…/overview` is the department's own info screen — «دربارهٔ X»; the bare
    // department route is its process list, which is just «X».
    return parts[2] === 'overview'
      ? { deptCode: parts[1], about: true }
      : { deptCode: parts[1] }
  }

  return {}
}
