import { useEffect, useId, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { can, type SessionDescriptor } from '../auth/session'
import { administrationRefusal, useCan } from '../auth/can'
import { usePending, useLogout, useDepartments } from '../api/hooks'
import { InboxModal } from '../write/InboxModal'
import { Sheet } from '../ui/Overlay'
import { pushDismissible, popDismissible, isTopDismissible } from '../ui/dismissibleStack'
import { SurfaceProvider } from '../ui/surface'
import { SignOutConfirm } from './SignOutConfirm'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { toFa } from '../lib/format'
import { panelCrumbs } from './crumbs'
import { canGoBack, isProcessView } from './back'

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

// §6.0's mobile sheet row (Panel :2082) — a full-width block, 14px all round,
// behind a 1.5px hairline, its text aligned to the start, with the label
// carried on a `flex:1` span. (Values by token name: the guard in
// src/test/guards.test.ts reads comments, and F6 says this file names no
// literal.)
//
// **Deliberately not `GHOST` plus an override, which is how it was written and
// is why it shipped wrong.** GHOST is shrink-to-fit and centres what is in it —
// correct for the bar's four icon and pill controls, and the opposite of this
// row. Appending `justify-start` to it does nothing at all: Tailwind emits
// `justify-center` AFTER `justify-start`, and the cascade takes the last
// declaration in the SHEET's order, never the order of the class attribute. So
// every entry in the sheet drew its label centred while the source said start,
// the build exited 0, and jsdom — which computes no cascade — read the class
// name and agreed with the source. Same trap, same line, for `flex` under
// `inline-flex`.
//
// **The rule that trap leaves behind, stated as the rule actually kept:** no
// string a row wears may set a property another string on that same row already
// sets to a DIFFERENT value. (The earlier wording — "nothing here may name a
// utility this file also names in GHOST" — was simply false, and being false it
// invited the wrong repair: this row and GHOST have always shared eight
// utilities, every one of them at the same value, and de-duplicating those
// would have changed nothing while leaving the real hazard in place.) It is why
// the three declarations §6.0 varies per row live in REST/HERE below rather
// than being appended to this string as an override.
//
// **Owner ruling R45 — `text-start`, and it is the same trap a second time.**
// §6.0 writes `text-align:start` on these rows (Panel :2083, :2093) and this
// string did not. It did not have to, for four of the six: an `<a>` inherits
// `text-align`'s initial `start` and reads down the leading edge. But «صندوق
// بازبینی» and «خروج» are `<button>`s, and Chrome's UA stylesheet writes
// `text-align:center` on a button — which then inherits into the `flex:1` label
// span and centres the word inside a row that is otherwise perfectly correct.
// `justify-start` cannot reach it: the span is the flex item and it is already
// against the leading edge; what is centred is the TEXT inside the span.
//
// So the two element types drew differently while wearing one identical class
// string, which is exactly why the class assertions could not see it — jsdom
// has no UA stylesheet and paints nothing, so `toHaveClass` and even a compiled
// `winner()` read the same answer for both. It is fixed HERE, on the one string
// every row wears, rather than on the two buttons: the next row somebody adds
// is a `<button>` half the time.
const SHEET_ITEM = 'flex items-center justify-start text-start gap-s6 px-s7 py-s7 rounded-tile border-hairline cursor-pointer no-underline text-fs-menu font-bold'

// §6.0's `{{ m.bg }}` / `{{ m.fg }}` / `{{ m.border }}` (Panel :2083), which is
// the sheet's current-entry highlight — the same violet fill and card label the
// top bar's nav pill takes, against the resting card white.
//
// It is drawn HERE and not in the «مدیریت» popover, and that is the whole point
// of it: the popover lives in the top bar, the bar is drawn on `/departments`
// alone, and nothing in the popover leads there — so a `pathname === to` branch
// up there is unreachable by construction, was written, was dead, and was
// deleted. The sheet is reachable from all eight panel routes and four of them
// are a destination it draws, so this is where "you are here" can be said at
// all. §6.0's own sheet hard-codes the administration group white and lets its
// popover carry that group's current state; this shell has no reachable popover
// to carry it, so the one predicate governs every row that has a destination.
//
// A row with no destination — the inbox, sign-out — is never current, which is
// §6.0's own `m.id !== 'inbox'` exclusion arrived at from the other end.
//
// REST keeps the hover; HERE must not have one. `text-card` over `--tile-v2` is
// the 1.04:1 pairing audit S1 measured, and a hover that lit this row lavender
// under a white label would reintroduce it on the app's only phone menu.
const SHEET_REST = 'bg-card text-violet border-line hover:bg-tile-v2'
const SHEET_HERE = 'bg-violet text-card border-violet'

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
  // Owner ruling: sign-out asks first. The state is here rather than in
  // `SignOutConfirm` because the mutation is here and because two call sites —
  // the bar and the ≤1080 sheet — raise the same one question.
  const [signingOut, setSigningOut] = useState(false)
  const { pathname } = useLocation()
  const nav = useNavigate()
  const canEdit = can(session, 'edit')
  // Scope-aware, unlike `can` above, which reads the capability list and
  // nothing else. Used by the one nav entry whose screen checks a scope.
  const mayReach = useCan(session)
  // C2 — the conflict inbox is an edit-only surface; a panel user without `edit`
  // never needs the query fired at all.
  const { data: pending = [] } = usePending({ enabled: canEdit })
  const { data: departments = [] } = useDepartments()
  const logout = useLogout()
  const openCount = pending.length

  const crumbs = panelCrumbs(pathname, (code) => departments.find((d) => d.code === code)?.name ?? code)
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined
  const home = pathname === '/departments'
  /** Where «بازگشت» answers history instead of the trail — owner ruling; the
   *  predicate and its reasoning live in `./back`. */
  const onFlow = isProcessView(pathname)
  // §6.0 labels the sheet's administration group. `useId` because the label is
  // what names the group to a screen reader, and two panel shells on one page
  // (the test file mounts several) must not both claim the same id.
  const adminGroup = useId()

  /** A sheet row's own three declarations: §6.0's current entry, or its resting one. */
  const sheetRow = (to: string) => `${SHEET_ITEM} ${pathname === to ? SHEET_HERE : SHEET_REST}`

  // R5 — an entry whose target this caller cannot reach is absent, not
  // disabled, not explained. Each of the three gates below is the SAME
  // predicate the screen behind it gates itself on, so the header and the
  // screen it leads to cannot come to disagree.
  //
  // «کاربران» — `administrationRefusal` is the twin of `access.requires`,
  //   INCLUDING ITS ORDER (D56): scope is checked before capability, so a
  //   holder of `manage_users` scoped to one department is answered **404** on
  //   every endpoint behind this entry — «چیزی اینجا نیست», a wall the app
  //   itself pointed them at. That asymmetry is not a tidy-up waiting to
  //   happen: 404 is for a caller who may not learn the surface exists,
  //   because user administration is not scoped to a department at all (D11),
  //   and 403 is for one who holds `*` and merely may not act.
  //
  // «سیاست نمایش محتوا» — the same shape, one code milder, and the entry that
  //   used to be spelled `can(session, 'set_visibility')`. `can` reads the
  //   capability list and IGNORES SCOPE; Visibility.tsx asks
  //   `can('set_visibility', '*')` — the `*` because one policy governs every
  //   department — and refuses 403 otherwise. So a scoped holder was drawn an
  //   entry and then refused when they clicked it, which is precisely the
  //   greyed-out-with-an-explanation that R5 forbids, only worse for arriving
  //   a click too late. `mayReach` is the same `useCan` that screen uses.
  //   Cosmetic either way (D48) — both endpoints re-derive capability AND
  //   scope and refuse regardless; this decides what to DRAW.
  //
  // «پروفایل و گذرواژه» — ungated, and that is the whole difference. It leads
  //   to the caller's own password, which everybody has. A gate here would be
  //   a gate on the only screen in the app whose endpoint cannot be pointed at
  //   anybody else's row.
  //
  // §6.0's «گزارش فعالیت کاربران» is absent under the same rule: no such screen.
  const adminItems = [
    ...(administrationRefusal(session) === undefined
      ? [{ to: '/users', label: 'کاربران', hint: 'نقش، دپارتمان، سرپرست و غیرفعال‌سازی' }] : []),
    ...(mayReach('set_visibility', '*')
      ? [{ to: '/visibility', label: 'سیاست نمایش محتوا', hint: 'یک تصمیم برای همهٔ غیرادیتورها' }] : []),
    { to: '/profile', label: 'پروفایل و گذرواژه', hint: 'نشست‌های باز و تغییر گذرواژه' },
  ]

  /*
   * The «مدیریت» popover answers Escape, and joins the SHARED dismissible stack
   * to do it (I7) — the same module `src/ui/Menu.tsx` and `src/ui/Overlay.tsx`
   * push onto, so only the topmost dismissible of any kind answers one press.
   * Without that, an Escape meant for a Dialog opened over this menu would
   * close both, which is the exact bug I7 was raised for.
   *
   * ## Why this is not just `<Menu/>`
   *
   * `src/ui/Menu.tsx` already implements this contract, and reusing it was the
   * first thing tried. It cannot be used here, and not because it is frozen:
   *
   *   · its items are `MenuItem = { label, onSelect }` rendered as `<button>`.
   *     These entries NAVIGATE — they are `<Link>`s with an `href` a reader can
   *     copy, middle-click and see in the status bar, and three tests assert
   *     that href. A button that calls `navigate()` is not the same control.
   *   · every entry here carries a second line, §6.0's `hint`. `MenuItem` has
   *     one string.
   *   · its paint is the old chrome's, not §6.0's: a 44px minimum row rather
   *     than the deliverable's 11px/12px option box, the popover pinned to the
   *     opposite inline edge, a different corner, a different pad, a different
   *     hairline and a hard-coded stacking rung instead of the role token.
   *
   * So the CONTRACT is reimplemented and the COMPONENT is not: the identity,
   * the push/pop and the topmost check below are `Menu.tsx`'s, line for line.
   * When `src/ui/` unfreezes, the lift is to give `Menu` link items and a hint
   * line and delete this — not to restyle it from the outside.
   */
  const adminTrigger = useRef<HTMLButtonElement>(null)
  const adminId = useRef(Symbol('panel-admin')).current

  useEffect(() => {
    if (!adminOpen) return
    pushDismissible(adminId)
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || !isTopDismissible(adminId)) return
      setAdminOpen(false)
      // …and the keyboard goes back where it was standing. `Menu.tsx` does not
      // do this half, and its omission is a real one: a caller who has tabbed
      // INTO the popover is holding a node that Escape unmounts, so focus lands
      // on <body> and the next Tab restarts from the top of the document.
      adminTrigger.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      popDismissible(adminId)
      document.removeEventListener('keydown', onKey)
    }
  }, [adminOpen, adminId])

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
        ref={adminTrigger}
        type="button" aria-haspopup="menu" aria-expanded={adminOpen}
        onClick={() => setAdminOpen((v) => !v)}
        className={`${TRAY_ITEM} inline-flex items-center gap-s3 bg-transparent text-violet`}
      >
        مدیریت
        {/* Down, and it stays down while the popover is open: §6.0 draws
            `M6 9l6 6 6-6` on this button and writes no open-state variant of
            it, though it has an `adminOpen` to key one off. A caret that flips
            would be a second, redundant statement of `aria-expanded`, which is
            already on the button and is the one a screen reader hears. */}
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
                // Always the resting fill, for the same reason the nav pill
                // above is always the active one: §6.0's `{{ a.bg }}` has
                // exactly one value here. This popover lives inside the top
                // bar, the top bar is drawn on `/departments` and nowhere else,
                // and no entry in it leads to `/departments` — so a
                // `pathname === i.to` branch is unreachable by construction.
                // It was written, and it was dead: no test could enter it, and
                // a reviewer's mutation that INVERTED it survived every suite
                // because inverting unreachable code changes nothing.
                className="block px-s6 py-option-y rounded-input no-underline text-start hover:bg-tile-v2 bg-transparent"
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
              // §8 — the badge hangs off the corner the RTL bar puts last, which
              // is the button's INLINE END. This was written as a physical inset
              // and declared one of guards.test.ts's two `PHYSICAL_PINS`; Task
              // 25 overturned that. Under RTL `inset-inline-end` resolves to the
              // same edge, so `-end-s3` renders byte-identically today, and the
              // argument the pin was declared on — "mirroring it would move it
              // onto the label" — is true of the inline START and false of the
              // inline END: mirroring is exactly what keeps it off the label if
              // this ever renders LTR. `src/ui/FAB.tsx`'s own badge already
              // writes the logical form. The FAB's own pin is different in kind
              // and survives — the design puts the FAB on the RTL document's
              // inline START corner, so the logical form would move it across
              // the screen — which is why one line stayed and this one went.
              //
              // Round and 19px: audit S5 found this inheriting the 44px touch
              // floor as a `<span aria-hidden>` that is not interactive, so it
              // rendered as a coral square beside the button.
              //
              // `border-card` here is the WHITE `--card`, not the hairline: the
              // ring cuts the badge out of whatever it overlaps. The hairline is
              // `border-border-card` (`--border-card`), which at 7% alpha would
              // be invisible here — and would still build.
              <span
                aria-hidden
                className="absolute -top-s3 -end-s3 min-w-count-chrome h-count-chrome px-s1 flex items-center justify-center rounded-round bg-coral text-card text-fs-micro font-bold border-2 border-card"
              >
                {toFa(openCount)}
              </span>
            )}
          </button>
        )}
        {/* Neither deliverable has a sign-out affordance anywhere — the two gaps
            in the deliverable's right cluster are where it is not. The app has
            one and must keep it, drawn on §5.2's icon-button metrics. It is the
            one control in this bar the design has no line for. Owner question.

            **`max1080:hidden` — owner ruling.** *"in mobile version, we have
            signout in hambergure manu and in topof menu. we should have just in
            hambergure menmu. remove its icon in top menu."* `data-r-menu`
            below is `hidden max1080:flex`, and the sheet it opens carries
            «خروج» — so under 1080 this button and that row are two doors to one
            act, ten pixels apart, and one of them is a 34px icon with no label.
            Exactly the complement of that variant, so the two can never both be
            drawn and can never both be gone: above 1080 the sheet has no opener
            in this bar at all and this is the only way out. */}
        <button
          type="button" onClick={() => setSigningOut(true)} aria-label="خروج"
          className={`${GHOST} ${HIT} w-tool h-tool rounded-control flex-none max1080:hidden`}
        >
          <Icon name="logout" px={17} stroke={2.2} />
        </button>
        {/* F11's floor reaches this one too. §6.0 draws it 40px — under the 44px
            minimum like every other box on the design's ladder — so it takes
            the same `::before` overlay the two 34/36px controls do, and for the
            same reason: the painted box stays the deliverable's and the target
            grows around it. 40 + 10 = 50, and the cluster's own 10px gap means
            two neighbouring overlays meet without overlapping. */}
        <button
          data-r-menu type="button" onClick={() => setMenuOpen(true)} aria-label="فهرست"
          className={`${HIT} hidden max1080:flex items-center justify-center w-iconbtn h-iconbtn rounded-input bg-tile-v2 text-violet border-hairline border-line cursor-pointer flex-none`}
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
      {back?.to !== undefined && (onFlow && canGoBack() ? (
        /* Same box, same glyph, same word — a `<button>` only because there is
           no href that means "the entry before this one". A `<Link>` whose
           `onClick` called `nav(-1)` would still advertise a URL to the middle
           button and to «copy link address», and the URL it advertised would be
           the one the ruling says is wrong. */
        <button
          type="button" onClick={() => nav(-1)}
          className={`${GHOST} gap-s3 px-s6 py-back-y rounded-input text-fs-sm2 font-bold flex-none cursor-pointer`}
        >
          <Icon name="chevronStart" px={15} stroke={2.4} />
          بازگشت
        </button>
      ) : (
        <Link to={back.to} className={`${GHOST} gap-s3 px-s6 py-back-y rounded-input text-fs-sm2 font-bold flex-none`}>
          {/* **R44** — "in flowchart screen, the back button should be on top
              menu too. like other page." One route used to be excepted here,
              and this guard is where: `!onFlow &&`, an anchored test for
              `/processes/{pid}/flow`.

              It was R41's answer to the OTHER half of the same owner's
              complaint — "some pages like flowchart have two of them" — and it
              got the count right by taking the wrong one away. Both deliverables
              agree on one «بازگشت» per screen and disagree on where the
              flowchart's goes: `Inja Panel.dc.html:558-613` is the panel's flow
              toolbar and has no back button in it at all, its first child being
              `data-r-flownav`, while `Inja Reader.dc.html:312-316` opens the
              reader's with one (`data-r-flowback`) because
              `showBackBar: screen !== 'flow'` leaves that surface no bar to put
              it in (R21). One shared `FlowScreen`, so it now branches on
              `useSurface()` and draws that button for the reader only — and
              this strip draws the panel's, on the flow route exactly as on the
              seven others. `crumbs[length-2]` on that route is the process
              summary, which is what `readerBack` was already handing
              `FlowScreen`, so nothing about the destination moved.

              RTL-correct as of Task 11: in a right-to-left reading what you came
              from lies to the RIGHT, so the back control points right. The
              deliverable draws `M9 18l6-6-6-6` on this very button (Panel :177),
              which is `chevronStart`. */}
          <Icon name="chevronStart" px={15} stroke={2.4} />
          بازگشت
        </Link>
      ))}
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
      {/* §6.0 draws this cluster as its own box — `margin-inline-start:auto;
          display:flex; align-items:center; gap:8px; flex:none` (Panel :188) —
          and puts one button in it. The wrapper is the deliverable's; the
          second button in it is not, and is the fix for the defect below. */}
      <div className="ms-auto flex items-center gap-s4 flex-none">
        <Link to="/departments" aria-label="خانه" className={`${GHOST} ${HIT} w-menu-more h-menu-more rounded-input flex-none`}>
          <Icon name="home" px={16} />
        </Link>
        {/* **REACHABILITY, and the one place this shell overrules §6.0.**
            `showTopBar: screen === 'depts'` is the design's own call and it is
            kept — but the design draws sign-out nowhere at all, so it never had
            to answer where sign-out lives on the screens the bar is absent
            from. The rewrite that adopted the gating answered "nowhere": an
            editor standing on the flow screen could not sign out, could not
            open the conflict inbox, and could not reach any administration
            screen without going home first — and under 1080 the sheet holding
            all three had no opener there either, so it was unreachable rather
            than merely inconvenient. The shipping shell before this one
            (a033328^) drew its header, sign-out and all, on every route; losing
            that was a regression against the app, not a concession to the
            design.
            One control restores all of it, because the sheet already carries
            every destination, the inbox and sign-out. It is drawn at EVERY
            width here, unlike the bar's, which is the ≤1080 stand-in for a nav
            tray this strip does not have at any width. It takes the strip's own
            36px white box rather than the bar's 40px lavender one: on this
            lavender ground a lavender button is a border and nothing else, and
            §6.0's own «خانه» beside it is white for that reason. */}
        <button
          data-r-menu type="button" onClick={() => setMenuOpen(true)} aria-label="فهرست"
          className={`${GHOST} ${HIT} w-menu-more h-menu-more rounded-input flex-none`}
        >
          <Icon name="menu" px={17} stroke={2.2} />
        </button>
      </div>
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
        {signingOut && (
          <SignOutConfirm
            pending={logout.isPending}
            onConfirm={() => logout.mutate()}
            onClose={() => setSigningOut(false)}
          />
        )}
        {/* §6.0's mobile menu (Panel :2071-2100), and — because this shell draws
            the strip's opener at every width — the app's only route to sign-out,
            to the conflict inbox and to every administration screen on six of
            its eight routes. Every row is a `flex:1` label span and an optional
            end-aligned pill, which is the deliverable's own row: the span is what
            keeps every label on one leading edge whatever sits after it. */}
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="فهرست">
          <div className="flex flex-col gap-s5">
            <div>
              <p className="m-0 text-fs-body font-bold text-ink">{session.displayName}</p>
              <p className="m-0 mt-half text-fs-xs text-muted">{session.role}</p>
            </div>
            <Link to="/departments" onClick={() => setMenuOpen(false)} className={sheetRow('/departments')}>
              <span className="flex-1">دپارتمان‌ها</span>
            </Link>
            {canEdit && (
              <button type="button" onClick={() => { setMenuOpen(false); setInboxOpen(true) }} className={`${SHEET_ITEM} ${SHEET_REST}`}>
                <span className="flex-1">صندوق بازبینی</span>
                {openCount > 0 && (
                  // §6.0 — `min-width:22px; height:22px; border-radius:999px`
                  // on the coral, pushed to the row's end by the span above.
                  // Written on the chrome's own count-badge token, which is
                  // 19px: the deliverable draws 19 in the bar and 22 here, and
                  // a third badge size needs a token in `src/styles/`, which
                  // this task may not add. Reported rather than invented — the
                  // shape, the colour and the placement are the design's; one
                  // number is the shell's nearest named rung.
                  <span className="min-w-count-chrome h-count-chrome px-s3 flex items-center justify-center rounded-round bg-coral text-card text-fs-xxs font-bold flex-none">
                    {toFa(openCount)}
                  </span>
                )}
              </button>
            )}
            {/* §6.0 sets the administration entries apart under their own
                heading, behind a `--warm` rule (Panel :2090-2091). Flat, they
                read as four peers of «دپارتمان‌ها», which is the one entry that
                is not administration. `role="group"` + `aria-labelledby` is what
                carries the heading to a reader who cannot see the rule. */}
            <div role="group" aria-labelledby={adminGroup} className="mt-s8 pt-s7 border-t border-warm flex flex-col gap-s5">
              <p id={adminGroup} className="m-0 text-fs-xs font-bold text-muted">مدیریت</p>
              {adminItems.map((i) => (
                <Link key={i.to} to={i.to} onClick={() => setMenuOpen(false)} className={sheetRow(i.to)}>
                  <span className="flex-1">{i.label}</span>
                </Link>
              ))}
            </div>
            {/* Closes the sheet before it asks: a `position:fixed` dialog
                raised from inside an open sheet would be the second dismissible
                on the stack, so Escape would answer the dialog and leave the
                sheet standing over the screen it returned to. */}
            <button type="button" onClick={() => { setMenuOpen(false); setSigningOut(true) }}
              className={`${SHEET_ITEM} ${SHEET_REST}`}>
              <span className="flex-1">خروج</span>
            </button>
          </div>
        </Sheet>
      </div>
    </SurfaceProvider>
  )
}
