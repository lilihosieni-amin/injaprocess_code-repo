import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'
import { PanelShell } from './PanelShell'
import { Icon } from '../ui/Icon'
import { expectExpandedHitArea } from '../test/a11y'
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
  { pending = [] as unknown[], depts = DEPTS as unknown[] } = {},
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
    const body = url.includes('/api/pending') ? pending : depts
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<PanelShell session={session(caps)} />}>
            <Route path="/departments" element={<p>محتوا</p>} />
            <Route path="/departments/:code" element={<p>محتوا</p>} />
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
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/departments']}>
          <PanelShell session={{ ...session(['view', 'edit', 'set_visibility', 'manage_users']), scopes: ['*'] }} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
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
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/departments']}>
          <PanelShell session={{ ...session(['view', 'edit', 'set_visibility', 'manage_users']), scopes: ['*'] }} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
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

/* -------------------------------------------------------------------------
   Everything above proves a string was written into a class attribute. jsdom
   paints nothing, so it cannot tell `py-crumb-y` from `py-crmub-y` — an
   invented utility emits no rule and the build still exits 0 — and it cannot
   tell which of two utilities setting the same property wins, because that is
   decided by Tailwind's output order and not by the order of the class string.

   So the block below runs the shell's OWN rendered class strings through the
   real `tailwind.config.js` and asserts the declarations that come out.

   `paint` and `winner` are copied from src/ui/table.test.tsx, which asks for
   them to be lifted into a shared module "by Task 12". They are not lifted
   here: doing so means editing two files under `src/ui/`, which this task is
   forbidden to touch. Recorded in the task report instead.
   ------------------------------------------------------------------------- */

/** One emitted rule, split into the class that carries it and the state it applies in. */
type Painted = { klass: string; state: string; media: string; decls: string }

/** Compile a class string through the real `tailwind.config.js`. */
async function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const out: Painted[] = []
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this block exists to catch.
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    for (const sel of rule.selectors) {
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      out.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return out
}

/**
 * The winning value of `prop` for an element wearing these classes, in `state`
 * and at `media` — the LAST declaration in emitted order, which is how the
 * cascade resolves two utilities that set the same property. Returns `''` when
 * nothing sets it, so a missing declaration and an invented class fail alike.
 */
function winner(painted: Painted[], prop: string, state = '', media = ''): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== state || p.media !== media) continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

const R1080 = '(max-width: 1080px)'
const R760 = '(max-width: 760px)'

/** The class strings the shell actually renders, read off the DOM. */
function chrome(entry: string, caps: Capability[] = ['view', 'edit']) {
  const { container } = renderPanel(caps, entry)
  const cls = (sel: string) => {
    const el = container.querySelector(sel)
    if (el === null) throw new Error(`chrome(): nothing rendered for \`${sel}\``)
    return (el as HTMLElement).className
  }
  return { container, cls }
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
})

describe('what the panel chrome’s class strings compile to', () => {
  it('paints the top bar white on a cream hairline, at the design’s box', async () => {
    const { cls } = chrome('/departments')
    const bar = await paint(cls('[data-r-topbar]'))
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
    // …and the whole emitted set at rest, so a declaration nobody thought to
    // name cannot arrive unnoticed.
    expect(new Set(bar.filter((p) => p.state === '' && p.media === '')
      .flatMap((p) => p.decls.split('; ').map((d) => d.split(':')[0]))))
      .toEqual(new Set([
        'display', 'align-items', 'gap', 'padding-left', 'padding-right',
        'padding-top', 'padding-bottom', 'background-color', 'border-bottom-width',
        'border-color', 'flex', 'z-index',
      ]))
  })

  it('paints the crumb strip on the violet tile, at the design’s box', async () => {
    const { cls } = chrome('/departments/dining')
    const strip = await paint(cls('[data-r-crumbbar]'))
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
  })

  it('gives the ghost controls a violet label over a violet-tile hover', async () => {
    // Audit S1, at the declaration level: the pairing that measured 1.04:1 was
    // `color: var(--card)` over `background-color: var(--tile-v2)`.
    const { cls } = chrome('/departments/dining')
    const back = await paint(cls('[data-r-crumbbar] a[href="/departments"]'))
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

  it('holds the nav tray, the inbox and the crumbs to the deliverable’s two breakpoints', async () => {
    const { cls } = chrome('/departments')
    const nav = await paint(cls('[data-r-nav]'))
    const burger = await paint(cls('[data-r-menu]'))
    const inbox = await paint(screen.getByRole('button', { name: /صندوق بازبینی/ }).className)
    expect(winner(nav, 'display')).toBe('inline-flex')
    expect(winner(nav, 'display', '', R1080)).toBe('none')
    expect(winner(burger, 'display')).toBe('none')
    expect(winner(burger, 'display', '', R1080)).toBe('flex')
    expect(winner(inbox, 'display')).toBe('inline-flex')
    expect(winner(inbox, 'display', '', R1080)).toBe('none')
    // The tray's one entry is the active pill — this bar is only ever drawn on
    // the screen that entry leads to — so it is the violet fill with the card
    // white on it, which is the one legal pairing of `text-card` in this bar.
    const pill = await paint((cls('[data-r-nav] a') as string))
    expect(winner(pill, 'background-color')).toBe('var(--violet)')
    expect(winner(pill, 'color')).toBe('var(--card)')
    expect(winner(pill, 'background-color', ':hover')).toBe('')
  })

  it('takes the crumbs away at 760 and leaves the strip’s box alone', async () => {
    const { cls } = chrome('/departments/dining')
    const crumbs = await paint(cls('[data-r-crumbs]'))
    const strip = await paint(cls('[data-r-crumbbar]'))
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
  })

  it('stacks the chrome above the page and the popover above the chrome’s siblings', async () => {
    // L-42…L-47 — the rungs replace the deliverable's `z-index:20` and `29`/`30`.
    // Tailwind ships its own `z-20`/`z-30`, which emit, look right in every test
    // and are the wrong layer.
    const { cls } = chrome('/departments')
    const bar = await paint(cls('[data-r-topbar]'))
    expect(winner(bar, 'z-index')).toBe('var(--role-z-chrome)')
    renderPanel(['view', 'edit'], '/departments')
    await userEvent.click(screen.getAllByRole('button', { name: /مدیریت/ })[1])
    const m = await paint(screen.getByRole('menu').className)
    expect(winner(m, 'z-index')).toBe('var(--role-z-dropdown)')
  })

  it('gives the inbox button the design’s own padding and gap', async () => {
    const { cls } = chrome('/departments')
    void cls('[data-r-topbar]')
    const inbox = await paint(screen.getByRole('button', { name: /صندوق بازبینی/ }).className)
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
