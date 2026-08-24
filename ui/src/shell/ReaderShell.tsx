import { useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'
import { useDepartments, useLogout } from '../api/hooks'
import { SurfaceProvider } from '../ui/surface'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { toFa } from '../lib/format'
import { roleLabel } from '../lib/roles'
import { readerBack, readerHere } from './crumbs'
import { canGoBack, isProcessView } from './back'
import { useScrollMemory } from './scroll'
import { SignOutConfirm } from './SignOutConfirm'

// Every control on both reader bars is the violet tile behind a 1.5px --line
// hairline with a --violet label (reader 142, 148, 157, 162). Values by token
// name: guards.test.ts's F6 reads COMMENTS, and this file names no literal.
//
// **This is the reversal, not a scale of the panel's.** `PanelShell`'s ghost is
// `bg-card` and it is right there: its crumb strip is the lavender tile and a
// white control stands off it. Here the bars are white and the controls are the
// lavender — so the panel's recipe, pasted, paints a white button on a white bar
// with a hairline round it. It compiles, it builds, and every class-name check
// in the suite agrees with it.
//
// It also carries NO hover, and that is the same fact from the other end: the
// panel hovers ONTO `--tile-v2`, which is the colour this control already is, so
// the same string here is feedback in the source and none on the screen. The
// deliverable draws no hover state for these four buttons.
const GHOST = 'inline-flex items-center justify-center bg-tile-v2 text-violet border-hairline border-line cursor-pointer no-underline'

// F11's 44px floor against the design's 38 and 42px boxes: the painted box stays
// the design's and a transparent `::before` grows the target. Nothing about it
// shows.
//
// The same string `PanelShell` writes, down to the bracket. The 5px is DERIVED —
// `(44 - 34) / 2` against the smallest box either shell paints — which is why it
// is the one bracketed value in both files: it is arithmetic against a floor, it
// differs per control (Overlay.tsx's 32px close button takes 6), and there is no
// role a token could name it by. It clears the floor with room on both boxes
// here: 38 + 10 = 48 and 42 + 10 = 52. `before:content-[""]` is what makes the
// pseudo-element exist at all, and src/test/a11y.ts reads this exact spelling to
// RESOLVE the hit area rather than pattern-match it — a named `-inset-` compiles
// to the same five pixels and leaves that helper with nothing to measure.
const HIT = 'relative before:absolute before:content-[""] before:-inset-[5px]'

/** The back bar's own control, reader 157 — `10px 15px`, radius 12, 13.5px.
 *  One string because R48's ruling made it two elements. */
const BACK_BAR_BTN =
  `${GHOST} ${HIT} gap-button-icon px-button-x py-s5 rounded-button text-fs-menu font-bold flex-none`

/**
 * Roomier density, one screen at a time.
 *
 * The reader's chrome is a top bar on their root and a back bar below it — never
 * the panel's breadcrumb strip (§9.12) — and **nothing at all on the flowchart**
 * (R3). The badge for comments awaiting you lives here because this is where
 * every session starts, and with in-app notification as the only channel that
 * placement is the whole signal (F15).
 */
export function ReaderShell({ session }: { session: SessionDescriptor }) {
  const logout = useLogout()
  // Owner ruling — sign-out asks first. One control on this surface, and the
  // same question `PanelShell` raises from its two.
  const [signingOut, setSigningOut] = useState(false)
  const { pathname } = useLocation()
  const nav = useNavigate()
  // Owner ruling — see `useScrollMemory`. The reader needs it most: their way
  // into a process is a long list they have scrolled through.
  const mainRef = useRef<HTMLElement>(null)
  useScrollMemory(mainRef)
  const { data: departments, isPending } = useDepartments()

  // R4 — decided by scope and never by content. `GET /api/departments` already
  // returns only what the caller can reach, so "exactly one" *is* the scope
  // test, and nothing below looks at how much is in it: a department with
  // nothing confirmed still redirects, and the process list shows its own empty
  // state. The same person therefore always lands in the same place rather than
  // moving as content gets confirmed. Reader-only — PanelShell does none of this.
  const only = departments?.length === 1 ? departments[0].code : undefined
  const root = only === undefined ? '/departments' : `/departments/${only}`
  const back = readerBack(pathname, root)
  const here = readerHere(pathname, root)
  const hereTitle =
    here.title ??
    (here.deptCode === undefined
      ? ''
      : `${here.about ? 'دربارهٔ ' : ''}${departments?.find((d) => d.code === here.deptCode)?.name ?? ''}`)
  // Anchored at both ends. `/\/flow/` matches `/processes/flow-001` — a process
  // in a department called `flow` — and strips the chrome off a screen that is
  // not the flowchart, leaving that reader no way back at all.
  const onFlow = /^\/processes\/[^/]+\/flow\/?$/.test(pathname)

  // The two routes whose CHROME depends on the answer wait for it.
  //
  // `/departments` is the redirect: rendering the one-tile list first and
  // leaving afterwards is a flicker the reader can see and click. `/departments/
  // :code` is the same argument one route over — on a deep link or a refresh the
  // departments are not in yet, so `only` is undefined, the root reads as
  // `/departments`, and the R4 reader is drawn a back bar whose «بازگشت» goes to
  // the very list R4 exists to keep them out of. It is on screen, it is
  // clickable, and it is replaced a moment later.
  //
  // Every OTHER route gets the back bar whichever root this reader has, so none
  // of them waits: blanking them would buy one extra round trip on every cold
  // deep link for a chrome that was never going to change.
  if (isPending && /^\/departments(\/[^/]+)?\/?$/.test(pathname)) {
    return <div data-shell="reader" className="h-screen bg-ink" />
  }
  // A regex and not `pathname === '/departments'`, for the same reason the two
  // functions in `crumbs.ts` normalise: this is the one line that decides the
  // rule, and `/departments/` — a trailing slash away — would walk past a `===`
  // and land the R4 reader on the list R4 exists to keep them off. `replace`, so
  // the list is not left in the history for Back to return them to.
  if (/^\/departments\/?$/.test(pathname) && only !== undefined) {
    return <Navigate to={root} replace />
  }

  return (
    <SurfaceProvider surface="reader">
      {/* §6.0 — the app sits on the deep violet field, and the root's own text
          colour is that same ink. Audit S7 read this shell as "inverted against
          the design"; §9.1 settles it the other way — the readme's cream page is
          superseded and both deliverables put every screen on the field. What
          WAS wrong is the `text-card` that used to sit beside it: an element
          that forgets to colour itself should be invisible, not accidentally
          white, which is the honest failure mode and the one a browser sees. */}
      <div data-shell="reader" className="h-screen flex flex-col overflow-hidden bg-ink text-ink">
        {/* The design's `showTopBar` is "the reader is at their root", which is
            the question `readerBack` has already answered — and answered on
            NORMALISED paths, so a trailing slash cannot put an R4 reader's own
            landing screen behind a back bar pointing at the list R4 exists to
            keep them out of.

            Branching on `back` itself, rather than on an `atRoot` beside it, is
            what keeps the back bar's own `back !== undefined` guard from
            existing: the two would say the same thing, the guard would be true
            every time it was evaluated, and an unreachable branch is a branch no
            mutation of it can be caught in. Here the type carries the invariant
            — `back` is a `string` inside this arm and TypeScript knows it. */}
        {onFlow ? null : back === undefined ? (
          /* reader 133 — `gap:12px; padding:12px 20px`, against the panel's
             `gap:14px; padding:12px 22px`. `--pad-topbar-reader` is the reader's
             CHROME gutter and is deliberately not `--pad-reader-x`, which is
             24px and is its CONTENT gutter (`padding:30px 24px 60px`, reader
             168) — a different row of the page, four pixels away. */
          <header
            data-r-topbar
            className="flex items-center gap-s6 px-topbar-reader py-s6 bg-card border-b border-warm flex-none z-chrome max760:px-s7 max760:py-s5 max760:gap-s5"
          >
            {/* reader 134 — `gap:10px; min-width:0`, and no `flex:none`: this
                lockup is the one thing on the bar allowed to shrink. */}
            <Link to={root} className="flex items-center gap-s5 min-w-0 no-underline">
              <Logo px={38} />
              {/* `leading-lockup` is ONE class and two values — 1.25 in the
                  panel (panel 120) and 1.3 here (reader 136) — because
                  `--role-lh-lockup` switches on `[data-surface]`, the way
                  `w-iconbtn` is 40 and 42. */}
              <span className="block min-w-0 leading-lockup">
                <span className="block text-fs-body-lead font-bold text-ink">اینجا فست‌فود</span>
              {/* reader 138 — `{{ roleLabel }}`, and reader 2497 binds that to
                  `me.role`. So the second line names the SIGNED-IN PERSON, not
                  the product: two accounts on the same bar read differently,
                  which a fixed tagline can never do. R22.
                  Through `roleLabel` and not raw, because the deliverable's
                  `me.role` is already a Persian word and this app's is a seed
                  IDENTIFIER (D50) — `reader_no_download`, in latin, under
                  «اینجا فست‌فود», on the app's one right-to-left surface. It is
                  the same mapping `/profile`, the users table and the user
                  record already draw, and a role this build has no wording for
                  keeps its identifier rather than being erased. */}
              <span className="block truncate text-fs-xxs text-muted">{roleLabel(session.role)}</span>
              </span>
            </Link>
            {/* reader 141 — `margin-inline-start:auto; gap:8px; flex:none`. The
                panel's own cluster is `gap:10px`. */}
            <div className="ms-auto flex items-center gap-s4 flex-none">
              {session.pendingApprovals > 0 && (
                // reader 145. Not `aria-hidden` like the panel's, which is a
                // decoration on a button whose own name carries the count; this
                // one stands alone, so it has to say what it is counting.
                <span
                  role="status"
                  aria-label={`${toFa(session.pendingApprovals)} کامنت در انتظار تأیید شما`}
                  className="min-w-count-chrome h-count-chrome px-s1 inline-flex items-center justify-center rounded-round bg-coral text-card text-fs-micro font-bold"
                >
                  {toFa(session.pendingApprovals)}
                </span>
              )}
              {/* R3 — the reader's icon buttons are 42×42 at radius 12 (reader
                  142, 148), against the panel's 34×34 at radius 10. Neither
                  shell writes a pixel for them: `w-iconbtn` reads the role. */}
              {/* reader 148 — `title="پروفایل من"`. «نمایه» was the plan's word
                  and the deliverable's is this one; R22 settles it for the
                  deliverable. It is also what `readerHere` already calls the
                  screen this opens (`crumbs.ts:148`), so the control and its
                  destination stop disagreeing about the name of the same page. */}
              <Link to="/profile" aria-label="پروفایل من" className={`${GHOST} ${HIT} w-iconbtn h-iconbtn rounded-button`}>
                <Icon name="user" px={19} />
              </Link>
              {/* Neither deliverable has a sign-out affordance anywhere — the
                  reader's bar draws a comments button here instead, and this app
                  has no comments screen. The app has a sign-out and must keep
                  it, drawn on the neighbouring button's metrics. Owner question,
                  the same one PanelShell records. */}
              <button
                type="button" onClick={() => setSigningOut(true)} aria-label="خروج"
                className={`${GHOST} ${HIT} w-iconbtn h-iconbtn rounded-button`}
              >
                <Icon name="logout" px={19} stroke={2.2} />
              </button>
            </div>
          </header>
        ) : (
          /* reader 156 — `gap:10px; padding:10px 20px`, on the card white
             behind a 1px --warm hairline. NOT the panel's crumb strip, which is
             `9px 22px` on the lavender tile behind a --line hairline.
             The deliverable writes its ≤760 override against `[data-r-topbar]`
             by name (reader 97) and writes none for this bar, so its gutter is
             the same at all three widths — exactly as the panel's strip is. */
          <nav
            data-r-backbar aria-label="مسیر"
            className="flex items-center gap-s5 px-topbar-reader py-s5 bg-card border-b border-warm flex-none"
          >
            {
              // reader 157 — `gap:7px; padding:10px 15px; border-radius:12px;
              // font-weight:700; font-size:13.5px`. The panel's own back button
              // is `gap:6px; padding:7px 12px; radius 11; 12.5px`: five values,
              // five different, one class string.
              //
              // `chevronStart`, which is the `M9 18l6-6-6-6` the deliverable
              // draws on this very button: in a right-to-left reading what you
              // came from lies to the RIGHT.
              // **Owner ruling — on a process view this answers history.** *"it
              // should go to last page user be there."* The reader reaches
              // «گام‌به‌گام» from the row in their process list, so the
              // URL-derived `readerBack` is a screen they may never have been on;
              // it stays as the fallback, for the deep link and the reload.
              // `FlowScreen` carries the same pair for the flowchart, which on
              // this surface draws its own back inside the toolbar (R21) and
              // never reaches this bar.
              //
              // One class string, two elements. NOT a `<Link>` with an
              // `onClick`: that would go on advertising to the middle button and
              // to «copy link address» exactly the URL the ruling calls wrong.
              isProcessView(pathname) && canGoBack() ? (
                <button type="button" onClick={() => nav(-1)} className={BACK_BAR_BTN}>
                  <Icon name="chevronStart" px={16} stroke={2.4} />
                  بازگشت
                </button>
              ) : (
                <Link to={back} className={BACK_BAR_BTN}>
                  <Icon name="chevronStart" px={16} stroke={2.4} />
                  بازگشت
                </Link>
              )
            }
            {/* reader 160 — the one piece of text on this bar, and the thing
                that says which document you are in. `min-w-0` is what makes
                `truncate` work at all inside a flex row. */}
            <span className="flex-1 min-w-0 truncate text-fs-menu font-bold text-ink">{hereTitle}</span>
            {/* reader 162 — `38×38; border-radius:11px; flex:none`. The panel's
                three squares are all 36 (`--size-menu-more`); this is its R3
                sibling and NOT `--size-logo-bar`, which is also 38 and is the
                logo image's role. */}
            <Link to={root} aria-label="خانه" className={`${GHOST} ${HIT} flex-none w-menu-more-reader h-menu-more-reader rounded-input`}>
              <Icon name="home" px={17} />
            </Link>
          </nav>
        )}
        {/* C1 — screens depend on this being a direct flex child of a flex-column
            ancestor with min-h-0: FlowScreen's own root is `flex-1 flex flex-col
            min-h-0`, and its canvas resolves `h-full` against this chain. Adding
            padding here re-breaks the flow canvas — screens own their padding. */}
        <main ref={mainRef} className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
        {signingOut && (
          <SignOutConfirm
            pending={logout.isPending}
            onConfirm={() => logout.mutate()}
            onClose={() => setSigningOut(false)}
          />
        )}
      </div>
    </SurfaceProvider>
  )
}
