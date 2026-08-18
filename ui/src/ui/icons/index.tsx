import type { ReactNode } from 'react'

/**
 * The line-icon set (§"Iconography").
 *
 * Every glyph is drawn on a 24×24 box with `stroke="currentColor"`, `fill="none"`
 * and round caps and joins, so an icon always inherits its role colour and the
 * caller decides the stroke — which carries meaning here: 1.9 for the nine
 * department glyphs, 2 general, 2.2 hamburger/small chevrons/FAB, 2.4
 * chevrons/back arrows/plus, 2.6 checks/calendar nav/step chevron, 3 for the
 * check inside a 12–13px tick box.
 *
 * **Provenance — NOTHING HERE IS AUTHORED, and that is a measurement.**
 *
 * An earlier draft of this note said six of these were drawn from scratch
 * "because neither deliverable, the token files nor the 33-key `InjaIcons`
 * export carries a `d` for them". Every clause of that was false, and it had
 * already cost a glyph: `home` shipped as a roofline over an open-bottomed box
 * while both deliverables draw a complete house WITH A DOOR, as one path, on the
 * same «خانه» button. `menu`, `file` and `funnel` are in the panel too; `trash`
 * and `userBust` are in `InjaIcons`, and the product draws both TODAY
 * (src/screens/ProcessList.tsx, export/steps/StepsApp.tsx). A provenance list is
 * the thing an owner reviews, so this one is asserted rather than asserted-to:
 * src/ui/icons.test.tsx renders all twenty-one keys and looks each one up in the
 * two deliverables and in `InjaIcons`, as tables that name every key.
 *
 * The same claim, made a second time, cost a second glyph. `inbox` was called
 * this codebase's own "because no deliverable draws either" — and the panel's
 * «صندوق بازبینی تعارض‌ها» button draws a TRAY, on the very control
 * src/shell/PanelShell.tsx renders `<Icon name="inbox">` in. Membership of a
 * deliverable is not enough either: the set is now pinned to the AFFORDANCES
 * the design draws these glyphs on, because swapping `menu` for `funnel`, or
 * `home` for the design's own subprocess glyph, left every table green.
 *
 * **Eighteen of the twenty-one are the design deliverable's own drawing**, and
 * the design draws in TWO DIALECTS: markup, and a `d` BOUND as a string.
 *
 * Written as markup:
 *
 *   · in both        — chevronStart, chevronEnd, chevronPrev, chevronNext,
 *                      check, search, user, comment, home
 *   · in the panel   — chevronDown, file, menu, funnel, inbox
 *   · `dots` — the row kebab's three circles are the design's to the decimal;
 *     only the `fill`/`stroke` pair moves, off its <svg> and onto each circle,
 *     because Icon's <svg> says the opposite of the design's and an attribute
 *     on the child is how a child overrides its parent.
 *
 * Bound rather than written — the panel interpolates a `d` in TEN places and the
 * reader in five, and a scan for `<path d="…">` sees none of them:
 *
 *   · `eye` and `eyeOff` — the change-password reveal (Panel :1860) binds ONE
 *     `d` through `newPwIcon` and draws the r=3 iris beside it, so the design's
 *     own construction is eye, and eye with `M3 3l18 18` appended.
 *   · `chevronUp` — six accordions and role cards bind
 *     `chevron: open ? 'M6 15l6-6 6 6' : …`, which is this glyph's three points
 *     in the other order and the same picture on screen.
 *
 * **Two are the design system's alone**, from `InjaIcons` in design/_ds/…:
 * `trash` and `userBust`, both byte for byte, and both drawn in the product
 * TODAY. `InjaIcons` carries `chevronUp` and `inbox` byte for byte as well — it
 * agrees with the deliverable about both.
 *
 * **One is this codebase's own**, which neither the design nor `InjaIcons`
 * draws: `logout`, from the two shells. Those bytes are the last record of it,
 * so icons.test.tsx pins them as exactly that rather than as a measurement
 * pretending to be one.
 *
 * `InjaIcons` disagrees with this set in five places, and all five are
 * decisions rather than drift: the four horizontal chevrons are the SAME four
 * drawings under crossed names (see below — it is where the plan's wrong table
 * came from), and its kebab lies on its side where S1's stands up.
 *
 * Twenty-one keys; the other twelve arrive with the screen that renders them.
 * Three of those twelve are already answered and icons.test.tsx says so, so that
 * the next task does not author them: `InjaIcons.trashSmall`, which three live
 * call sites draw; `InjaIcons.warning`, which both deliverables BIND byte for
 * byte on the confirm dialog; and `InjaIcons.info`, which nothing else records.
 * `document` and `list` are the opposite case — the panel binds a drawing for
 * each and it is NOT the design system's key of that name, which is a ruling to
 * ask for rather than a blank to fill.
 */
export const ICONS = {
  /* THE FOUR HORIZONTAL CHEVRONS ARE NAMED LOGICALLY, AND THIS APP IS RTL.
   *
   * A chevron pointing right is `start`/`prev` here and would be `end`/`next` in
   * an English product; the plan's own table had them the English way round, and
   * the design deliverable settles it against that table in four places:
   *
   *   · «بازگشت», the crumb bar's BACK button      (Panel :177) — points RIGHT
   *   · the department card's OPEN cta             (Panel :257) — points LEFT
   *   · «صفحهٔ قبلی», the pager's PREVIOUS button   (Panel :1603) — points RIGHT
   *   · «صفحهٔ بعدی», the pager's NEXT button       (Panel :1607) — points LEFT
   *
   * which is the same rule everywhere: in a right-to-left reading, what you came
   * from lies to the RIGHT and what you are going to lies to the LEFT. Named
   * physically the four would be honest and unusable (F10 — RTL is structural);
   * named the English way they compile, look right in review and put every arrow
   * in the product on the affordance it does not perform. src/ui/icons.test.tsx
   * pins all four to the design's own four buttons rather than to this comment.
   */
  /** `>` — towards the start of a trail: the back button. */
  chevronStart: <path d="M9 18l6-6-6-6" />,
  /** `<` — towards the end: the drill-in chevron on a card or a row. */
  chevronEnd: <path d="M15 18l-6-6 6-6" />,
  /** `>` — the previous page. */
  chevronPrev: <path d="M9 6l6 6-6 6" />,
  /** `<` — the next page. */
  chevronNext: <path d="M15 6l-6 6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  // THE DELIVERABLES DRAW THIS ONE SIX TIMES — as a BOUND `d` rather than as
  // markup, which is why a scan for `<path d="…">` reports none: every accordion
  // and role card ships `chevron: open ? 'M6 15l6-6 6 6' : …` (Panel :2853,
  // :2933, :3501; Reader :1866, :1950, :2539). `M6 15l6-6 6 6` and this `d` are
  // the SAME THREE POINTS traversed in opposite order — with round caps and
  // joins the two are the same picture — and `InjaIcons.chevronUp` is this
  // direction byte for byte, which is what src/screens/Overview.tsx's role card
  // draws and what src/ui/Accordion.tsx's open mark now comes from.
  // src/ui/icons.test.tsx reconciles the two rather than restating this.
  chevronUp: <path d="M18 15l-6-6-6 6" />,
  check: <path d="M20 6L9 17l-5-5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  // `InjaIcons.userBust`, which export/steps/StepsApp.tsx's `icoUser` draws
  // today. An earlier draft redrew it — the `comment` mistake again, and the
  // export would have changed glyph the moment StepsApp folded onto this set.
  userBust: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  // S1's row kebab (Panel :356): three filled circles stacked vertically
  // (§9.7 l). The design draws the same idea three ways — a vertical kebab, a
  // horizontal `InjaIcons.dots`, and the literal ⋯ in five places. This is the
  // one an implementation can reach, and the literal is a unicode glyph the
  // design forbids.
  //
  // The design fills its <svg> and strokes nothing; Icon's <svg> does the
  // reverse for every other glyph in the set, so the inversion rides on the
  // circles, where it beats the parent. Without it the three dots are hollow
  // rings.
  dots: <><circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  // THE CONFLICT BUTTON’S OWN GLYPH, from the affordance this key is drawn on:
  // Panel :152 is «صندوق بازبینی تعارض‌ها» — same label, same count badge,
  // `onClick="{{ openInbox }}"` — and it draws a TRAY. `InjaIcons.inbox` is that
  // same tray byte for byte. The envelope this key used to carry came from the
  // old shell, matched neither, and shipped: src/shell/PanelShell.tsx renders
  // <Icon name="inbox"> inside that very button, so the panel drew one picture
  // and the design another. `home`-without-a-door and the invented `comment`,
  // a third time; src/ui/icons.test.tsx now pins this one to the button.
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  // The «خانه» button in both deliverables (Panel :191, Reader :163) draws a
  // COMPLETE house as one path, and it has a doorway. An earlier draft here drew
  // a roofline plus an open-bottomed box, on the premise that neither
  // deliverable carries a `d` for it; both do, identically, and a user got a
  // doorless house in the app bar.
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  // src/ui/FAB.tsx's own path, which is the deliverable's.
  comment: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  funnel: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  // `InjaIcons.trash`, which src/screens/ProcessList.tsx draws today. The
  // design system also names a `trashSmall` — a shorter bin without the two
  // ribs — and src/screens/Overview.tsx and src/flow/DetailDrawer.tsx draw THAT
  // in three more places; it is one of the twelve keys still to arrive, and it
  // is not this one.
  trash: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />,
  // EYE_OFF IS EYE STRUCK THROUGH, and that is the DESIGN'S construction rather
  // than a convention: the change-password reveal (Panel :1860, Reader :2914)
  // binds one `d` — `newPwShow ? '<lens>' : '<lens>M3 3l18 18'` — into a fixed
  // <svg> that also draws the r=3 iris. Which of the two is on screen is the
  // only thing a SIGHTED user has to tell the button's two states apart;
  // `aria-pressed` and the label carry it for everyone else.
  //
  // The strike is a separate <path> rather than a third subpath of the lens: on
  // screen the two are indistinguishable — same stroke, same colour, subpaths
  // and siblings paint alike — and src/ui/fields.test.tsx reads the strike as a
  // `d` of its own in both states.
  //
  // An earlier draft drew a lucide-style gapped eye-off and a 3.6-wide lens, on
  // ledger L-39's note that `InjaIcons` ships no eye. L-39 is about the ICON
  // EXPORT; the deliverable ships both states as a bound `d`, and these are they.
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><path d="M3 3l18 18" /><circle cx="12" cy="12" r="3" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS
