import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { can, type SessionDescriptor } from '../auth/session'
import { administrationRefusal } from '../auth/can'
import { usePending, useLogout, useDepartments } from '../api/hooks'
import { InboxModal } from '../write/InboxModal'
import { Sheet } from '../ui/Overlay'
import { SurfaceProvider } from '../ui/surface'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { toFa } from '../lib/format'
import { panelCrumbs } from './crumbs'

// §6.0 — the nav tray's shell. These entries *navigate*, so they are links in a
// `<nav>` rather than a NavTabTray: the tray is a `tablist` and these are not
// tabs, and borrowing the role because the paint matches would announce a set of
// views where there is a set of destinations.
const TRAY = 'inline-flex items-center gap-s1 p-s1 rounded-button bg-tile-v2'
const TRAY_ITEM = 'px-s7 py-s4 rounded-tool border-0 no-underline cursor-pointer text-fs-sm2 font-bold'

// §5.2 — icon buttons are the white card, the brand violet and a 1.5px --line
// hairline. Audit S1's fix lives in this one string: the bar behind these
// controls is white, so their label is `--violet` and `--tile-v2` is the correct
// hover UNDER it. The pairing that measured 1.04:1 was `text-card` over the same
// hover, which is a near-white block with a white label inside it.
const GHOST = 'inline-flex items-center justify-center bg-card text-violet border-hairline border-line cursor-pointer no-underline hover:bg-tile-v2'

// F11's 44px floor against the design's 34-36px boxes: the painted box stays the
// design's, and an invisible `::before` grows the target. Nothing about it shows.
//
// The 5px is DERIVED, not drawn — `(44 - 34) / 2` against the smallest box this
// shell paints, `w-tool` — which is why it is the one bracketed value in this
// file: it is arithmetic against a floor, it differs per control (the 32px close
// button in Overlay.tsx takes 6, the tab tray takes 4), and there is no role a
// token could name it by. It clears the floor on both boxes here: 34 + 10 = 44
// and 36 + 10 = 46. `before:content-[""]` is the declaration that makes the
// pseudo-element exist at all; `before:content-none` is not a substitute and
// src/ui/table.test.tsx has a test that says so.
const HIT = 'relative before:absolute before:content-[""] before:-inset-[5px]'

/** Compact density, breadcrumb trail, administration surfaces. */
export function PanelShell({ session }: { session: SessionDescriptor }) {
  const [inboxOpen, setInboxOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const canEdit = can(session, 'edit')
  // C2 — the conflict inbox is an edit-only surface; a panel user without `edit`
  // never needs the query fired at all.
  const { data: pending = [] } = usePending({ enabled: canEdit })
  const { data: departments = [] } = useDepartments()
  const logout = useLogout()
  const openCount = pending.length

  const crumbs = panelCrumbs(pathname, (code) => departments.find((d) => d.code === code)?.name ?? code)
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined
  const home = pathname === '/departments'

  // R5 — an entry whose target this caller cannot reach is absent, not disabled.
  // `administrationRefusal` is the twin `access.requires` uses, including its
  // order, so the header and the screen it leads to cannot come to disagree; a
  // holder of `manage_users` scoped to one department is answered 404 on every
  // endpoint behind «کاربران», which is a wall the app itself pointed them at.
  // §6.0's «گزارش فعالیت کاربران» is absent for the same rule: no such screen.
  const adminItems = [
    ...(administrationRefusal(session) === undefined
      ? [{ to: '/users', label: 'کاربران', hint: 'نقش، دپارتمان، سرپرست و غیرفعال‌سازی' }] : []),
    ...(can(session, 'set_visibility')
      ? [{ to: '/visibility', label: 'سیاست نمایش محتوا', hint: 'یک تصمیم برای همهٔ غیرادیتورها' }] : []),
    { to: '/profile', label: 'پروفایل و گذرواژه', hint: 'نشست‌های باز و تغییر گذرواژه' },
  ]

  /*
   * The three chrome pieces below are FUNCTIONS THAT RETURN ELEMENTS, called as
   * `adminMenu()`, and deliberately not components written `<AdminMenu/>`.
   *
   * A component declared inside a render is a new function identity on every
   * render, so React sees a different element TYPE and unmounts the whole
   * subtree rather than reconciling it. Nothing about that is visible in a
   * snapshot or a build — but the «مدیریت» button loses DOM focus the instant
   * its own menu opens, because the button the keyboard is standing on is
   * destroyed by the state change it just caused. Called as a plain function
   * the returned tree is spliced in directly, there is no component boundary,
   * and the button survives its own click. `keeps the keyboard on the
   * «مدیریت» button when its own menu opens` in shells.test.tsx is that test.
   */
  const adminMenu = () => (
    <div className="relative">
      <button
        type="button" aria-haspopup="menu" aria-expanded={adminOpen}
        onClick={() => setAdminOpen((v) => !v)}
        className={`${TRAY_ITEM} inline-flex items-center gap-s3 bg-transparent text-violet`}
      >
        مدیریت
        <Icon name="chevronDown" px={13} stroke={2.4} />
      </button>
      {adminOpen && (
        <>
          <div aria-hidden onClick={() => setAdminOpen(false)} className="fixed inset-0 z-dropdown" />
          {/* `top:calc(100% - 6px)` in the deliverable, which is `top-full` and a
              negative 6px margin. The design also pins it `right:190px` against
              the BAR; anchored to its own trigger instead, which is the same
              popover in the deliverable's own layout and survives a nav tray
              whose entries are not the deliverable's three. */}
          <div
            role="menu"
            className="absolute top-full -mt-s3 start-0 z-dropdown min-w-menu flex flex-col gap-half p-s4 bg-card border border-border-card rounded-card shadow-pop"
          >
            {adminItems.map((i) => (
              <Link
                key={i.to} role="menuitem" to={i.to} onClick={() => setAdminOpen(false)}
                className={`block px-s6 py-option-y rounded-input no-underline text-start hover:bg-tile-v2 ${pathname === i.to ? 'bg-tile-v2' : 'bg-transparent'}`}
              >
                <span className="block text-fs-menu font-bold text-ink">{i.label}</span>
                <span className="block mt-hint text-fs-xs text-faint">{i.hint}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const topBar = () => (
    <header
      data-r-topbar
      className="flex items-center gap-s7 px-topbar py-s6 bg-card border-b border-warm flex-none z-chrome max760:px-s7 max760:py-s5 max760:gap-s5"
    >
      <Link to="/departments" className="flex items-center gap-s5 no-underline flex-none">
        {/* Audit S2 — `assets/inja-logo.jpg` had been in the repo since July and
            no file in src/ imported it, so the product had no brand mark. */}
        <Logo px={38} />
        <span className="block leading-lockup">
          <span className="block text-fs-body font-bold text-ink">اینجا فست‌فود</span>
          <span className="block text-fs-micro text-muted">سامانهٔ فرآیندها</span>
        </span>
      </Link>
      <span aria-hidden className="w-px h-s11 mx-s1 bg-border-current max1080:hidden" />
      <nav data-r-nav aria-label="بخش‌های اصلی" className={`${TRAY} max1080:hidden`}>
        {/* Always the active pill: this bar is drawn on the home screen and
            nowhere else (§6.0's `showTopBar: screen === 'depts'`), so the
            deliverable's `{{ t.bg }}` has exactly one value here. */}
        <Link to="/departments" className={`${TRAY_ITEM} bg-violet text-card`}>دپارتمان‌ها</Link>
        {adminMenu()}
      </nav>
      <div className="ms-auto flex items-center gap-s5">
        {canEdit && (
          <button
            type="button" onClick={() => setInboxOpen(true)}
            aria-label={openCount > 0 ? `صندوق بازبینی تعارض‌ها، ${toFa(openCount)} مورد در انتظار` : 'صندوق بازبینی تعارض‌ها'}
            className={`${GHOST} relative gap-s4 px-inbox-x py-s4 rounded-button text-fs-sm2 font-bold max1080:hidden`}
          >
            <Icon name="inbox" px={16} />
            صندوق بازبینی
            {openCount > 0 && (
              // §8 — the badge's `top` and `left` are one of the physical pins
              // the deliverable keeps: it hangs off the corner the RTL bar puts
              // last, and mirroring it would move it onto the label. Round and
              // 19px: audit S5 found this inheriting the 44px touch floor as a
              // `<span aria-hidden>` that is not interactive, so it rendered as
              // a coral square beside the button.
              //
              // `border-card` here is the WHITE `--card`, not the hairline: the
              // ring cuts the badge out of whatever it overlaps. The hairline is
              // `border-border-card` (`--border-card`), which at 7% alpha would
              // be invisible here — and would still build.
              <span
                aria-hidden
                className="absolute -top-s3 -left-s3 min-w-count-chrome h-count-chrome px-s1 flex items-center justify-center rounded-round bg-coral text-card text-fs-micro font-bold border-2 border-card"
              >
                {toFa(openCount)}
              </span>
            )}
          </button>
        )}
        {/* Neither deliverable has a sign-out affordance anywhere — the two gaps
            in the deliverable's right cluster are where it is not. The app has
            one and must keep it, drawn on §5.2's icon-button metrics. It is the
            one control in this bar the design has no line for. Owner question. */}
        <button
          type="button" onClick={() => logout.mutate()} aria-label="خروج"
          className={`${GHOST} ${HIT} w-tool h-tool rounded-control flex-none`}
        >
          <Icon name="logout" px={17} stroke={2.2} />
        </button>
        <button
          data-r-menu type="button" onClick={() => setMenuOpen(true)} aria-label="فهرست"
          className="hidden max1080:flex items-center justify-center w-iconbtn h-iconbtn rounded-input bg-tile-v2 text-violet border-hairline border-line cursor-pointer flex-none"
        >
          <Icon name="menu" px={19} stroke={2.2} />
        </button>
      </div>
    </header>
  )

  const crumbStrip = () => (
    <nav
      data-r-crumbbar aria-label="مسیر"
      className="flex items-center gap-s5 px-topbar py-crumb-y bg-tile-v2 border-b border-line flex-none"
    >
      {back?.to !== undefined && (
        <Link to={back.to} className={`${GHOST} gap-s3 px-s6 py-back-y rounded-input text-fs-sm2 font-bold flex-none`}>
          {/* RTL-correct as of Task 11: in a right-to-left reading what you came
              from lies to the RIGHT, so the back control points right. The
              deliverable draws `M9 18l6-6-6-6` on this very button (Panel :177),
              which is `chevronStart`. */}
          <Icon name="chevronStart" px={15} stroke={2.4} />
          بازگشت
        </Link>
      )}
      <ol data-r-crumbs className="flex flex-wrap items-center gap-s3 min-w-0 list-none m-0 p-0 text-fs-sm2 max760:hidden">
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-s3">
            {i > 0 && <span aria-hidden className="text-faint">/</span>}
            {c.to !== undefined && i < crumbs.length - 1 ? (
              <Link to={c.to} dir={c.mono ? 'ltr' : undefined} className={`no-underline text-muted ${c.mono ? 'font-mono' : ''}`}>
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" dir={c.mono ? 'ltr' : undefined} className={`font-semibold text-ink ${c.mono ? 'font-mono' : ''}`}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <Link to="/departments" aria-label="خانه" className={`${GHOST} ${HIT} ms-auto w-menu-more h-menu-more rounded-input flex-none`}>
        <Icon name="home" px={16} />
      </Link>
    </nav>
  )

  return (
    // R3 — the scale layer. Every surface-aware primitive below reads this, and
    // nothing passes a density prop down (F4/F8).
    <SurfaceProvider surface="panel">
      {/* §6.0 — the whole application sits on the deep violet field, and the
          root's own text colour is that same ink: screens do not paint their own
          ground, they are cards floating on the field, and everything legible on
          the field sets its colour explicitly. */}
      <div data-shell="panel" className="h-screen flex flex-col overflow-hidden bg-ink text-ink">
        {home ? topBar() : crumbStrip()}
        {/* C1 — screens depend on this being a direct flex child of a flex-column
            ancestor with min-h-0: FlowScreen's own root is `flex-1 flex flex-col
            min-h-0`, and its canvas resolves `h-full` against this chain. Adding
            padding here re-breaks the flow canvas — screens own their padding. */}
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
        {inboxOpen && <InboxModal onClose={() => setInboxOpen(false)} />}
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="فهرست">
          <div className="flex flex-col gap-s5">
            <div>
              <p className="m-0 text-fs-body font-bold text-ink">{session.displayName}</p>
              <p className="m-0 mt-half text-fs-xs text-muted">{session.role}</p>
            </div>
            <Link to="/departments" onClick={() => setMenuOpen(false)} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
              دپارتمان‌ها
            </Link>
            {adminItems.map((i) => (
              <Link key={i.to} to={i.to} onClick={() => setMenuOpen(false)} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
                {i.label}
              </Link>
            ))}
            {canEdit && (
              <button type="button" onClick={() => { setMenuOpen(false); setInboxOpen(true) }} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
                صندوق بازبینی {openCount > 0 && toFa(openCount)}
              </button>
            )}
            <button type="button" onClick={() => logout.mutate()} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
              خروج
            </button>
          </div>
        </Sheet>
      </div>
    </SurfaceProvider>
  )
}
