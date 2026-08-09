# Inja Food — Process Documentation Design System

A design system extracted from the **Inja Food (اینجا فست‌فود) Restaurant Process
Documentation System** — the internal, Persian-first, right-to-left web product a
fast-food restaurant group uses to document how it actually works.

Meetings with staff are recorded, transcribed and mined by an extraction pipeline; the
result is a per-department library of processes drawn as **IDEF0 / IDEF3** diagrams. The
product's whole job is to let an analyst review, correct and publish that library —
and never to invent content of its own. That constraint shapes the interface: every
screen shows what was recorded, flags what is disputed, and says plainly when something
was not recorded at all.

Two surfaces are covered here:

1. **The process panel** — the analyst's admin app: departments → processes → summary →
   flowchart editor, plus the conflict review inbox and the write dialogs. Warm cream
   paper, violet ink, coral for anything primary or destructive, 12–15px working type.
2. **The staff-guide export** — a standalone offline HTML document generated per
   department for the people on the floor. Same palette, much larger scale: 17px base
   type, 1.9 line-height, 2px borders, 42px step numerals, everything thumb-sized.

## Sources

Built by reading the application source, not screenshots.

- **GitHub:** `lilihosieni-amin/injaprocess_code-repo` — https://github.com/lilihosieni-amin/injaprocess_code-repo (branch `main`)
  - `ui/src/` — React + TypeScript + Vite + @xyflow/react panel. Ground truth for every
    token, component and screen here (`index.css`, `tailwind.config.js`, `screens/`,
    `flow/`, `write/`, `shell/`, `ui/`, `lib/`).
  - `ui/export/steps/` — the staff-guide document (`StepsApp.tsx`, `steps.module.css`,
    `steps-base.css`).
  - `ui/export/flowchart/` — the second export document (formal sheets + interactive
    flowchart). Only `doc-base.css` was read; **not** recreated as a UI kit.
  - `ui/design/` — an earlier design system in the repo, generated from a desktop
    prototype. Useful history, but where it disagreed with `ui/src` the running app won
    (most visibly: the departments screen is now deep-violet, not cream).
  - `CLAUDE.md`, `docs/runbooks/`, `schemas/` — product and data context.
  - `assets/inja-logo.jpg` — copied from `ui/src/assets/`.

Explore those repository paths directly for anything this system leaves out; the code is
far more detailed than any summary of it, and it is the only reliable source for the
flowchart export document.

---

## CONTENT FUNDAMENTALS

**Language.** Persian throughout, RTL. Latin appears in exactly three places: process and
node ids (`dining-003`, `dining-003-n010`), the junction labels `XOR / AND / OR`, and the
one eyebrow lockup `INJA FOOD · مستندسازی فرآیند`.

**Numbers.** Every count, position, index and date shown to a reader is converted to
Persian digits — «۴۸ فرآیند مستند», «۲ تعارض», «۱۴۰۳/۰۹/۱۲» (dates are Jalali). Ids keep
latin numerals and are pinned `dir="ltr"`. Use `toFa()` / the `Fa` component; there is no
exception for "technical" numbers in body copy.

**Voice.** Neutral system voice — no "I", no "we", and the reader is addressed only in
instructions, politely and in plural («انتخاب کنید», «روی هر مرحله بزنید»). Buttons are
bare verbs or nouns: «ذخیره», «انصراف», «فلوچارت», «اطلاعات کلی», «حذف کامل فرآیند»,
«ایجاد و ویرایش».

**Tone.** Plain and specific; guides rather than commands. A subtitle explains what the
screen is for in one sentence: «یک دپارتمان را برای مرور فرآیندهای مستندشده، کارت خلاصه
و فلوچارت انتخاب کنید». The staff guide goes further and asks the reader's question back
to them: «این بخش مربوط به چیست؟», «این کار را چه کسی انجام می‌دهد؟».

**Confirmations are past tense and state the fact:** «فرآیند ایجاد شد», «ترتیب فرآیندها
ذخیره شد», «پیشنهاد پذیرفته شد». Progress is present continuous: «در حال ذخیره…»,
«در حال آماده‌سازی خروجی…».

**Destructive copy names the target and states reversibility.** Recoverable: «با «واگرد»
قابل بازگردانی است». Not recoverable: «برای همیشه و بدون امکان بازیابی حذف می‌شود …
شناسهٔ این فرآیند نیز دیگر هرگز دوباره استفاده نمی‌شود».

**Emptiness is a fact, not an apology** — and the product states its own limits out loud:
«شاخصی برای این فرآیند ثبت نشده است. (سامانه اطلاعات را نمی‌سازد؛ فقط از محتوای واقعی
جلسه پر می‌شود.)», «فرآیندی با این نام پیدا نشد», «کاری لازم نیست».

**Casing & emoji.** Persian has no case; the only uppercase is that one latin eyebrow,
letter-spaced `.14em`. **No emoji anywhere**, in the product or in copy written for it.

---

## VISUAL FOUNDATIONS

**Palette.** Deep violet ink `#2A1D5E` for text and dark screens; brand violet `#4A25A9`
(sampled from the logo) for primary UI; coral `#FA5A52` and its stronger `#E23D35` for
accents, conflicts and destruction; green `#1F8A5B` for a committed write. Page is warm
cream `#FBF7F1`, cards are white. **There are no neutral greys** — every "grey" is a
violet-tinted value (`#8a7db0`, `#a99fc4`, `#EFE7DC`).

**Type.** Vazirmatn at 400/600/700/800, and nothing else. Every heading is 800. The panel
works at 12.5–15px with 22–34px headings; the exported staff guide works at 16–19px with
27–32px headings. Sizes are frequently half-pixel (13.5, 12.5, 11.5, 10.5) — copy them
verbatim, never snap to a 4px scale. Line-height rises with reading distance: 1.6–1.75 in
the panel, 1.9–2.1 in the document (Persian long-form reads better loose).

**Backgrounds.** Flat fills only. **No gradients anywhere** — the login screen's depth
comes from two solid `#3A1D85` circles at 50–55% opacity on flat `#2E1668`, not a
gradient, and the flow canvas is a 20px dot grid. The departments screen is a full
deep-violet field with cream cards on it; every other panel screen is cream.

**Cards.** White, 1px `#EFE7DC` border, 16px radius, and a soft violet-tinted shadow
`0 3px 14px -8px rgba(74,37,169,.25)`. On the dark screen the same card turns cream and
deepens its shadow. The department card adds a 4px accent bar, a ghosted two-digit
numeral, a glyph tile, count chips and a footer CTA with a circular chevron. Guide-document
cards are the exception: **2px** borders, because they are read at arm's length and printed.

**Borders.** 1px `#EFE7DC` (warm) on cards, 1.5px `#E3D8F5` (violet-tinted) on controls and
inputs, `#F2ECE3` hairlines inside a card, and 1.5px dashed `#C9B8EC` on every "add"
affordance.

**Radii.** 6px id badge · 7px ICOM chip · 9–10px small controls · 12px button · 13px search
· 14px glyph tile and KPI card · 16px card and row · 18px summary card · 20px feature card
and wide dialog · 24px login card and dialog · fully round for pills, dots and avatars.

**Shadows.** Always violet-tinted and soft, and they carry meaning: `card` on every
surface, `card-hover` on a lifting card, coloured glows under coral / violet / green
buttons, `drawer` sideways from the node panel, `pop` under a menu. Only dialogs go
neutral and dark (`0 40px 90px -30px rgba(0,0,0,.6)`).

**Hover.** Cards lift `translateY(-2px)` and deepen their shadow; ghost buttons fill
`#F4EFFB`; filled buttons brighten `filter: brightness(1.05–1.12)`; menu and list rows
tint `#F4EFFB` / `#F8F4FE`; guide rows swap their border to violet and gain a shadow.
Transitions are `.16s` (`.12s` fast, `.18s` for a rotating chevron).

**Press & focus.** Colour shift only — **nothing scales or bounces on press**. Inputs focus
by turning their border coral; there is no glow, ring or outline. The one ring in the
product marks a flow node touched by the selected edge, and a step the reader jumped back
to (`0 0 0 4px rgba(250,90,82,.22)`).

**Disabled.** Keeps its surface and fades the glyph to `#cfc7e0`; controls are never
hidden. A busy button swaps its icon for a spinner, forces itself disabled, and says
«در حال ذخیره…» — a slow save must look busy, not frozen.

**Transparency & blur.** Dialog scrims are `rgba(36,17,82,.45)`; only the export dialog
adds `backdrop-filter: blur(3px)`. Edge labels sit on `rgba(255,255,255,.9)`. Every other
surface is opaque. Guide top-bar buttons are the one place white-alpha fills are used
(`.1` → `.22` on hover).

**Layout.** Fixed top bar, then one scrolling region. Content is capped per screen: 1120px
departments grid (3 columns, 18px gap), 920px process list and department info, 960px
process summary, 860px guide document, 340px node drawer (a bottom sheet at 58% height
below 560px). Page padding is 30×40px; the top bar is 22px; card interiors 14–22px.

**Motion.** Restrained: hover lifts, a rotating chevron, a spinner, a toast that fades up
from the bottom edge and leaves after 2.6s. No parallax, no bounce, no entrance
animations on content.

**Imagery.** There is none. The product ships one raster — the logo — and otherwise draws
with type, colour and line icons. Do not add photography or illustration to it.

---

## ICONOGRAPHY

- **System:** hand-inlined **line SVGs** on a 24×24 box, `stroke="currentColor"`, rounded
  caps and joins — visually a Feather / Lucide set, but written into the components
  themselves. Stroke weight is meaningful: **1.9** for the nine department glyphs, **2** for
  general icons, **2.2–2.6** for chevrons, checks and back-arrows. Rendered at 12–24px.
- **No icon font, no PNG icons, no emoji, no unicode-glyph icons.** Two exceptions, both
  from the source: the drag handle in the reorder dialog is the character `⣿`, and the
  ICOM directions on the IDEF0 card are the arrows `↓ → ← ↑`.
- There are **no icon files in the repository** — the glyphs live as path strings in the
  TSX. They were copied verbatim into `components/core/Icon.jsx` (`InjaIcons`,
  `InjaDeptIcons`, `InjaDeptAccent`), which is the whole vocabulary the product uses.
  Nothing was drawn for this system.
- **Colour comes from `currentColor`**, so an icon inherits its role colour — violet on a
  tool button, coral on a destructive one, green on a confirmation.
- **Logo:** `assets/inja-logo.jpg` — a violet square with the coral «اینجا / INJA FAST FOOD»
  wordmark. It is the only brand raster, rendered `object-fit: cover` at 76px/20px radius on
  login and 38px/11px radius in the app bar. It is never recoloured, cropped differently, or
  redrawn as an SVG.
- **If you need a glyph the set lacks,** take it from **Lucide** (CDN) at stroke-width 2 with
  rounded caps — that matches the existing hand-inlined style. Flagged as a substitution,
  not something the product ships.

---

## Tokens

`styles.css` is the entry point and contains only `@import`s:

| File | Holds |
|---|---|
| `tokens/fonts.css` | The Vazirmatn webfont import |
| `tokens/colors.css` | Brand, surfaces, borders, text, semantic, ICOM, junction, department and document colours |
| `tokens/typography.css` | Font stacks, weights, the panel scale and the larger document scale, line-heights, tracking |
| `tokens/spacing.css` | Spacing steps, screen gutters, content widths, radii, recurring sizes |
| `tokens/effects.css` | Shadows, rings, hover lift, durations, scrim blur |
| `tokens/base.css` | The handful of global rules the app itself sets (RTL, scrollbars, selection, links) + component keyframes |

## Components

Reusable primitives, grouped by concern. Each directory has a `@dsCard` HTML showing its
states, and each component a `.d.ts` contract and a `.prompt.md` note.

**`components/core/`** — `Button` (+ `Spinner`), `Icon` (+ `InjaIcons`, `InjaDeptIcons`,
`InjaDeptAccent`), `IconTile`, `IdBadge`, `Chip`, `ProcessTag`, `Card`, `Fa` (+ `toFa`,
`pad2Fa`)

**`components/forms/`** — `TextField`, `SearchField`, `ListEditor`, `AddButton`

**`components/surfaces/`** — `DepartmentCard`, `ProcessRow`, `StatCard`, `KpiCard`,
`Idef0Diagram`

**`components/flow/`** — `ActivityNode`, `TerminalNode`, `JunctionNode`, `JunctionLegend`,
`DetailDrawer`

**`components/feedback/`** — `Modal`, `Toast`, `ConflictCard`, `EmptyState`

**`components/shell/`** — `TopBar`, `Breadcrumb`, `ToolGroup`, `ToolButton`, `ToolDivider`

**`components/guide/`** — `StepCard`, `BranchGroup`, `EndMark` (the export document's
larger scale — do not mix these into a panel screen)

### Intentional additions

The source defines its inventory in `ui/src/ui/`, `ui/src/shell/`, `ui/src/flow/` and
`ui/src/write/`; everything above has a counterpart there. Five components are
generalisations rather than 1:1 files, all of repeated inline markup:

- `Icon` / `Fa` — wrappers around the two helpers every file repeats by hand (inline SVG
  markup, `toFa`).
- `IconTile` — the tinted glyph square used on four screens and in two menus.
- `Modal` — the shell the five dialogs each re-declare inline.
- `ToolGroup` / `ToolButton` — the segmented tray the flow toolbar builds five times.
- `StatCard`, `EmptyState`, `ProcessTag`, `Idef0Diagram` — lifted from inline blocks in
  `Departments.tsx`, `ProcessList.tsx` and `Summary.tsx`.

Nothing was invented: there is no Avatar, Tabs, Tooltip, Accordion or Select here,
because the product has none.

## UI kits

| Kit | What it is |
|---|---|
| `ui_kits/panel/` | Click-through recreation of the analyst panel: login → departments → process list → department info / summary → flowchart with node drawer and edit toolbar, plus the create, delete, reorder, inbox and export dialogs. |
| `ui_kits/staff-guide/` | The generated staff-guide document: task list → numbered steps with branch groups, sub-process steps and the closing marker. |

Each kit has its own `README.md` listing exactly which source files it recreates and what
it knowingly simplifies.

## Index

| Path | What it is |
|---|---|
| `styles.css` | The one stylesheet consumers link |
| `tokens/` | Six token files (see above) |
| `guidelines/` | 22 foundation specimen cards — Colors, Type, Spacing, Effects, Brand |
| `components/` | 7 groups, 37 exports (see above) |
| `ui_kits/panel/` | The analyst panel recreation |
| `ui_kits/staff-guide/` | The staff-guide export document recreation |
| `assets/inja-logo.jpg` | The one brand raster |
| `assets/icons/README.md` | Where the icon set actually lives, and how to extend it |
| `thumbnail.html` | The homepage tile |
| `SKILL.md` | Agent-Skills manifest, for using this system in Claude Code |
| `github.md` | Source-repo association and sync record |

## CAVEATS

- **Fonts are CDN, not self-hosted.** The app installs `@fontsource-variable/vazirmatn` and
  inlines it into offline exports (registering the family as **Vazirmatn Variable**); no font
  binaries exist in the source repo, so `tokens/fonts.css` pulls Vazirmatn from Google
  Fonts and `--font-sans` names both. **This is a substitution — send the `.woff2` files and
  they'll be wired into real `@font-face` rules.**
- **The flowchart export document is not recreated.** `ui/export/flowchart/` holds a 31KB
  CSS module and a 17KB document component that were not read; its sheet layout is
  therefore unknown and was deliberately left out rather than guessed.
- **The panel's inline edit modes are read-only here.** Summary, department info and the
  flowchart all have full edit branches in the source; the kits show the read views and the
  edit *chrome*, not working editors.
- **The flow canvas is not @xyflow/react.** Node positions, edge stroke, arrowhead and label
  box match `edges/edge-style.ts`, but pan, zoom and dragging are not implemented.
- **Sample content is illustrative.** Department names, process names and the one sample
  flowchart were written for this system in the product's register; they are not real Inja
  data.
