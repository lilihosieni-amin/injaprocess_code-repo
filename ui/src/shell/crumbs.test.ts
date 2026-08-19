import { describe, it, expect } from 'vitest'
import { panelCrumbs, readerBack, readerHere } from './crumbs'

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
    // **R41.** Two crumbs, not one, and the leading one is what draws «بازگشت»:
    // `Inja Panel.dc.html:3407` seeds every trail with «دپارتمان‌ها» before a
    // branch runs, and `:3413` pushes the administration label onto it. With the
    // leading crumb missing these three had `crumbs.length === 1`, so
    // `PanelShell`'s `crumbs.length > 1 ? … : undefined` left them with no back
    // control at all — the "some pages don't have it" half of the owner's
    // ruling, on the three screens that had it.
    expect(panelCrumbs('/users', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'کاربران' },
    ])
    expect(panelCrumbs('/users/09120000000', name)).toEqual([
      { label: 'کاربران', to: '/users' },
      { label: 'دسترسی' },
    ])
    expect(panelCrumbs('/visibility', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'سیاست نمایش محتوا' },
    ])
    expect(panelCrumbs('/profile', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'پروفایل و گذرواژه' },
    ])
  })

  it('gives every route but the home screen a crumb to go back to', () => {
    // The rule the three rows above are three instances of, stated once and
    // over the whole route table — `src/routes.tsx`'s panel list, minus the two
    // redirects. `PanelShell` derives «بازگشت» from `crumbs[length - 2]`, so a
    // trail of one is a screen with no way back, and §6.0 draws one on every
    // route but `/departments` (`canBack: s.hist.length > 0 && screen !==
    // 'depts'`, Panel :3451, where `hist` is empty on the home screen alone).
    //
    // Written as a sweep because the defect it caught was an omission: three
    // routes nobody had listed beside the others. A per-route `expect` cannot
    // notice the route that is not in it.
    for (const path of [
      '/departments/dining', '/departments/dining/overview',
      '/processes/dining-003', '/processes/dining-003/flow',
      '/users', '/users/09120000000', '/visibility', '/profile',
    ]) {
      const trail = panelCrumbs(path, name)
      expect(trail.length, path).toBeGreaterThan(1)
      expect(trail[trail.length - 2].to, path).toBeDefined()
    }
    // …and the home screen is the one that has none, so this is a test about
    // two branches rather than one that a trail-of-two everywhere would satisfy.
    expect(panelCrumbs('/departments', name)).toHaveLength(1)
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

/* ==================================================================== *
 * The reader's chrome — Task 13
 *
 * The reader's non-home chrome is a BACK BAR, not the panel's trail (§9.12), so
 * two questions have to be answered about a route rather than one: where does
 * «بازگشت» go, and what does the bar call the screen it is on. They are two
 * functions on purpose — `readerBack`'s answers must not move when the title
 * table does — and they share only the route parsing.
 *
 * `root` is a parameter of both because R4 makes it a property of the PERSON: a
 * reader who can reach exactly one department has that department's process
 * list as their root, and a bar offering to take them "back" to a list they
 * will never see is a control leading nowhere.
 * ==================================================================== */

describe('readerBack', () => {
  it('gives a reader at their root nothing to go back to', () => {
    // R4 — the landing list is their root, so it carries no back bar. Both
    // shapes of root: the many-department list and the one-department list.
    expect(readerBack('/departments', '/departments')).toBeUndefined()
    expect(readerBack('/departments/dining', '/departments/dining')).toBeUndefined()
  })

  it('sends a many-department reader back up the list', () => {
    expect(readerBack('/departments/dining', '/departments')).toBe('/departments')
  })

  it('sends the department summary back to its process list', () => {
    expect(readerBack('/departments/dining/overview', '/departments/dining')).toBe('/departments/dining')
    expect(readerBack('/departments/dining/overview', '/departments')).toBe('/departments/dining')
  })

  it('sends a process back to its department, recovered from the id', () => {
    expect(readerBack('/processes/dining-003', '/departments')).toBe('/departments/dining')
    expect(readerBack('/processes/dining-003', '/departments/dining')).toBe('/departments/dining')
  })

  it('sends the flowchart back to its own process', () => {
    expect(readerBack('/processes/dining-003/flow', '/departments')).toBe('/processes/dining-003')
  })

  it('falls back to the root rather than nowhere for an id it cannot place', () => {
    expect(readerBack('/processes/abc', '/departments/dining')).toBe('/departments/dining')
    expect(readerBack('/profile', '/departments/dining')).toBe('/departments/dining')
  })

  /* ------------------------------------------------------------------ *
   * Beyond the plan's six. Each was written because a mutant survived all
   * six above; the mutation log is in this task's report.
   * ------------------------------------------------------------------ */

  it('reads a process id back from its LAST dash, so a suffixed id is not mis-placed', () => {
    // `dining-003-v2` is not an id `allocate-id` issues and `:pid` matches it.
    // Split on the FIRST dash it looks like a dining process and the bar offers
    // «بازگشت» to a department the id does not belong to; split on the LAST,
    // `dining-003` is not a department code and the bar falls back to the root.
    // Same rule `panelCrumbs` keeps above — a shorter answer, never a wrong one
    // — and the `lastIndexOf` -> `indexOf` mutant survives every other case in
    // this block, because no other one uses an id with two dashes in it.
    expect(readerBack('/processes/dining-003-v2', '/departments')).toBe('/departments')
    expect(readerBack('/processes/dining-003-v2', '/departments/dining')).toBe('/departments/dining')
  })

  it('checks the recovered prefix against the real department list', () => {
    // The `DEPT_CODES.includes(code)` guard, which the six above cannot see:
    // every one of them uses `dining`, which is in the list, or `abc`, which has
    // no dash at all. `notadept-001` has the SHAPE of an id and a prefix that is
    // not a department, and it is one typed URL away.
    expect(readerBack('/processes/notadept-001', '/departments')).toBe('/departments')
    expect(readerBack('/processes/notadept-001', '/departments/dining')).toBe('/departments/dining')
    // …and a second real code, so the answer is read off the id rather than
    // hard-coded to the one department every other case in this file stands on.
    expect(readerBack('/processes/cooking-012', '/departments')).toBe('/departments/cooking')
  })

  it('does not mistake a third segment it does not know for the flow leaf', () => {
    // `/processes/:pid/*` matches one route today and the catch-all redirects
    // the rest, but a bar that treated any third segment as the flowchart would
    // send «بازگشت» to the process from a screen that is not under it. The twin
    // of `panelCrumbs`'s own case above, and the mutant `parts[2] === 'flow'` ->
    // `parts[2] !== undefined` survives every other case here.
    expect(readerBack('/processes/dining-003/history', '/departments')).toBe('/departments/dining')
  })

  it('does not mistake a third segment it does not know for the summary', () => {
    // The department twin. `parts[2] === 'overview'` -> `parts[2] !== undefined`
    // survives all six of the plan's cases, because every one of them stands on
    // either exactly two segments or exactly the one third segment the app has.
    expect(readerBack('/departments/dining/settings', '/departments')).toBe('/departments')
  })

  it('reads an empty path segment as no segment at all, on BOTH arguments', () => {
    // A trailing slash, and the doubled slash a concatenated `${base}/${x}`
    // produces. This is not tidiness: `pathname === root` is the test that
    // decides whether a reader is at their root, and it is a STRING compare on
    // two values that arrive from different places — the router's location and
    // a root this shell builds itself. `/departments/dining/` against
    // `/departments/dining` is the R4 reader's own landing screen wearing a back
    // bar that offers to take them to the list R4 exists to keep them out of.
    expect(readerBack('/departments/dining/', '/departments/dining')).toBeUndefined()
    expect(readerBack('/departments/dining', '/departments/dining/')).toBeUndefined()
    expect(readerBack('//departments//dining', '/departments')).toBe('/departments')
    expect(readerBack('/departments/dining//overview', '/departments')).toBe('/departments/dining')
  })

  it('never sends a one-department reader to a list they cannot see', () => {
    // R4 read back into this function. For a MANY-department reader the root and
    // `/departments` are the same string, so every case above passes whichever of
    // the two the departments branch hands back; for a one-department reader they
    // are not, and the literal gives them a control whose destination is a
    // redirect straight back to where they already were. Both routes below are
    // off the app's own route table today, which is exactly why nothing else
    // separates the two spellings.
    expect(readerBack('/departments/cooking', '/departments/dining')).toBe('/departments/dining')
    expect(readerBack('/departments/dining/settings', '/departments/dining')).toBe('/departments/dining')
    // …and the many-department reader's answer is unchanged, which is the half
    // that says this is one answer and not two.
    expect(readerBack('/departments/cooking', '/departments')).toBe('/departments')
  })

  it('never offers to take a reader to the screen they are already on', () => {
    // A back control pointing at the current page is a control that does
    // nothing, and every individual case above is satisfied by an answer that
    // happens not to be the input. This says it about the whole route table, on
    // both shapes of root.
    const paths = [
      '/departments', '/departments/dining', '/departments/dining/overview',
      '/departments/cooking', '/processes/dining-003', '/processes/dining-003/flow',
      '/processes/abc', '/profile', '/nowhere', '/',
    ]
    for (const root of ['/departments', '/departments/dining']) {
      for (const p of paths) {
        expect(readerBack(p, root), `${p} from ${root}`).not.toBe(p)
      }
    }
  })

  it('answers with an absolute path or with nothing, on every route the app has', () => {
    // A relative answer would be resolved against the current URL by the router
    // and land somewhere different on every screen. Nothing above says so: each
    // one compares against a literal that happens to start with a slash.
    for (const root of ['/departments', '/departments/dining']) {
      for (const p of [
        '/departments', '/departments/dining', '/departments/dining/overview',
        '/processes/dining-003', '/processes/dining-003/flow', '/profile', '/',
      ]) {
        const to = readerBack(p, root)
        if (to !== undefined) expect(to.startsWith('/'), `${p} from ${root} -> ${to}`).toBe(true)
      }
    }
  })
})

describe('readerHere', () => {
  // The design derives the bar's title from the route and nothing else
  // (`hereTitle`, `Inja Reader.dc.html:2681`). Two screens name themselves; two
  // are named after their DEPARTMENT — never a process — so this returns the
  // code and `ReaderShell` resolves the name from the `useDepartments()` list
  // it already holds, which is what keeps this function pure.

  it('names the department’s process list after the department', () => {
    expect(readerHere('/departments/dining', '/departments')).toEqual({ deptCode: 'dining' })
    // …read off the segment, not hard-coded to the one department the rest of
    // this file stands on.
    expect(readerHere('/departments/cooking', '/departments')).toEqual({ deptCode: 'cooking' })
  })

  it('marks the department summary as being ABOUT the department', () => {
    // `'دربارهٔ ' + dm.name` in the deliverable. The flag rather than the string,
    // because the name is not in the route.
    expect(readerHere('/departments/dining/overview', '/departments')).toEqual({
      deptCode: 'dining', about: true,
    })
  })

  it('does not mark a third segment it does not know as the summary', () => {
    // The mutant `parts[2] === 'overview'` -> `parts[2] !== undefined` draws
    // «دربارهٔ سالن» over a screen that is not the summary.
    expect(readerHere('/departments/dining/settings', '/departments')).toEqual({ deptCode: 'dining' })
  })

  it('lets the two screens that name themselves do so', () => {
    // `/profile` is a route this app has. `/comments` is NOT — `src/routes.tsx`
    // has no entry for it and the catch-all sends it to `/departments` — and it
    // is here because it is one of the four rows of the deliverable's own table
    // and the one the app has not built. Recorded in this task's report rather
    // than dropped silently, so the row is not re-derived from scratch the day
    // the comments inbox lands.
    expect(readerHere('/profile', '/departments')).toEqual({ title: 'پروفایل من' })
    expect(readerHere('/comments', '/departments')).toEqual({ title: 'کامنت‌ها' })
  })

  it('names a process nothing at all, which is what the deliverable draws', () => {
    // `screen === 'plist' ? dm.name : ''` — a process screen and its flowchart
    // fall off the end of that chain. Not an oversight to be filled in here: a
    // title invented for them would be the one string on the bar that no line
    // of the design carries.
    expect(readerHere('/processes/dining-003', '/departments')).toEqual({})
    expect(readerHere('/processes/dining-003/flow', '/departments')).toEqual({})
  })

  it('names nothing on the reader’s own root, whichever root that is', () => {
    expect(readerHere('/departments', '/departments')).toEqual({})
    expect(readerHere('/departments/dining', '/departments/dining')).toEqual({})
  })

  it('names nothing on a route it does not know', () => {
    expect(readerHere('/nowhere', '/departments')).toEqual({})
    expect(readerHere('/', '/departments')).toEqual({})
  })

  it('reads an empty path segment as no segment at all, on BOTH arguments', () => {
    expect(readerHere('/departments/dining/', '/departments/dining')).toEqual({})
    expect(readerHere('/departments/dining', '/departments/dining/')).toEqual({})
    expect(readerHere('//departments//dining', '/departments')).toEqual({ deptCode: 'dining' })
    expect(readerHere('/departments/dining//overview', '/departments')).toEqual({
      deptCode: 'dining', about: true,
    })
  })

  it('never answers with both a title and a department', () => {
    // The two halves are read by different branches of the caller — a title is
    // used as it stands, a code is looked up — and an answer carrying both would
    // silently take whichever the caller happens to read first. Nothing above
    // says so: every case names one shape.
    for (const p of [
      '/departments', '/departments/dining', '/departments/dining/overview',
      '/departments/dining/settings', '/processes/dining-003',
      '/processes/dining-003/flow', '/profile', '/comments', '/nowhere', '/',
    ]) {
      const here = readerHere(p, '/departments')
      expect(here.title !== undefined && here.deptCode !== undefined, p).toBe(false)
      // …and `about` is a qualifier on a department, never a screen of its own.
      if (here.about === true) expect(here.deptCode, p).toBeDefined()
    }
  })
})
