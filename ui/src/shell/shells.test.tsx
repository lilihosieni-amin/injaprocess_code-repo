import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'
import { PanelShell } from './PanelShell'
import { Icon } from '../ui/Icon'
import { pushDismissible, popDismissible, isTopDismissible } from '../ui/dismissibleStack'
import { expectExpandedHitArea } from '../test/a11y'
import { paint, winner, declarations } from '../test/paint'
import type { SessionDescriptor, Capability } from '../auth/session'

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
            <Route path="/processes/:pid" element={<p>محتوا</p>} />
            <Route path="/processes/:pid/flow" element={<p>محتوا</p>} />
            <Route path="/users" element={<p>محتوا</p>} />
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
function renderAdmin(entry = '/departments') {
  return renderPanel(['view', 'edit', 'set_visibility', 'manage_users'], entry, { scopes: ['*'] })
}

/** Every `d` this element draws, in order — the whole glyph, not its first path. */
function glyphOf(el: Element | null | undefined): string {
  return Array.from(el?.querySelectorAll('path') ?? []).map((p) => p.getAttribute('d')).join(' ')
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

  it('keeps the crumb strip on the flow screen, which has no bar of its own', () => {
    // §6.0 replaces the strip with the flowchart's own tool bar here. `src/flow/`
    // is frozen (F16) and has no bar, so without this that screen has no chrome
    // and no way back at all — the one place where following the design would
    // ship a dead end.
    const { container } = renderPanel(['view', 'edit'], '/processes/dining-003/flow')
    expect(container.querySelector('[data-r-crumbbar]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/processes/dining-003')
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
  })

  it('grows both under-sized chrome controls to the 44px floor', () => {
    // F11 against the design's ladder: the painted box stays 34 and 36, and a
    // transparent ::before carries the target. `expectExpandedHitArea` resolves
    // the used width from the element's own classes rather than matching a
    // literal, so it also refuses a ::before that has been told not to draw.
    const { unmount } = renderPanel(['view', 'edit'], '/departments')
    expectExpandedHitArea(screen.getByRole('button', { name: 'خروج' }))
    unmount()
    renderPanel(['view', 'edit'], '/departments/dining')
    expectExpandedHitArea(screen.getByRole('link', { name: 'خانه' }))
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

/** Every route this shell is ever mounted on, one per branch of its chrome. */
const ROUTES = ['/departments', '/departments/dining', '/processes/dining-003', '/processes/dining-003/flow']

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
    // which is the box §6.0 draws there.
    const inner = renderPanel(['view', 'edit'], '/departments/dining')
    const cluster = inner.container.querySelector('[data-r-crumbbar] .ms-auto') as HTMLElement
    expect(within(cluster).getByRole('link', { name: 'خانه' })).toBeInTheDocument()
    expect(within(cluster).getByRole('button', { name: 'فهرست' })).toBeInTheDocument()
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
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
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
  it('draws six DIFFERENT pictures, so the pins below are about something', () => {
    // The negative half. Without it, an icon set that had collapsed to one
    // drawing would satisfy every assertion in this block.
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
   12". Lifting the two copies under `src/ui/` is one import each and is left to
   whoever unfreezes that directory; this file's copy is gone, so there are two
   left rather than three, and the module they should point at exists.
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
    const row = await paint((within(sheet).getByRole('link', { name: 'دپارتمان‌ها' })).className)
    expect(winner(row, 'justify-content')).toBe('flex-start')
    expect(winner(row, 'justify-content')).not.toBe('center')
    expect(winner(row, 'display')).toBe('flex')
    expect(winner(row, 'display')).not.toBe('inline-flex')
    expect(declarations(row)).toEqual(new Set([
      'display: flex',
      'align-items: center',
      'justify-content: flex-start',
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
    // §8 — the corner it hangs off is one of the physical pins the deliverable
    // keeps (`top:-6px; left:-6px`): the RTL bar puts the button's inline END on
    // the left, and mirroring this to `inset-inline-start` would move the badge
    // onto the label it is meant to sit beside.
    expect(winner(b, 'top')).toBe('calc(var(--space-3) * -1)')
    expect(winner(b, 'left')).toBe('calc(var(--space-3) * -1)')
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
