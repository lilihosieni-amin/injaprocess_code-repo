import { describe, it, expect } from 'vitest'
import { panelCrumbs } from './crumbs'

const name = (code: string) => ({ dining: 'سالن', cooking: 'پخت' }[code] ?? code)

describe('panelCrumbs', () => {
  it('gives the home screen a trail of one, going nowhere', () => {
    expect(panelCrumbs('/departments', name)).toEqual([{ label: 'دپارتمان‌ها' }])
  })

  it('names the department, and keeps home clickable', () => {
    expect(panelCrumbs('/departments/dining', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن' },
    ])
  })

  it('goes three deep for the department summary', () => {
    expect(panelCrumbs('/departments/dining/overview', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'خلاصهٔ سالن' },
    ])
  })

  it('recovers the department from a process id, and sets the id LTR mono', () => {
    // The only thing assumed about a process id is what allocate-id guarantees:
    // `{dept}-{nnn}`. §8 — an id is a latin island.
    expect(panelCrumbs('/processes/dining-003', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'dining-003', mono: true },
    ])
  })

  it('adds the flow leaf under the process', () => {
    expect(panelCrumbs('/processes/dining-003/flow', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'dining-003', to: '/processes/dining-003', mono: true },
      { label: 'فلوچارت' },
    ])
  })

  it('gives a shorter trail rather than a wrong one for an id it cannot place', () => {
    // `/processes/abc` is one typed URL away and `:pid` matches any string.
    expect(panelCrumbs('/processes/abc', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'abc', mono: true },
    ])
  })

  it('knows the administration screens', () => {
    expect(panelCrumbs('/users', name)).toEqual([{ label: 'کاربران' }])
    expect(panelCrumbs('/users/09120000000', name)).toEqual([
      { label: 'کاربران', to: '/users' },
      { label: 'دسترسی' },
    ])
    expect(panelCrumbs('/visibility', name)).toEqual([{ label: 'سیاست نمایش محتوا' }])
    expect(panelCrumbs('/profile', name)).toEqual([{ label: 'پروفایل و گذرواژه' }])
  })

  it('falls back to home rather than to an empty bar', () => {
    expect(panelCrumbs('/nowhere', name)).toEqual([{ label: 'دپارتمان‌ها' }])
  })

  /* ------------------------------------------------------------------ *
   * Beyond the plan's eight. Each of these was written because a mutant
   * survived all eight above; the mutation log is in the task report.
   * ------------------------------------------------------------------ */

  it('is the only place the department name is spelled, and it asks for the code it is on', () => {
    // The eight above pass a lookup that ignores its argument — every one of
    // them stands on `dining`. This one stands on a second department and
    // records what was asked for, so `deptName('dining')` hard-coded, or a
    // lookup keyed on the wrong path segment, dies here.
    const asked: string[] = []
    const spy = (code: string) => { asked.push(code); return name(code) }
    expect(panelCrumbs('/departments/cooking/overview', spy)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان پخت', to: '/departments/cooking' },
      { label: 'خلاصهٔ پخت' },
    ])
    expect(asked).toEqual(['cooking', 'cooking'])
  })

  it('falls back to the raw code for a department the query has not answered for yet', () => {
    // `deptName` is fed from the `['departments']` query, which is empty on the
    // first paint of a deep link. A trail that reads «دپارتمان undefined» for
    // the ~200ms before it lands is the defect; the code itself is the fallback,
    // and it is the caller's fallback, not this function's — so this test pins
    // that this function does not second-guess it.
    expect(panelCrumbs('/departments/warehouse', (code) => code)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان warehouse' },
    ])
  })

  it('does not mistake a third segment it does not know for the flow leaf', () => {
    // `/processes/:pid/*` matches one route today and the catch-all redirects
    // the rest, but a trail that appends «فلوچارت» to anything at all would
    // name a screen the caller is not on.
    expect(panelCrumbs('/processes/dining-003/history', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'dining-003', mono: true },
    ])
  })

  it('marks the latin id mono and nothing else', () => {
    // `mono` drives both `font-mono` and the LTR pin. A trail that set it on
    // every crumb would render «دپارتمان‌ها» in a monospace latin font, pinned
    // left, and every assertion above still passes: `toEqual` is satisfied by
    // the shape it is given, and none of the eight names a crumb that must NOT
    // carry it.
    const persian = panelCrumbs('/processes/dining-003/flow', name).filter((c) => c.label !== 'dining-003')
    expect(persian.length).toBe(3)
    expect(persian.every((c) => c.mono === undefined)).toBe(true)
  })

  it('leaves the last crumb without a target, on every shape of trail', () => {
    // The last crumb is where you already are, and the shell renders a crumb
    // with a `to` as a link. A trail whose leaf carried one would offer the
    // reader a link to the page they are reading.
    for (const path of [
      '/departments', '/departments/dining', '/departments/dining/overview',
      '/processes/dining-003', '/processes/dining-003/flow', '/processes/abc',
      '/users', '/users/09120000000', '/visibility', '/profile', '/nowhere', '/',
    ]) {
      const trail = panelCrumbs(path, name)
      expect(trail.length, path).toBeGreaterThan(0)
      expect(trail[trail.length - 1].to, path).toBeUndefined()
      // …and every crumb before it does carry one, or it is a dead label in a
      // trail that promises the way back.
      expect(trail.slice(0, -1).map((c) => c.to === undefined), path)
        .toEqual(trail.slice(0, -1).map(() => false))
    }
  })

  it('does not mistake a third segment it does not know for the summary', () => {
    // The twin of the flow case above, and it was written because the mutant
    // `parts[2] === 'overview'` → `parts[2] !== undefined` survived all
    // fourteen tests before it: every one of them stands on either exactly two
    // segments or exactly the two third segments the app has.
    expect(panelCrumbs('/departments/dining/settings', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن' },
    ])
  })

  it('reads a process id back from its LAST dash, so a suffixed id is not mis-placed', () => {
    // `dining-003-v2` is not an id `allocate-id` issues, and `:pid` matches it.
    // Split on the FIRST dash it looks like a dining process and gets the full
    // three-deep trail; split on the LAST, `dining-003` is not a department
    // code, and the rule is the same one the shorter-trail test states — a
    // shorter trail rather than a wrong one. The mutant `lastIndexOf` →
    // `indexOf` survived every other test in this file, because no other test
    // uses an id with two dashes in it.
    expect(panelCrumbs('/processes/dining-003-v2', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'dining-003-v2', mono: true },
    ])
  })

  it('reads an empty path segment as no segment at all', () => {
    // A trailing slash, and the doubled slash that a concatenated `${base}/${x}`
    // produces. Without this, `filter(Boolean)` → `slice(1)` survives: for every
    // other path in this file the two agree, and only a doubled slash separates
    // them — where the second spelling draws «دپارتمان » for a department whose
    // code is the empty string, and links it to `/departments/`.
    expect(panelCrumbs('/departments/dining/', name)).toEqual(panelCrumbs('/departments/dining', name))
    expect(panelCrumbs('//departments//dining', name)).toEqual(panelCrumbs('/departments/dining', name))
    expect(panelCrumbs('/departments/dining//overview', name))
      .toEqual(panelCrumbs('/departments/dining/overview', name))
  })
})
