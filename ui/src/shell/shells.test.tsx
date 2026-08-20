import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'
import { PanelShell } from './PanelShell'
import { ReaderShell } from './ReaderShell'
import { Icon } from '../ui/Icon'
import { pushDismissible, popDismissible, isTopDismissible } from '../ui/dismissibleStack'
import { expectExpandedHitArea } from '../test/a11y'
import { paint, winner, declarations } from '../test/paint'
import type { SessionDescriptor, Capability } from '../auth/session'
import type { Department } from '../api/types'

/*
 * A test file, and src/test/theme.test.ts's R11 scan excludes it by name. The
 * marker below is the same pin src/ui/table.test.tsx and src/test/a11y.ts carry,
 * put here because this file now spells whole utility names in fixtures and in
 * negative controls, and a scan that ever read it as a component would count
 * every one of them as consumed.
 *
 *   marker: zz-only-a-test-file-writes-this
 */

afterEach(() => vi.restoreAllMocks())

function session(capabilities: Capability[]): SessionDescriptor {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes: ['dept:dining'], supervisor: '09120000000',
    canSupervise: false, pendingApprovals: 0,
  }
}

function renderShell(caps: Capability[]) {
  // C2 — the panel shell now calls usePending/useLogout, both real network
  // hooks, so every render here needs a QueryClient and a fetch stub.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell session={session(caps)} />}>
            <Route path="/" element={<p>محتوا</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  it('marks the reader shell so density resolves', () => {
    const { container } = renderShell(['view', 'comment', 'export_pdf'])
    expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument()
  })

  it('marks the panel shell for anyone holding a panel capability', () => {
    const { container } = renderShell(['view', 'comment', 'edit'])
    expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument()
  })

  it('renders the routed content in either shell', () => {
    renderShell(['view'])
    expect(screen.getByText('محتوا')).toBeInTheDocument()
  })

  it('renders no h1 of its own', () => {
    // I6 — the brand is a div; the routed screen owns the page's one h1 (F11).
    const { container } = renderShell(['view'])
    expect(container.querySelectorAll('h1')).toHaveLength(0)
  })

  it('sets the document direction and language', () => {
    renderShell(['view'])
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement).toHaveAttribute('lang', 'fa')
  })

  it('gives the outlet a growing, unpadded flex column ancestor', () => {
    // C1 — jsdom does no layout, so height can't be observed directly. This
    // asserts the structural classes the flow canvas depends on to resolve a
    // real height instead: a direct flex-1/min-h-0 flex-column wrapper around
    // <Outlet/>, with no padding class (screens own their own padding).
    for (const caps of [['view', 'comment', 'export_pdf'], ['view', 'comment', 'edit']] as const) {
      const { unmount } = renderShell([...caps])
      const main = screen.getByText('محتوا').parentElement as HTMLElement
      expect(main.tagName).toBe('MAIN')
      expect(main.className).toMatch(/\bflex-1\b/)
      expect(main.className).toMatch(/\bmin-h-0\b/)
      expect(main.className).not.toMatch(/(^|\s)p[xytrbl]?-/)
      unmount()
    }
  })
})

/* ==================================================================== *
 * PanelShell — the chrome
 * ==================================================================== */

const DEPTS = [{ code: 'dining', name: 'سالن', count: 3, subs: 0 }]

/**
 * Render the panel shell at `entry`, with the two reads it makes answered.
 *
 * The stub is keyed on the URL rather than answering everything with one body:
 * `usePending` and `useDepartments` want different shapes, and a single `[]` for
 * both is what makes the Persian-digit test below vacuous — an empty inbox draws
 * no badge and no count, so the assertion that no latin digit reaches the screen
 * passes over a header with nothing in it.
 */
function renderPanel(
  caps: Capability[],
  entry: string,
  { pending = [] as unknown[], depts = DEPTS as unknown[], scopes }: {
    pending?: unknown[]; depts?: unknown[]; scopes?: string[]
  } = {},
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
    const body = url.includes('/api/pending') ? pending : depts
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
  })
  const who = scopes === undefined ? session(caps) : { ...session(caps), scopes }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<PanelShell session={who} />}>
            <Route path="/departments" element={<p>محتوا</p>} />
            <Route path="/departments/:code" element={<p>محتوا</p>} />
            <Route path="/departments/:code/overview" element={<p>محتوا</p>} />
            <Route path="/processes/:pid" element={<p>محتوا</p>} />
            <Route path="/processes/:pid/flow" element={<p>محتوا</p>} />
            <Route path="/users" element={<p>محتوا</p>} />
            <Route path="/users/:id" element={<p>محتوا</p>} />
            <Route path="/visibility" element={<p>محتوا</p>} />
            <Route path="/profile" element={<p>محتوا</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * The administration fixture: every entry drawn, so a test about the menu's
 * CONTENTS is not silently a test about an empty menu.
 *
 * `scopes: ['*']` because both gated entries need it — «کاربران» is answered
 * 404 without it (D56) and «سیاست نمایش محتوا» 403 — and `session()` above is
 * deliberately scoped to one department, which is what makes the two negative
 * fixtures non-vacuous. It goes through `renderPanel`, and that is not a
 * tidy-up: the two tests that used to build this render inline had **no fetch
 * stub at all**, so `useDepartments` and `usePending` reached jsdom's real
 * `fetch` and the suite's strongest content fixtures were leaning on a network
 * call that happened to fail quietly.
 */
function renderAdmin(entry = '/departments', { pending = [] as unknown[] } = {}) {
  return renderPanel(['view', 'edit', 'set_visibility', 'manage_users'], entry, { scopes: ['*'], pending })
}

/** Every `d` this element draws, in order — the whole glyph, not its first path. */
function glyphOf(el: Element | null | undefined): string {
  return Array.from(el?.querySelectorAll('path') ?? []).map((p) => p.getAttribute('d')).join(' ')
}

/**
 * The WEIGHT the glyph inside this control is drawn at.
 *
 * A separate reading from `glyphOf` because it is a separate failure: the same
 * picture at the wrong weight is the same `d`, the same box, the same colour and
 * the same screenshot at a glance. `Icon`'s own default is 2, so half the call
 * sites in both shells write their weight and half let the default hold — and a
 * swap in either direction compiles, paints something legal, and is invisible to
 * every other assertion in this file.
 */
function strokeOf(el: Element | null | undefined): string | null {
  return el?.querySelector('svg')?.getAttribute('stroke-width') ?? null
}

/**
 * The drawing `<Icon name={…}/>` makes, read off the icon set rather than
 * matched against a literal `d` — so these pins survive Task 11 redrawing a
 * glyph and still fail a swap to a different one.
 */
function iconGlyph(name: Parameters<typeof Icon>[0]['name']): string {
  const { container, unmount } = render(<Icon name={name} px={16} />)
  const d = glyphOf(container)
  unmount()
  return d
}

/** The header's own controls — the set audit S1 measured. */
const controlsIn = (container: HTMLElement, bar = '[data-r-topbar]') =>
  Array.from(container.querySelectorAll<HTMLElement>(`${bar} a, ${bar} button`))

describe('PanelShell chrome', () => {
  it('draws the top bar on the home screen and the crumb strip everywhere else', () => {
    // §6.0 — `showTopBar: screen === 'depts'`, `showCrumbBar: screen !== 'depts'`.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
    expect(container.querySelector('[data-r-crumbbar]')).toBeNull()
    unmount()
    const inner = renderPanel(['view', 'edit'], '/departments/dining')
    expect(inner.container.querySelector('[data-r-topbar]')).toBeNull()
    expect(inner.container.querySelector('[data-r-crumbbar]')).toBeInTheDocument()
  })

  it('draws the flow screen’s «بازگشت» in the crumb strip, like every other route', () => {
    // §6.0 draws the strip here — `showCrumbBar: screen !== 'depts'` — and the
    // back button in it: `canBack: s.hist.length > 0 && screen !== 'depts'`
    // (`Inja Panel.dc.html:3451`) is exactly "not the home screen", and the
    // panel deliverable's own flow toolbar has no back in it at all
    // (`:558-613`, whose first child is `data-r-flownav`, the next/previous
    // pair).
    //
    // **R44.** "in flowchart screen, the back button should be on top menu too.
    // like other page." This route was the one exception, and the exception was
    // a stated deviation rather than a reading of the panel deliverable: R41
    // found `FlowScreen` drawing «بازگشت» as its toolbar's first child and the
    // strip drawing a second directly above it, both pointing at
    // `/processes/{pid}`, and — with `src/flow/` frozen to another task — took
    // the strip's away to get the count to one. R44 unfroze the one line that
    // makes the choice: `FlowScreen` branches on `useSurface()` and draws the
    // toolbar button for the READER only, whose shell draws no bar on this
    // route at all (`showBackBar: screen !== 'flow'`, `Inja Reader.dc.html:2684`
    // — R21, and the reason that button may not simply be deleted). So the
    // panel's «بازگشت» comes home to the strip and the count stays one.
    //
    // **This file cannot see the count.** `renderPanel` mounts `<p>محتوا</p>`
    // behind every route, so the toolbar that drew the other «بازگشت» is not in
    // this tree — which is exactly how two of them shipped. One is asserted on
    // the composed page, in a browser, at three widths, by
    // `one «بازگشت» per panel route, and never two` in e2e/panel-shell.spec.ts,
    // which also pins it to `[data-r-crumbbar]` so a revert cannot pass on
    // count alone.
    const { container } = renderPanel(['view', 'edit'], '/processes/dining-003/flow')
    const strip = container.querySelector('[data-r-crumbbar]') as HTMLElement
    expect(strip).toBeInTheDocument()
    expect(within(strip).getByRole('link', { name: 'بازگشت' }))
      .toHaveAttribute('href', '/processes/dining-003')
    // The trail is untouched, so the leaf still names the screen and the crumb
    // before it is still the way back as a LINK as well as a button.
    expect(container.querySelector('[data-r-crumbs] [aria-current="page"]')).toHaveTextContent('فلوچارت')
    expect(within(container).getByRole('link', { name: 'dining-003' }))
      .toHaveAttribute('href', '/processes/dining-003')
  })

  it('draws it on a process whose id merely looks like the flowchart’s', () => {
    // `/processes/flow-001` is a process in a department called `flow`. The
    // panel used to tell it apart from `/processes/{pid}/flow` with an anchored
    // regex, because matched loosely it lost the one back control it has and
    // gained no toolbar to replace it — the dead end R21 closed on the reader.
    // R44 deletes that regex from this shell: the strip now draws «بازگشت»
    // wherever `panelCrumbs` gives it somewhere to go, so there is no path for
    // a loose match to take it off. The route stays asserted because the answer
    // must not change, whatever the shell stops asking. `ReaderShell:75` still
    // carries the regex and `takes the chrome away on the flowchart and NOT on
    // a process whose id looks like one` below is that surface's half.
    const entry = '/processes/flow-001'
    const { container } = renderPanel(['view', 'edit'], entry)
    expect(within(container).getByRole('link', { name: 'بازگشت' }), entry).toBeInTheDocument()
  })

  it('draws the logo that has been in the repo since July', () => {
    // Audit S2 — `assets/inja-logo.jpg` existed and no file in src/ imported it.
    const { container } = renderPanel(['view', 'edit'], '/departments')
    const img = container.querySelector('[data-r-topbar] img')
    expect(img).toHaveAttribute('src', expect.stringMatching(/inja-logo/))
    // …at the box the design draws it in, as an ATTRIBUTE: an <img> needs its
    // intrinsic size before the file lands or the whole bar reflows when it does.
    expect(img).toHaveAttribute('width', '38')
    expect(img).toHaveAttribute('height', '38')
    // The wordmark beside it is why the image is `alt=""` (Logo.tsx).
    expect(img).toHaveAttribute('alt', '')
    expect(screen.getByText('اینجا فست‌فود')).toBeInTheDocument()
  })

  it('is a white bar on a cream hairline, not a violet block', () => {
    const { container } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-topbar]')).toHaveClass('bg-card', 'border-warm')
  })

  it('leaves no control that would vanish on hover', () => {
    // Audit S1 — `text-card` over `hover:bg-tile-v2` is 1.04:1. The design's fix
    // is the white bar: its controls are --violet and #F4EFFB is their hover.
    // Every branch of the bar is rendered: this caller holds `set_visibility`
    // and `edit`, so the inbox button, the policy entry and the admin menu are
    // all on screen, and a control inside an unrendered branch cannot be read.
    const { container } = renderPanel(['view', 'edit', 'set_visibility'], '/departments')
    const controls = controlsIn(container)
    expect(controls.length).toBeGreaterThan(2)
    controls.forEach((c) => {
      const cls = c.className
      expect(/\btext-card\b/.test(cls) && /hover:bg-tile-v2/.test(cls)).toBe(false)
    })
  })

  it('leaves no control that would vanish on hover in the crumb strip either', () => {
    // The other chrome. S1 counted seven controls and the audit's list is the
    // top bar's; the strip draws two more of the same ghost button.
    const { container } = renderPanel(['view', 'edit'], '/departments/dining')
    const controls = controlsIn(container, '[data-r-crumbbar]')
    expect(controls.length).toBeGreaterThan(1)
    controls.forEach((c) => {
      expect(/\btext-card\b/.test(c.className) && /hover:bg-tile-v2/.test(c.className)).toBe(false)
    })
  })

  it('counts the inbox in Persian, in the badge and in the name', async () => {
    // Audit S4 — the two shells were the only surfaces in the app rendering a
    // latin digit, so a reader saw «۳ فرآیند» on the page and `3` in the header.
    renderPanel(['view', 'edit'], '/departments', {
      pending: [{ process: 'dining-001' }, { process: 'dining-002' }],
    })
    const btn = await screen.findByRole('button', { name: 'صندوق بازبینی تعارض‌ها، ۲ مورد در انتظار' })
    expect(btn.textContent).toContain('۲')
    expect(btn.textContent).not.toMatch(/[0-9]/)
    // …and the badge itself: 19px round chrome badge, not S5's 44px coral square.
    const badge = btn.querySelector('span[aria-hidden]') as HTMLElement
    expect(badge.className).toMatch(/\bh-count-chrome\b/)
    expect(badge.className).toMatch(/\bmin-w-count-chrome\b/)
    expect(badge.className).toMatch(/\brounded-round\b/)
    // S5 — the badge is not interactive, so it must not carry the touch floor.
    expect(badge.className).not.toMatch(/\bmin-[wh]-touch\b/)
  })

  it('names the inbox without a count when there is nothing in it', () => {
    // The other half of the branch above, and the reason the aria-label is a
    // conditional at all: «…، ۰ مورد در انتظار» is a sentence about nothing.
    const { container } = renderPanel(['view', 'edit'], '/departments')
    const btn = screen.getByRole('button', { name: 'صندوق بازبینی تعارض‌ها' })
    expect(btn.querySelector('span[aria-hidden]')).toBeNull()
    expect(container.textContent).not.toMatch(/[0-9]/)
  })

  it('carries a visible label the accessible name contains, on the inbox', () => {
    // WCAG 2.5.3. The design draws «صندوق بازبینی» (Panel :154) and the app's
    // own accessible name is «صندوق بازبینی تعارض‌ها»; the plan's «صندوق
    // تعارض‌ها» is not a substring of that name, so speech control would fail
    // on the words a reader can see. This pins the containment, not the string.
    renderPanel(['view', 'edit'], '/departments')
    const btn = screen.getByRole('button', { name: 'صندوق بازبینی تعارض‌ها' })
    const visible = (btn.textContent ?? '').trim()
    expect(visible.length).toBeGreaterThan(0)
    expect(btn.getAttribute('aria-label')).toContain(visible)
  })

  it('fires no pending query for a caller who cannot edit', async () => {
    // C2 — the inbox is an edit-only surface. An auditor reaches this shell and
    // holds no `edit`, so the request is not made and no button is drawn.
    const { container } = renderPanel(['view', 'view_audit'], '/departments')
    await screen.findByText('محتوا')
    const asked = vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]))
    expect(asked.some((u) => u.includes('/api/pending'))).toBe(false)
    expect(asked.some((u) => u.includes('/api/departments'))).toBe(true)
    expect(controlsIn(container).some((c) => /صندوق/.test(c.textContent ?? ''))).toBe(false)
  })

  it('draws the crumb trail, with the last crumb as the current page', async () => {
    renderPanel(['view', 'edit'], '/departments/dining')
    // `find`, not `get`: the department's Persian name arrives with the
    // `['departments']` query, so a synchronous read here sees «دپارتمان dining»
    // — the raw code — and an assertion on the Persian name would be red for a
    // reason that has nothing to do with the trail.
    expect(await screen.findByText('دپارتمان سالن')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'دپارتمان‌ها' })).toHaveAttribute('href', '/departments')
    expect(screen.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/departments')
    expect(screen.getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/departments')
    // The leaf is where you already are, so it is not a link.
    expect(screen.queryByRole('link', { name: 'دپارتمان سالن' })).toBeNull()
    // …and the trail does not open with a separator: one `/` BETWEEN each pair
    // of crumbs, so two crumbs mean one.
    const crumbs = screen.getByRole('navigation', { name: 'مسیر' })
    expect(crumbs.querySelectorAll('[data-r-crumbs] li')).toHaveLength(2)
    expect(within(crumbs).getAllByText('/')).toHaveLength(1)
  })

  it('points the back control the way an RTL reader came from', () => {
    // Task 11's chevron names are RTL-correct: what you came FROM lies to the
    // right, so the back control points right — `chevronStart`, which is the
    // path the deliverable draws on this very button (`Inja Panel.dc.html:177`).
    // Compared against the icon set rather than against a literal `d`, so the
    // pin survives Task 11 redrawing the glyph and still fails a swap.
    renderPanel(['view', 'edit'], '/departments/dining')
    const drawn = screen.getByRole('link', { name: 'بازگشت' }).querySelector('path')?.getAttribute('d')
    expect(drawn).toBeTruthy()
    const start = render(<Icon name="chevronStart" px={15} />).container.querySelector('path')
    const end = render(<Icon name="chevronEnd" px={15} />).container.querySelector('path')
    // The negative half: if the two glyphs were the same drawing this assertion
    // would be about nothing.
    expect(start?.getAttribute('d')).not.toBe(end?.getAttribute('d'))
    expect(drawn).toBe(start?.getAttribute('d'))
  })

  it('pins a process id LTR and monospaced, and nothing else', async () => {
    // §8 — a latin island in RTL prose. `guards.test.ts` declares this file as
    // the island that writes `dir=`; this is what it writes it on.
    renderPanel(['view', 'edit'], '/processes/dining-003/flow')
    // The Persian department name arrives with the `['departments']` query, and
    // the crumb it sits in is one of the three this test asserts is NOT an
    // island — so it has to be on screen before the loop below reads it.
    await screen.findByText('دپارتمان سالن')
    const id = screen.getByText('dining-003')
    expect(id).toHaveAttribute('dir', 'ltr')
    expect(id.className).toMatch(/\bfont-mono\b/)
    for (const label of ['دپارتمان‌ها', 'دپارتمان سالن', 'فلوچارت']) {
      const el = screen.getByText(label)
      expect(el.getAttribute('dir'), label).toBeNull()
      expect(el.className, label).not.toMatch(/\bfont-mono\b/)
    }
  })

  it('leaves out the administration entries this caller cannot reach', async () => {
    // R5 — absent, not disabled. `administrationRefusal` is the same twin the
    // screen gates itself on, so header and screen cannot come to disagree.
    renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    expect(screen.queryByRole('menuitem', { name: /کاربران/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /سیاست نمایش محتوا/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /پروفایل و گذرواژه/ })).toBeInTheDocument()
  })

  it('leaves out user administration for a holder scoped to one department', async () => {
    // D56 — `access.requires` checks SCOPE before capability, so a holder of
    // `manage_users` scoped to one department is answered **404** on every
    // endpoint behind «کاربران»: «چیزی اینجا نیست», a wall the app itself
    // pointed them at. A gate spelled `can(session, 'manage_users')` draws them
    // the link anyway and passes every other test in this file, because no
    // other fixture holds the capability without the scope.
    renderPanel(['view', 'edit', 'manage_users'], '/departments')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^کاربران/ })).toBeNull()
  })

  it('draws the administration entries this caller CAN reach', async () => {
    // The non-vacuous twin of the test above: without it, a menu that renders
    // nothing at all passes, and so does one whose gate is `false`.
    renderAdmin()
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    expect(screen.getByRole('menuitem', { name: /کاربران/ })).toHaveAttribute('href', '/users')
    expect(screen.getByRole('menuitem', { name: /سیاست نمایش محتوا/ })).toHaveAttribute('href', '/visibility')
    expect(screen.getByRole('menuitem', { name: /پروفایل و گذرواژه/ })).toHaveAttribute('href', '/profile')
    // Every entry explains itself (§6.0's `hint` line), and the hint is not the
    // accessible name — it is a second line under it.
    expect(screen.getByText('نشست‌های باز و تغییر گذرواژه')).toBeInTheDocument()
  })

  it('says whether its menu is open, and shuts it on a click outside', async () => {
    const { container } = renderPanel(['view', 'edit'], '/departments')
    const trigger = screen.getByRole('button', { name: /مدیریت/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // The scrim: a click anywhere off the popover shuts it, which is the only
    // way out that does not also leave the screen.
    const scrim = container.querySelector('.fixed.inset-0') as HTMLElement
    expect(scrim).toBeInTheDocument()
    await userEvent.click(scrim)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: /مدیریت/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('takes the caller to the entry they chose, and the bar with it', async () => {
    // The other exit. Choosing «پروفایل و گذرواژه» navigates, and §6.0 draws the
    // crumb strip on every screen but the home one — so the top bar this menu
    // lives in is gone, which is also the menu closing.
    renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /پروفایل و گذرواژه/ }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('button', { name: /مدیریت/ })).toBeNull()
    expect(await screen.findByText('پروفایل و گذرواژه')).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the keyboard on the «مدیریت» button when its own menu opens', async () => {
    // A component DECLARED inside a render is a new function identity on every
    // render, so React unmounts the whole header rather than reconciling it and
    // the focused button is destroyed by the state change it just caused. The
    // chrome pieces are therefore plain functions returning elements, called
    // rather than mounted. Nothing about the difference is visible in a
    // snapshot, a build, or any other test in this file.
    renderPanel(['view', 'edit'], '/departments')
    const trigger = screen.getByRole('button', { name: /مدیریت/ })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /مدیریت/ }))
  })

  it('hides the nav tray and the inbox at 1080, and the crumbs at 760', () => {
    // R7 — the shell held zero responsive utilities. The breakpoints are the
    // deliverable's own: `[data-r-nav]{display:none}` and
    // `[data-r-topbar] [data-r-hide]{display:none}` at ≤1080 — which covers the
    // divider AND the inbox button — `[data-r-topbar] [data-r-show]{display:flex}`
    // for the hamburger at the same width, and `[data-r-crumbs]{display:none}`
    // at ≤760.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-nav]')?.className).toMatch(/\bmax1080:hidden\b/)
    expect(container.querySelector('[data-r-menu]')?.className).toMatch(/\bhidden\b.*\bmax1080:flex\b/)
    expect(screen.getByRole('button', { name: /صندوق بازبینی/ }).className).toMatch(/\bmax1080:hidden\b/)
    unmount()
    const inner = renderPanel(['view', 'edit'], '/departments/dining')
    expect(inner.container.querySelector('[data-r-crumbs]')?.className).toMatch(/\bmax760:hidden\b/)
    // …and the way back survives the width that takes the trail away.
    expect(inner.container.querySelector('[data-r-crumbbar] a[href="/departments"]')).toBeInTheDocument()
  })

  it('offers every destination the bar has, in the sheet the hamburger opens', async () => {
    // The mobile chrome is the ONLY route to the inbox and to sign-out below
    // 1080, so a sheet that lost one of them would strand a phone.
    renderAdmin()
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    for (const name of ['دپارتمان‌ها', 'کاربران', 'سیاست نمایش محتوا', 'پروفایل و گذرواژه']) {
      expect(within(sheet).getByRole('link', { name: new RegExp(name) }), name).toBeInTheDocument()
    }
    expect(within(sheet).getByRole('button', { name: /صندوق بازبینی/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'خروج' })).toBeInTheDocument()
    // …and each destination is the route it names. The «مدیریت» popover's three
    // hrefs are asserted twice over; the sheet's one non-`adminItems`
    // destination was not asserted once, and the test that clicks it waits for
    // the dialog to vanish, never for where it went.
    expect(within(sheet).getByRole('link', { name: /دپارتمان‌ها/ })).toHaveAttribute('href', '/departments')
    expect(within(sheet).getByRole('link', { name: /کاربران/ })).toHaveAttribute('href', '/users')
    expect(within(sheet).getByRole('link', { name: /سیاست نمایش محتوا/ })).toHaveAttribute('href', '/visibility')
    expect(within(sheet).getByRole('link', { name: /پروفایل و گذرواژه/ })).toHaveAttribute('href', '/profile')
  })

  /* R5 in the sheet. Every fixture that had ever opened it was `renderAdmin()`
     — an editor holding both administration capabilities, scoped `*` — so the
     surface that carries them all on six of the eight routes was graded by one
     session who is allowed everything. Both mutations below survived vitest AND
     Playwright: `{canEdit &&` rewritten to `{true &&`, and `adminItems` replaced
     by a literal three-entry list. The bar's twins are protected by tests that
     read `[data-r-topbar]` and by seven in PanelShell.visibility.test.tsx that
     read the popover; not one of them can see the sheet. */
  it('leaves the inbox out of the sheet for a caller who cannot edit', async () => {
    // R5/C2 — «صندوق بازبینی» drawn to a `view`-only caller is an entry the
    // screen behind it refuses, which R5 forbids in the form that costs a
    // click to discover. It is also the only sheet row that fires a query.
    renderPanel(['view'], '/departments/dining')
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).queryByRole('button', { name: /صندوق بازبینی/ })).toBeNull()
    // …and the sheet it is absent from is on screen and carries its other rows,
    // which is the difference between "this entry is gated" and "nothing
    // rendered at all".
    expect(within(sheet).getByRole('link', { name: /دپارتمان‌ها/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'خروج' })).toBeInTheDocument()
  })

  it('leaves the administration entries this caller cannot reach out of the sheet too', async () => {
    // A `view`-only panel caller holds neither administration capability, so
    // the group holds its one ungated entry and nothing else.
    renderPanel(['view'], '/departments/dining')
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    for (const name of ['کاربران', 'سیاست نمایش محتوا']) {
      expect(within(sheet).queryByRole('link', { name: new RegExp(name) }), name).toBeNull()
    }
    expect(within(sheet).getByRole('link', { name: /پروفایل و گذرواژه/ })).toBeInTheDocument()
  })

  it('leaves user administration out of the sheet for a holder scoped to one department', async () => {
    // D56, in the sheet. `session()` is scoped to `dept:dining`, and
    // `administrationRefusal` checks the SCOPE before the capability — so this
    // holder of `manage_users` is answered 404 on every endpoint behind
    // «کاربران». Drawn, it is a wall the app itself pointed them at.
    renderPanel(['view', 'edit', 'manage_users', 'set_visibility'], '/departments/dining')
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).queryByRole('link', { name: /کاربران/ })).toBeNull()
    // …and «سیاست نمایش محتوا» goes with it, one refusal code milder: that
    // screen asks `can('set_visibility', '*')` because one policy governs every
    // department (D11), and this caller holds the capability but not the scope.
    expect(within(sheet).queryByRole('link', { name: /سیاست نمایش محتوا/ })).toBeNull()
    // The pair's other half: scoped `*`, the same capabilities, both drawn. A
    // gate spelled `false` would satisfy every negative above.
    expect(within(sheet).getByRole('link', { name: /پروفایل و گذرواژه/ })).toBeInTheDocument()
  })

  it('draws both gated entries in the sheet for a holder scoped `*`', async () => {
    renderAdmin('/departments/dining')
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    for (const name of ['کاربران', 'سیاست نمایش محتوا', 'پروفایل و گذرواژه']) {
      expect(within(sheet).getByRole('link', { name: new RegExp(name) }), name).toBeInTheDocument()
    }
    expect(within(sheet).getByRole('button', { name: /صندوق بازبینی/ })).toBeInTheDocument()
  })

  it('counts the sheet’s inbox in Persian, which is the count a phone can see', async () => {
    // The bar's badge is asserted in Persian and the bar is hidden at ≤1080, so
    // the ONE count a phone is ever shown had no digit assertion at all — and
    // no fixture had ever opened the sheet with a non-empty inbox, so `toFa`
    // could come off and both suites would agree. The Playwright check matches
    // `/صندوق بازبینی/` as a regex, which «صندوق بازبینی 2» satisfies.
    renderAdmin('/departments/dining', {
      pending: [{ process: 'dining-001' }, { process: 'dining-002' }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    const row = await within(sheet).findByRole('button', { name: /صندوق بازبینی ۲/ })
    expect(row).toBeInTheDocument()
    // …and no latin digit anywhere in the sheet, which is the assertion that
    // does not have to be told where the count is written.
    expect(sheet.textContent ?? '').not.toMatch(/[0-9]/)
    expect(sheet.textContent ?? '').toContain('۲')
  })

  it('grows every under-sized chrome control to the 44px floor', () => {
    // F11 against the design's ladder: the painted box stays 34, 36 and 40, and
    // a transparent ::before carries the target. `expectExpandedHitArea`
    // resolves the used width from the element's own classes rather than
    // matching a literal, so it also refuses a ::before that has been told not
    // to draw.
    //
    // Was "both", and read two controls. There are FOUR under-sized boxes in
    // this chrome and the two it missed are the two sheet openers — the strip's
    // is the only route to sign-out on six routes, and dropping `${HIT}` off it
    // left a 36px target under the floor with every suite green.
    const bar = renderPanel(['view', 'edit'], '/departments')
    expectExpandedHitArea(screen.getByRole('button', { name: 'خروج' }))
    expectExpandedHitArea(screen.getByRole('button', { name: 'فهرست' }))
    bar.unmount()
    renderPanel(['view', 'edit'], '/departments/dining')
    expectExpandedHitArea(screen.getByRole('link', { name: 'خانه' }))
    expectExpandedHitArea(screen.getByRole('button', { name: 'فهرست' }))
  })

  it('marks the surface so R3’s scale resolves under it', () => {
    // The provider is what makes `--role-tile`, `--role-iconbtn` and
    // `--role-lh-lockup` mean the panel's number rather than the reader's; the
    // wrapper is `display: contents`, so it introduces no box.
    const { container } = renderPanel(['view', 'edit'], '/departments')
    const surface = container.querySelector('[data-surface="panel"]')
    expect(surface).toBeInTheDocument()
    expect(surface).toHaveClass('contents')
    expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument()
  })

  it('gives the outlet a growing, unpadded flex column ancestor on both chromes', () => {
    // C1 — unchanged from before: FlowScreen's canvas resolves its height
    // against this chain, and padding here renders it at zero height.
    for (const entry of ['/departments', '/departments/dining']) {
      const { unmount } = renderPanel(['view', 'edit'], entry)
      const main = screen.getByText('محتوا').parentElement as HTMLElement
      expect(main.tagName, entry).toBe('MAIN')
      expect(main.className, entry).toMatch(/\bflex-1\b/)
      expect(main.className, entry).toMatch(/\bmin-h-0\b/)
      expect(main.className, entry).not.toMatch(/(^|\s)p[xytrbl]?-/)
      unmount()
    }
  })

  it('renders no h1 of its own, in either chrome', () => {
    // I6 — the routed screen owns the page's one h1 (F11).
    for (const entry of ['/departments', '/departments/dining']) {
      const { container, unmount } = renderPanel(['view', 'edit'], entry)
      expect(container.querySelectorAll('h1'), entry).toHaveLength(0)
      unmount()
    }
  })
})

/* ==================================================================== *
 * PanelShell — reachability
 *
 * §6.0 draws the top bar on `/departments` and the crumb strip everywhere
 * else, and that gating is kept. What the design cannot settle is where the
 * app's own controls go on the screens the bar is absent from: it draws no
 * sign-out at all, so it never had to answer.
 *
 * The answer this shell shipped with was "nowhere". Every test in the block
 * above passed over an editor who, standing on the flow screen, could not
 * sign out, could not open the conflict inbox and could not reach any
 * administration screen — and, under 1080, had no opener for the sheet that
 * holds all three either. The shipping shell before the rewrite (a033328^)
 * drew its header on every route.
 * ==================================================================== */

/**
 * Every route this shell is ever mounted on — `src/routes.tsx`'s whole panel
 * list, minus the two redirects.
 *
 * **The three flat administration routes are the ones that matter here, and
 * they were missing.** They used to be the routes with no back control at all:
 * `panelCrumbs` gave `/users`, `/visibility` and `/profile` a single crumb, so
 * `back` was undefined on all three, and a reviewer's mutation that wrapped the
 * strip's opener in the back button's own `back?.to !== undefined` guard removed
 * sign-out, the inbox and all three administration entries from the three
 * administration screens while the block below — named "EVERY route" — stayed
 * green.
 *
 * **R41 has since given all three the back control the design draws on them**
 * (`crumbs.ts`, the leading «دپارتمان‌ها» that was missing), and **R44 the
 * flowchart** — see `WITH_BACK`, which is now every route that has a strip at
 * all. The mutation above is therefore no longer a mutation: `back?.to` is
 * defined on every route this shell draws a strip on, so wrapping the opener in
 * that guard changes nothing an assertion could observe. What used to catch it
 * is now split across two tests that each catch half of the damage it did —
 * `puts sign-out one control away on EVERY route` would lose the opener, and
 * `draws the strip’s opener beside «بازگشت» on every route that has a strip`
 * would lose it beside a back control that is still there. The list stays as it
 * is: it is the route table, and every test in this block is about all of it.
 */
const ROUTES = [
  '/departments',
  '/departments/dining',
  '/departments/dining/overview',
  '/processes/dining-003',
  '/processes/dining-003/flow',
  '/users',
  '/users/09120000000',
  '/visibility',
  '/profile',
]

/**
 * Every route whose crumb strip carries a back control — which, since R44, is
 * every route that has a crumb strip.
 *
 * **R41 moved three across and R44 the fourth.** `/users`, `/visibility` and
 * `/profile` had no back because `panelCrumbs` gave them a single crumb; the
 * flowchart had none because `PanelShell` suppressed it there, `FlowScreen`
 * having drawn one of its own inside the toolbar. `FlowScreen` now draws that
 * button for the reader only, so nothing on this surface is drawn twice and
 * nothing is left without. `/departments` is the one exclusion: it wears the
 * top bar, so it has no strip to hold either control.
 */
const WITH_BACK = ROUTES.filter((r) => r !== '/departments')

describe('PanelShell reachability', () => {
  it('puts sign-out one control away on EVERY route', async () => {
    for (const entry of ROUTES) {
      const { unmount } = renderAdmin(entry)
      const opener = screen.getByRole('button', { name: 'فهرست' })
      await userEvent.click(opener)
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'خروج' }), entry)
        .toBeInTheDocument()
      unmount()
    }
  })

  it('puts the conflict inbox one control away on EVERY route', async () => {
    for (const entry of ROUTES) {
      const { unmount } = renderAdmin(entry)
      await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: /صندوق بازبینی/ }), entry)
        .toBeInTheDocument()
      unmount()
    }
  })

  it('puts every administration screen one control away on EVERY route', async () => {
    for (const entry of ROUTES) {
      const { unmount } = renderAdmin(entry)
      await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
      const sheet = screen.getByRole('dialog')
      for (const name of ['کاربران', 'سیاست نمایش محتوا', 'پروفایل و گذرواژه']) {
        expect(within(sheet).getByRole('link', { name: new RegExp(name) }), `${entry} ${name}`)
          .toBeInTheDocument()
      }
      unmount()
    }
  })

  it('draws the crumb strip’s opener at every width, unlike the bar’s', () => {
    // The bar's hamburger is the ≤1080 stand-in for a nav tray that is drawn
    // above it; the strip has no tray at any width, so its opener is not a
    // narrow-screen affordance and must not be hidden at a breakpoint. A
    // `max1080:` on this one puts every desktop editor back where they started.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments/dining')
    const opener = container.querySelector('[data-r-crumbbar] [data-r-menu]') as HTMLElement
    expect(opener).toBeInTheDocument()
    expect(opener.className).not.toMatch(/\bhidden\b/)
    expect(opener.className).not.toMatch(/max\d+:/)
    unmount()
    // …and it lives in the strip's own inline-end cluster, beside «خانه»,
    // which is the box §6.0 draws there, and AFTER it: the deliverable's
    // cluster reads «خانه» first from the inline start, and an `order-` on
    // either control transposes the two without moving a line of markup.
    const inner = renderPanel(['view', 'edit'], '/departments/dining')
    const cluster = inner.container.querySelector('[data-r-crumbbar] .ms-auto') as HTMLElement
    expect(within(cluster).getByRole('link', { name: 'خانه' })).toBeInTheDocument()
    expect(within(cluster).getByRole('button', { name: 'فهرست' })).toBeInTheDocument()
    expect(Array.from(cluster.children).map((c) => c.getAttribute('aria-label')))
      .toEqual(['خانه', 'فهرست'])
  })

  it('draws the strip’s opener beside «بازگشت» on every route that has a strip', () => {
    // Three controls, on all eight of them: «خانه», the sheet opener — the only
    // thing on these screens that reaches sign-out, the inbox or any
    // administration entry — and the back button.
    //
    // **Both are asserted together because R44 left no route to tell them
    // apart.** Until it landed, the flowchart's strip had no «بازگشت» (R41 gave
    // that route's to the flow toolbar, and before R41 `/users`, `/visibility`
    // and `/profile` had none either), so a mutation that hung the opener off
    // the back button's own `back?.to !== undefined` guard emptied a real
    // screen and this test saw it. Now `back?.to` is defined wherever a strip
    // is drawn at all, so that mutation is equivalent code and no assertion can
    // catch it — what it USED to break is covered instead by this test's third
    // expectation and by `puts sign-out one control away on EVERY route`, which
    // walks the same table and opens the sheet.
    for (const entry of WITH_BACK) {
      const { container, unmount } = renderPanel(['view', 'edit'], entry)
      expect(container.querySelector('[data-r-crumbbar] a[href="/departments"][aria-label]'), entry)
        .toBeInTheDocument()
      expect(container.querySelector('[data-r-crumbbar] [data-r-menu]'), entry).toBeInTheDocument()
      expect(within(container).getByRole('link', { name: /بازگشت/ }), entry).toBeInTheDocument()
      unmount()
    }
    // …and the route with no strip has neither, so this is a test about two
    // branches rather than one that would pass with a strip on every route.
    const { container } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-crumbbar]')).toBeNull()
    expect(within(container).queryByRole('link', { name: /بازگشت/ })).toBeNull()
  })

  it('leaves the strip’s opener in the tab order, on every route it is drawn', () => {
    // On six of the eight routes this control is the only way to sign-out and
    // to the inbox. `tabIndex={-1}` on it takes both away from a keyboard-only
    // caller entirely and is invisible to every other assertion in this file:
    // the element is still present, still labelled, still the right size and
    // still clickable by a mouse.
    for (const entry of ROUTES) {
      const { container, unmount } = renderPanel(['view', 'edit'], entry)
      const opener = container.querySelector('[data-r-menu]') as HTMLElement
      expect(opener, entry).toBeInTheDocument()
      expect(opener.tabIndex, `${entry}: the sheet opener is out of the tab order`).toBe(0)
      expect(opener.hasAttribute('disabled'), entry).toBe(false)
      expect(opener.getAttribute('aria-hidden'), entry).toBeNull()
      unmount()
    }
  })

  it('draws the strip’s opener at the design’s own box, in the design’s own colours', async () => {
    // The whole emitted set, values included. Everything about this control was
    // asserted except what it looks like: that it exists, that its class string
    // carries no `hidden` and no breakpoint variant, and which glyph is in it.
    // Six separate mutations to its paint survived both suites — including
    // dropping `hover:bg-tile-v2` from the ghost recipe, which leaves `Icon`'s
    // `currentColor` white on a white box: an empty white square where the only
    // sign-out on the screen is.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments/dining')
    const opener = container.querySelector('[data-r-crumbbar] [data-r-menu]') as HTMLElement
    const o = await paint(opener.className)
    unmount()
    expect(declarations(o)).toEqual(new Set([
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'position: relative',
      'width: var(--size-menu-more)',
      'height: var(--size-menu-more)',
      'border-radius: var(--radius-input)',
      'border-width: var(--border-hairline)',
      'border-color: var(--line)',
      'background-color: var(--card)',
      'color: var(--violet)',
      'text-decoration-line: none',
      'cursor: pointer',
      'flex: none',
    ]))
    // The hover half, which is the one that decides whether the glyph is
    // visible at all: `Icon` draws in `currentColor`, so a control whose label
    // is `--card` on the strip's own white box is an empty square.
    expect(declarations(o, ':hover')).toEqual(new Set(['background-color: var(--tile-v2)']))
    expect(winner(o, 'color')).not.toBe('var(--card)')
    // §6.0's own «خانه» beside it is the strip's 36px white box, not the bar's
    // 40px lavender one — on this lavender ground a lavender button is a border
    // and nothing else. `--size-tool` is the same family one rung down (34px)
    // and compiles; `--role-iconbtn` is the bar's 40.
    expect(winner(o, 'width')).not.toBe('var(--size-tool)')
    expect(winner(o, 'width')).not.toBe('var(--role-iconbtn)')
    expect(winner(o, 'background-color')).not.toBe('var(--tile-v2)')
    // …and the ::before that carries F11's floor around the 36px box.
    expect(winner(o, 'position', '::before')).toBe('absolute')
    expect(winner(o, 'content', '::before')).toBe('var(--tw-content)')
    expect(winner(o, '--tw-content', '::before')).toBe('""')
    expect(winner(o, 'inset', '::before')).toBe('-5px')
  })

  it('paints «خانه» the same 36px white box, and neither control reorders itself', async () => {
    // The opener's neighbour, and the deliverable's own control (Panel :189).
    // Its box was read one property at a time — `width` and the ::before inset
    // — so the rest of it, its colours included, had no assertion at all.
    //
    // **`order-` is why this is a whole-set and not four `winner` lines.** The
    // cluster's markup order is asserted a few tests up, and `order-last` on
    // either control transposes the two without touching a line of it: the
    // deliverable reads «خانه» first from the inline start, and a strip that
    // draws the hamburger there instead puts the app's only sign-out where the
    // design puts going home. Nothing in a class-name check, a snapshot or
    // jsdom can see that, because jsdom resolves no flex order.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments/dining')
    const cluster = container.querySelector('[data-r-crumbbar] .ms-auto') as HTMLElement
    const sets = await Promise.all(
      Array.from(cluster.children).map(async (c) => declarations(await paint((c as HTMLElement).className))),
    )
    unmount()
    const BOX = new Set([
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'position: relative',
      'width: var(--size-menu-more)',
      'height: var(--size-menu-more)',
      'border-radius: var(--radius-input)',
      'border-width: var(--border-hairline)',
      'border-color: var(--line)',
      'background-color: var(--card)',
      'color: var(--violet)',
      'text-decoration-line: none',
      'cursor: pointer',
      'flex: none',
    ])
    // Both controls, one recipe, and NEITHER of them setting `order` — which is
    // the declaration this set exists to refuse.
    expect(sets).toEqual([BOX, BOX])
  })

  it('sizes the glyph in each chrome opener to the deliverable’s own number', () => {
    // §6.0 draws a 19px hamburger in the bar's 40px box and a 17px one in the
    // strip's 36px box. `Icon` writes `px` as a width ATTRIBUTE, so nothing in
    // a class-name assertion can see it and an 8px glyph in a 36px box is a
    // control that looks empty.
    for (const [entry, px] of [['/departments', '19'], ['/departments/dining', '17']] as const) {
      const { unmount } = renderPanel(['view', 'edit'], entry)
      const svg = screen.getByRole('button', { name: 'فهرست' }).querySelector('svg')
      expect(svg?.getAttribute('width'), entry).toBe(px)
      expect(svg?.getAttribute('height'), entry).toBe(px)
      unmount()
    }
  })
})

/* ==================================================================== *
 * PanelShell — the chrome's controls actually do something
 *
 * Every assertion in this block is about an `onClick`. Before it, the suite
 * clicked «مدیریت» and the scrim and nothing else in the chrome: dropping the
 * handler off the top bar's sign-out, off the inbox button, off the sheet's
 * sign-out, or off the sheet's destinations left every vitest and every
 * Playwright project green, at all three widths.
 * ==================================================================== */

/** The URLs the shell's stubbed `fetch` was actually asked for. */
const asked = () => vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]))

/** `POST /api/auth/logout` — what `useLogout` does and the only proof it ran. */
function signedOut(): number {
  return vi.mocked(globalThis.fetch).mock.calls
    .filter((c) => String(c[0]).includes('/api/auth/logout'))
    .filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    .length
}

/** The inbox modal's own subtitle — a string no button in either chrome carries. */
const INBOX_BODY = /مقدار فعلی در برابر پیشنهاد/

describe('PanelShell controls', () => {
  it('signs out when the top bar’s «خروج» is pressed', async () => {
    renderPanel(['view', 'edit'], '/departments')
    expect(signedOut()).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(signedOut()).toBe(1))
  })

  it('signs out when the sheet’s «خروج» is pressed', async () => {
    // The phone's only sign-out, and a separate handler from the one above.
    renderAdmin()
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(signedOut()).toBe(1))
  })

  it('opens the conflict inbox when the top bar’s inbox is pressed', async () => {
    renderPanel(['view', 'edit'], '/departments')
    expect(screen.queryByText(INBOX_BODY)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /صندوق بازبینی/ }))
    expect(await screen.findByText(INBOX_BODY)).toBeInTheDocument()
  })

  it('opens the inbox from the sheet, and shuts the sheet on the way', async () => {
    // Two state changes on one handler, and the suite could see neither. A
    // sheet that opens the inbox and stays put leaves the phone's whole screen
    // covered by the menu it was dismissed from; one that shuts and opens
    // nothing is a control that does nothing at all.
    renderAdmin()
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /صندوق بازبینی/ }),
    )
    expect(await screen.findByText(INBOX_BODY)).toBeInTheDocument()
    // …and the SHEET is gone, named. A bare `queryByRole('dialog')` said "no
    // dialog is left", which stopped being the claim the moment `InboxModal`
    // became a real `role="dialog"` of its own (Task 24): the box this test is
    // about is the one titled «فهرست», and what replaced it is a dialog too.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'فهرست' })).toBeNull())
  })

  it('shuts the sheet behind every destination it offers', async () => {
    // The sheet navigates and then stands over the screen it navigated to.
    for (const name of ['دپارتمان‌ها', 'کاربران', 'سیاست نمایش محتوا', 'پروفایل و گذرواژه']) {
      const { unmount } = renderAdmin()
      await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('link', { name: new RegExp(name) }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog'), name).toBeNull())
      unmount()
    }
  })

  it('points the brand lockup and the nav pill at the home screen', async () => {
    // Neither destination was asserted, so the logo could take you to the
    // password screen and the one nav entry to the policy screen, and the crumb
    // links — whose `href`s ARE asserted — would go on passing.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments')
    const lockup = container.querySelector('[data-r-topbar] > a') as HTMLElement
    expect(within(lockup).getByText('اینجا فست‌فود')).toBeInTheDocument()
    expect(lockup).toHaveAttribute('href', '/departments')
    expect(container.querySelector('[data-r-nav] a')).toHaveAttribute('href', '/departments')
    unmount()
    // …and pressing the lockup keeps you there rather than moving you.
    renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(within(
      screen.getByText('اینجا فست‌فود').closest('a') as HTMLElement,
    ).getByText('اینجا فست‌فود'))
    expect(await screen.findByRole('button', { name: /مدیریت/ })).toBeInTheDocument()
    expect(asked().some((u) => u.includes('/api/departments'))).toBe(true)
  })
})

/* ==================================================================== *
 * PanelShell — the glyphs
 *
 * Task 11's finding species: a wrong picture on a real button. Every control
 * below carries a `<Icon name>` whose drawing nothing measured, so the panel
 * could sign you out under a hamburger, send you home under a sheet of paper
 * and open the inbox under a speech bubble with the whole suite green.
 * ==================================================================== */

describe('PanelShell glyphs', () => {
  it('draws eight DIFFERENT pictures, so the pins below are about something', () => {
    // The negative half. Without it, an icon set that had collapsed to one
    // drawing would satisfy every assertion in this block.
    //
    // Named "six" while asserting eight, which is harmless — the assertion is
    // the stronger of the two — and is the same name/shape slippage this
    // project keeps finding, in this round's own new code. The name is now the
    // count, and the count is read off the list rather than written twice.
    const names = ['logout', 'menu', 'home', 'file', 'inbox', 'comment', 'chevronDown', 'chevronUp'] as const
    const drawn = names.map(iconGlyph)
    for (const d of drawn) expect(d).not.toBe('')
    expect(new Set(drawn).size).toBe(names.length)
  })

  it('draws the sign-out glyph on sign-out, not the hamburger beside it', () => {
    const { unmount } = renderPanel(['view', 'edit'], '/departments')
    const out = glyphOf(screen.getByRole('button', { name: 'خروج' }))
    unmount()
    expect(out).toBe(iconGlyph('logout'))
    expect(out).not.toBe(iconGlyph('menu'))
  })

  it('draws the inbox tray on the inbox, not a speech bubble', () => {
    // The deliverable draws a TRAY on this button (Panel :158). `comment` is
    // the glyph an earlier pass reached for and is a different picture.
    const { unmount } = renderPanel(['view', 'edit'], '/departments')
    const box = glyphOf(screen.getByRole('button', { name: /صندوق بازبینی/ }))
    unmount()
    expect(box).toBe(iconGlyph('inbox'))
    expect(box).not.toBe(iconGlyph('comment'))
  })

  it('draws a house on «خانه», not a sheet of paper', () => {
    // §6.0 draws `M3 11l9-7 9 7v9…` on this very button (Panel :189). `file` is
    // in the panel's own set, so a swap compiles and every other test agrees.
    const { unmount } = renderPanel(['view', 'edit'], '/departments/dining')
    const house = glyphOf(screen.getByRole('link', { name: 'خانه' }))
    unmount()
    expect(house).toBe(iconGlyph('home'))
    expect(house).not.toBe(iconGlyph('file'))
  })

  it('draws the hamburger on both sheet openers, not the tray or a house', () => {
    for (const entry of ['/departments', '/departments/dining']) {
      const { unmount } = renderPanel(['view', 'edit'], entry)
      const burger = glyphOf(screen.getByRole('button', { name: 'فهرست' }))
      expect(burger, entry).toBe(iconGlyph('menu'))
      expect(burger, entry).not.toBe(iconGlyph('home'))
      unmount()
    }
  })

  it('draws the crumb strip’s two glyphs at the deliverable’s own weights', async () => {
    // Panel 177 draws the back chevron at `stroke-width:2.4`; Panel 191 draws
    // the house at `2`. `Icon`'s default is 2, so one of the two is written at
    // the call site and the other is the default holding — and swapping either
    // way compiles, paints, and leaves every size, glyph, box and colour
    // assertion in this file agreeing with it. A 2.4 house is a heavier drawing
    // in the same square; a 2.0 chevron is a thinner one.
    const { unmount } = renderPanel(['view', 'edit'], '/departments/dining')
    expect(strokeOf(screen.getByRole('link', { name: 'بازگشت' }))).toBe('2.4')
    expect(strokeOf(screen.getByRole('link', { name: 'خانه' }))).toBe('2')
    unmount()
  })

  it('points the «مدیریت» caret down while its menu is shut, and leaves it there', async () => {
    // §6.0 draws `M6 9l6 6 6-6` here and writes no open-state variant, though
    // it has an `adminOpen` to key one off. A caret drawn UP while the menu is
    // shut says the opposite of what the button does, and `aria-expanded` —
    // which IS asserted — cannot see it.
    renderPanel(['view', 'edit'], '/departments')
    const trigger = screen.getByRole('button', { name: /مدیریت/ })
    expect(glyphOf(trigger)).toBe(iconGlyph('chevronDown'))
    expect(glyphOf(trigger)).not.toBe(iconGlyph('chevronUp'))
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(glyphOf(screen.getByRole('button', { name: /مدیریت/ }))).toBe(iconGlyph('chevronDown'))
  })
})

/* ==================================================================== *
 * PanelShell — dismissing the «مدیریت» popover from the keyboard
 * ==================================================================== */

describe('PanelShell popover dismissal', () => {
  it('shuts on Escape and hands the keyboard back to the trigger', async () => {
    // Probed before this landed: open, Escape, and the menu was still there.
    // The only ways out were a mouse click on the trigger or on an
    // `aria-hidden` scrim, so a keyboard-only caller could not dismiss it at
    // all — they could tab through it, past it, and never close it.
    renderPanel(['view', 'edit'], '/departments')
    const trigger = screen.getByRole('button', { name: /مدیریت/ })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // **Standing INSIDE the popover when Escape arrives**, which is the only
    // arrangement that can see the second half of this test. Pressed from the
    // trigger, focus was never going to move, so an implementation that
    // restores nothing passes — measured: dropping the restore left a version
    // of this test that opened from the trigger completely green.
    await userEvent.tab()
    const first = within(screen.getByRole('menu')).getAllByRole('menuitem')[0]
    expect(document.activeElement).toBe(first)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: /مدیریت/ })).toHaveAttribute('aria-expanded', 'false')
    // …and the keyboard is back on the trigger rather than on <body>, which is
    // the half `src/ui/Menu.tsx` leaves out: Escape unmounts the node the
    // caller was standing on, and focus falls to the document body, so the
    // next Tab restarts from the top of the page.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /مدیریت/ }))
  })

  it('defers to whatever dismissible is above it, rather than listening on document', async () => {
    // I7 — the shared stack, the one `src/ui/Menu.tsx` and `src/ui/Overlay.tsx`
    // push onto. A bare `document` keydown listener passes the test above and
    // fails this one: with a Dialog opened over this menu, one Escape would
    // close both, which is the exact defect I7 was raised for.
    renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    const above = Symbol('something over the menu')
    pushDismissible(above)
    try {
      await userEvent.keyboard('{Escape}')
      expect(screen.getByRole('menu')).toBeInTheDocument()
    } finally {
      popDismissible(above)
    }
    // …and it answers again the moment it is topmost.
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('leaves the shared stack as it found it', async () => {
    // An identity that is pushed and never popped sits on top of the stack for
    // ever and silences every dismissible after it — including the sheet and
    // the inbox modal this same shell opens.
    const { unmount } = renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    // If the shell's identity were still on the stack, this one could not be
    // the top and its own Escape would be ignored.
    const after = Symbol('after')
    pushDismissible(after)
    expect(isTopDismissible(after)).toBe(true)
    popDismissible(after)
    unmount()
  })

  it('takes its keydown listener off the document when it shuts', async () => {
    // The other half of the cleanup, and it cannot be observed through
    // behaviour: a listener left behind is guarded by the same
    // `isTopDismissible` check as the live one, so it early-returns and does
    // nothing visible. What it does instead is accumulate — one more listener
    // on `document` per open, for the life of the session — and the only place
    // that is visible is the registration itself. So the registration is what
    // is counted.
    const added: unknown[] = []
    const removed: unknown[] = []
    const realAdd = document.addEventListener.bind(document)
    const realRemove = document.removeEventListener.bind(document)
    vi.spyOn(document, 'addEventListener').mockImplementation((t, l, o) => {
      if (t === 'keydown') added.push(l)
      realAdd(t, l as EventListener, o)
    })
    vi.spyOn(document, 'removeEventListener').mockImplementation((t, l, o) => {
      if (t === 'keydown') removed.push(l)
      realRemove(t, l as EventListener, o)
    })
    renderPanel(['view', 'edit'], '/departments')
    const trigger = () => screen.getByRole('button', { name: /مدیریت/ })
    for (let i = 0; i < 3; i++) {
      await userEvent.click(trigger())
      expect(screen.getByRole('menu')).toBeInTheDocument()
      await userEvent.click(trigger())
      expect(screen.queryByRole('menu')).toBeNull()
    }
    // Three opens, three closes: whatever went on came back off, and nothing is
    // still attached. A count of zero on both sides would make this vacuous.
    expect(added.length).toBeGreaterThanOrEqual(3)
    expect(new Set(removed)).toEqual(new Set(added))
  })
})

/* -------------------------------------------------------------------------
   Everything above proves a string was written into a class attribute. jsdom
   paints nothing, so it cannot tell `py-crumb-y` from `py-crmub-y` — an
   invented utility emits no rule and the build still exits 0 — and it cannot
   tell which of two utilities setting the same property wins, because that is
   decided by Tailwind's output order and not by the order of the class string.

   So the block below runs the shell's OWN rendered class strings through the
   real `tailwind.config.js` and asserts the declarations that come out.

   `paint`, `winner` and `declarations` come from `src/test/paint.ts`, which is
   where src/ui/table.test.tsx's comment asks for them to be lifted "by Task
   12". This file's copy is gone and the module they should point at exists;
   lifting the rest is one import each and is left to whoever unfreezes
   `src/ui/`, which is frozen for this task.

   **Seven files under `src/ui/` still carry their own copy**, not two: choices,
   composites, fields, icons, Overlay, primitives.design and table. The earlier
   count here said "two left rather than three", which was true only of the
   three files the older comment in table.test.tsx happened to name, and reading
   it as the whole inventory understates the lift by more than a factor of two.
   ------------------------------------------------------------------------- */

const R1080 = '(max-width: 1080px)'
const R760 = '(max-width: 760px)'

/**
 * The class strings the shell actually renders, read off the DOM.
 *
 * `unmount` is handed back and every caller uses it. Without that, each render
 * stayed mounted for the rest of the file and `screen` queries went ambiguous
 * across tests — one assertion below had already been written as
 * `getAllByRole(…)[1]` to step over a shell nobody had taken down.
 */
function chrome(entry: string, caps: Capability[] = ['view', 'edit']) {
  const { container, unmount } = renderPanel(caps, entry)
  const cls = (sel: string) => {
    const el = container.querySelector(sel)
    if (el === null) throw new Error(`chrome(): nothing rendered for \`${sel}\``)
    return (el as HTMLElement).className
  }
  return { container, cls, unmount }
}

describe('the compiler this block is asserted with', () => {
  // Every assertion below reads `winner()`, which returns '' both for "nothing
  // sets it" and for "the class was invented". Without this, a `paint()` that
  // silently produced nothing would let every `.not.toBe(…)` pass over an empty
  // sheet — the broken-checker failure this project has hit three times.
  it('resolves a real utility and nothing at all for an invented one', async () => {
    expect(winner(await paint('py-crumb-y'), 'padding-top')).toBe('var(--pad-crumb-y)')
    expect(winner(await paint('py-crmub-y'), 'padding-top')).toBe('')
    expect(winner(await paint('px-topbar'), 'padding-left')).toBe('var(--pad-topbar)')
    expect(winner(await paint('px-topbra'), 'padding-left')).toBe('')
    // …and the media half of it, which the responsive assertions all depend on.
    expect(winner(await paint('max1080:hidden'), 'display', '', R1080)).toBe('none')
    expect(winner(await paint('max1080:hidden'), 'display')).toBe('')
    expect(winner(await paint('max9999:hidden'), 'display', '', '(max-width: 9999px)')).toBe('')
  })

  it('reports the VALUE a property settles on, not merely that it was set', async () => {
    // The whole-set guards below are `toEqual` against a written-out set, and
    // the first spelling of them collected property NAMES alone: it checked
    // that nobody had added or removed a declaration and let every swap that
    // keeps the property and changes its value walk through. Two survived a
    // reviewer's mutation survey on that exact axis. `declarations` returns
    // `name: value` pairs, and this is the pin that says so.
    expect(declarations(await paint('items-center'))).toEqual(new Set(['align-items: center']))
    expect(declarations(await paint('items-start'))).toEqual(new Set(['align-items: flex-start']))
    expect(declarations(await paint('flex'))).toEqual(new Set(['display: flex']))
    expect(declarations(await paint('inline-flex'))).toEqual(new Set(['display: inline-flex']))
    // …resolved through the cascade, like `winner`: two utilities setting one
    // property report once, at the value that actually wins. This pair is not
    // hypothetical — it is how the sheet's rows drew centred labels while their
    // source said `justify-start`.
    expect(declarations(await paint('justify-start justify-center')))
      .toEqual(new Set(['justify-content: center']))
    // …and an invented utility contributes nothing rather than a bare name.
    expect(declarations(await paint('items-centre'))).toEqual(new Set())
  })
})

describe('what the panel chrome’s class strings compile to', () => {
  it('paints the top bar white on a cream hairline, at the design’s box', async () => {
    const { cls, unmount } = chrome('/departments')
    const bar = await paint(cls('[data-r-topbar]'))
    unmount()
    // §6.0 — `padding:12px 22px; background:#fff; border-bottom:1px solid #EFE7DC`.
    expect(winner(bar, 'background-color')).toBe('var(--card)')
    expect(winner(bar, 'border-bottom-width')).toBe('1px')
    expect(winner(bar, 'border-color')).toBe('var(--warm)')
    expect(winner(bar, 'padding-top')).toBe('var(--space-6)')
    expect(winner(bar, 'padding-left')).toBe('var(--pad-topbar)')
    expect(winner(bar, 'gap')).toBe('var(--space-7)')
    // NOT the neighbouring token of the same value: `--space-10` is also 22px
    // and is the spacing ladder's rung, not the chrome gutter.
    expect(winner(bar, 'padding-left')).not.toBe('var(--space-10)')
    // §6.16 — `[data-r-topbar]{padding:10px 14px; gap:10px}` at ≤760.
    expect(winner(bar, 'padding-left', '', R760)).toBe('var(--space-7)')
    expect(winner(bar, 'padding-top', '', R760)).toBe('var(--space-5)')
    expect(winner(bar, 'gap', '', R760)).toBe('var(--space-5)')
    // …and the whole emitted set at rest, WITH the value each property settles
    // on, so neither a declaration nobody thought to name nor a value nobody
    // asked for can arrive unnoticed.
    //
    // The value half is the half that catches things. Collecting names alone —
    // which is what this assertion used to do — passed a bar whose
    // `align-items` had been moved off centre, and passed a bar changed from
    // `flex` to `inline-flex`, which shrinks a full-width white bar to the
    // width of its own buttons and stops the cream hairline at the last one.
    // Neither is visible to any `toHaveCSS` in the Playwright spec either,
    // because none of them measures this bar's box.
    expect(declarations(bar)).toEqual(new Set([
      'display: flex',
      'align-items: center',
      'gap: var(--space-7)',
      'padding-left: var(--pad-topbar)',
      'padding-right: var(--pad-topbar)',
      'padding-top: var(--space-6)',
      'padding-bottom: var(--space-6)',
      'background-color: var(--card)',
      'border-bottom-width: 1px',
      'border-color: var(--warm)',
      'flex: none',
      'z-index: var(--role-z-chrome)',
    ]))
    // …and at ≤760 the deliverable overrides the gutter and the gap and nothing
    // else, so the set there is exactly those five.
    expect(declarations(bar, '', R760)).toEqual(new Set([
      'gap: var(--space-5)',
      'padding-left: var(--space-7)',
      'padding-right: var(--space-7)',
      'padding-top: var(--space-5)',
      'padding-bottom: var(--space-5)',
    ]))
  })

  it('paints the shell’s own root as the full-viewport field it has to be', async () => {
    const { cls, unmount } = chrome('/departments')
    const root = await paint(cls('[data-shell="panel"]'))
    unmount()
    // `100vh`, not `100%`. `h-full` compiles, looks right in every class-name
    // assertion, and resolves against a parent with no height of its own — so
    // the whole app collapses to the height of its content and the flow
    // canvas, which resolves its own height down this chain, renders at zero.
    expect(declarations(root)).toEqual(new Set([
      'height: 100vh',
      'display: flex',
      'flex-direction: column',
      'overflow: hidden',
      'background-color: var(--ink)',
      'color: var(--ink)',
    ]))
  })

  it('paints the crumb strip on the violet tile, at the design’s box', async () => {
    const { cls, unmount } = chrome('/departments/dining')
    const strip = await paint(cls('[data-r-crumbbar]'))
    unmount()
    // §6.0 — `padding:9px 22px; background:#F4EFFB; border-bottom:1px solid #E3D8F5`.
    expect(winner(strip, 'padding-top')).toBe('var(--pad-crumb-y)')
    expect(winner(strip, 'padding-left')).toBe('var(--pad-topbar)')
    expect(winner(strip, 'background-color')).toBe('var(--tile-v2)')
    expect(winner(strip, 'border-color')).toBe('var(--line)')
    expect(winner(strip, 'gap')).toBe('var(--space-5)')
    // The strip is NOT the reader's back bar: that one is `10px 20px`
    // (`--space-5`) and Task 13 writes it. Same-valued neighbours refused by
    // name — 9px is also the audit tab, the option gap, the menu search field,
    // the filter chip and the timeline note.
    expect(winner(strip, 'padding-top')).not.toBe('var(--space-5)')
    expect(winner(strip, 'padding-top')).not.toBe('var(--pad-tab-y-audit)')
    // The whole set, values included: the strip is a full-width row whose
    // contents sit on its centre line, and it must stay one. `items-start`
    // drops the back button and the «خانه» button off the crumbs' baseline;
    // `inline-flex` shrinks the lavender ground to its contents and leaves the
    // rest of the row on the violet field behind it.
    expect(declarations(strip)).toEqual(new Set([
      'display: flex',
      'align-items: center',
      'gap: var(--space-5)',
      'padding-left: var(--pad-topbar)',
      'padding-right: var(--pad-topbar)',
      'padding-top: var(--pad-crumb-y)',
      'padding-bottom: var(--pad-crumb-y)',
      'background-color: var(--tile-v2)',
      'border-bottom-width: 1px',
      'border-color: var(--line)',
      'flex: none',
    ]))
    // …and §6.0 writes NO ≤760 rule for this bar at all, unlike the top bar,
    // which it overrides by name. So the set at that width is empty — not
    // "the gutter is unchanged", but "nothing is".
    expect(declarations(strip, '', R760)).toEqual(new Set())
  })

  it('gives the ghost controls a violet label over a violet-tile hover', async () => {
    // Audit S1, at the declaration level: the pairing that measured 1.04:1 was
    // `color: var(--card)` over `background-color: var(--tile-v2)`.
    const { cls, unmount } = chrome('/departments/dining')
    const back = await paint(cls('[data-r-crumbbar] a[href="/departments"]'))
    unmount()
    expect(winner(back, 'color')).toBe('var(--violet)')
    expect(winner(back, 'background-color')).toBe('var(--card)')
    expect(winner(back, 'background-color', ':hover')).toBe('var(--tile-v2)')
    expect(winner(back, 'color', ':hover')).toBe('')   // the label does not move
    expect(winner(back, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(back, 'border-color')).toBe('var(--line)')
    // §6.0 — `padding:7px 12px; border-radius:11px`.
    expect(winner(back, 'padding-top')).toBe('var(--pad-back-y)')
    expect(winner(back, 'padding-left')).toBe('var(--space-6)')
    expect(winner(back, 'border-radius')).toBe('var(--radius-input)')
    // 7px has four other owners, and the comment on `--gap-stat-dot` in
    // tokens.css forbids exactly this borrowing.
    expect(winner(back, 'padding-top')).not.toBe('var(--gap-stat-dot)')
    expect(winner(back, 'padding-top')).not.toBe('var(--pad-popover)')
    // The whole ghost recipe, values included. `justify-content` is the one
    // that has actually gone wrong in this file: the shell's mobile sheet rows
    // wrote `justify-start` after this same string and drew centred anyway,
    // because the emitted sheet puts `justify-center` last. Here centred is
    // right — a chevron and a word, sized to their own content.
    expect(declarations(back)).toEqual(new Set([
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'gap: var(--space-3)',
      'padding-left: var(--space-6)',
      'padding-right: var(--space-6)',
      'padding-top: var(--pad-back-y)',
      'padding-bottom: var(--pad-back-y)',
      'border-radius: var(--radius-input)',
      'border-width: var(--border-hairline)',
      'border-color: var(--line)',
      'background-color: var(--card)',
      'color: var(--violet)',
      'font-size: var(--fs-sm2)',
      'font-weight: var(--fw-bold)',
      'text-decoration-line: none',
      'cursor: pointer',
      'flex: none',
    ]))
  })

  it('gives the sheet’s rows the design’s full-width row, not the bar’s centred pill', async () => {
    // §6.0's sheet (Panel :2082) draws `display:flex; width:100%; padding:14px;
    // text-align:start` with the label on a `flex:1` span — a stack of rows a
    // thumb reads down the leading edge of.
    //
    // Written as the ghost recipe plus `justify-start`, it drew CENTRED, on
    // every entry, on every phone. Tailwind emits `justify-center` after
    // `justify-start`, so the cascade takes the ghost's value no matter which
    // way round the class attribute is written, and jsdom — which resolves no
    // cascade — reads the class name and reports the intent. The whole class of
    // bug is invisible without compiling the sheet, which is what this block
    // is for; it went unseen here because nothing ever painted the sheet.
    renderAdmin()
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    // A row that is NOT where this render is standing. `renderAdmin()` enters at
    // `/departments`, so «دپارتمان‌ها» wears §6.0's current-entry paint and is
    // the wrong row to read the resting recipe off; the test below is the one
    // about that row.
    const row = await paint((within(sheet).getByRole('link', { name: /پروفایل و گذرواژه/ })).className)
    expect(winner(row, 'justify-content')).toBe('flex-start')
    expect(winner(row, 'justify-content')).not.toBe('center')
    expect(winner(row, 'display')).toBe('flex')
    expect(winner(row, 'display')).not.toBe('inline-flex')
    expect(declarations(row)).toEqual(new Set([
      'display: flex',
      'align-items: center',
      'justify-content: flex-start',
      // Owner ruling R45. §6.0 writes `text-align:start` on these rows (Panel
      // :2083, :2093) and this recipe did not — which cost nothing on the four
      // `<a>` rows, since an anchor inherits the initial `start`, and centred
      // the label on the two `<button>` ones, because Chrome's UA stylesheet
      // writes `text-align:center` on a button and it inherits into the `flex:1`
      // span. Nothing in this file can see that: `paint()` compiles the class
      // string and jsdom has no UA stylesheet, so both elements read identically
      // here whether the declaration is present or not. It is pinned as a
      // DECLARATION here and measured as a painted position, per element type,
      // in `e2e/panel-shell.spec.ts`.
      'text-align: start',
      'gap: var(--space-6)',
      'padding-left: var(--space-7)',
      'padding-right: var(--space-7)',
      'padding-top: var(--space-7)',
      'padding-bottom: var(--space-7)',
      'border-radius: var(--radius-tile)',
      'border-width: var(--border-hairline)',
      'border-color: var(--line)',
      'background-color: var(--card)',
      'color: var(--violet)',
      'font-size: var(--fs-menu)',
      'font-weight: var(--fw-bold)',
      'text-decoration-line: none',
      'cursor: pointer',
    ]))
    // …and every row in the sheet is that one recipe, links and buttons alike.
    const every = [
      ...within(sheet).getAllByRole('link'),
      ...within(sheet).getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'بستن'),
    ]
    expect(every.length).toBeGreaterThan(4)
    for (const el of every) {
      expect(winner(await paint(el.className), 'justify-content'), el.textContent ?? '')
        .toBe('flex-start')
    }
  })

  it('marks the sheet row you are standing on, and leaves every other one resting', async () => {
    // §6.0's `{{ m.bg }}`/`{{ m.fg }}`/`{{ m.border }}` (Panel :2083). The sheet
    // is the app's only route to sign-out, the inbox and every administration
    // screen on six of its eight routes, and four of those routes are a
    // destination it draws — so it is the one surface where "you are here" can
    // be said at all. The «مدیریت» popover's own current-state branch was dead
    // by construction (that bar is drawn on `/departments`, and nothing in the
    // popover leads there) and was deleted; this is where it belongs.
    for (const [entry, current] of [
      ['/departments', 'دپارتمان‌ها'],
      ['/visibility', 'سیاست نمایش محتوا'],
      ['/profile', 'پروفایل و گذرواژه'],
    ] as const) {
      const { unmount } = renderAdmin(entry)
      await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
      const sheet = screen.getByRole('dialog')
      const rows = within(sheet).getAllByRole('link')
      expect(rows.length, entry).toBeGreaterThan(3)
      for (const row of rows) {
        const here = (row.textContent ?? '').includes(current)
        const p = await paint(row.className)
        const where = `${entry} → ${row.textContent}`
        expect(winner(p, 'background-color'), where).toBe(here ? 'var(--violet)' : 'var(--card)')
        expect(winner(p, 'color'), where).toBe(here ? 'var(--card)' : 'var(--violet)')
        expect(winner(p, 'border-color'), where).toBe(here ? 'var(--violet)' : 'var(--line)')
        // The current row must carry NO hover. `text-card` over `--tile-v2` is
        // the 1.04:1 pairing audit S1 measured, and lighting the violet row
        // lavender under its white label is exactly that pairing, on the one
        // menu a phone has. A resting row hovers because its label is violet.
        expect(winner(p, 'background-color', ':hover'), where)
          .toBe(here ? '' : 'var(--tile-v2)')
      }
      // …and exactly one row is marked, so this is a current-entry highlight
      // and not a fill that happens to be on.
      const marked = await Promise.all(
        rows.map(async (r) => winner(await paint(r.className), 'background-color')),
      )
      expect(marked.filter((c) => c === 'var(--violet)').length, entry).toBe(1)
      unmount()
    }
  })

  it('marks nothing at all on a route the sheet does not lead to', async () => {
    // The negative half of the pair above. Without it a highlight spelled
    // `true` — or one keyed off something the fixture always satisfies — paints
    // every row violet and satisfies every "the current row is violet" line.
    renderAdmin('/processes/dining-003/flow')
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const rows = within(screen.getByRole('dialog')).getAllByRole('link')
    expect(rows.length).toBeGreaterThan(3)
    for (const row of rows) {
      expect(winner(await paint(row.className), 'background-color'), row.textContent ?? '')
        .toBe('var(--card)')
    }
  })

  it('carries every sheet label on a flex:1 span, with the count pushed to the end', async () => {
    // §6.0's row is `<span style="flex:1">{{ label }}</span>` and then the
    // badge (Panel :2083-2084) — the span is the whole reason every label in
    // the stack sits on one leading edge whatever follows it. The comment on
    // `SHEET_ITEM` claimed the span for months; there was none, and the count
    // was bare text run on after the words.
    renderAdmin('/departments', { pending: [{ process: 'dining-001' }, { process: 'dining-002' }] })
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    const rows = [
      ...within(sheet).getAllByRole('link'),
      ...within(sheet).getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'بستن'),
    ]
    expect(rows.length).toBeGreaterThan(4)
    for (const row of rows) {
      const label = row.firstElementChild as HTMLElement | null
      expect(label?.tagName, row.textContent ?? '').toBe('SPAN')
      expect(declarations(await paint(label?.className ?? '')), row.textContent ?? '')
        .toEqual(new Set(['flex: 1 1 0%']))
    }
    // …and the count is §6.0's coral pill rather than a word ending in a digit.
    const inbox = within(sheet).getByRole('button', { name: /صندوق بازبینی/ })
    const pill = inbox.lastElementChild as HTMLElement
    expect(pill.textContent).toBe('۲')
    const p = await paint(pill.className)
    expect(declarations(p)).toEqual(new Set([
      'min-width: var(--size-count-chrome)',
      'height: var(--size-count-chrome)',
      'padding-left: var(--space-3)',
      'padding-right: var(--space-3)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'border-radius: var(--radius-round)',
      'background-color: var(--coral)',
      'color: var(--card)',
      'font-size: var(--fs-xxs)',
      'font-weight: var(--fw-bold)',
      'flex: none',
    ]))
    // Round, not merely rounded: `--radius-pill` is 20px and would draw a
    // stadium on a 19px box, which is the same shape one corner short.
    expect(winner(p, 'border-radius')).not.toBe('var(--radius-pill)')
    // …and it does not shrink away when a long label pushes at it, which is
    // what `flex-none` is for beside a `flex:1` sibling.
    expect(winner(p, 'flex')).toBe('none')
  })

  it('stacks the sheet, and sets the administration entries apart under their heading', async () => {
    // §6.0 (Panel :2090-2091) puts the administration entries in their own
    // group behind a `--warm` rule under an «مدیریت» heading; flat, they read
    // as four peers of «دپارتمان‌ها», which is the one entry that is not
    // administration. Nothing in this file had ever painted the sheet's own
    // container, so the stack could have collapsed to a 4px ladder — every row
    // still correct, the menu unreadable — with both suites green.
    renderAdmin()
    await userEvent.click(screen.getByRole('button', { name: 'فهرست' }))
    const sheet = screen.getByRole('dialog')
    const stack = within(sheet).getByRole('link', { name: /دپارتمان‌ها/ }).parentElement as HTMLElement
    expect(declarations(await paint(stack.className))).toEqual(new Set([
      'display: flex',
      'flex-direction: column',
      'gap: var(--space-5)',
    ]))
    // NOT `--space-half`, which is 2px and is the popover's row gap.
    expect(winner(await paint(stack.className), 'gap')).not.toBe('var(--space-half)')
    const group = within(sheet).getByRole('group', { name: 'مدیریت' })
    expect(declarations(await paint(group.className))).toEqual(new Set([
      'margin-top: var(--space-8)',
      'padding-top: var(--space-7)',
      'border-top-width: 1px',
      'border-color: var(--warm)',
      'display: flex',
      'flex-direction: column',
      'gap: var(--space-5)',
    ]))
    // The rule is the cream `--warm`, the edge every chrome bar in this app
    // takes — not `--line`, the lavender hairline the rows themselves wear,
    // which would read as one more row with nothing in it.
    expect(winner(await paint(group.className), 'border-color')).not.toBe('var(--line)')
    // …and the heading itself, which is the accessible name of that group.
    const heading = within(group).getByText('مدیریت')
    expect(declarations(await paint(heading.className))).toEqual(new Set([
      'margin: 0px',
      'font-size: var(--fs-xs)',
      'font-weight: var(--fw-bold)',
      'color: var(--text-muted)',
    ]))
    // Every administration entry is inside it, and «دپارتمان‌ها» is not.
    for (const name of ['کاربران', 'سیاست نمایش محتوا', 'پروفایل و گذرواژه']) {
      expect(within(group).getByRole('link', { name: new RegExp(name) }), name).toBeInTheDocument()
    }
    expect(within(group).queryByRole('link', { name: /دپارتمان‌ها/ })).toBeNull()
  })

  it('draws the count badge round, 19px, and ringed in the card white', async () => {
    const { container } = renderPanel(['view', 'edit'], '/departments', {
      pending: [{ process: 'dining-001' }],
    })
    const badge = await screen.findByText('۱')
    const b = await paint(badge.className)
    expect(winner(b, 'min-width')).toBe('var(--size-count-chrome)')
    expect(winner(b, 'height')).toBe('var(--size-count-chrome)')
    expect(winner(b, 'border-radius')).toBe('var(--radius-round)')
    expect(winner(b, 'background-color')).toBe('var(--coral)')
    expect(winner(b, 'color')).toBe('var(--card)')
    expect(winner(b, 'font-size')).toBe('var(--fs-micro)')
    // The ring is the WHITE `--card`, not the 7%-alpha card hairline: the ring
    // cuts the badge out of whatever it overlaps, and `--border-card` would be
    // invisible here and would still build.
    expect(winner(b, 'border-color')).toBe('var(--card)')
    expect(winner(b, 'border-color')).not.toBe('var(--border-card)')
    // Not the FAB's badge (21px, `--size-count`) and not L-10's tick box, which
    // is also 19px. Three badges, three owners; only this one is chrome.
    expect(winner(b, 'height')).not.toBe('var(--size-count)')
    expect(winner(b, 'height')).not.toBe('var(--size-tick)')
    // §8 — the corner it hangs off. The deliverable writes `top:-6px; left:-6px`
    // and this used to reproduce it physically, declared as one of
    // guards.test.ts's two `PHYSICAL_PINS`; Task 25 overturned that. The RTL bar
    // puts the button's inline END on the left, so `inset-inline-end` resolves
    // to the same edge and paints identically — and the argument the pin stood
    // on ("mirroring would move it onto the label") is true of the inline START
    // and false of the inline END.
    //
    // Asserted as the LOGICAL property, which is the whole of what changed: a
    // regression to `left` fails here as a missing `inset-inline-end`, and a
    // mirror bug that reached for `start` fails on the third line.
    expect(winner(b, 'top')).toBe('calc(var(--space-3) * -1)')
    expect(winner(b, 'inset-inline-end')).toBe('calc(var(--space-3) * -1)')
    expect(winner(b, 'inset-inline-start')).toBe('')
    expect(winner(b, 'left')).toBe('')
    expect(winner(b, 'right')).toBe('')
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
  })

  it('holds the nav tray, the divider and the inbox to the deliverable’s 1080 breakpoint', async () => {
    // Renamed: this stands on `/departments`, where §6.0 draws the top bar and
    // NO crumb strip, so it never had a crumb to hold to anything. The 760
    // half is the test below, which stands on a screen that has one.
    const { cls, unmount } = chrome('/departments')
    const nav = await paint(cls('[data-r-nav]'))
    const burger = await paint(cls('[data-r-menu]'))
    const divider = await paint(cls('[data-r-topbar] > span[aria-hidden]'))
    const pill = await paint(cls('[data-r-nav] a'))
    const inbox = await paint(screen.getByRole('button', { name: /صندوق بازبینی/ }).className)
    unmount()
    expect(winner(nav, 'display')).toBe('inline-flex')
    expect(winner(nav, 'display', '', R1080)).toBe('none')
    expect(winner(burger, 'display')).toBe('none')
    expect(winner(burger, 'display', '', R1080)).toBe('flex')
    expect(winner(inbox, 'display')).toBe('inline-flex')
    expect(winner(inbox, 'display', '', R1080)).toBe('none')
    // §6.16's `[data-r-hide]` rule covers the brand divider as well as the
    // inbox. It is a 1px hairline with no text in it, so nothing else in this
    // file can notice it going or staying.
    expect(declarations(divider, '', R1080)).toEqual(new Set(['display: none']))
    expect(declarations(divider)).toEqual(new Set([
      'width: 1px',
      'height: var(--space-11)',
      'margin-left: var(--space-1)',
      'margin-right: var(--space-1)',
      'background-color: var(--border-current)',
    ]))
    // The tray is a lavender ground with a 4px inset, and the pill inside it is
    // the active one — this bar is only ever drawn on the screen that entry
    // leads to — so it is the violet fill with the card white on it, which is
    // the one legal pairing of `text-card` in this bar.
    expect(declarations(nav)).toEqual(new Set([
      'display: inline-flex',
      'align-items: center',
      'gap: var(--space-1)',
      'padding: var(--space-1)',
      'border-radius: var(--radius-md)',
      'background-color: var(--tile-v2)',
    ]))
    expect(winner(pill, 'background-color')).toBe('var(--violet)')
    expect(winner(pill, 'color')).toBe('var(--card)')
    expect(winner(pill, 'background-color', ':hover')).toBe('')
    // §6.0 — `padding:8px 14px`, and that way round. Transposed it is still two
    // real tokens, still compiles, and draws a tall narrow pill.
    expect(declarations(pill)).toEqual(new Set([
      'padding-left: var(--space-7)',
      'padding-right: var(--space-7)',
      'padding-top: var(--space-4)',
      'padding-bottom: var(--space-4)',
      'border-radius: var(--radius-sm)',
      'border-width: 0px',
      'background-color: var(--violet)',
      'color: var(--card)',
      'font-size: var(--fs-sm2)',
      'font-weight: var(--fw-bold)',
      'text-decoration-line: none',
      'cursor: pointer',
    ]))
  })

  it('pushes both right-hand clusters to the inline end, on both chromes', async () => {
    // §6.0 gives each bar a `margin-inline-start:auto` cluster — Panel :151 in
    // the top bar and :188 in the crumb strip. Lose the auto margin and the
    // cluster collapses back against the brand or the crumbs with the rest of
    // the row empty behind it. Nothing else in this file reads either box.
    const bar = chrome('/departments')
    const top = await paint(bar.cls('[data-r-topbar] .ms-auto'))
    bar.unmount()
    const inner = chrome('/departments/dining')
    const strip = await paint(inner.cls('[data-r-crumbbar] .ms-auto'))
    inner.unmount()
    expect(declarations(top)).toEqual(new Set([
      'margin-inline-start: auto',
      'display: flex',
      'align-items: center',
      'gap: var(--space-5)',
    ]))
    expect(declarations(strip)).toEqual(new Set([
      'margin-inline-start: auto',
      'display: flex',
      'align-items: center',
      'gap: var(--space-4)',
      'flex: none',
    ]))
  })

  it('marks where you are and does not mark where you have been', async () => {
    // §6.0 draws the trail's leaf `color:#2A1D5E; font-weight:700` and every
    // link before it `color:#8a7db0` at the list's own weight — the one visual
    // difference between "you are here" and "you can go here". Both are a
    // colour and a weight on a bare span, so nothing else in this file — which
    // reads the trail through `aria-current` and `href` — can see either move.
    const { cls, unmount } = chrome('/departments/dining')
    await screen.findByText('دپارتمان سالن')
    const current = await paint(cls('[data-r-crumbs] [aria-current="page"]'))
    const link = await paint(cls('[data-r-crumbs] a'))
    const sep = await paint(cls('[data-r-crumbs] span[aria-hidden]'))
    unmount()
    expect(declarations(current)).toEqual(new Set([
      'color: var(--ink)',
      'font-weight: var(--fw-semibold)',
    ]))
    expect(declarations(link)).toEqual(new Set([
      'color: var(--text-muted)',
      'text-decoration-line: none',
    ]))
    // …and the `/` between them is fainter than either, which is what keeps it
    // from reading as a crumb of its own.
    expect(declarations(sep)).toEqual(new Set(['color: var(--text-faint)']))
  })

  it('takes the crumbs away at 760 and leaves the strip’s box alone', async () => {
    const { cls, unmount } = chrome('/departments/dining')
    const crumbs = await paint(cls('[data-r-crumbs]'))
    const strip = await paint(cls('[data-r-crumbbar]'))
    unmount()
    expect(winner(crumbs, 'display')).toBe('flex')
    expect(winner(crumbs, 'display', '', R760)).toBe('none')
    // §6.0 — `flex-wrap:wrap; min-width:0`. Without the floor the list refuses
    // to shrink and pushes the «خانه» button off the end of a narrow strip.
    expect(winner(crumbs, 'flex-wrap')).toBe('wrap')
    expect(winner(crumbs, 'min-width')).toBe('0px')
    // The deliverable's only ≤760 rule for this bar is the line above; it draws
    // no padding override for the strip, unlike `[data-r-topbar]`, so nothing
    // here may invent one.
    expect(winner(strip, 'padding-left', '', R760)).toBe('')
    expect(winner(strip, 'padding-top', '', R760)).toBe('')
  })

  it('gives the brand lockup the surface-aware leading, not the title leading', async () => {
    const { container } = renderPanel(['view', 'edit'], '/departments')
    const lockup = container.querySelector('[data-r-topbar] span.leading-lockup') as HTMLElement
    expect(lockup).toBeInTheDocument()
    const l = await paint(lockup.className)
    // A ROLE, not a plain token: 1.25 on the panel and 1.3 under
    // `[data-surface='reader']`, so both shells write the identical class.
    expect(winner(l, 'line-height')).toBe('var(--role-lh-lockup)')
    // NOT `--lh-tight`, which is 1.2 and is every title step's leading.
    expect(winner(l, 'line-height')).not.toBe('var(--lh-tight)')
    const title = await paint((lockup.firstElementChild as HTMLElement).className)
    expect(winner(title, 'font-size')).toBe('var(--fs-body)')
    const sub = await paint((lockup.lastElementChild as HTMLElement).className)
    expect(winner(sub, 'font-size')).toBe('var(--fs-micro)')
    expect(winner(sub, 'color')).toBe('var(--text-muted)')
  })

  it('gives the «مدیریت» popover the deliverable’s floor, padding and hint offset', async () => {
    renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    const menu = screen.getByRole('menu')
    const m = await paint(menu.className)
    expect(winner(m, 'min-width')).toBe('var(--width-menu)')
    expect(winner(m, 'padding')).toBe('var(--space-4)')
    expect(winner(m, 'border-radius')).toBe('var(--radius-card)')
    expect(winner(m, 'border-color')).toBe('var(--border-card)')
    // `box-shadow` itself is Tailwind's ring-composed value; the token lands in
    // `--tw-shadow`, which is the half a swapped shadow class would move.
    expect(winner(m, '--tw-shadow')).toBe('var(--shadow-pop)')
    expect(winner(m, 'box-shadow')).toContain('var(--tw-shadow)')
    expect(winner(m, 'margin-top')).toBe('calc(var(--space-3) * -1)')
    const row = menu.querySelector('a') as HTMLElement
    const r = await paint(row.className)
    expect(winner(r, 'padding-top')).toBe('var(--pad-option-y)')
    expect(winner(r, 'padding-left')).toBe('var(--space-6)')
    expect(winner(r, 'background-color', ':hover')).toBe('var(--tile-v2)')
    const hint = row.lastElementChild as HTMLElement
    const h = await paint(hint.className)
    expect(winner(h, 'margin-top')).toBe('var(--space-hint)')
    // 3px is off the ladder (2 → 4) and `--gap-tab-flow` is also 3px — it is the
    // flow nav group's GAP, not a hint line's offset under the label above it.
    expect(winner(h, 'margin-top')).not.toBe('var(--gap-tab-flow)')
    expect(winner(h, 'color')).toBe('var(--text-faint)')
    expect(winner(h, 'font-size')).toBe('var(--fs-xs)')
    // The whole popover box, values included. Two of these decide whether it is
    // a popover at all: a background that is not the opaque card leaves the
    // screen behind it legible straight through the menu, and the inline-start
    // pin is the RTL-correct edge — `inset-inline-end` opens it off the far
    // side of a trigger that sits at the bar's start.
    expect(declarations(m)).toEqual(new Set([
      'position: absolute',
      'top: 100%',
      'margin-top: calc(var(--space-3) * -1)',
      'inset-inline-start: 0px',
      'z-index: var(--role-z-dropdown)',
      'min-width: var(--width-menu)',
      'display: flex',
      'flex-direction: column',
      'gap: var(--space-half)',
      'padding: var(--space-4)',
      'background-color: var(--card)',
      'border-width: 1px',
      'border-color: var(--border-card)',
      'border-radius: var(--radius-card)',
      '--tw-shadow: var(--shadow-pop)',
      '--tw-shadow-colored: var(--shadow-pop)',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
    ]))
    // Every row rests transparent and lights on hover — never the other way
    // round, which would read as "all of these are current except the one you
    // are pointing at". There is no current-state branch to invert: this
    // popover is drawn on `/departments` and nothing in it leads there.
    expect(declarations(r)).toEqual(new Set([
      'display: block',
      'padding-left: var(--space-6)',
      'padding-right: var(--space-6)',
      'padding-top: var(--pad-option-y)',
      'padding-bottom: var(--pad-option-y)',
      'border-radius: var(--radius-input)',
      'background-color: transparent',
      'text-align: start',
      'text-decoration-line: none',
    ]))
    for (const row of Array.from(menu.querySelectorAll('a'))) {
      const p = await paint(row.className)
      expect(winner(p, 'background-color'), row.textContent ?? '').toBe('transparent')
      expect(winner(p, 'background-color', ':hover'), row.textContent ?? '').toBe('var(--tile-v2)')
    }
  })

  it('stacks the chrome above the page, and the popover inside the chrome’s own context', async () => {
    // L-42…L-47 — the rungs replace the deliverable's `z-index:20` and `29`/`30`.
    // Tailwind ships its own `z-20`/`z-30`, which emit, look right in every test
    // and are the wrong layer.
    //
    // Renamed, and the missing half added. The popover's own rung is BELOW the
    // chrome's — 1000 against 1020 — so read as two numbers this looked wrong,
    // and the previous spelling of this test asserted only the number and left
    // the reason unstated. The reason is that the popover is a DESCENDANT of
    // the header: the header's own `z-index` opens a stacking context, both the
    // popover and its scrim are painted inside it, and their rungs order them
    // against each other and against nothing else. So the nesting is the load-
    // bearing fact and it is asserted here rather than assumed.
    const { cls, container, unmount } = chrome('/departments')
    const bar = await paint(cls('[data-r-topbar]'))
    expect(winner(bar, 'z-index')).toBe('var(--role-z-chrome)')
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    const menu = screen.getByRole('menu')
    const scrim = container.querySelector('.fixed.inset-0') as HTMLElement
    const topbar = container.querySelector('[data-r-topbar]') as HTMLElement
    expect(topbar.contains(menu)).toBe(true)
    expect(topbar.contains(scrim)).toBe(true)
    const m = await paint(menu.className)
    const s = await paint(scrim.className)
    unmount()
    expect(winner(m, 'z-index')).toBe('var(--role-z-dropdown)')
    // The scrim rides the same rung and is written BEFORE the popover, so the
    // popover wins on document order — put the scrim after it and every click
    // meant for a menu entry lands on the sheet of glass over it instead.
    expect(winner(s, 'z-index')).toBe('var(--role-z-dropdown)')
    expect(declarations(s)).toEqual(new Set([
      'position: fixed',
      'inset: 0px',
      'z-index: var(--role-z-dropdown)',
    ]))
  })

  it('gives the inbox button the design’s own padding and gap', async () => {
    const { cls, unmount } = chrome('/departments')
    void cls('[data-r-topbar]')
    const inbox = await paint(screen.getByRole('button', { name: /صندوق بازبینی/ }).className)
    unmount()
    // §6.0 — `padding:8px 13px; gap:8px; border-radius:12px`.
    expect(winner(inbox, 'padding-left')).toBe('var(--pad-inbox-x)')
    expect(winner(inbox, 'padding-top')).toBe('var(--space-4)')
    expect(winner(inbox, 'gap')).toBe('var(--space-4)')
    expect(winner(inbox, 'border-radius')).toBe('var(--radius-md)')
    // Five other tokens hold 13px and every one is another component's; and the
    // gap is 8px here, NOT the 4-up stat's 7px `--gap-stat-dot`.
    expect(winner(inbox, 'padding-left')).not.toBe('var(--pad-compose)')
    expect(winner(inbox, 'padding-left')).not.toBe('var(--pad-search-y)')
    expect(winner(inbox, 'gap')).not.toBe('var(--gap-stat-dot)')
  })

  it('grows the hit area with a ::before that actually generates a box', async () => {
    const { unmount } = renderPanel(['view', 'edit'], '/departments')
    const out = await paint(screen.getByRole('button', { name: 'خروج' }).className)
    expect(winner(out, 'position')).toBe('relative')
    expect(winner(out, 'width')).toBe('var(--size-tool)')
    expect(winner(out, 'height')).toBe('var(--size-tool)')
    expect(winner(out, 'position', '::before')).toBe('absolute')
    expect(winner(out, '--tw-content', '::before')).toBe('""')
    expect(winner(out, 'content', '::before')).toBe('var(--tw-content)')
    expect(winner(out, 'inset', '::before')).toBe('-5px')
    // …and the control's own width is not silently inflated to the floor.
    expect(winner(out, 'min-width')).toBe('')
    unmount()
    renderPanel(['view', 'edit'], '/departments/dining')
    const home = await paint(screen.getByRole('link', { name: 'خانه' }).className)
    expect(winner(home, 'width')).toBe('var(--size-menu-more)')
    expect(winner(home, 'inset', '::before')).toBe('-5px')
    // NOT `--size-logo-bar`, which is also 38px, nor the reader's 38px sibling.
    expect(winner(home, 'width')).not.toBe('var(--size-menu-more-reader)')
  })
})

/* ==================================================================== *
 * ReaderShell — Task 13
 *
 * Three things the panel does not do, and one the design does not carry.
 *
 *   · the chrome off home is a BACK BAR on `#fff`, not the panel's breadcrumb
 *     strip on `#F4EFFB` (§9.12);
 *   · there is NO chrome at all on the flowchart (R3);
 *   · every metric on both bars is the READER's — the two surfaces differ
 *     deliberately, which is what R3 exists to be, so a value copied off
 *     `PanelShell` is wrong here even when it compiles and looks right;
 *   · R4 — a reader whose reachable departments number exactly one lands on
 *     that department's process list, which is then their root.
 * ==================================================================== */

const ONE: Department[] = [{ code: 'dining', name: 'سالن', count: 3, subs: 0 }]
const ONE_EMPTY: Department[] = [{ code: 'dining', name: 'سالن', count: 0, subs: 0 }]
const ONE_COOKING: Department[] = [{ code: 'cooking', name: 'پخت', count: 2, subs: 1 }]
const THREE: Department[] = [
  { code: 'dining', name: 'سالن', count: 3, subs: 0 },
  { code: 'cooking', name: 'پخت', count: 2, subs: 1 },
  { code: 'warehouse', name: 'انبار', count: 0, subs: 0 },
]

/**
 * The routed screen behind `/departments/:code`, which reports which department
 * it was actually given.
 *
 * R4 redirects to `departments[0].code`, and a fixture standing on one
 * department cannot tell that apart from a redirect hard-coded to `dining` —
 * every one of this file's other fixtures is a `dining` fixture. The `:code`
 * this stub prints is what makes `ONE_COOKING` below say something.
 */
function ProcessListStub() {
  const { code } = useParams()
  return (
    <>
      <p>فهرست فرآیندها</p>
      <span data-code>{code}</span>
    </>
  )
}

const READER_CAPS: Capability[] = ['view', 'comment', 'export_pdf']

/** One step back in the history, from inside the router that owns it. */
function GoBack() {
  const nav = useNavigate()
  return <button type="button" onClick={() => nav(-1)}>عقب</button>
}

/**
 * Render the reader shell at `entry`, with the one read it makes answered.
 *
 * Keyed on the URL rather than answering everything with one body, for the same
 * reason `renderPanel` above is: a sign-out POST answered with a department list
 * is a mock that cannot tell the two apart, and `signedOut()` counts calls on
 * this same spy.
 */
function renderReader(depts: Department[], entry: string, over: Partial<SessionDescriptor> = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
    const body = url.includes('/api/departments') ? depts : { ok: true }
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<ReaderShell session={{ ...session(READER_CAPS), ...over }} />}>
            <Route path="/departments" element={<p>فهرست دپارتمان‌ها</p>} />
            <Route path="/departments/:code" element={<ProcessListStub />} />
            <Route path="/departments/:code/overview" element={<p>خلاصهٔ دپارتمان</p>} />
            <Route path="/processes/:pid" element={<p>خلاصهٔ فرآیند</p>} />
            <Route path="/processes/:pid/flow" element={<p>فلوچارت</p>} />
            <Route path="/profile" element={<p>محتوای پروفایل</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The class strings the READER chrome renders, read off the DOM. Twin of `chrome()`. */
function readerChrome(entry: string, depts: Department[] = THREE) {
  const { container, unmount } = renderReader(depts, entry)
  const cls = (sel: string) => {
    const el = container.querySelector(sel)
    if (el === null) throw new Error(`readerChrome(): nothing rendered for \`${sel}\``)
    return (el as HTMLElement).className
  }
  return { container, cls, unmount }
}

describe('R4 — a reader with one department never sees the department list', () => {
  it('lands on that department’s process list', async () => {
    renderReader(ONE, '/departments')
    expect(await screen.findByText('فهرست فرآیندها')).toBeInTheDocument()
    expect(screen.queryByText('فهرست دپارتمان‌ها')).toBeNull()
  })

  it('lands on the department they actually have, not on the one the fixtures use', async () => {
    // `departments[0].code` -> `'dining'` is a one-word mutation that every
    // other case in this block is blind to, because every other fixture IS
    // `dining`. This one is scoped to `cooking` and reads the `:code` back off
    // the routed screen.
    const { container } = renderReader(ONE_COOKING, '/departments')
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-code]')).toHaveTextContent('cooking')
  })

  it('redirects on scope alone — a department with nothing in it still redirects', async () => {
    // The owner's ruling, stated as a rule about scope and not about content:
    // the same person always lands in the same place, rather than moving as
    // content gets confirmed. The list then shows its own empty state.
    renderReader(ONE_EMPTY, '/departments')
    expect(await screen.findByText('فهرست فرآیندها')).toBeInTheDocument()
  })

  it('makes that list their root, so it carries no back bar', async () => {
    const { container } = renderReader(ONE, '/departments')
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-r-backbar]')).toBeNull()
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
  })

  it('survives a reader whose department list comes back EMPTY', async () => {
    // `departments?.length === 1` is the scope test, and `<= 1` is one
    // character away from it. On an empty list that spelling reads
    // `departments[0].code`, throws a TypeError inside render, and gives a
    // white screen to an account that has been created and not yet scoped —
    // which is the state every new account passes through.
    //
    // It survives every other case in this file and the whole reader e2e,
    // because no fixture in either serves `[]`. The one test in the suite that
    // caught it was a screen test three directories away that happens to serve
    // an empty list for its own reasons; this is the assertion that means it.
    const { container } = renderReader([], '/departments')
    expect(await screen.findByText('فهرست دپارتمان‌ها')).toBeInTheDocument()
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /اینجا فست‌فود/ })).toHaveAttribute('href', '/departments')
  })

  it('leaves a reader with more than one department on the list', async () => {
    renderReader(THREE, '/departments')
    expect(await screen.findByText('فهرست دپارتمان‌ها')).toBeInTheDocument()
  })

  it('gives a many-department reader a back bar one level down', async () => {
    const { container } = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-r-backbar]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/departments')
    // …and it is a NAMED landmark. An unlabelled `<nav>` is announced as
    // "navigation" with nothing to tell it from any other on the page, and this
    // is the one a reader lands in on every screen but their root.
    expect(screen.getByRole('navigation', { name: 'مسیر' })).toBe(container.querySelector('[data-r-backbar]'))
  })

  it('never flashes the one-tile list while the departments are still loading', async () => {
    // A redirect that waits for the answer is a redirect; one that renders the
    // list first and then leaves is a flicker the reader can see and click.
    const { container } = renderReader(ONE, '/departments')
    expect(screen.queryByText('فهرست دپارتمان‌ها')).toBeNull()
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument()
  })

  it('never flashes the WRONG CHROME on the one-department reader’s own root either', async () => {
    // The same argument, one route over, and it is not in the plan. On a deep
    // link or a refresh at `/departments/dining` the departments are not in yet,
    // so `only` is undefined and the root reads as `/departments` — which draws
    // this reader a BACK BAR whose «بازگشت» goes to the department list R4
    // exists to keep them out of. It is on screen, it is clickable, and it is
    // replaced by the top bar a moment later. So the two routes whose chrome
    // depends on the answer both wait for it; every other route's chrome is the
    // back bar whatever the answer is, and none of them waits.
    const { container } = renderReader(ONE, '/departments/dining')
    expect(container.querySelector('[data-r-backbar]')).toBeNull()
    expect(container.querySelector('[data-r-topbar]')).toBeNull()
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
    expect(container.querySelector('[data-r-backbar]')).toBeNull()
  })

  it('holds nothing else up: a route whose chrome the answer cannot change draws at once', async () => {
    // The other half of the gate, and the reason it is two routes wide and not
    // "wait for the query". `/processes/:pid/flow` and `/profile` get the same
    // chrome whichever root this reader has, so blanking them would be latency
    // bought for nothing — one extra round trip on every cold deep link.
    const flow = renderReader(ONE, '/processes/dining-003/flow')
    expect(screen.getByText('فلوچارت')).toBeInTheDocument()
    flow.unmount()
    const { container } = renderReader(ONE, '/profile')
    expect(screen.getByText('محتوای پروفایل')).toBeInTheDocument()
    expect(container.querySelector('[data-r-backbar]')).toBeInTheDocument()
  })

  it('REPLACES the list in the history rather than stacking on it', async () => {
    // Without `replace` the entry the reader was bounced off stays behind them:
    // one press of Back returns them to `/departments`, which redirects forward
    // again, and the browser's own Back button stops working on the reader's
    // root. It is one word, nothing about it is on screen, and every assertion
    // above passes either way.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(ONE), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/profile', '/departments']} initialIndex={1}>
          <Routes>
            <Route element={<ReaderShell session={session(READER_CAPS)} />}>
              <Route path="/departments" element={<p>فهرست دپارتمان‌ها</p>} />
              <Route path="/departments/:code" element={<GoBack />} />
              <Route path="/profile" element={<p>محتوای پروفایل</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('button', { name: 'عقب' })
    await userEvent.click(screen.getByRole('button', { name: 'عقب' }))
    expect(await screen.findByText('محتوای پروفایل')).toBeInTheDocument()
  })

  it('reads a trailing slash on the ONE-department reader’s own root as their root', async () => {
    // The other half of the trailing-slash case, and the one the redirect cannot
    // cover: at `/departments/dining/` the redirect never fires, so the only
    // thing standing between this reader and a back bar to a list they must
    // never see is whether the at-root question normalises. `pathname === root`
    // does not.
    const { container } = renderReader(ONE, '/departments/dining/')
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
    expect(container.querySelector('[data-r-backbar]')).toBeNull()
  })

  it('marks the frame it waits on, so the app’s own ground does not blink', async () => {
    // `data-shell` is F8's density switch and it carries the page's type scale
    // and its ground. A blank frame without it is one paint of the default
    // surface between the sign-in screen and the reader's own — and it is the
    // frame this shell deliberately draws, so it is the one place the mark can
    // go missing without anything else noticing.
    const { container } = renderReader(ONE, '/departments')
    const frame = container.querySelector('[data-shell="reader"]') as HTMLElement
    expect(frame).toBeInTheDocument()
    expect(container.querySelector('[data-r-topbar]')).toBeNull()
    // …and the GROUND it is drawn on, which is the whole of what the sentence
    // above claims and was the only half not asserted. `data-shell` alone says
    // the mark is there; `bg-ink` is what stops the frame being a full-viewport
    // WHITE flash on every cold load, and `bg-card` in its place keeps the mark,
    // keeps the height, keeps the mount order and blinks the app white.
    //
    // The class string is read off the node BEFORE the await: the query lands
    // during it and React reuses this node for the real chrome.
    const waiting = frame.className
    expect(declarations(await paint(waiting))).toEqual(new Set([
      'height: 100vh',
      'background-color: var(--ink)',
    ]))
    await screen.findByText('فهرست فرآیندها')
  })

  it('redirects from a trailing slash too, which is one keystroke away', async () => {
    // `pathname === '/departments'` walks past `/departments/` and leaves this
    // reader standing on the one-tile list, which is the whole of what R4
    // forbids. The two functions in `crumbs.ts` normalise for the same reason.
    const { container } = renderReader(ONE, '/departments/')
    expect(await screen.findByText('فهرست فرآیندها')).toBeInTheDocument()
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
  })

  it('redirects from the department LIST and from nowhere else', async () => {
    // R4 is a rule about one route. A redirect keyed on `only !== undefined`
    // alone sends this reader home from every screen they open, which is the
    // same one-line mutation and is invisible to every case above.
    renderReader(ONE, '/departments/dining/overview')
    expect(await screen.findByText('خلاصهٔ دپارتمان')).toBeInTheDocument()
    expect(screen.queryByText('فهرست فرآیندها')).toBeNull()
  })

  it('is reader-only: an admin scoped to one department still sees the list', async () => {
    // R4's own clause. For them the list is a real navigation level and their
    // chrome is the breadcrumb strip, so the ruling does not apply.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(ONE), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/departments']}>
          <Routes>
            <Route element={<PanelShell session={session(['view', 'edit'])} />}>
              <Route path="/departments" element={<p>فهرست دپارتمان‌ها</p>} />
              <Route path="/departments/:code" element={<p>فهرست فرآیندها</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('فهرست دپارتمان‌ها')).toBeInTheDocument()
  })
})

describe('ReaderShell chrome', () => {
  it('draws no chrome at all on the flowchart', async () => {
    // R3 — "a back bar — and neither on the flow screen". The panel keeps its
    // crumb strip there and this shell keeps nothing, which is a reader rule.
    //
    // The second render is what stops this being a test a shell with NO chrome
    // anywhere passes — which is exactly what the shell before this one was.
    const flow = renderReader(THREE, '/processes/dining-003/flow')
    await screen.findByText('فلوچارت')
    expect(flow.container.querySelector('[data-r-topbar]')).toBeNull()
    expect(flow.container.querySelector('[data-r-backbar]')).toBeNull()
    // …and the routed screen is still there, so this is a bar that is absent
    // rather than a shell that rendered nothing.
    expect(flow.container.querySelector('main')).toBeInTheDocument()
    flow.unmount()
    const { container } = renderReader(THREE, '/processes/dining-003')
    await screen.findByText('خلاصهٔ فرآیند')
    expect(container.querySelector('[data-r-backbar]')).toBeInTheDocument()
  })

  it('takes the chrome away on the flowchart and NOT on a process whose id looks like one', async () => {
    // `/\/flow/` — the regex without its anchors — matches `/processes/flow-001`,
    // a process in a department called `flow`, and leaves that reader on a screen
    // with no chrome and no way back. `allocate-id` issues `{dept}-{nnn}`, so the
    // id is one department code away from existing.
    const { container } = renderReader(THREE, '/processes/flow-001')
    await screen.findByText('خلاصهٔ فرآیند')
    expect(container.querySelector('[data-r-backbar]')).toBeInTheDocument()
  })

  it('draws the top bar on the root and the back bar on every other screen', async () => {
    // The reader's `showTopBar` / `showBackBar` (Reader :2684-2686), which is
    // the panel's split one screen further in: the panel keeps its crumb strip
    // on the flowchart and this shell keeps nothing there.
    for (const [entry, bar, gone] of [
      ['/departments', '[data-r-topbar]', '[data-r-backbar]'],
      ['/departments/dining', '[data-r-backbar]', '[data-r-topbar]'],
      ['/departments/dining/overview', '[data-r-backbar]', '[data-r-topbar]'],
      ['/processes/dining-003', '[data-r-backbar]', '[data-r-topbar]'],
      ['/profile', '[data-r-backbar]', '[data-r-topbar]'],
    ] as const) {
      const { container, unmount } = renderReader(THREE, entry)
      await waitFor(() => expect(container.querySelector(bar), entry).toBeInTheDocument())
      expect(container.querySelector(gone), entry).toBeNull()
      // …and never both, which is the shape a `? :` that became two `&&`s takes.
      expect(container.querySelectorAll('[data-r-topbar], [data-r-backbar]').length, entry).toBe(1)
      unmount()
    }
  })

  it('is a white bar on the violet field, with the logo', async () => {
    const { container } = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(container.querySelector('[data-r-topbar]')).toHaveClass('bg-card', 'border-warm')
    expect(container.querySelector('[data-r-topbar] img')).toHaveAttribute('src', expect.stringMatching(/inja-logo/))
    // Audit S7 read this shell as inverted against the design because it renders
    // `bg-ink`. §9.1 settles it the other way — both deliverables put every
    // screen on the violet field. What WAS wrong is the `text-card` beside it:
    // §6.0's root sets `color:#2A1D5E`, so an element that forgets to colour
    // itself is invisible rather than accidentally white, which is the honest
    // failure mode and the one the e2e sweep can see.
    expect(container.querySelector('[data-shell="reader"]')).toHaveClass('bg-ink', 'text-ink')
    expect(container.querySelector('[data-shell="reader"]')).not.toHaveClass('text-card')
  })

  it('names the SIGNED-IN PERSON on the lockup’s second line, not the product', async () => {
    // reader 138 draws `{{ roleLabel }}` there and reader 2497 binds that to
    // `me.role`. R22 settles it for the deliverable: the second line is whose
    // account this is, which two people on the same bar read differently and a
    // fixed tagline never can.
    const reader = renderReader(THREE, '/departments')
    expect(await screen.findByText('خواننده')).toBeInTheDocument()
    expect(screen.queryByText('سامانهٔ فرآیندها')).toBeNull()
    reader.unmount()
    // …and MAPPED rather than printed. This app's `role` is a seed IDENTIFIER
    // (D50), not the deliverable's Persian word: raw, this line reads
    // `reader_no_download` — a latin string, in an 11px grey, directly under
    // «اینجا فست‌فود», on the app's one right-to-left surface. That is the exact
    // defect `src/lib/roles.ts` was written to have fixed once, and the top bar
    // is the second screen every account sees.
    renderReader(THREE, '/departments', { role: 'reader_no_download' })
    expect(await screen.findByText('خواننده بدون خروجی')).toBeInTheDocument()
    expect(screen.queryByText('reader_no_download')).toBeNull()
  })

  it('draws both bars as the landmarks a screen reader steers by', async () => {
    // The back bar's `navigation` is pinned by name in the R4 block; the top
    // bar's was not pinned at all, and `<header>` -> `<div>` is one word that
    // leaves every class string, every compiled declaration, every box and
    // every screenshot identical. This is the reader's ROOT — the one screen
    // carrying the brand, the pending-comment badge, the profile and sign-out —
    // and without the element there is no landmark on it whatsoever.
    const top = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(screen.getByRole('banner')).toBe(top.container.querySelector('[data-r-topbar]'))
    top.unmount()
    const back = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    expect(screen.getByRole('navigation', { name: 'مسیر' })).toBe(back.container.querySelector('[data-r-backbar]'))
  })

  it('draws the logo at the box the design gives it, as an attribute', async () => {
    // An `<img>` needs its intrinsic size before the file lands or the whole bar
    // reflows when it does. `Inja Reader.dc.html:135` — 38×38, the same box the
    // panel draws it at.
    const { container } = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const img = container.querySelector('[data-r-topbar] img')
    expect(img).toHaveAttribute('width', '38')
    expect(img).toHaveAttribute('height', '38')
  })

  it('asks for the icon-button ROLE, which is what makes it 42 here and 34 on the panel', async () => {
    // R3's table: the reader's icon buttons are 42×42 at radius 12.
    //
    // The class is `w-iconbtn`, not a number, and it is the SAME string the panel
    // writes — `--role-iconbtn` is `--size-iconbtn` 40px on `:root` and
    // `--size-iconbtn-reader` 42px under `[data-surface='reader']`, so the
    // difference is carried by the role layer that R3 exists to be. jsdom
    // computes no CSS, so this assertion can only pin that the shell asked for
    // the role; the two values themselves are pinned by `--role-iconbtn`'s row in
    // `SCALE` in `src/ui/surface.test.tsx`, and the painted box by the Playwright
    // check in `e2e/reader-shell.spec.ts`. A `w-[42px]` here would pass this test
    // and this test alone, and would stop being the design the day R3 moved.
    renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    for (const name of ['پروفایل من', 'خروج']) {
      const control = name === 'خروج'
        ? screen.getByRole('button', { name })
        : screen.getByRole('link', { name })
      expect(control, name).toHaveClass('w-iconbtn', 'h-iconbtn', 'rounded-button')
      // …and NOT the panel's own square, which is a different token at a
      // different value and compiles just as cleanly.
      expect(control.className, name).not.toMatch(/\bw-(tool|menu-more)\b/)
    }
  })

  it('gives the home square the READER’s 38px box, not the panel’s 36', async () => {
    // `Inja Reader.dc.html:162` — `38×38; border-radius:11px`. The panel draws
    // its own home button, its tools button and its mobile menu tile all at 36
    // (`--size-menu-more`), and `w-menu-more` here compiles, paints and is two
    // pixels wrong on every screen this bar is on.
    renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const home = screen.getByRole('link', { name: 'خانه' })
    expect(home).toHaveClass('w-menu-more-reader', 'h-menu-more-reader', 'rounded-input')
    // A whole class token, not `\b`: `\b` sits between the `e` and the `-` of
    // `w-menu-more-reader`, so the panel's own key matches inside the reader's.
    expect(home.className.split(/\s+/)).not.toContain('w-menu-more')
  })

  it('counts the approvals waiting for you in Persian, and drops the badge at zero', async () => {
    // Audit S4 and S5 together: a latin digit in a 44×44 coral square.
    const zero = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(screen.queryByRole('status')).toBeNull()
    zero.unmount()
    renderReader(THREE, '/departments', { pendingApprovals: 4 })
    const badge = await screen.findByRole('status')
    expect(badge).toHaveTextContent('۴')
    expect(badge.textContent).not.toMatch(/[0-9]/)
    expect(badge).toHaveClass('rounded-round', 'min-w-count-chrome', 'h-count-chrome')
    // S5 — the badge is not interactive, so it must not carry the touch floor.
    expect(badge.className).not.toMatch(/\bmin-[wh]-touch\b/)
    // …and it says what it is counting. A bare «۴» in a coral disc is a number
    // with no sentence attached, and this is the app's only notification channel.
    expect(badge.getAttribute('aria-label')).toContain('۴')
  })

  it('shows the badge for a reader with EXACTLY ONE comment waiting', async () => {
    // The boundary, and on this bar it is the one that matters: `> 0` -> `> 1`
    // is one character, and every fixture in this file and in the reader e2e is
    // 0 or 4, so both agree with it. What it does is show a reader with a single
    // comment awaiting their approval NOTHING — and in-app notification is this
    // product's only channel (F15), so for that reader the badge is not part of
    // the signal, it IS the signal.
    renderReader(THREE, '/departments', { pendingApprovals: 1 })
    const badge = await screen.findByRole('status')
    expect(badge).toHaveTextContent('۱')
    expect(badge.getAttribute('aria-label')).toContain('۱')
  })

  it('names the screen the back bar is on, resolved from the departments it already holds', async () => {
    // `Inja Reader.dc.html:160-161` — the one piece of text on that bar, and the
    // plan drew the bar without it. The NAME comes from the query, never from
    // the code in the URL: «دپارتمان dining» is the failure this pins against.
    const list = renderReader(THREE, '/departments/dining')
    expect(await screen.findByText('سالن')).toBeInTheDocument()
    list.unmount()
    const about = renderReader(THREE, '/departments/cooking/overview')
    expect(await screen.findByText('دربارهٔ پخت')).toBeInTheDocument()
    about.unmount()
    // …and the two that name themselves need no query at all, which is why they
    // are a different branch: this one is on screen before the fetch resolves.
    renderReader(THREE, '/profile')
    expect(screen.getByText('پروفایل من')).toBeInTheDocument()
  })

  it('leaves the title empty rather than half-written before the query lands', async () => {
    // The deliverable's own answer for a process screen is the empty string.
    const { container } = renderReader(THREE, '/processes/dining-003')
    await screen.findByText('خلاصهٔ فرآیند')
    const bar = container.querySelector('[data-r-backbar]') as HTMLElement
    expect(bar.textContent).not.toMatch(/undefined|dining/)
  })

  it('never writes the department CODE on the bar, not even for the frame before the query lands', async () => {
    // The name is in the query and the code is in the URL, and the fallback for
    // "asked before it answered" is the empty string — never the code. The
    // department summary is the route that shows it: it is not behind the
    // redirect's gate, so it paints once with `departments` still undefined, and
    // a fallback of `here.deptCode` writes «دربارهٔ dining» — a latin word, in
    // the Persian bar, on the app's only right-to-left surface (§8).
    //
    // The assertion is taken BEFORE the await on purpose. Every other title case
    // in this file waits for the answer first, and after it lands the two
    // spellings agree.
    const { container } = renderReader(THREE, '/departments/dining/overview')
    const bar = container.querySelector('[data-r-backbar]') as HTMLElement
    expect(bar, 'the back bar is not on screen yet, so this test is about nothing').toBeInTheDocument()
    expect(bar.textContent).not.toMatch(/[A-Za-z]/)
    expect(await screen.findByText('دربارهٔ سالن')).toBeInTheDocument()
  })

  it('marks the surface so R3’s scale resolves under it', async () => {
    const { container } = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const surface = container.querySelector('[data-surface="reader"]')
    expect(surface).toBeInTheDocument()
    expect(surface).toHaveClass('contents')
  })

  it('gives the outlet a growing, unpadded flex column ancestor, on both chromes and on neither', async () => {
    // C1 — FlowScreen's canvas resolves `h-full` down this chain, and padding
    // here renders it at zero height. The flow screen has no bar at all, so it
    // is the one that most needs saying.
    for (const [entry, text] of [
      ['/departments', 'فهرست دپارتمان‌ها'],
      ['/departments/dining', 'فهرست فرآیندها'],
      ['/processes/dining-003/flow', 'فلوچارت'],
    ] as const) {
      const { unmount } = renderReader(THREE, entry)
      const main = (await screen.findByText(text)).parentElement as HTMLElement
      expect(main.tagName, entry).toBe('MAIN')
      expect(main.className, entry).toMatch(/\bflex-1\b/)
      expect(main.className, entry).toMatch(/\bmin-h-0\b/)
      expect(main.className, entry).not.toMatch(/(^|\s)p[xytrbl]?-/)
      unmount()
    }
  })

  it('renders no h1 of its own, on either chrome', async () => {
    // I6 — the brand is a span; the routed screen owns the page's one h1 (F11).
    for (const [entry, text] of [
      ['/departments', 'فهرست دپارتمان‌ها'],
      ['/departments/dining', 'فهرست فرآیندها'],
    ] as const) {
      const { container, unmount } = renderReader(THREE, entry)
      await screen.findByText(text)
      expect(container.querySelectorAll('h1').length, entry).toBe(0)
      unmount()
    }
  })

  it('grows every under-sized chrome control to the 44px floor', async () => {
    // F11 against the design's ladder: the painted box stays 42 and 38, and a
    // transparent ::before carries the target. `expectExpandedHitArea` resolves
    // the used box from the element's own classes rather than matching a
    // literal, so it also refuses a ::before that has been told not to draw.
    const bar = renderReader(THREE, '/departments')
    expectExpandedHitArea(await screen.findByRole('link', { name: 'پروفایل من' }))
    expectExpandedHitArea(screen.getByRole('button', { name: 'خروج' }))
    bar.unmount()
    renderReader(THREE, '/departments/dining')
    expectExpandedHitArea(await screen.findByRole('link', { name: 'خانه' }))
  })
})

/** Whatever a control calls itself, for a message that says WHICH one is out. */
function named(el: HTMLElement): string {
  return el.getAttribute('aria-label') ?? el.textContent ?? el.tagName
}

describe('ReaderShell reachability', () => {
  it('puts sign-out and the profile one control away on the reader’s root', async () => {
    renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(screen.getByRole('button', { name: 'خروج' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'پروفایل من' })).toHaveAttribute('href', '/profile')
    // R22 — «نمایه» was the plan's word for this control and the deliverable's
    // is «پروفایل من» (reader 148), which is also what `readerHere` already
    // calls the screen it opens (`crumbs.ts:148`). The two used to disagree
    // about the name of the same page: the button said one thing and the bar
    // you landed on said another.
    expect(screen.queryByRole('link', { name: 'نمایه' })).toBeNull()
  })

  it('signs out when the top bar’s «خروج» is pressed', async () => {
    // A control asserted only to exist is not asserted. This one is wired.
    renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(signedOut()).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(signedOut()).toBe(1))
  })

  it('keeps a way back on EVERY route that has a bar at all, and points it where readerBack says', async () => {
    for (const [entry, text, to] of [
      ['/departments/dining', 'فهرست فرآیندها', '/departments'],
      ['/departments/dining/overview', 'خلاصهٔ دپارتمان', '/departments/dining'],
      ['/processes/dining-003', 'خلاصهٔ فرآیند', '/departments/dining'],
      ['/profile', 'محتوای پروفایل', '/departments'],
    ] as const) {
      const { unmount } = renderReader(THREE, entry)
      await screen.findByText(text)
      expect(screen.getByRole('link', { name: 'بازگشت' }), entry).toHaveAttribute('href', to)
      // …and «خانه» beside it, which is the reader's one route back to the bar
      // that holds sign-out. The design draws no sign-out on this bar and this
      // shell does not add one: it is two clicks, not nowhere, which is the
      // difference between this and the panel's strip before Task 12 fixed it.
      expect(screen.getByRole('link', { name: 'خانه' }), entry).toHaveAttribute('href', '/departments')
      unmount()
    }
  })

  it('points «خانه» at the ONE-department reader’s own root, not at the list', async () => {
    // The other half of R4, and the mutation `to={root}` -> `to="/departments"`
    // is invisible to every many-department case above: for them the two are the
    // same string. For this reader «خانه» would land on a list that bounces them
    // straight back — a control whose destination is a redirect.
    renderReader(ONE, '/departments/dining/overview')
    await screen.findByText('دربارهٔ سالن')
    expect(screen.getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/departments/dining')
    expect(screen.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/departments/dining')
  })

  it('points the brand lockup at the same root «خانه» does', async () => {
    const one = renderReader(ONE, '/departments')
    await screen.findByText('فهرست فرآیندها')
    expect(screen.getByRole('link', { name: /اینجا فست‌فود/ })).toHaveAttribute('href', '/departments/dining')
    one.unmount()
    renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(screen.getByRole('link', { name: /اینجا فست‌فود/ })).toHaveAttribute('href', '/departments')
  })

  it('leaves the whole chrome in the tab order', async () => {
    // `tabIndex={-1}` on any of these is a control that is still there, still
    // labelled, still the right size and still clickable by a mouse — and gone
    // for a keyboard. Sign-out is the one that matters most.
    const bar = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    for (const el of controlsIn(bar.container)) {
      expect(el.getAttribute('tabindex'), named(el)).not.toBe('-1')
    }
    expect(controlsIn(bar.container).length).toBeGreaterThan(2)
    bar.unmount()
    const back = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const controls = controlsIn(back.container, '[data-r-backbar]')
    expect(controls.length).toBeGreaterThan(1)
    for (const el of controls) {
      expect(el.getAttribute('tabindex'), named(el)).not.toBe('-1')
    }
  })
})

describe('ReaderShell glyphs', () => {
  it('draws four DIFFERENT pictures, so the pins below are about something', () => {
    const drawn = ['chevronStart', 'home', 'user', 'logout'].map(
      (n) => iconGlyph(n as Parameters<typeof Icon>[0]['name']),
    )
    expect(new Set(drawn).size).toBe(4)
    expect(drawn.every((d) => d.length > 0)).toBe(true)
  })

  it('points «بازگشت» the way an RTL reader came from', async () => {
    // `Inja Reader.dc.html:158` draws `M9 18l6-6-6-6` on this very button, which
    // is `chevronStart`. In a right-to-left reading what you came from lies to
    // the RIGHT, so the back control points right — and `chevronEnd`, the
    // drill-in chevron, is the same picture mirrored and compiles just as well.
    const { container } = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const glyph = glyphOf(screen.getByRole('link', { name: 'بازگشت' }))
    expect(glyph).toBe(iconGlyph('chevronStart'))
    expect(glyph).not.toBe(iconGlyph('chevronEnd'))
    // …and «خانه» beside it is a house, not the same chevron again.
    expect(glyphOf(container.querySelector('a[aria-label="خانه"]'))).toBe(iconGlyph('home'))
  })

  it('draws a person on the profile and the sign-out glyph on sign-out', async () => {
    const { container } = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(glyphOf(container.querySelector('a[aria-label="پروفایل من"]'))).toBe(iconGlyph('user'))
    expect(glyphOf(container.querySelector('button[aria-label="خروج"]'))).toBe(iconGlyph('logout'))
  })

  it('draws each glyph at the WEIGHT the deliverable gives it, on both bars', async () => {
    // reader 158 draws the chevron at `stroke-width:2.4` and reader 163 the
    // house at `2`. Sizes are pinned below and weights were pinned nowhere:
    // `Icon`'s default is 2, so the chevron's 2.4 is written at the call site
    // and the house's 2 is the default holding, and BOTH directions compile,
    // paint a legal picture, and satisfy every glyph, size, box and colour
    // assertion in this file. A 2.4 house is a heavier drawing in the same
    // square — a difference a reader sees and no other check does.
    const bar = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(strokeOf(bar.container.querySelector('a[aria-label="پروفایل من"]'))).toBe('2')
    expect(strokeOf(bar.container.querySelector('button[aria-label="خروج"]'))).toBe('2.2')
    bar.unmount()
    const back = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    expect(strokeOf(back.container.querySelector('[data-r-backbar] a[href="/departments"]'))).toBe('2.4')
    expect(strokeOf(back.container.querySelector('a[aria-label="خانه"]'))).toBe('2')
  })

  it('sizes each glyph to the deliverable’s own number', async () => {
    // The reader's bar draws its icons at 19 (reader 143, 149) and its back bar
    // at 16 and 17 (reader 158, 163) — every one of them a step above the
    // panel's, because every box under them is. A glyph sized off the panel
    // renders a small picture in a large button and nothing fails.
    const bar = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const svg = (sel: string) => bar.container.querySelector(`${sel} svg`)
    expect(svg('a[aria-label="پروفایل من"]')).toHaveAttribute('width', '19')
    expect(svg('button[aria-label="خروج"]')).toHaveAttribute('width', '19')
    bar.unmount()
    const back = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    expect(back.container.querySelector('[data-r-backbar] a[href="/departments"] svg'))
      .toHaveAttribute('width', '16')
    expect(back.container.querySelector('a[aria-label="خانه"] svg')).toHaveAttribute('width', '17')
  })
})

describe('what the reader chrome’s class strings compile to', () => {
  it('paints the top bar white on a cream hairline, at the READER’s box', async () => {
    const { cls, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const bar = await paint(cls('[data-r-topbar]'))
    unmount()
    // `Inja Reader.dc.html:133` — `gap:12px; padding:12px 20px; background:#fff;
    // border-bottom:1px solid #EFE7DC; z-index:20`. The panel draws `gap:14px;
    // padding:12px 22px` on its own bar, and every one of those three numbers
    // compiles here.
    expect(winner(bar, 'gap')).toBe('var(--space-6)')
    expect(winner(bar, 'gap')).not.toBe('var(--space-7)')
    expect(winner(bar, 'padding-left')).toBe('var(--pad-topbar-reader)')
    // NOT the panel's gutter, and NOT the reader's CONTENT gutter, which is a
    // different row of the page four pixels away.
    expect(winner(bar, 'padding-left')).not.toBe('var(--pad-topbar)')
    expect(winner(bar, 'padding-left')).not.toBe('var(--pad-reader-x)')
    expect(declarations(bar)).toEqual(new Set([
      'display: flex',
      'align-items: center',
      'gap: var(--space-6)',
      'padding-left: var(--pad-topbar-reader)',
      'padding-right: var(--pad-topbar-reader)',
      'padding-top: var(--space-6)',
      'padding-bottom: var(--space-6)',
      'background-color: var(--card)',
      'border-bottom-width: 1px',
      'border-color: var(--warm)',
      'flex: none',
      'z-index: var(--role-z-chrome)',
    ]))
    // `Inja Reader.dc.html:97` — `[data-r-topbar]{padding:10px 14px; gap:10px}`
    // at ≤760, and nothing else.
    expect(declarations(bar, '', R760)).toEqual(new Set([
      'gap: var(--space-5)',
      'padding-left: var(--space-7)',
      'padding-right: var(--space-7)',
      'padding-top: var(--space-5)',
      'padding-bottom: var(--space-5)',
    ]))
  })

  it('paints the back bar white too, and does NOT tighten it at 760', async () => {
    const { cls, unmount } = readerChrome('/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const bar = await paint(cls('[data-r-backbar]'))
    unmount()
    // `Inja Reader.dc.html:156` — `gap:10px; padding:10px 20px; background:#fff;
    // border-bottom:1px solid #EFE7DC`. This is NOT the panel's crumb strip:
    // that one is `9px 22px` on the LAVENDER tile behind a violet hairline, and
    // it would compile here without a word.
    expect(winner(bar, 'background-color')).toBe('var(--card)')
    expect(winner(bar, 'background-color')).not.toBe('var(--tile-v2)')
    expect(winner(bar, 'border-color')).toBe('var(--warm)')
    expect(winner(bar, 'padding-top')).toBe('var(--space-5)')
    expect(winner(bar, 'padding-top')).not.toBe('var(--pad-crumb-y)')
    expect(declarations(bar)).toEqual(new Set([
      'display: flex',
      'align-items: center',
      'gap: var(--space-5)',
      'padding-left: var(--pad-topbar-reader)',
      'padding-right: var(--pad-topbar-reader)',
      'padding-top: var(--space-5)',
      'padding-bottom: var(--space-5)',
      'background-color: var(--card)',
      'border-bottom-width: 1px',
      'border-color: var(--warm)',
      'flex: none',
    ]))
    // The deliverable writes its ≤760 override against `[data-r-topbar]` by
    // name and writes NONE for this bar, exactly as the panel's own strip has
    // none. A `max760:px-s7` copied off the bar above narrows this one by six
    // pixels on every phone and nothing says so.
    expect(declarations(bar, '', R760)).toEqual(new Set())
    expect(declarations(bar, '', R1080)).toEqual(new Set())
  })

  it('paints the shell’s own root as the full-viewport field it has to be', async () => {
    const { cls, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const root = await paint(cls('[data-shell="reader"]'))
    unmount()
    expect(declarations(root)).toEqual(new Set([
      'height: 100vh',
      'display: flex',
      'flex-direction: column',
      'overflow: hidden',
      'background-color: var(--ink)',
      'color: var(--ink)',
    ]))
  })

  it('gives ALL FOUR ghost controls every declaration the design draws on them', async () => {
    // `Inja Reader.dc.html:142, 148, 157, 162` — every control on both reader
    // bars is `display:inline-flex; align-items:center; justify-content:center;
    // background:#F4EFFB; border:1.5px solid #E3D8F5; color:#4A25A9`, plus its
    // own box.
    //
    // Graded as a SET, and that is the point of rewriting it. The first spelling
    // read five properties through `winner()` and left `align-items` and
    // `justify-content` — two of the ten — asserted nowhere on any of the four,
    // while both bars, the lockup, the subtitle, the title span and the cluster
    // beside it all get set-equality. Measured with either one dropped: vitest
    // stays green, Playwright stays green, and every glyph in every chrome
    // button jams against one edge of its box — the profile person at 1px from
    // the inline start and 22px from the end inside a 42×42 square, «خانه» at
    // 1/20, the «بازگشت» chevron at 11/15.25 vertically. About 21 pixels off
    // centre, on four controls, on every screen this shell draws.
    //
    // The colour half is the reversal that makes the two surfaces different
    // rather than scaled: the panel's bars put a WHITE control on a lavender
    // strip and the reader's put a LAVENDER control on a white bar, so `bg-card`
    // — the panel's recipe, byte for byte — compiles, builds and paints a white
    // button on a white bar with a hairline round it.
    const inner = readerChrome('/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const drawn: Record<string, string> = {
      'بازگشت': inner.cls('[data-r-backbar] a[href="/departments"]'),
      'خانه': inner.cls('[data-r-backbar] a[aria-label="خانه"]'),
    }
    inner.unmount()
    const root = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    drawn['پروفایل من'] = root.cls('[data-r-topbar] a[aria-label="پروفایل من"]')
    drawn['خروج'] = root.cls('[data-r-topbar] button[aria-label="خروج"]')
    root.unmount()

    // Ten declarations every one of the four carries, and the centring is two
    // of them.
    const GHOST = [
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'background-color: var(--tile-v2)',
      'color: var(--violet)',
      'border-color: var(--line)',
      'border-width: var(--border-hairline)',
      'cursor: pointer',
      'text-decoration-line: none',
      // F11's overlay needs a positioned ancestor, and this is it.
      'position: relative',
    ]
    // …and the box each one is the design's own, which is R3's whole subject:
    // 42 at radius 12 on the top bar (reader 142, 148), 38 at radius 11 for
    // «خانه» (reader 162), and five stated values for «بازگشت» (reader 157).
    const OWN: Record<string, string[]> = {
      'بازگشت': [
        'flex: none',
        'gap: var(--gap-button-icon)',
        'padding-left: var(--pad-button-x)', 'padding-right: var(--pad-button-x)',
        'padding-top: var(--space-5)', 'padding-bottom: var(--space-5)',
        'border-radius: var(--radius-md)',
        'font-size: var(--fs-menu)', 'font-weight: var(--fw-bold)',
      ],
      'خانه': [
        'flex: none',
        'width: var(--size-menu-more-reader)', 'height: var(--size-menu-more-reader)',
        'border-radius: var(--radius-input)',
      ],
      'پروفایل من': [
        'width: var(--role-iconbtn)', 'height: var(--role-iconbtn)',
        'border-radius: var(--radius-md)',
      ],
      'خروج': [
        'width: var(--role-iconbtn)', 'height: var(--role-iconbtn)',
        'border-radius: var(--radius-md)',
      ],
    }
    for (const [name, cls] of Object.entries(drawn)) {
      const ghost = await paint(cls)
      expect(declarations(ghost), name).toEqual(new Set([...GHOST, ...OWN[name]]))
      // …and NOTHING on hover, which is a statement about the design and not
      // an omission. The panel's ghost hovers ONTO `--tile-v2`, the colour this
      // one already IS, so the panel's string pasted here is feedback in the
      // source and none on the screen; and the OTHER half of the panel's recipe
      // — `hover:bg-card` — is worse than nothing, because it makes the hovered
      // control exactly the colour of the bar under it. The button stops being
      // a tile at all under the pointer, its label stays perfectly legible
      // violet-on-white, and a contrast check on the LABEL reports it fine.
      // "Different from its resting colour" cannot say this; "no hover rule at
      // all" can, and it is what the deliverable draws.
      expect(declarations(ghost, ':hover'), name).toEqual(new Set())
      // …and no width override either. The deliverable writes its ≤760 rule
      // against `[data-r-topbar]` itself (reader 97) and none for any control.
      expect(declarations(ghost, '', R760), name).toEqual(new Set())
      // F11's 44px floor, on a transparent `::before` rather than on the box the
      // design draws — so it is the one thing here that is deliberately NOT in
      // the set above.
      expect(declarations(ghost, '::before'), name).toEqual(new Set([
        '--tw-content: ""',
        'content: var(--tw-content)',
        'position: absolute',
        'inset: -5px',
      ]))
    }
  })

  it('gives «بازگشت» all five of the reader’s own values', async () => {
    // `Inja Reader.dc.html:157` — `gap:7px; padding:10px 15px; border-radius:12px;
    // font-weight:700; font-size:13.5px`. The panel's own back button is
    // `gap:6px; padding:7px 12px; radius 11; 12.5px` — five values, five
    // different, and one class string carries all of them.
    const { cls, unmount } = readerChrome('/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const back = await paint(cls('[data-r-backbar] a[href="/departments"]'))
    unmount()
    expect(winner(back, 'gap')).toBe('var(--gap-button-icon)')
    expect(winner(back, 'gap')).not.toBe('var(--space-3)')
    expect(winner(back, 'padding-left')).toBe('var(--pad-button-x)')
    expect(winner(back, 'padding-left')).not.toBe('var(--space-6)')
    expect(winner(back, 'padding-top')).toBe('var(--space-5)')
    expect(winner(back, 'padding-top')).not.toBe('var(--pad-back-y)')
    expect(winner(back, 'border-radius')).toBe('var(--radius-md)')
    expect(winner(back, 'border-radius')).not.toBe('var(--radius-input)')
    expect(winner(back, 'font-size')).toBe('var(--fs-menu)')
    expect(winner(back, 'font-size')).not.toBe('var(--fs-sm2)')
    expect(winner(back, 'font-weight')).toBe('var(--fw-bold)')
  })

  it('gives the home square the reader’s 38px box at the design’s 11px corner', async () => {
    const { cls, unmount } = readerChrome('/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const home = await paint(cls('[data-r-backbar] a[aria-label="خانه"]'))
    unmount()
    expect(winner(home, 'width')).toBe('var(--size-menu-more-reader)')
    expect(winner(home, 'height')).toBe('var(--size-menu-more-reader)')
    // Same value, different owner: `--size-logo-bar` is also 38px and is the
    // logo IMAGE's role. A same-value swap paints identically and only a name
    // check can see it.
    expect(winner(home, 'width')).not.toBe('var(--size-logo-bar)')
    expect(winner(home, 'width')).not.toBe('var(--size-menu-more)')
    expect(winner(home, 'border-radius')).toBe('var(--radius-input)')
    expect(winner(home, 'flex')).toBe('none')
  })

  it('gives the icon buttons the ROLE, and the design’s 12px corner', async () => {
    const { cls, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const btn = await paint(cls('[data-r-topbar] a[aria-label="پروفایل من"]'))
    unmount()
    expect(winner(btn, 'width')).toBe('var(--role-iconbtn)')
    expect(winner(btn, 'width')).not.toBe('var(--size-iconbtn-reader)')
    expect(winner(btn, 'height')).toBe('var(--role-iconbtn)')
    expect(winner(btn, 'border-radius')).toBe('var(--radius-md)')
    // F11's overlay, on the ::before rather than on the box the design draws.
    expect(winner(btn, 'position')).toBe('relative')
    expect(winner(btn, 'position', '::before')).toBe('absolute')
    expect(winner(btn, 'inset', '::before')).toBe('-5px')
    expect(winner(btn, 'content', '::before')).toBe('var(--tw-content)')
  })

  it('gives the brand lockup the surface-aware leading and the reader’s two type steps', async () => {
    // `Inja Reader.dc.html:136-138` — `line-height:1.3`, then 14.5px over 11px.
    // The panel draws 1.25 over 14px over 10.5px, and `leading-lockup` is ONE
    // class that is both: `--role-lh-lockup` switches on `[data-surface]`, the
    // way `w-iconbtn` is 40 and 42. Pointing it at `--lh-lockup` compiles and
    // silently makes the reader the panel.
    const { container, cls, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const lockup = await paint(cls('[data-r-topbar] a span'))
    const name = await paint((container.querySelectorAll('[data-r-topbar] a span span')[0] as HTMLElement).className)
    const sub = await paint((container.querySelectorAll('[data-r-topbar] a span span')[1] as HTMLElement).className)
    unmount()
    expect(winner(lockup, 'line-height')).toBe('var(--role-lh-lockup)')
    expect(winner(lockup, 'line-height')).not.toBe('var(--lh-lockup)')
    expect(winner(lockup, 'line-height')).not.toBe('var(--lh-tight)')
    expect(winner(name, 'font-size')).toBe('var(--fs-body-lead)')
    expect(winner(name, 'font-size')).not.toBe('var(--fs-body)')
    expect(winner(sub, 'font-size')).toBe('var(--fs-xxs)')
    expect(winner(sub, 'font-size')).not.toBe('var(--fs-micro)')
    // reader 134, 136, 138 — `min-width:0` twice and the ellipsis on the second
    // line, which is what lets the lockup give way to the controls beside it
    // instead of pushing them off a narrow bar. Nothing about it is visible
    // until the window is narrow enough, and `truncate` without a `min-width:0`
    // above it does nothing at all inside a flex row.
    expect(declarations(lockup)).toEqual(new Set([
      'display: block',
      'min-width: 0px',
      'line-height: var(--role-lh-lockup)',
    ]))
    expect(declarations(sub)).toEqual(new Set([
      'display: block',
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
      'font-size: var(--fs-xxs)',
      'color: var(--text-muted)',
    ]))
  })

  it('lets the brand lockup give way rather than push the controls off the bar', async () => {
    // reader 134 — `min-width:0` on the lockup itself. A flex item's default
    // `min-width:auto` is its content, so without this the lockup refuses to
    // shrink and the two icon buttons are pushed past the bar's own edge.
    const { container, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const link = await paint((container.querySelector('[data-r-topbar] a') as HTMLElement).className)
    unmount()
    expect(winner(link, 'min-width')).toBe('0px')
  })

  it('draws the count badge round, 19px, and coral', async () => {
    const { cls, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    unmount()
    const { container, unmount: drop } = renderReader(THREE, '/departments', { pendingApprovals: 4 })
    await screen.findByRole('status')
    const badge = await paint((container.querySelector('[role="status"]') as HTMLElement).className)
    drop()
    void cls
    // `Inja Reader.dc.html:145` — `min-width:19px; height:19px; padding:0 4px;
    // background:#FA5A52; color:#fff; border-radius:50%; font-size:10.5px`.
    expect(winner(badge, 'min-width')).toBe('var(--size-count-chrome)')
    expect(winner(badge, 'height')).toBe('var(--size-count-chrome)')
    // Same value, two other owners: `--size-tick` is 19px and is the tick box,
    // `--size-count` is 21px and is the FAB's badge.
    expect(winner(badge, 'min-width')).not.toBe('var(--size-tick)')
    expect(winner(badge, 'border-radius')).toBe('var(--radius-round)')
    expect(winner(badge, 'background-color')).toBe('var(--coral)')
    expect(winner(badge, 'color')).toBe('var(--card)')
    expect(winner(badge, 'font-size')).toBe('var(--fs-micro)')
    expect(winner(badge, 'padding-left')).toBe('var(--space-1)')
  })

  it('carries the bar’s title on a flex:1 span that truncates rather than wraps', async () => {
    // `Inja Reader.dc.html:160` — `flex:1; min-width:0; overflow:hidden;
    // text-overflow:ellipsis; white-space:nowrap`. The `min-width:0` is what
    // makes the other two work at all inside a flex row, and it is the half a
    // `truncate` on its own leaves out.
    const { container, unmount } = readerChrome('/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    const title = await paint((container.querySelector('[data-r-backbar] > span') as HTMLElement).className)
    unmount()
    expect(declarations(title)).toEqual(new Set([
      'flex: 1 1 0%',
      'min-width: 0px',
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
      'font-size: var(--fs-menu)',
      'font-weight: var(--fw-bold)',
      'color: var(--ink)',
    ]))
  })

  it('pushes the bar’s right-hand cluster to the inline end at the design’s 8px gap', async () => {
    // `Inja Reader.dc.html:141` — `margin-inline-start:auto; gap:8px; flex:none`.
    // The panel's own cluster is `gap:10px`, and `gap-s5` here compiles.
    const { container, unmount } = readerChrome('/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    const cluster = await paint(
      (container.querySelector('[data-r-topbar] a[aria-label="پروفایل من"]')!.parentElement as HTMLElement).className,
    )
    unmount()
    expect(declarations(cluster)).toEqual(new Set([
      'margin-inline-start: auto',
      'display: flex',
      'align-items: center',
      'gap: var(--space-4)',
      'flex: none',
    ]))
    expect(winner(cluster, 'gap')).not.toBe('var(--space-5)')
  })
})
