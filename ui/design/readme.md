# Inja Food — Design System

A visual + component system extracted from the **Inja Food (اینجا فست‌فود) Restaurant Process Documentation System** — an internal, right-to-left (Persian) web app for documenting, visualizing (IDEF0 / IDEF3 flowcharts), editing, and reviewing restaurant operational processes across departments (پخت، سالن، صندوق، …).

The look is **warm, friendly and guided**: cream paper background, a deep violet brand color drawn from the Inja logo, a coral accent, generous rounding, and soft violet-tinted shadows. It is Persian-first and fully RTL.

## Sources
- `Inja Process System.dc.html` — the full desktop prototype (login → departments → process list → summary → flowchart → edit → conflict inbox → overview). Ground truth for every token and component here.
- `Inja Mobile.dc.html` — the same app inside an iPhone frame.
- `Inja Responsive.dc.html` — single responsive build (desktop + mobile via media queries).
- `assets/inja-logo.jpg` — the restaurant logo (violet ground, coral "FAST" wordmark).
- PRD/ARD in `uploads/` (product + architecture requirements).

---

## CONTENT FUNDAMENTALS

- **Language & direction:** Persian throughout, RTL layout. Latin appears only for identifiers (`cooking-001`, `dining-003-n010`) and the eyebrow label `INJA FOOD`.
- **Tone:** professional but approachable — short, plain instructions, never jargon-heavy. It guides rather than commands. Example microcopy: «یک دپارتمان را برای مرور فرآیندهای مستندشده انتخاب کنید»، «این فرآیند یک زیرفرآیند است»، «شناسه کپی شد».
- **Voice:** neutral/system voice (no "I"/"you" persona). Buttons are verbs or nouns: «ذخیره»، «انصراف»، «حذف کامل»، «فلوچارت»، «اطلاعات کلی».
- **Numbers:** always rendered in Persian digits (۰۱۲۳۴۵۶۷۸۹). A `toFa()`-style conversion is applied everywhere counts/ids surface to the reader.
- **Confirmations** are explicit and reassuring — destructive dialogs name the target and state reversibility («… با واگرد قابل بازگردانی است» vs «این کار قابل بازگردانی نیست»).
- **Casing:** Persian has no case; the only uppercase is the latin eyebrow `INJA FOOD · مستندسازی فرآیند`, letter-spaced.
- **Emoji:** none. Iconography is line-SVG only.

---

## VISUAL FOUNDATIONS

- **Color:** deep violet ink `#2A1D5E` for text/headings; brand violet `#4A25A9` for primary actions & accents; coral `#FA5A52` (and stronger `#E23D35`) for accent/destructive. Backgrounds are warm cream `#FBF7F1`; cards are white. Everything tinted violet/coral — no cool grays. Semantic set: green outputs, blue inputs, amber controls, violet mechanisms (the IDEF0 ICOM roles).
- **Type:** Vazirmatn (Persian) at weights 400/600/700/800. Headings are heavy (800) and tight; body is 13.5px at loose 1.6–1.8 line-height (Persian reads better loose). Process ids use a UI-mono stack, `dir="ltr"`.
- **Spacing:** screens padded 30×40px; cards 16–22px interior. Comfortable, not dense — the density brief was "friendly & approachable".
- **Backgrounds:** flat cream. **No gradients** (explicitly removed at the client's request — do not reintroduce them). The login screen is the one exception surface: a flat deep-violet `#2E1668` field with two low-opacity solid violet circles as bokeh — still no gradient.
- **Borders:** 1px, warm `#EFE7DC` on cards; violet-tinted `#E3D8F5` on inputs/controls; hairline `#F2ECE3` for internal dividers. Inputs focus to coral `#FA5A52`.
- **Corner radii:** chips 7px, controls 10–12px, icon tiles 14px, cards 16–20px, panels/sheets 24px, status pills 20px, avatars/dots 50%.
- **Shadows:** always soft and violet-tinted, e.g. rows `0 3px 14px -9px rgba(74,37,169,.25)`; hover lift `0 14px 30px -14px rgba(74,37,169,.45)`; modals go darker/neutral `0 40px 90px -30px rgba(0,0,0,.6)`. Destructive buttons carry a coral glow.
- **Cards:** white, warm 1px border, small violet shadow, 16–20px radius. Feature cards (departments) add a 4px colored top bar, a ghosted index numeral, an icon tile, a stat row, and a footer CTA with a circular chevron.
- **Hover:** cards lift `translateY(-2px)` + deepen shadow; ghost buttons fill with `#F4EFFB`; primary buttons brighten (`filter: brightness(1.12)`). Transitions ~.16s.
- **Press/active:** color shift only (no scale on buttons); selected flow nodes/edges turn coral.
- **Pills & chips:** fully rounded (20px) status pills with a tiny leading dot for conflicts; ICOM chips are 7px-radius role-colored soft backgrounds.
- **Transparency/blur:** modal scrims use `rgba(36,17,82,.45)` + `backdrop-filter: blur(3px)`. Otherwise surfaces are opaque.
- **Layout:** fixed top bar + breadcrumb; scrolling content area; side drawer for box detail (becomes a bottom sheet on mobile). Flowchart is an absolutely-positioned pan/zoom canvas with a dotted texture.
- **Animation:** restrained — hover lifts, fades, toast slide-ins. No bounces, no long motion.

---

## ICONOGRAPHY

- **System:** inline **line SVGs**, `stroke="currentColor"`, `stroke-width` 1.9–2.6, rounded caps/joins, 24×24 viewBox — visually a Lucide/Feather-style set. Sized 12–24px by context.
- No icon font, no PNG icons, no emoji, no unicode-glyph icons. Color comes from `currentColor` so icons inherit role colors.
- The one raster asset is the **logo** (`assets/inja-logo.jpg`) — a rounded-square violet tile with the coral wordmark; used on login and as the app avatar. Rendered `border-radius:20px; object-fit:cover`.
- Consumers that need a broader glyph set should use **Lucide** (CDN) to match the existing stroke style. This is a documented substitution — the app itself hand-inlines the handful of icons it uses.

---

## INDEX / MANIFEST

- `styles.css` — entry point (link this). `@import`s all tokens + the Vazirmatn webfont.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Effects) for the Design System tab.
- `components/` — reusable primitives:
  - `core/` — `Button`, `IconButton`, `Badge`, `StatusPill`
  - `forms/` — `TextField`, `SearchField`, `Toggle`
  - `surfaces/` — `Card`, `DepartmentCard`, `ProcessRow`
  - `flow/` — `ICOMChip`, `FlowNode`, `JunctionNode`
- `ui_kits/inja/` — click-through recreation of the app (login, departments, process list, summary, flowchart).
- `SKILL.md` — Agent-Skills manifest for downloading/using this system in Claude Code.

## CAVEATS
- **Fonts:** Vazirmatn is loaded from Google Fonts (CDN) rather than self-hosted binaries. If you need offline/self-hosted webfonts, provide the `.woff2` files and they'll be wired into `@font-face`.
- The logo is the only brand raster; no additional brand illustrations exist in the source, so none were invented.
