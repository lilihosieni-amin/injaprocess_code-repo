/**
 * Whether «بازگشت» has a page of this app's own to go back to.
 *
 * **Owner ruling, about the flowchart:** *"when in flowchart page and click on
 * back bottomn, it goes to process information page. but it shouldn't be like
 * this. it should go to last page user be there."*
 *
 * Both shells derive that control's destination from the URL — `panelCrumbs`
 * answers `crumbs[length-2]` and `readerBack` answers the same process summary —
 * which is *hierarchical* navigation, not history. On this one route the two
 * disagree in practice almost every time: the flowchart is reached from the
 * department's process list («فلوچارت» is the row's primary button, and now the
 * step view's sibling), so "up" is a screen the reader was never on and "back"
 * lands them two presses from where they were.
 *
 * `history.state.idx` is React Router's own counter — `createBrowserHistory`
 * writes `{ usr, key, idx }` on every push and increments `idx` — so it answers
 * exactly the question `history.length` cannot: **how many entries of THIS app
 * are behind us.** `history.length` counts the whole tab, including the page the
 * user was on before they ever arrived here, so `-1` on a fresh deep link or a
 * reload would walk them out of the application entirely.
 *
 * Absent or not a number means "assume not": a `MemoryRouter` (every unit test),
 * a hash router, an entry pushed by something other than the router. The caller
 * then draws the URL-derived link it always drew, which is a destination that
 * exists rather than a press that does nothing.
 *
 * Read at render rather than held in state, deliberately. Both callers already
 * re-render on every navigation (`useLocation`), which is the only moment the
 * answer can change, and a `useState` seeded once would go stale the first time
 * the person moved.
 */
export function canGoBack(): boolean {
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' && state.idx > 0
}

/**
 * The two routes where the ruling above applies — `/processes/{pid}/flow` and
 * `/processes/{pid}/steps`.
 *
 * Anchored, so `/processes/x/flowchart` and a path with anything after the view
 * are not these routes; a trailing slash is.
 *
 * **Scoped to the two process views and not written for every route**, which is
 * the whole of the reasoning. The ruling names the flowchart, and «گام‌به‌گام»
 * is the same document read another way and is reached the same way — from the
 * row in the process list, never by walking down from the summary. On the other
 * seven routes the trail's own answer IS where the person came from (the
 * department list leads to the department, which leads to the process), so
 * widening this would be re-deciding six screens nobody reported.
 */
export function isProcessView(pathname: string): boolean {
  return /^\/processes\/[^/]+\/(flow|steps)\/?$/.test(pathname)
}

/**
 * Which nav-tray entry the pill sits under — §6.0's `inScreen`
 * (`Inja Panel.dc.html:4787-4788`), which is a **section** test and not a route
 * comparison.
 *
 * ```js
 * inScreen = (id) => id === 'depts' ? (screen !== 'comments' && !inAdmin && !inFacts)
 *          : id === 'facts' ? inFacts : screen === 'comments'
 * ```
 *
 * So «دپارتمان‌ها» is lit on the department list, one department, its overview
 * and all three process views — six routes, one section — and «داده‌های کمّی»
 * on the facts list and on any entry's detail. `null` is the administration
 * screens, where the design lights the «مدیریت» trigger instead and neither
 * tray entry. «صندوق کامنت‌ها», the design's third entry, is not built (R5: no
 * such screen), so nothing here answers for it.
 *
 * This was written as `pathname === n.to` when the second tray entry landed,
 * which is the same answer **only on `/departments`** — the one route the shell
 * actually draws this bar on today (`home ? topBar() : crumbStrip()`), and the
 * one route `shells.test.tsx` grades the pill on. That made the defect both
 * unreachable and ungradable through a render, which is why the predicate is a
 * pure function with a test of its own rather than a ternary inside the
 * component: the day the bar is drawn on a second route, the pill is already
 * right.
 */
export function traySection(pathname: string): string | null {
  if (inSection(pathname, '/facts')) return '/facts'
  // The three administration targets `PanelShell`'s own `adminItems` lists;
  // `/users/{id}` is inside `/users` by the same section test the tray uses.
  return ADMIN.some((root) => inSection(pathname, root)) ? null : '/departments'
}

/** The three administration destinations `PanelShell`'s `adminItems` draws. */
const ADMIN = ['/users', '/visibility', '/profile']

/**
 * Is `pathname` inside the section rooted at `root`?
 *
 * The separator is what makes it a section test rather than a prefix match:
 * without it `/factsheet` is inside `/facts` and `/profiles` inside `/profile`.
 */
function inSection(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`)
}

/**
 * Whether the mobile sheet draws a row as the one you are on.
 *
 * **The sheet and the tray answer the same rule, and that is the design's, not
 * a convenience.** §6.0 builds its sheet rows from `navDefs` and paints them
 * `inScreen(m.id)` — `menuItems`, `Inja Panel.dc.html:5097` — the very predicate
 * `navTabs` uses one line below it. So a sheet whose «دپارتمان‌ها» row went dark
 * on a process view would disagree with the design and with its own top bar at
 * once.
 *
 * The disjunction is two rules, not a widened one:
 *
 * * `traySection(...) === to` is §6.0's `inScreen` for the two rows that are
 *   tray sections. It is what carries «دپارتمان‌ها» across the process views,
 *   which no prefix test can do — `/processes/{pid}` does not start with
 *   `/departments`.
 * * `inSection(...)` is for the three administration rows, which §6.0 paints
 *   white with no current state at all (`adminItems`, :5094, binds no `bg`)
 *   because its own popover carries that group's state and this shell has no
 *   reachable popover to carry it. So "you are here" on those three is this
 *   app's addition — see `SHEET_HERE` — and it was written as an exact route
 *   match, which left «کاربران» dark on `/users/{id}`, a row the sheet draws
 *   ON the screen it leads to. A section test is the same rule the other three
 *   rows already follow.
 *
 * The two never contradict: `inSection` can only be true for a tray root on a
 * path `traySection` already answers with that same root.
 */
export function sheetHere(pathname: string, to: string): boolean {
  return traySection(pathname) === to || inSection(pathname, to)
}
