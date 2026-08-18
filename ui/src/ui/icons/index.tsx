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
 * **Provenance.** The six chevrons, `check`, `search`, `user` and `dots` are the
 * paths the design fixes literally (§5.1.2) and are quoted byte for byte.
 * `file`, `inbox`, `logout` and `comment` are paths ALREADY IN THIS CODEBASE
 * and are quoted from it rather than redrawn: `inbox`/`logout` from the two
 * shells (src/shell/PanelShell.tsx, src/shell/ReaderShell.tsx), `file` from the
 * export menu, and `comment` from src/ui/FAB.tsx — which carries the
 * deliverable's own speech bubble, pinned in src/ui/composites.test.tsx. An
 * earlier draft of this file invented a speech bubble on the premise that the
 * design ships none; it ships one, and this is it.
 *
 * The rest are authored to the construction above, because neither deliverable,
 * the token files nor the 33-key `InjaIcons` export carries a `d` for them —
 * see the plan's owner questions. Twenty-one keys; the other twelve arrive with
 * the screen that renders them.
 */
export const ICONS = {
  chevronStart: <path d="M15 18l-6-6 6-6" />,
  chevronEnd: <path d="M9 18l6-6-6-6" />,
  chevronNext: <path d="M9 6l6 6-6 6" />,
  chevronPrev: <path d="M15 6l-6 6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M18 15l-6-6-6 6" />,
  check: <path d="M20 6L9 17l-5-5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  userBust: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  // S1's row kebab: three filled circles stacked vertically (§9.7 l). The design
  // draws the same idea three ways — a vertical kebab, a horizontal
  // `InjaIcons.dots`, and the literal ⋯ in five places. This is the one an
  // implementation can reach, and the literal is a unicode glyph the design
  // forbids.
  dots: <><circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  inbox: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 8l9 6 9-6" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  // src/ui/FAB.tsx's own path, which is the deliverable's.
  comment: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  funnel: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />,
  // EYE_OFF is EYE struck through, and which of the two is on screen is the only
  // thing a SIGHTED user has to tell the reveal button's two states apart —
  // `aria-pressed` and the label carry it for everyone else. Both paths are
  // quoted from src/ui/PasswordField.tsx, where they were drawn (ledger L-39
  // records that InjaIcons ships no eye at all), and src/ui/fields.test.tsx
  // asserts the struck path in both states.
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 7.7A17.6 17.6 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="M3 3l18 18" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS
