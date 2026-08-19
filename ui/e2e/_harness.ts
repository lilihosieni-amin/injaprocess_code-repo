import { expect, type Page } from '@playwright/test'

/* The design's numbers, as Chrome serialises them from getComputedStyle.
   Every one is quoted from .superpowers/sdd/ui-design-spec.md. */

/** §6.0 — the whole application sits on the deep violet field #2A1D5E. */
export const FIELD = 'rgb(42, 29, 94)'
/** §9.1 — every card on that field is #fff in both deliverables (ledger L-14). */
export const SURFACE = 'rgb(255, 255, 255)'
/** §6.1 — the cream a heading is written in **on the field** (`--bg`, #FBF7F1). */
export const ON_FIELD = 'rgb(251, 247, 241)'
/** §6.1 — the muted violet body copy on the field (#B7A6E0). */
export const ON_FIELD_MUTED = 'rgb(183, 166, 224)'
/**
 * Ledger **L-01** — the screen title on the violet field, `#FFFFFF`.
 *
 * The same string as `SURFACE`, and deliberately a second name: one is the
 * colour a *card* is painted, the other the colour a *title on the field* is
 * written in, and a screen that repainted one has no business dragging the
 * other with it. L-01 counted 10 screens at `#FFFFFF` against departments alone
 * at `#FBF7F1` and decided white for all eleven, so `ON_FIELD` above is now the
 * flow canvas's ground and the value the departments H1 still paints **today** —
 * not a title colour any new screen may take.
 *
 * **The theme cannot reach this value by the name the plan writes.** Tasks 15
 * and 17–20 all write `text-on-dark`, which is `--text-on-dark` `#FBF7F1`;
 * `roles.css` names the decided value `--role-title-on-field: var(--card)` and
 * no Tailwind key reads that role. Until one exists the class is `text-card`.
 * Recorded in `.superpowers/sdd/ui-harness-preflight-report.md`.
 */
export const TITLE_ON_FIELD = 'rgb(255, 255, 255)'
/**
 * Ledger **L-28** — the subtitle under it, `#C9BEEE`, on both surfaces.
 *
 * `#B7A6E0` (`ON_FIELD_MUTED`) survives on departments alone, 1 use against 13,
 * and `--violet-on-dark-body` has already been re-cut to `#C9BEEE` in
 * `tokens.css`. Every row below writes this; departments keeps the old value
 * until Task 14 repaints it.
 */
export const SUBTITLE_ON_FIELD = 'rgb(201, 190, 238)'
/** §6.13 / ledger L-15 — the sub-panel edge `#EDE5F5` (`--border-current`). */
export const SUBPANEL_BORDER = 'rgb(237, 229, 245)'
/** §1.2 — `--surface-sub` `#FBF9FE`, THE sub-panel fill (see `profile` below). */
export const SUBPANEL_SURFACE = 'rgb(251, 249, 254)'
/** §4.3 — the default card border, 46 uses (ledger L-15). */
export const CARD_BORDER = 'rgba(42, 29, 94, 0.07)'
/**
 * §4.2 — THE card shadow: two-layer, neutral-dark, 25 uses.
 *
 * **Two layers, and this constant carries exactly those two.** What Chrome
 * prints for an element wearing Tailwind's `shadow-card` is *four*: Tailwind 3
 * composes every shadow utility as
 * `box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)`,
 * so two fully transparent ring layers are serialised ahead of the real ones —
 * measured on this repo:
 *
 * ```
 * rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px,
 * rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px
 * ```
 *
 * A raw `toBe(CARD_SHADOW)` against that can never pass. **Do not repair a red
 * by pasting what the browser printed** — that would write Tailwind's ring
 * scaffolding into the design's ledger and enshrine it in every screen that
 * follows. Compare with `shadowOf()` instead, which drops the layers that paint
 * nothing. `harness.spec.ts` holds both halves of that: the real class passes
 * through `shadowOf`, and the raw string does not equal this constant.
 */
/**
 * The departments card's own shadow. NOT `CARD_SHADOW`: the deliverable, mint-spec
 * §1.2 #10 and `tailwind.config.js:311` all give this card `--shadow-feature`, which
 * has no other consumer anywhere in the plan. Recorded here so the difference is a
 * stated decision rather than a discrepancy someone later 'fixes' into CARD_SHADOW.
 */
export const FEATURE_SHADOW =
  'rgba(16, 10, 40, 0.18) 0px 2px 4px 0px, rgba(16, 10, 40, 0.65) 0px 22px 46px -20px'

export const CARD_SHADOW =
  'rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px'
/** §4.6 — focus is a coral border. 15 of 15 declarations, no glow. */
export const FOCUS = 'rgb(250, 90, 82)'
/** §4.5 — --hover-lift: translateY(-2px). */
export const LIFT = 'matrix(1, 0, 0, 1, 0, -2)'
/**
 * `--font-sans`, as Chrome serialises it.
 *
 * The whole application inherits this from `base.css`'s `body` rule, which is
 * why it had never been asserted anywhere: nothing *declares* a family, so
 * nothing looked like it needed grading. That is exactly what made it free to
 * break — replacing the one declaration in `base.css` re-set every glyph on
 * every screen and not one value this file measures moved. Quoted from
 * `design/_ds/…/tokens/typography.css`, in the order Chrome prints it.
 */
export const FONT_SANS =
  '"Vazirmatn Variable", Vazirmatn, system-ui, -apple-system, "Segoe UI", sans-serif'
/**
 * `--font-mono`, as Chrome serialises it — the one latin island's stack.
 *
 * Ledger **L-21**: both deliverables write
 * `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace` twenty-three
 * times and **never load JetBrains Mono**, so the first choice silently falls
 * through and what the design actually renders is the token. Measured on this
 * repo through `font-mono`, not transcribed from the token file.
 */
export const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

/**
 * §6.0 — the application is Persian and reads right to left.
 *
 * `index.html` carries `dir="rtl"` and `base.css` repeats it on `html`, so every
 * screen inherits it and no screen declares it. Same shape as `FONT_SANS`: an
 * inherited property nothing measured, and `dir="ltr"` on a screen root mirrors
 * the headings, the card order, the chevrons and the sentence-final punctuation
 * while every length, colour and weight in this file stays byte-identical.
 */
export const RTL = 'rtl'

/**
 * The floor a run of text must clear against what is painted behind it.
 *
 * **This is not an accessibility gate and must not be read as one.** WCAG AA is
 * 4.5:1 for body copy and this screen does not meet it — `text-muted` on the
 * cream card measures 3.49 and the coral primary button measures 3.16. The
 * defect being caught here is narrower and cruder: *text the reader cannot see
 * at all*, which is what a colour swap between a surface and the type on it
 * produces. Measured on `departments`, 2026-08-18:
 *
 * | | ratio |
 * |---|---|
 * | card title `text-ink` → `text-bg` (cream on cream) | **1.00** |
 * | card `bg-bg` → `bg-ink` (ink title on the ink field) | **1.00** |
 * | the decorative `۰۱` watermark, `#EDE4FA` on `#FBF7F1` | 1.15 — waived |
 * | the dimmest **real** text, `text-muted` on the card | 3.49 |
 * | `Button.tsx`'s white-on-coral | 3.16 |
 *
 * 2.0 sits in the gap: every mutant is at 1.0, the nearest real text is at 3.16,
 * and the two decorative watermarks are below it *because they are decoration*
 * and are named in `contrastWaived`. Raising this to 4.5 would be a different,
 * larger claim about the design and would go red on the shipped screen; §4 says
 * a conflict like that is a finding, not something to resolve by moving a
 * number, so it is recorded rather than enforced.
 */
export const LEGIBLE = 2

/* ------------------------------------------------------------------ *
 * Per-width expectations — the only thing that makes 1080 and 760 pay
 * ------------------------------------------------------------------ */

/**
 * The widths `playwright.config.ts` declares a project for.
 *
 * R7 is "every page and component is responsive", and a check can only gate it
 * by asserting something that **differs between these numbers**. A computed
 * `max-width`, font-size, padding, radius or transform does not: it is the
 * declared length at every viewport, so running it three times costs 3× and
 * proves 1×. Anything genuinely width-dependent — a used width, a grid's track
 * count — is written as a `ByWidth` record, and `atWidth` picks the row.
 */
export const WIDTHS = [1440, 1080, 760] as const
export type Width = (typeof WIDTHS)[number]
/** One expected value per project width. Every key is required. */
export type ByWidth<T> = { readonly [W in Width]: T }
/** Either one value for all three widths, or one per width. */
export type PerWidth<T> = T | ByWidth<T>

/** Picks the row for the running project's viewport. */
export function atWidth<T>(width: number, value: PerWidth<T>): T {
  if (typeof value !== 'object' || value === null) return value
  const byWidth = value as unknown as Record<number, T>
  const missing = WIDTHS.filter((w) => !(w in byWidth))
  if (missing.length) {
    throw new Error(
      `_harness: a per-width expectation is missing ${missing.join(', ')}; ` +
      `every one of ${WIDTHS.join(' / ')} must be written out`,
    )
  }
  if (!(WIDTHS as readonly number[]).includes(width)) {
    throw new Error(
      `_harness: the running project's viewport is ${width}px, which is not one of ` +
      `${WIDTHS.join(' / ')}. Add it to WIDTHS and to every ByWidth record, or the ` +
      `new project silently grades nothing.`,
    )
  }
  return byWidth[width]
}

/* ------------------------------------------------------------------ *
 * box-shadow, minus Tailwind's ring scaffolding
 * ------------------------------------------------------------------ */

/** Splits a comma-separated CSS value without splitting inside `rgba(…)`. */
function layers(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  const tail = value.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

/** A shadow layer whose colour is fully transparent paints nothing. */
function paintsNothing(layer: string): boolean {
  if (layer === '' || layer === 'none') return true
  const alpha = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(layer)
  return alpha !== null && Number(alpha[1]) === 0
}

/**
 * The shadow a computed `box-shadow` actually paints.
 *
 * Tailwind 3 emits every shadow utility as three composed layers —
 * `var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)` — and
 * Chrome serialises the two unset ring layers as `rgba(0, 0, 0, 0) 0px 0px 0px
 * 0px`. They are invisible, they are not the design's, and they are not
 * something a screen task should have to know about. Stripped here so a
 * `DESIGN` record can quote §4.2 verbatim.
 *
 * The same normalisation is what makes "no shadow" answerable: an element with
 * `shadow-none` computes to *three* transparent layers, not `none`, so a raw
 * `toBe('none')` fails on an element that has no shadow.
 */
export function shadowOf(computed: string): string {
  const painted = layers(computed).filter((l) => !paintsNothing(l))
  return painted.length ? painted.join(', ') : 'none'
}

/** A colour that paints nothing: `rgba(r, g, b, 0)`, or the keyword. */
function transparent(colour: string): boolean {
  if (colour === 'transparent') return true
  const alpha = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(colour.trim())
  return alpha !== null && Number(alpha[1]) === 0
}

/* ------------------------------------------------------------------ *
 * grid track counting
 * ------------------------------------------------------------------ */

/**
 * How many columns a computed `grid-template-columns` really draws.
 *
 * Not a whitespace-token count, which is what this used to be, and which is
 * wrong twice — both measured in Chrome 150 on this repo:
 *
 * 1. **A grid that is not laid out reports its *specified* value.** Prepend
 *    `<div data-grid class="hidden grid-cols-1">` inside `[data-col]` and Chrome
 *    answers `repeat(1, minmax(0px, 1fr))` — three whitespace tokens, which a
 *    naive count reads as "3 columns". A hidden one-column decoy then satisfies
 *    a three-column assertion, silently. That is refused here rather than
 *    counted: any `f(…)` in the value means the track list was never resolved,
 *    so the element is `display:none` or inside something that is. (`hook()`
 *    also requires the grid to be **visible**, so this is the second of two
 *    independent kills.)
 * 2. **Named grid lines are not tracks.** `[a] 545px [b] 545px` is a two-column
 *    grid and counts four whitespace tokens. Only bare `px`/`fr` lengths count.
 *
 * A used value is always a plain length list — Chrome resolves `repeat()`,
 * `minmax()`, `fit-content()`, `auto` and percentages to `px` for a grid that
 * has layout. Measured on the departments grid at 1440: `361.328px 361.328px
 * 361.344px` → 3.
 */
export function trackCount(computed: string): number {
  const value = computed.trim()
  if (value === '' || value === 'none') return 0
  if (/[a-zA-Z-]+\(/.test(value)) {
    throw new Error(
      `_harness: \`grid-template-columns: ${value}\` is a **specified** value, not a used one. ` +
      'Chrome only resolves a track list for a grid that is laid out, so this element is ' +
      '`display:none` or inside something that is — measure a visible grid, or point ' +
      '`grid.selector` at the twin that is on screen at this width. (Counting the whitespace ' +
      'tokens of `repeat(1, minmax(0px, 1fr))` is how a hidden one-column decoy used to pass a ' +
      'three-column assertion.)',
    )
  }
  return value.split(/\s+/).filter((t) => /^-?[\d.]+(px|fr)$/.test(t)).length
}

/* ------------------------------------------------------------------ *
 * padding shorthand
 * ------------------------------------------------------------------ */

/** The CSS 1–4 value `padding` shorthand, expanded to its four sides. */
export function expandPadding(shorthand: string): {
  top: string; right: string; bottom: string; left: string
} {
  const v = shorthand.trim().split(/\s+/).filter((s) => s !== '')
  if (v.length < 1 || v.length > 4) {
    throw new Error(
      `_harness: \`${shorthand}\` is not a CSS padding shorthand — it must carry 1 to 4 lengths`,
    )
  }
  const [top, right = top, bottom = top, left = right] = v
  return { top, right, bottom, left }
}

/* ------------------------------------------------------------------ *
 * What a screen declares
 * ------------------------------------------------------------------ */

/** One run of type: its size, optionally its weight, and — always — its colour. */
export interface Measured {
  size: PerWidth<string>
  weight?: PerWidth<string>
  /**
   * Required, and that is the point. Nine screens shipped where every
   * individual value was legal and the page still looked wrong; a legal colour
   * on the wrong element is the archetype of that. `text-bg` → `text-ink` on
   * the departments H1 paints #2A1D5E on the #2A1D5E field — an invisible page
   * title — and every other assertion in this file stays green.
   */
  color: PerWidth<string>
  /**
   * computed `font-family`. **Defaults to `FONT_SANS`**, so a screen that uses
   * the application's type stack — every screen — writes nothing, and one that
   * deliberately does not has to say so here.
   */
  family?: PerWidth<string>
  /**
   * computed `text-align`. **Defaults to `start`**, which is what Chrome reports
   * for type that has not been aligned; a screen that centres or end-aligns a
   * run declares it. Note this does *not* catch an RTL page flipped to LTR —
   * `start` is `start` in both directions. `ScreenDesign.direction` catches that.
   */
  align?: PerWidth<string>
}

/**
 * The hooks `expectDesign` grades, other than the screen root.
 *
 * A closed set, so `direction` cannot name a hook that does not exist: an object
 * literal with a stray key is a `tsc` error rather than a line that grades
 * nothing. `grid` is this name whatever selector the row gives it — the row
 * names one grid, and calling the override `[data-r-2col]` on one screen and
 * `data-grid` on the next would put the selector in two places.
 */
export type ContentHook = 'col' | 'h1' | 'body' | 'grid' | 'card'

export interface ScreenDesign {
  /** computed `background-color` of `[data-screen]` */
  field: PerWidth<string>
  /** computed `max-width` of `[data-col]` — the design's declared column */
  column: PerWidth<string>
  /**
   * computed **used** `width` of `[data-col]`, per project width.
   *
   * Required, and the only assertion in this file whose expected value changes
   * with the viewport. `column` above is the declared cap and computes to the
   * same length at 760 as at 1440; this is what the reader actually gets.
   */
  columnWidth: ByWidth<string>
  /** the `padding` shorthand of `[data-screen]`, 1–4 lengths */
  padding: PerWidth<string>
  /**
   * computed `direction`, asserted on **every graded hook**, per hook.
   *
   * **Every content hook defaults to `rtl`**, so no screen has to remember it,
   * and a screen with an LTR island has to write the lie down where a reviewer
   * sees it — by hook, so the exemption covers the one run of type that is
   * really latin and nothing else. This is the assertion that notices a
   * `dir="ltr"` mirroring the whole Persian UI: headings to the other margin,
   * cards in reverse order, chevrons the wrong way, the sentence-final period on
   * the wrong side — and **no** length, colour, weight, radius or track count
   * that this file measures moves. `text-align` cannot stand in for it: Chrome
   * reports `start` in both directions.
   *
   * ## Why this is per hook and not one value per row
   *
   * §8 wants RTL text with the scrollbar on the right, and both deliverables
   * spell that as two lines of CSS, which Task 15 moves into `base.css`:
   *
   * ```css
   * [data-r-pad]     { direction: ltr; }
   * [data-r-pad] > * { direction: rtl; }
   * ```
   *
   * `[data-r-pad]` **is** `[data-screen]` — it is the scrolling region that
   * paints the field and carries the screen padding. So on every screen that
   * carries it the root computes `ltr` while the column, both type hooks, the
   * grid and the card all compute `rtl`. One value for the whole row cannot say
   * that: `rtl` accuses a correct screen and `ltr` excuses a mirrored one. A row
   * written that way was a **predicted false red** — a correct screen failed by
   * the gate, in a template twenty-one tasks copy, whose cheapest repair is to
   * weaken the gate. This project has paid for that twice.
   *
   * ## The screen root is not in this record, and that is deliberate
   *
   * Its rule is not a row's to state, because it is §8's:
   *
   * - `rtl` — the ordinary screen, and what every screen without a scroll box
   *   must be.
   * - `ltr` — legal **only** as §8's scroll box, and the box has to prove
   *   itself: the root carries `data-r-pad` *and* **every** immediate element
   *   child of it computes `rtl`.
   *
   * That second clause is why this is an assertion and not an exemption. It is
   * strictly stronger than asserting `rtl`, because a mirrored page can never
   * satisfy it — a mirror is a root whose children are `ltr`. And it closes the
   * defect §8's stylesheet rule exists for: the attribute form (`dir="ltr"` on
   * the region, `dir="rtl"` on the one child somebody remembered) left every
   * dialog mounted beside it LTR, which is the workaround
   * `write/CreateProcessModal`, `DeleteProcessConfirm`, `ReorderModal`,
   * `ExportModal` and `ExportMenu` each carry a comment about. Checking one
   * child — `[data-col]`, the only one hooked — would have gone on missing it.
   *
   * The rule holds whether or not a given screen carries `data-r-pad`: a screen
   * without one has an `rtl` root and never reaches the second clause. So no row
   * has to guess which screens get the scroll box, which is as well — the
   * deliverables put it on **every** screen and the plan writes it on two.
   *
   * ## What a row may say
   *
   * One entry per content hook that is genuinely not `rtl`. `access`'s
   * `[data-body]` is the case this exists for: the design's only subtitle there
   * is a `dir="ltr"` mono username, which is an ordinary and correct thing
   * inside a Persian form. Both halves are verified — an entry naming a hook the
   * row does not grade fails, and an entry that only restates the `rtl` default
   * fails, because a deviation that is not one is a hole nobody decided to open.
   *
   * Deliberately not applied to the `focus` and `lift` targets: an LTR field for
   * an email address, a phone number or a code is ordinary, and a gate that
   * red-flagged it would be teaching twenty-one screens the wrong lesson.
   */
  direction?: Partial<Record<ContentHook, PerWidth<'rtl' | 'ltr'>>>
  /** computed on `[data-h1]` */
  h1: Measured & { weight: PerWidth<string> }
  /** computed on `[data-body]` */
  body: Measured
  /**
   * The card grid's track count per width — §6.16's only structural rule.
   *
   * Optional because not every screen has a grid. Where a screen does, this is
   * the assertion that notices a layout collapsing or refusing to collapse:
   * `grid-cols-3` → `grid-cols-1` changes nothing else measured here.
   */
  grid?: {
    selector?: string
    columns: ByWidth<number>
    /**
     * The gutter, as a length — checked twice, and required.
     *
     * Once as the computed `column-gap`/`row-gap`, and once **geometrically**,
     * as the distance between the border boxes of adjacent items. The pair
     * matters because either one alone is escapable: `gap-[18px]` →
     * `gap-[240px]` blows the layout apart while `trackCount` still answers 3
     * and `[data-col]`'s used width does not move, and a margin on the items
     * opens a visible gutter that the computed `gap` never mentions.
     */
    gap: PerWidth<string>
  }
  card?: {
    radius?: PerWidth<string>
    /** compared through `shadowOf` — quote `CARD_SHADOW`, never the raw computed string */
    shadow?: PerWidth<string>
    border?: PerWidth<string>
    /**
     * computed `background-color`. **Required**, for the same reason
     * `Measured.color` is: a card painted the same colour as the field it sits
     * on does not look like a mistake in any single value — the radius, the
     * shadow, the border and every length are untouched — it just stops being a
     * card. Write what the screen paints *today*; a task that repaints it
     * changes this line in the same commit.
     */
    background: PerWidth<string>
  }
  /**
   * A focusable selector **inside the screen**; focusing it must raise a coral
   * indicator that was not there at rest. See `expectFocusIndicator` for the
   * two idioms this codebase actually ships and why "a coral border" alone is
   * not the assertion.
   */
  focus?: string
  /** A selector **inside the screen**; its transform must become the -2px lift. */
  lift?: string
  /**
   * Selectors inside the screen whose text is exempt from `LEGIBLE`.
   *
   * The census below reads **every** run of type on the screen, not only the two
   * the `DESIGN` row names, because the invisible-text defect does not confine
   * itself to hooked elements — the mutation that started this was on a card
   * title, and no screen will ever hook every title it draws. Firing on all of
   * it needs a way to say "this one is decoration", and this is it: one line,
   * visible to a reviewer, and **verified** — a selector that matches nothing is
   * a failure, so a waiver cannot outlive the thing it was written for.
   *
   * `el.closest(selector)` decides, so a waiver on a wrapper covers its subtree.
   * Use it for two things and nothing else: type that is decorative by design
   * (a watermark numeral), and type over a background this method cannot reduce
   * to a colour (a gradient or an image).
   */
  contrastWaived?: readonly string[]
}

/**
 * One entry per screen. A screen task adds its own row and calls
 * `expectDesign(page, '<name>')` at all three widths.
 *
 * `departments` is deliberately partial in its optional half: the visual audit
 * calls this screen near pixel-faithful, and it is — on the field, the column,
 * the padding, the title and the card's radius. Its card is still cream
 * `#FBF7F1` with `--shadow-card-dark` and a `#EFE7DC` border, which ledger
 * L-14/L-15 retire; Task 14 rebuilds it white with `CARD_BORDER` and
 * `CARD_SHADOW` and adds `border` and `shadow` to this record in the same
 * commit — `background` is already here, holding the cream the screen paints
 * today. The screen has no focusable control, so `focus` is absent by fact.
 *
 * ## Two surfaces, two rows
 *
 * R3 makes five of these screens exist twice — the same screen read at a
 * different scale, not a second theme. A row is one screen at one scale, so a
 * screen with two surfaces gets **two rows**: `<name>` for the panel and
 * `<name>Reader` for the reader, and its component writes
 * `data-screen={reader ? '<name>Reader' : '<name>'}`. Two rows rather than a
 * surface-aware field because nothing here is surface-aware: `PerWidth` keys on
 * the viewport, and a sixth mechanism keyed on something else is a second place
 * for a screen's numbers to live.
 *
 * ## This table was filled in ahead of the screens, and what that does and does
 * not mean
 *
 * Eleven screen tasks each planned to append their own row to this one file, in
 * one shared working tree. The later write wins and the build stays green, so
 * the rows were written **before** the screens, from the plan's own task
 * sections cross-checked against `ui/design/Inja Panel.dc.html` and
 * `ui/design/Inja Reader.dc.html`, and the screen tasks are forbidden to touch
 * the table. Every number below is quoted from one of those two deliverables or
 * from a decided row of `docs/superpowers/ui-normalisation-ledger.md`, and where
 * the two disagree the row says which it took and why.
 *
 * Three screens are **deliberately absent**, because a wrong row is worse than
 * no row for twenty-one tasks that will trust it. `users` draws no second line
 * at all, so there is no `[data-body]` to grade and choosing one would be
 * designing the screen rather than measuring it. `signIn` is identical at 1440,
 * 1080 and 760, so a row for it would fail `every DESIGN row carries a
 * width-dependent expectation` on the day it was added. The dialogs are not
 * `[data-screen]` regions at all. Each is written up, with every value that *is*
 * settled, in `.superpowers/sdd/ui-harness-preflight-report.md`.
 *
 * ## §8's scroll box: the false red that was predicted and then removed
 *
 * Task 15 moves §8's scroll rule into `base.css` —
 * `[data-r-pad]{direction:ltr}` with `[data-r-pad] > *{direction:rtl}` — so the
 * scrollbar sits on the right. `[data-r-pad]` is the same element as
 * `[data-screen]` on every screen that carries it, so on those screens the root
 * computes `ltr` while the column, both type hooks, the grid and the card all
 * compute `rtl`. Against a single per-row `direction` that was a **correct
 * screen failed by the gate** — `departments` would have gone red the moment
 * Task 14 added the attribute, and the red would have read as a defect in the
 * screen, in a file twenty-one screen checks copy.
 *
 * So `direction` is per hook, and the root's own rule is §8's rather than the
 * row's: `rtl`, or `ltr` **only** as the scroll box, proved — `data-r-pad` on
 * the root and every immediate child back at `rtl`. No row below states it, no
 * row has to guess which screens get the pad (the deliverables give it to all of
 * them and the plan writes it on two), and a mirrored page still cannot satisfy
 * it, because a mirror is a root whose children are LTR too. See
 * `ScreenDesign.direction`, and `harness.spec.ts`'s
 * `§8's scroll box is a legal LTR root, and only when it proves itself`.
 */
export const DESIGN = {
  departments: {
    field: FIELD,
    column: '1120px',
    // 1440 − 80 of screen padding is capped by the 1120 column; 1080 and 760 are not.
    columnWidth: { 1440: '1120px', 1080: '1000px', 760: '732px' },
    // §6.16 requires `[data-r-pad]{padding:18px 14px}` at ≤760px and the screen
    // ships one padding at every width — `Departments.tsx` writes a bare
    // `pt-[38px] pb-12 px-10` with no `max760:` variant, so the mobile viewport
    // gets the desktop's 40px side padding. That is the same R7 defect the grid
    // line below records, and the same task closes it: **Task 14 rewrites the
    // line below as a per-width record — `{ 1440: '38px 40px 48px', 1080: '38px
    // 40px 48px', 760: '18px 14px' }` — in the same commit that adds
    // `max760:px-s7 max760:py-s9` to the screen.** Until then this states what
    // the screen *does*, so the mutant that changes the padding dies today.
    padding: { 1440: '38px 40px 48px', 1080: '38px 40px 48px', 760: '18px 14px' },
    // §R7 drops every `[data-r-title]` to 25px at <=760 (`Inja Panel.dc.html:90`,
    // `!important`) and the departments title IS one (`:207`, 34px), but
    // `Departments.tsx` writes a bare size with no `max760:` variant. Same rule as
    // `padding`, `grid.columns` and `card` around it: this states what the screen
    // *does*, so the mutant that resizes the title dies today. **Task 14 rewrites
    // this as `{ 1440: '34px', 1080: '34px', 760: '25px' }` in the same commit
    // that adds the variant.**
    h1: { size: { 1440: '34px', 1080: '34px', 760: '25px' }, weight: '800', color: ON_FIELD },
    // The fourth "states today's paint" line, and the least obvious: this is
    // #B7A6E0 because `Departments.tsx:32` writes `text-[#B7A6E0]` — AN ARBITRARY
    // HEX LITERAL, not a token. No *named* utility can paint it: Task 3 re-cut
    // `--violet-on-dark-body` to #C9BEEE, and L-28 settles the role there. The
    // screen only gets away with it because it predates the guard's reach. So the
    // row is right about today and wrong about the design, exactly like its three
    // neighbours. **Task 14 changes this to `SUBTITLE_ON_FIELD` in the same commit
    // that replaces the literal with the token.**
    body: { size: '14px', color: SUBTITLE_ON_FIELD },
    // §6.16 requires 3 / 2 / 1 and the screen ships 3 / 3 / 3 — `Departments.tsx`
    // writes a bare `grid-cols-3` with no `max1080:` or `max760:` variant, so the
    // three-column grid is squeezed into 760px. That is a real R7 defect and it
    // is Task 14's to close; what this row states is what the screen *does*, so
    // the mutant that collapses the grid dies at all three widths today. **Task
    // 14 edits the line below to `{ 1440: 3, 1080: 2, 760: 1 }` in the same
    // commit that adds the variants.**
    grid: { columns: { 1440: 3, 1080: 2, 760: 1 }, gap: '18px' },
    // §9.1/L-14 make this `#fff`; `Departments.tsx` still paints `bg-bg`, the
    // cream `#FBF7F1`, and Task 14 rebuilds it. Same rule as `padding` and
    // `grid.columns` above: this states what the screen *does*, so the mutant
    // that repaints the card the colour of the field dies today. Task 14 changes
    // this to `SURFACE` in the commit that repaints it, and adds `border` and
    // `shadow` beside it.
    card: { radius: '20px', shadow: FEATURE_SHADOW, border: CARD_BORDER, background: SURFACE },
    lift: '[data-card]',
    // The two `text-[46px]` watermark numerals behind each card's icon —
    // `#EDE4FA` and `#FBE4E1` on the cream card, 1.15 and 1.14. They are drawn
    // to be *nearly* invisible and they carry no information the reader needs;
    // the numeral is decoration, and it is the screen's only run of type below
    // the floor. One selector reaches both because it is the screen's only
    // `pointer-events-none`.
    contrastWaived: ['[data-card] .pointer-events-none'],
  },

  /**
   * Task 14, the reader half — `data-screen="departmentsReader"`.
   *
   * `Inja Reader.dc.html:170` — `padding:30px 24px 60px`, a `720px` column, a
   * `26px/800 #fff` title and a single-column list of `18px` white cards that
   * lift. R4 only routes a reader here when they can reach two or more
   * departments; with one, `ReaderShell` lands them on a process list and a spec
   * pointed at this row is grading the wrong page.
   */
  departmentsReader: {
    field: FIELD,
    column: '720px',
    // 720 caps at every width: 1440−48, 1080−48 and (at ≤760, where the
    // deliverable's own `[data-r-pad]{padding:18px 14px}` takes over) 760−28=732
    // are all wider. Measured, not assumed: this Chrome overlays its scrollbar —
    // an `overflow:auto` box that is scrolling reports `clientWidth` equal to
    // `offsetWidth`, so no width below carries a scrollbar term.
    columnWidth: { 1440: '720px', 1080: '720px', 760: '720px' },
    // The per-width expectation this row is proved by. `--role-pad-x` is 24px on
    // the reader against the panel's 40, `--role-pad-bottom` 60 against 30, and
    // both deliverables' `@media (max-width:760px)` blocks rewrite every
    // `[data-r-pad]` to `18px 14px` — which is what `max760:px-s7 max760:py-s9`
    // compiles to (`--space-7` 14px, `--space-9` 18px).
    padding: { 1440: '30px 24px 60px', 1080: '30px 24px 60px', 760: '18px 14px' },
    // `--fs-h1-reader-home`. Ledger L-34 keeps the reader's hero *smaller* than
    // its own list title (30px) — recorded as reading like a defect, referred to
    // the owner, and not silently "fixed" here.
    h1: { size: '26px', weight: '800', color: TITLE_ON_FIELD },
    // The deliverable writes 14.5px. R12 drops the reader's 14.5px override —
    // it is `--role-fs-dense`, 13px on the panel — so this is 13px on both
    // surfaces. Do not restore 14.5 here without moving R12.
    body: { size: '13px', color: SUBTITLE_ON_FIELD },
    // `--role-dept-gap` is `--space-7` 14px on the reader against the panel's 18,
    // and the list is one column at every width (`[data-r-deptgrid]` in the
    // reader deliverable is a flex column; Task 14 draws it as a 1-track grid so
    // one component serves both surfaces). The row is proved responsive by
    // `padding` above, not by this.
    grid: { selector: '[data-r-deptgrid]', columns: { 1440: 1, 1080: 1, 760: 1 }, gap: '14px' },
    card: { radius: '18px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
    lift: '[data-card]',
  },

  /**
   * Task 15, panel — `Inja Panel.dc.html:269`.
   *
   * `padding:30px 40px`, `--width-list` 920, a `22px/800` title beside the
   * department tile and a `13px` count line under it. The rows are the design's
   * `16px` white cards at `17px 19px` with the card hairline, the two-layer
   * shadow and the −2px lift.
   */
  processList: {
    field: FIELD,
    column: '920px',
    // 920 caps at 1440 and 1080 (1000 available); at 760 the `18px 14px` pass
    // leaves 732 and the column is uncapped.
    columnWidth: { 1440: '920px', 1080: '920px', 760: '732px' },
    padding: { 1440: '30px 40px', 1080: '30px 40px', 760: '18px 14px' },
    // `--fs-h2`, ledger L-02's one screen title. The deliverable paints it
    // `#fff`; the plan's own JSX writes `text-on-dark`, which is `#FBF7F1` —
    // see TITLE_ON_FIELD for why this row takes white.
    h1: { size: '22px', weight: '800', color: TITLE_ON_FIELD },
    body: { size: '13px', color: SUBTITLE_ON_FIELD },
    // `[data-r-prow]`: `background:#fff;border:1px solid rgba(42,29,94,.07);
    // border-radius:16px;padding:17px 19px;box-shadow:<the two-layer card
    // shadow>` with `style-hover="transform:translateY(-2px)"`.
    card: { radius: '16px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
    // The large `SearchField` is the screen's first input, and §4.6's focus rule
    // is 15 of 15 declarations: a coral border, no ring and no glow.
    focus: 'input',
    lift: '[data-card]',
  },

  /**
   * Task 15, the reader half — `Inja Reader.dc.html:196`.
   *
   * Same screen, the reader's scale: a `720px` column, a **centred** `30px`
   * title (`--fs-h1-reader-list`) and a centred lead line. `ProcessList.tsx`
   * already branches on `useSurface()` for both — `reader ? 'max-w-reader' :
   * 'max-w-list'` and `reader ? 'text-fs-h1-reader-list' : 'text-fs-h2'`.
   */
  processListReader: {
    field: FIELD,
    column: '720px',
    columnWidth: { 1440: '720px', 1080: '720px', 760: '720px' },
    // The per-width expectation this row is proved by; see `departmentsReader`.
    padding: { 1440: '30px 24px 60px', 1080: '30px 24px 60px', 760: '18px 14px' },
    h1: { size: '30px', weight: '800', color: TITLE_ON_FIELD, align: 'center' },
    // 14.5px in the deliverable, 13px here — R12, as on `departmentsReader`.
    body: { size: '13px', color: SUBTITLE_ON_FIELD, align: 'center' },
    card: { radius: '16px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
    lift: '[data-card]',
  },

  /**
   * Task 16 — `Inja Panel.dc.html:382`. Panel only: the reader never meets a
   * process summary, it goes from the list to the step-by-step view.
   *
   * The subtitle is inside `<sc-if value="{{ isEditor }}">`, so **the spec must
   * sign in as an editor** or `[data-body]` has nothing to hook.
   */
  summary: {
    field: FIELD,
    column: '960px',                       // --width-summary
    columnWidth: { 1440: '960px', 1080: '960px', 760: '732px' },
    padding: { 1440: '30px 40px', 1080: '30px 40px', 760: '18px 14px' },
    // The deliverable draws 23px here. Ledger **L-02** counts 22px on seven
    // screens against this one 23 and the profile's 21, and decides 22 for all
    // nine; `--fs-h1`'s 23px stays the audit stat numeral. The plan's own Task 16
    // step still quotes 23 — L-02 supersedes it.
    h1: { size: '22px', weight: '800', color: TITLE_ON_FIELD },
    // 15px, `--fs-lg`. Not one of ledger L-27's four body steps and not
    // normalised by anything: it is the screen subtitle the design gives this
    // one screen, `max-width:640px`, `line-height:1.75`.
    body: { size: '15px', color: SUBTITLE_ON_FIELD },
    // The A-0 card: `border-radius:18px;padding:24px`. The deliverable's own
    // border is `1px solid #EFE7DC`; ledger **L-15** retires that for
    // `rgba(42,29,94,.07)`, which is what Task 16 builds and what `CARD_BORDER`
    // holds.
    card: { radius: '18px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
    // No `grid`: the IDEF0 block is `[data-r-idef0]`, a `1fr 1.4fr 1fr` grid that
    // becomes `display:flex;flex-direction:column` at ≤760, so `trackCount` reads
    // the specified value at one of the three widths and `gridGeometry` measures
    // a flex column. Grading it needs a rule this shape does not have; the
    // screen's own spec asserts the `display` swap directly.
  },

  /**
   * Task 17 — `Inja Panel.dc.html:466`, the department overview. Panel only:
   * `Overview.tsx` reads `useSurface()` for its `IconTile` and writes
   * `max-w-list` and `text-fs-h2` unconditionally, so there is no reader row.
   */
  overview: {
    field: FIELD,
    // The deliverable draws `max-width:900px`. Ledger **L-07** decides 920
    // (`--width-list`) on dominance — 900 has no token, no role and no second
    // use — and `--role-column` resolves there, so the theme cannot express 900.
    column: '920px',
    columnWidth: { 1440: '920px', 1080: '920px', 760: '732px' },
    padding: { 1440: '30px 40px', 1080: '30px 40px', 760: '18px 14px' },
    h1: { size: '22px', weight: '800', color: TITLE_ON_FIELD },
    body: { size: '13px', color: SUBTITLE_ON_FIELD },
    // The sub-units grid: `grid grid-cols-2 gap-s6 max760:grid-cols-1`
    // (`--space-6` is 12px). **The fixture must serve at least two sub-units** —
    // the section is not drawn for an empty list, and a one-item grid proves no
    // gutter.
    grid: {
      selector: '[data-r-2col]',
      columns: { 1440: 2, 1080: 2, 760: 1 },
      gap: '12px',
    },
    // The three stacked §6.4 cards: `bg-card border-border-card rounded-doc
    // shadow-card`, radius `--radius-doc` 18px. Same L-15 note as `summary`.
    card: { radius: '18px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
    // The rebuilt `Accordion` header is the screen's only `aria-expanded`, and
    // §4.6 says nothing on this screen lifts or scales on press — so `focus` and
    // no `lift`.
    focus: '[aria-expanded]',
  },

  /**
   * Task 23, the visibility policy — `Inja Panel.dc.html:1756`.
   *
   * §3.3 gives it Access's `820px`. One card of rows, not six: `background:#fff;
   * border:1px solid rgba(42,29,94,.07);border-radius:16px;padding:8px 18px`
   * with the two-layer shadow. Ledger **V2** settles the radius at 16 against
   * the visual audit's 20 — §6.12 quotes the literal, the audit measured a
   * screenshot.
   */
  policy: {
    field: FIELD,
    column: '820px',                       // --width-access
    columnWidth: { 1440: '820px', 1080: '820px', 760: '732px' },
    padding: { 1440: '30px 40px', 1080: '30px 40px', 760: '18px 14px' },
    h1: { size: '22px', weight: '800', color: TITLE_ON_FIELD },
    body: { size: '13px', color: SUBTITLE_ON_FIELD },
    card: { radius: '16px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
    // No `focus`: the row's real control is an `sr-only` input behind a drawn
    // 19px tick, and a 1×1 clipped box is the wrong thing to measure a focus
    // indicator on. No `lift`: F7's fix is a hover *fill* (`hover:bg-tile-v4`),
    // not a transform — §4.6 lifts cards, not rows inside one.
  },

  /**
   * Task 20, the Access screen — `Inja Panel.dc.html:1286`.
   *
   * **This row exists because `direction` became per hook.** The design's only
   * second line here is the mono username, `<span dir="ltr">` — an ordinary and
   * correct latin island inside a Persian form — and while one `direction` value
   * covered the whole row, saying so would have excused a mirrored column at the
   * same time. `direction: { body: 'ltr' }` says it about the one hook it is
   * true of, and the column, the title and the card are still held to `rtl`.
   */
  access: {
    field: FIELD,
    column: '820px',                       // --width-access
    columnWidth: { 1440: '820px', 1080: '820px', 760: '732px' },
    padding: { 1440: '30px 40px', 1080: '30px 40px', 760: '18px 14px' },
    h1: { size: '22px', weight: '800', color: TITLE_ON_FIELD },
    // `<div dir="ltr" style="font-family:<mono>;font-size:12.5px;color:#C9BEEE;
    // text-align:start">{{ su.user }}</div>`. `align` is written out because the
    // deliverable writes it out — an LTR run inside an RTL column would otherwise
    // be read as end-aligned by anyone skimming, and `start` is what it is.
    body: { size: '12.5px', color: SUBTITLE_ON_FIELD, family: FONT_MONO, align: 'start' },
    direction: { body: 'ltr' },
    // `border:1px solid #EDE5F5;border-radius:16px;padding:18px;background:var(--card)`
    // — a white panel on a sub-panel edge, and flat. Corrected 2026-08-19: the
    // old comment said "§6.8's FOUR cards sit flat". THREE of them do. Panel 3,
    // «گذرواژه», is the card recipe — CARD_BORDER under CARD_SHADOW
    // (`Inja Panel.dc.html:1409`). No value here moves, because `[data-card]` is
    // panel 1; the prose was simply wrong, and a later reader would have taken it
    // as licence to flatten a card the design shadows.
    //
    // `shadow: 'none'` is stated rather than left unsaid: FLATNESS IS THE ONE
    // VALUE that separates a §6.8 sub-panel from a list card, so leaving it
    // unasserted left the row unable to tell them apart. Measured through
    // `shadowOf` at all three widths.
    card: { radius: '16px', border: SUBPANEL_BORDER, background: SURFACE, shadow: 'none' },
  },

  /**
   * Task 22 — `Inja Panel.dc.html:1785`, and `Inja Reader.dc.html:834` draws it
   * identically (`padding:30px 40px`, a `700px` column), so one row serves both.
   */
  profile: {
    field: FIELD,
    column: '700px',                       // --width-profile
    // 700 caps at every width — at 760 the `18px 14px` pass still leaves 732.
    // The row is proved responsive by `padding`.
    columnWidth: { 1440: '700px', 1080: '700px', 760: '700px' },
    padding: { 1440: '30px 40px', 1080: '30px 40px', 760: '18px 14px' },
    // Both deliverables draw 21px and Task 22's own JSX writes
    // `text-fs-stat-sm`. Ledger **L-02** normalises the profile to 22 and
    // **L-33** repeats it — `--fs-stat-sm` 21px exists for the *activity stat
    // numeral*, which `tokens.css` says in as many words. 22px.
    h1: { size: '22px', weight: '800', color: TITLE_ON_FIELD },
    // `12.5px #C9BEEE` — the role line beside the mono username. Hook the
    // wrapper, not the username: that span is `dir="ltr"`, and `direction` is one
    // value for every graded hook in this row.
    body: { size: '12.5px', color: SUBTITLE_ON_FIELD },
    // The tinted `SectionCard`: `background:#FBF9FE;border:1px solid #EDE5F5;
    // border-radius:16px`, and no shadow — it is a sub-panel, not a card on the
    // field. **`background` is the value the mint decided, not the one the role
    // used to resolve to**: `--role-surface-sub` pointed at `--tile-v4`
    // `#F8F4FE` when this row was written, two shades off the deliverable's
    // `#FBF9FE`; `.superpowers/sdd/mint-spec.md` §2.1 C1 re-points it at
    // `--surface-sub`, and that correction has since landed in `roles.css:39`.
    // If a revert ever puts `--tile-v4` back, this line goes red — correct the
    // role, not this row.
    card: { radius: '16px', border: SUBPANEL_BORDER, background: SUBPANEL_SURFACE },
    // The three `PasswordField`s are the screen's inputs; the first is «گذرواژهٔ
    // فعلی». §4.6: a coral border, no ring, no glow.
    focus: 'input',
  },
} satisfies Record<string, ScreenDesign>

/* ------------------------------------------------------------------ *
 * The page every measurement is supposed to be made on
 * ------------------------------------------------------------------ */

/** A document's identity, and how many in-page navigations it has been through. */
interface Stamp {
  /** `<document id>#<in-page navigations>`. Either half moving is a navigation. */
  token: string
  href: string
}

declare global {
  interface Window {
    /** Installed by `instrument()`, before one line of application code runs. */
    __uiHarnessPage?: () => Stamp
  }
}

/** Where a page was pinned, so the failure can say what it was pinned *by*. */
interface Pin {
  stamp: Stamp
  where: string
}

const PINNED = new WeakMap<Page, Pin>()
const INSTRUMENTED = new WeakSet<Page>()

/**
 * The sentence every navigation failure carries.
 *
 * Exported behind `isNavigationFault` so a spec that expects a *specific* red —
 * `rejects.toThrow(/covered measurement hook/)` — can re-throw this one verbatim
 * instead of wrapping it in its own accusation. That wrapping is the whole
 * defect: the spec's message is written for the case where the guard failed,
 * and it is printed for the case where the page moved.
 */
const NAVIGATION_FAULT = 'the page navigated out from under this measurement'

/** Is this failure the harness saying the page moved, rather than a real red? */
export function isNavigationFault(failure: unknown): boolean {
  return failure instanceof Error && failure.message.includes(NAVIGATION_FAULT)
}

/**
 * Stamps every document this page loads, and counts its in-page navigations.
 *
 * Two kinds of movement, both of which destroy what a spec has planted and
 * neither of which any assertion in this file could previously see:
 *
 * 1. **A new document** — `goto`, `reload`, a followed link. The window is
 *    replaced, so the stamp is too, and *everything* is gone: injected
 *    stylesheets, planted probes, decoy nodes, attributes set on the screen root.
 * 2. **An in-page history navigation** — `pushState`, `replaceState`,
 *    `popstate`, a hash change. **These count, and the decision is deliberate:
 *    this application is a React SPA.** A route change here is not cosmetic —
 *    react-router unmounts the whole screen subtree and mounts another one, so
 *    every node a spec planted inside `[data-screen]` dies, while a stylesheet
 *    injected into `<head>` survives untouched. That half-wiped page is the
 *    *more* misleading of the two: some of the mutation is still in force, so
 *    the failure it produces looks like a plausible partial defect rather than
 *    like a page that moved.
 *
 * The counter is bumped by patching `history.pushState`/`replaceState` rather
 * than by listening for something, because a `pushState` fires no event. The
 * patch is installed by an init script, so it is in place before react-router
 * reads `window.history`, and it calls straight through.
 *
 * The known cost of counting the second kind: a bare `history.replaceState` that
 * re-renders nothing — a query-string tidy-up, say — is reported as a
 * navigation although nothing was lost. That is accepted rather than worked
 * around, because the two are not distinguishable from outside the app and the
 * one that matters is the one that silently empties the screen. The escape is a
 * line: `await pinPage(page)`.
 */
async function instrument(page: Page) {
  if (INSTRUMENTED.has(page)) return
  INSTRUMENTED.add(page)
  await page.addInitScript(() => {
    const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`
    let soft = 0
    const wrap = (name: 'pushState' | 'replaceState') => {
      const original = window.history[name].bind(window.history)
      window.history[name] = (...args: Parameters<History['pushState']>) => {
        soft += 1
        original(...args)
      }
    }
    wrap('pushState')
    wrap('replaceState')
    window.addEventListener('popstate', () => { soft += 1 })
    window.addEventListener('hashchange', () => { soft += 1 })
    window.__uiHarnessPage = () => ({ token: `${id}#${soft}`, href: location.href })
  })
}

/** The failure, written for whoever meets it — which is not whoever wrote it. */
function navigated(pin: Pin, now: Stamp | null, what: string): Error {
  const moved = now === null
    ? 'the document carries no harness stamp at all, so it cannot be the one that was pinned. ' +
      'It was opened before the init script was installed, or by something that bypassed it'
    : pin.stamp.token.split('#')[0] !== now.token.split('#')[0]
      ? 'a whole new document — a `goto`, a `reload`, a form submit, a followed link. Every ' +
        'node, every injected stylesheet and every attribute the spec set is gone with it'
      : 'an in-page history navigation — `pushState`, `replaceState`, `popstate` or a hash ' +
        'change. The document survived, and so did anything injected into `<head>`. What does ' +
        'not survive an in-app route change is the screen: react-router unmounts it, and ' +
        'everything the spec planted inside it goes too. Half the mutation is left standing, ' +
        'which is why the red this produces looks like a plausible partial defect rather than ' +
        'like a page that moved'
  return new Error(
    `_harness: ${NAVIGATION_FAULT}.\n` +
    `    measuring: ${what}\n` +
    `    pinned:    ${pin.stamp.token}  ${pin.stamp.href}   (${pin.where})\n` +
    `    found:     ${now ? `${now.token}  ${now.href}` : '(no stamp)'}\n` +
    `    what moved: ${moved}.\n` +
    '\n' +
    '**The navigation is the fault. It is not a reason to relax anything.** A guard handed a ' +
    'page it was never given tells the truth about the wrong page, and the reds that come out ' +
    'of it read as accusations against the guard itself — "the mutant is no longer caught", ' +
    '"the decoys are not in front of the screen\'s hooks any more", "the probe stopped killing ' +
    'its clause". Every one of those means what this message means: the mutation, the decoy or ' +
    'the probe was applied to a page that no longer exists, so of course nothing found it. Do ' +
    'not weaken the assertion, delete the probe, widen the regex or lower a threshold to make ' +
    'this green — none of them is what broke.\n' +
    '\n' +
    'Find what moved the page:\n' +
    '  - a `page.goto`, `page.reload` or `page.goBack` in the spec between the setup and the ' +
    'measurement;\n' +
    '  - a click that followed a link or called the router. In this SPA that is enough: the ' +
    'screen is unmounted and everything planted inside it goes with it;\n' +
    '  - a redirect the application made after the screen first appeared — a session that ' +
    'expired mid-run and sent the page to /login is the usual one;\n' +
    '  - a file saved under a watching dev server. `playwright.config.ts` builds once and ' +
    'serves the frozen `dist-e2e` through `vite preview` precisely so this cannot happen; if ' +
    'it is happening again, the run is not being served from that build.\n' +
    '\n' +
    'If the navigation is deliberate — a spec that clicks through to a second screen and ' +
    'measures that — say so: `await pinPage(page)` after it, and every later measurement is ' +
    'graded against the new page.',
  )
}

/**
 * Grades one page read against the page that was pinned, and hands back its value.
 *
 * Every reader in this file is folded into this shape — `{ nav, value }` out of
 * one `evaluate` — so the check costs **no extra round trip**: the stamp comes
 * back in the same call as the measurement it belongs to. That matters because
 * this file is a template twenty-one screen checks copy, and a guard that costs
 * a round trip per property would be paid for on every one of them.
 *
 * A page with no stamp and no pin is left alone rather than failed: that is
 * `about:blank` and the three `proved once` entries that never open a page.
 */
function samePage<T>(page: Page, read: { nav: Stamp | null; value: T }, what: string): T {
  const pin = PINNED.get(page)
  if (!pin) {
    // Nothing pinned yet — pin here, so the window this guard covers starts at
    // the first thing the harness ever looked at. A spec that navigates with
    // `visit()` gets a pin one step earlier still, which is what covers the gap
    // between `page.goto` and the first measurement.
    if (read.nav) PINNED.set(page, { stamp: read.nav, where: `first measured while ${what}` })
    return read.value
  }
  if (read.nav !== null && read.nav.token === pin.stamp.token) return read.value
  throw navigated(pin, read.nav, what)
}

/**
 * This page carries the stamp, so everything measured on it is able to notice a
 * navigation — *and* it has not navigated.
 *
 * The guard's own precondition, and the reason it is worth a round trip at the
 * top of `expectDesign` and again at the camera. The stamp is written by an init
 * script, and an init script only reaches documents opened **after** it was
 * installed: `signedIn` and `serve` install it, and every spec calls one of them
 * before it navigates — but a spec that navigated first has a page with no
 * stamp, and every navigation check in this file would then pass on it in
 * silence. A guard that cannot fail is the defect this file spends its length
 * refusing, one layer down.
 */
async function expectGuardedPage(page: Page, what: string) {
  const nav = await page.evaluate(() => window.__uiHarnessPage?.() ?? null)
  if (!nav) {
    throw new Error(
      '_harness: this page carries no harness stamp, so nothing measured on it could tell you ' +
      `whether it navigated (${what}). The stamp is written by an init script, and an init ` +
      'script only reaches documents opened after it was installed — so call `signedIn(page)` ' +
      'or `serve(page, …)` **before** navigating (every spec must anyway), and navigate with ' +
      '`visit(page, url)`, which installs it itself and pins the page it lands on.',
    )
  }
  samePage(page, { nav, value: null }, what)
}

/** The same check, standing alone, for the places that read no value. */
export async function expectSamePage(page: Page, what: string) {
  samePage(
    page,
    await page.evaluate(() => ({ nav: window.__uiHarnessPage?.() ?? null, value: null })),
    what,
  )
}

/**
 * Runs something that can fail for its own reasons, and asks *first* whether the
 * page moved before letting its failure stand.
 *
 * This is the zero-cost half: on a green run it does nothing at all. It exists
 * for the locator waits, whose failures are the most confidently wrong messages
 * in the file — a hook that vanished with the document is reported as "missing
 * measurement hook", which reads as a defect in the screen and invites someone
 * to go and add the attribute that is already there.
 */
async function orNavigated<T>(page: Page, run: Promise<T>, what: string): Promise<T> {
  try {
    return await run
  } catch (failure) {
    await expectSamePage(page, what)
    throw failure
  }
}

/**
 * Declares that *this* is the page every later measurement must be made on.
 *
 * Called for you by `visit()`. Call it yourself after a deliberate navigation —
 * a click that routes, a second `page.goto` — and never to silence a failure you
 * did not cause: re-pinning is how a spec says "the page moved and I meant it",
 * which is a claim about the spec, not a repair of the harness.
 */
export async function pinPage(page: Page, where = 'pinPage()') {
  const nav = await page.evaluate(() => window.__uiHarnessPage?.() ?? null)
  if (!nav) {
    throw new Error(
      '_harness: pinPage() found no harness stamp on this page. The stamp is installed by an ' +
      'init script, and an init script only reaches documents opened after it was added — so ' +
      'call `signedIn(page)` or `serve(page, …)` before navigating (every spec must anyway, or ' +
      '`expectEveryEndpointStubbed` fails it), or navigate with `visit(page, url)`, which ' +
      'installs it itself.',
    )
  }
  PINNED.set(page, { stamp: nav, where })
}

/**
 * Open a screen: navigate, wait for it, and pin the page to it.
 *
 * The three lines every screen spec writes, and the reason they are one line
 * here is the pin. `page.goto` on its own leaves the guard armed only from the
 * first measurement onward, so anything a spec plants *before* it measures —
 * a decoy, a probe, a mutant — sits in an unguarded window. Going through
 * `visit` closes that window.
 *
 * **The pin is taken after the screen is on the page, not after `goto` returns,
 * and that ordering is load-bearing.** This application counts one in-page
 * navigation before it has drawn anything: `createBrowserRouter` builds a
 * `createBrowserHistory`, which seeds `history.state.idx` with a `replaceState`
 * at module evaluation — measured here, the pin taken after `waitFor` reads
 * `#1` on a fresh `goto` and `#0` after a `reload`, where the seeded state
 * survives and no second seed is written. Pinning the instant `goto` resolves
 * would catch that startup `replaceState` on the wrong side of the pin and go
 * red on every green run, which is the shape of false red this whole guard
 * exists to stop being. Waiting for the screen also absorbs any redirect the
 * application makes on the way in.
 */
export async function visit(page: Page, url: string, screen?: keyof typeof DESIGN) {
  await instrument(page)
  await page.goto(url)
  if (screen !== undefined) await page.locator(`[data-screen="${screen}"]`).waitFor()
  await pinPage(page, `visit(page, '${url}')`)
}

/* ------------------------------------------------------------------ *
 * The stubs
 * ------------------------------------------------------------------ */

interface Session {
  username: string
  displayName: string
  role: string
  capabilities: string[]
  scopes: string[]
  supervisor: string | null
  canSupervise: boolean
  pendingApprovals: number
}

const EDITOR: Session = {
  username: 'editor',
  displayName: 'ویراستار',
  role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'],
  scopes: ['*'],
  supervisor: null,
  canSupervise: false,
  pendingApprovals: 0,
}

interface Stubs {
  /** pathname → JSON body */
  table: Map<string, string>
  /** every `/api/` pathname the app asked for that nothing answered */
  unstubbed: Set<string>
}

const STUBS = new WeakMap<Page, Stubs>()

/**
 * The one handler every `/api/` request goes through.
 *
 * Three defects it exists to make impossible, all three measured on this repo:
 *
 * 1. **Nothing falls through to the container.** With one `page.route` per
 *    endpoint, an endpoint a later screen forgets to stub leaves the browser
 *    and is proxied to the FastAPI container on `:8000` — which is listening,
 *    and answered. The proxy is `vite.config.ts`'s `server.proxy`, which the
 *    `vite preview` server this suite runs against inherits, so this is as true
 *    of the frozen `dist-e2e` build as it was of the dev server: do not go
 *    looking for a dev server on `:5173` when diagnosing it, there is none.
 *    A check that silently grades a live database is the drift R6 exists to
 *    catch. Anything unstubbed is aborted and **named** by
 *    `expectEveryEndpointStubbed`, which `expectDesign` and `shot` both call.
 * 2. **Query strings match.** The old form globbed `**${path}`, which does not
 *    match `/api/confirmations?department=cooking` — the exact URL
 *    `useConfirmations` fetches. Matching is on `URL.pathname`, so a query is
 *    irrelevant by construction.
 * 3. **Registration order cannot matter.** Playwright tries route handlers in
 *    *reverse* registration order — measured: of two handlers for one glob, the
 *    last registered wins — so a catch-all added after the specific routes
 *    swallows them. There is only one handler here, so there is no order.
 */
async function stubs(page: Page): Promise<Stubs> {
  const existing = STUBS.get(page)
  if (existing) return existing
  // Every spec reaches this before its `goto` — which is the one moment an init
  // script can still be installed for the document that is about to be opened.
  await instrument(page)
  const s: Stubs = { table: new Map(), unstubbed: new Set() }
  STUBS.set(page, s)
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const { pathname } = new URL(route.request().url())
      const body = s.table.get(pathname)
      if (body === undefined) {
        s.unstubbed.add(pathname)
        return route.abort()
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body })
    },
  )
  return s
}

/** Answers GET /api/auth/me so the app renders past RequireAuth. */
export async function signedIn(page: Page, over: Partial<Session> = {}) {
  const s = await stubs(page)
  s.table.set('/api/auth/me', JSON.stringify({ ...EDITOR, ...over }))
}

/**
 * Answers the read endpoints from fixtures, keyed by **pathname**.
 *
 * A key may carry a query string for readability — `'/api/confirmations?department=cooking'`
 * — but only its pathname is matched, so every query on that path gets the same
 * body. Write the fixture for the query the screen actually sends.
 */
export async function serve(page: Page, table: Record<string, unknown>) {
  const s = await stubs(page)
  for (const [key, value] of Object.entries(table)) {
    const pathname = key.split('?')[0]
    if (!pathname.startsWith('/api/')) {
      throw new Error(`serve(): \`${key}\` is not an /api/ path; nothing else is intercepted`)
    }
    if (s.table.has(pathname)) {
      throw new Error(
        `serve(): \`${pathname}\` is stubbed twice. A query string in a key is documentation, ` +
        'not a discriminator — only the pathname is matched — so the second fixture would ' +
        'silently replace the first and the request the first was written for would be ' +
        'answered with the wrong body. Write one fixture per pathname.',
      )
    }
    s.table.set(pathname, JSON.stringify(value))
  }
}

/**
 * Every `/api/` endpoint the app asked for was answered from a fixture.
 *
 * Called by `expectDesign` and by `shot`. A screen that grows a new read and
 * forgets to stub it fails here, naming the pathname, instead of quietly
 * grading whatever the container on `:8000` happened to hold.
 *
 * **A spec that registered nothing fails hardest of all.** The empty-list form
 * this used to take — `s ? [...s.unstubbed] : []` — reported a clean bill of
 * health for the one case where *nothing at all* was intercepted: no
 * `signedIn`, no `serve`, therefore no `page.route`, therefore every `/api/`
 * request leaves the browser, is proxied to the FastAPI container on `:8000`,
 * and is answered by it. The proxy that carries it there is
 * `vite.config.ts`'s `server.proxy`, which `vite preview` inherits — the run is
 * served from the frozen `dist-e2e` build, not from a dev server, and the
 * fall-through is unchanged by that. Measured on this repo: an unstubbed
 * `GET /api/pending?department=cooking` came back `401
 * {"detail":"authentication required"}` — a real response, from a real
 * database, in a check whose whole premise is that it grades the working tree.
 */
export async function expectEveryEndpointStubbed(page: Page) {
  const s = STUBS.get(page)
  if (!s) {
    throw new Error(
      'this spec registered no stubs at all — call `signedIn(page)` and `serve(page, …)` ' +
      'before `visit(page, …)`. With no page.route installed nothing is intercepted: every ' +
      '/api/ request leaves the browser and is proxied to the FastAPI container on :8000, ' +
      'which is listening and answers, so the check would be grading a live database instead ' +
      'of the working tree. (The proxy is `vite.config.ts`\'s `server.proxy`; `vite preview` ' +
      'inherits it, so the run being served from the frozen `dist-e2e` build changes nothing ' +
      'about this — there is no dev server to go looking at.)',
    )
  }
  // Before the census, because a route change is one of the ways this list grows
  // a pathname the spec never wrote: the new screen's own reads land in it, and
  // "endpoints the spec never stubbed" is then a true sentence about a page the
  // spec never opened on purpose.
  await expectSamePage(page, 'the census of unstubbed endpoints')
  expect(
    [...s.unstubbed].sort(),
    'endpoints the spec never stubbed — add them to serve()',
  ).toEqual([])
}

/* ------------------------------------------------------------------ *
 * The measurement
 * ------------------------------------------------------------------ */

/** How long a missing measurement hook is waited for before it is named. */
const HOOK_TIMEOUT = 5_000

const css = async (page: Page, selector: string, prop: string) => samePage(
  page,
  await page.locator(selector).first().evaluate(
    (el, p) => ({
      nav: window.__uiHarnessPage?.() ?? null,
      value: getComputedStyle(el).getPropertyValue(p),
    }),
    prop,
  ),
  `reading \`${prop}\` off \`${selector}\``,
)

/**
 * The opacity an element is really painted at: its own, times every ancestor's.
 *
 * Read up the tree rather than off the element, because that is where it comes
 * from — nothing sets `opacity:0` on the grid itself, it sets it on the panel
 * that is fading in around it. The first fully transparent node is named in the
 * failure, since the element the selector matched will look innocent.
 */
const paintedOpacity = async (page: Page, selector: string) => samePage(
  page,
  await page.locator(selector).first().evaluate((el) => {
    let product = 1
    let culprit: string | null = null
    for (let node: Element | null = el; node; node = node.parentElement) {
      const opacity = Number(getComputedStyle(node).opacity)
      if (Number.isFinite(opacity)) product *= opacity
      if (opacity === 0 && culprit === null) {
        const cls = node.getAttribute('class')
        culprit = `${node === el ? 'the hook itself' : 'an ancestor'}: <` +
          `${node.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}>`
      }
    }
    return { nav: window.__uiHarnessPage?.() ?? null, value: { product, culprit } }
  }),
  `reading the painted opacity of \`${selector}\``,
)

/* ------------------------------------------------------------------ *
 * Where a hook actually is, and what is painted on top of it
 * ------------------------------------------------------------------ */

/** Where a hook sits relative to the viewport, and whether anything covers it. */
interface Placement {
  /** the hook's border box, in viewport coordinates */
  rect: { left: number; top: number; right: number; bottom: number }
  viewport: { width: number; height: number }
  /** does any part of the box fall inside the viewport? */
  onScreen: boolean
  /** how far the box sticks out past each side edge; 0 when it does not */
  outLeft: number
  outRight: number
  /**
   * `null` when some point inside the box resolves to the hook with nothing
   * painted over it. Otherwise the first thing found painted on top — or, if no
   * sampled point resolved to the hook at all, a note saying so.
   */
  cover: string | null
}

/**
 * The two questions no computed property can answer: *is this on screen*, and
 * *can anything be seen of it*.
 *
 * Both were open, and both are cheap to break by accident:
 *
 * 1. **Off to the side.** `[data-col]` given `relative left-[-9999px]` keeps its
 *    declared `max-width` and its used `width` exactly — those are the two
 *    lengths the column is graded on — while the whole content column, cards and
 *    all, leaves the page. Every colour, size, radius, track count and shadow
 *    reads normally, because every one of them is computed from a box that is
 *    laid out perfectly well; it is just laid out somewhere nobody can look.
 * 2. **Painted over.** A `fixed inset-0` element with a background is one
 *    unmounted scrim away at any moment, and it renders a *completely blank*
 *    page — screenshot-verified: a solid rectangle, no text, no cards — with
 *    every assertion in this file still green.
 *
 * The cover test is a hit test, at up to five points spread through the part of
 * the box that is on screen, and it passes as soon as **one** of them reaches
 * the hook with nothing opaque in front. One is the right number: a hook only
 * needs somewhere the reader's eye can land, and requiring all five would go red
 * on any element with something legitimately layered over a corner of it.
 *
 * **`pointer-events` is forced on for the length of the probe**, and that is the
 * part that matters. `elementsFromPoint` is hit testing, hit testing honours
 * `pointer-events: none`, and the scrim above wears it — a scrim that still
 * catches clicks is a bug someone notices in a minute, so the ones that survive
 * to production are exactly the ones the naive probe cannot see. An `!important`
 * author rule beats both a class and an ordinary inline style, `pointer-events`
 * affects no layout, and the sheet is removed in a `finally` before the
 * `evaluate` returns, so nothing observes the page in the altered state.
 */
const placement = async (page: Page, selector: string): Promise<Placement> => samePage(
  page,
  await page.locator(selector).first().evaluate((el) => {
    const stamped = (value: Placement) => ({ nav: window.__uiHarnessPage?.() ?? null, value })
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const r = el.getBoundingClientRect()
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const viewport = { width: vw, height: vh }
    const x0 = Math.max(r.left, 0)
    const x1 = Math.min(r.right, vw)
    const y0 = Math.max(r.top, 0)
    const y1 = Math.min(r.bottom, vh)
    const onScreen = x1 - x0 > 0.5 && y1 - y0 > 0.5
    const outLeft = Math.max(0, -r.left)
    const outRight = Math.max(0, r.right - vw)
    if (!onScreen) return stamped({ rect, viewport, onScreen, outLeft, outRight, cover: null })

    const alphaOf = (colour: string): number => {
      const c = colour.trim()
      if (c === 'transparent') return 0
      const m = /^rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(c)
      if (!m) return 1
      return m[1] === undefined ? 1 : Number(m[1])
    }
    const paints = (n: Element): boolean => {
      const cs = getComputedStyle(n)
      if (cs.visibility === 'hidden') return false
      for (let p: Element | null = n; p; p = p.parentElement) {
        if (Number(getComputedStyle(p).opacity) === 0) return false
      }
      if (cs.backgroundImage !== 'none') return true
      if (/^(img|svg|canvas|video|iframe)$/.test(n.tagName.toLowerCase())) return true
      return alphaOf(cs.backgroundColor) > 0
    }
    const describe = (n: Element): string => {
      const cs = getComputedStyle(n)
      const cls = n.getAttribute('class')
      return `<${n.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}> ` +
        `{ position: ${cs.position}, z-index: ${cs.zIndex}, ` +
        `background-color: ${cs.backgroundColor}, background-image: ${cs.backgroundImage}, ` +
        `pointer-events: ${cs.pointerEvents} }`
    }

    const sheet = document.createElement('style')
    sheet.textContent = '*, *::before, *::after { pointer-events: auto !important }'
    document.head.append(sheet)
    let clear = false
    let culprit: Element | null = null
    try {
      const fx = [0.5, 0.25, 0.75, 0.25, 0.75]
      const fy = [0.5, 0.25, 0.25, 0.75, 0.75]
      for (let i = 0; i < fx.length; i++) {
        const stack = document.elementsFromPoint(x0 + (x1 - x0) * fx[i], y0 + (y1 - y0) * fy[i])
        const self = stack.findIndex((n) => el.contains(n))
        if (self === -1) continue
        const above = stack.slice(0, self).filter(paints)
        if (above.length === 0) {
          clear = true
          break
        }
        culprit = above[0]
      }
    } finally {
      // Before `describe`, so the report prints the element's *real*
      // `pointer-events` — "none" is the interesting half of the finding, and
      // reading it through the override would print "auto" and hide it.
      sheet.remove()
    }
    const cover = clear
      ? null
      : culprit
        ? describe(culprit)
        : 'no sampled point inside the box resolved to this element at all'
    return stamped({ rect, viewport, onScreen, outLeft, outRight, cover })
  }),
  `reading where \`${selector}\` sits, and what is painted over it`,
)

/**
 * Names a missing hook in ~5s instead of timing out for 30 inside `evaluate`,
 * and refuses to measure one that is **not on screen**.
 *
 * Attached-only was not enough. Every read here is `.first()`, so the hook the
 * harness grades is the first in document order — and twenty-one screens are
 * about to carry `max760:hidden` twins, overlays and `display:none` scaffolding
 * wearing the same attributes. A hidden element does not merely look wrong, it
 * *reads* wrong: Chrome answers a `display:none` grid's `grid-template-columns`
 * with its specified value (see `trackCount`), so a hidden one-column decoy
 * satisfied a three-column assertion. Where a screen legitimately has two
 * twins, point `grid.selector` at the one that is on screen at this width.
 *
 * **And `toBeVisible()` is not "the reader can see it".** Playwright's
 * definition is a non-empty bounding box plus no `visibility:hidden`; an
 * `opacity:0` element satisfies both. It is worse than a `display:none` twin,
 * not better: it is fully laid out, so its track list resolves to real used
 * values and every colour, size and radius reads exactly as if it were on
 * screen. Measured on this repo — an `opacity:0` wrapper holding a
 * three-column `[data-grid]`, prepended inside `[data-col]` — the departments
 * check went **green grading the decoy**. There is no `opacity-0` in `src/`
 * today; there are twenty-one screens coming, and a fade-in overlay is the
 * ordinary way to get one. So the paint is checked too.
 */
async function hook(page: Page, selector: string, what: string) {
  const el = page.locator(selector).first()
  // Both waits go through `orNavigated`, which costs nothing when they pass and
  // asks whether the page moved before letting them fail. A hook that left with
  // the document reads exactly like a hook the screen forgot to put there, and
  // "missing measurement hook" sends the reader to add an attribute that is
  // already in the source.
  await orNavigated(page, expect(
    el,
    `missing measurement hook: ${what} — nothing matches \`${selector}\``,
  ).toBeAttached({ timeout: HOOK_TIMEOUT }), `waiting for the measurement hook ${what}`)
  await orNavigated(page, expect(
    el,
    `hidden measurement hook: ${what} — \`${selector}\` resolves first to an element that is ` +
    'not visible. A hidden twin is measured with the wrong values, not skipped; give the ' +
    'visible one a distinct selector.',
  ).toBeVisible({ timeout: HOOK_TIMEOUT }), `waiting for the measurement hook ${what} to be visible`)
  const painted = await paintedOpacity(page, selector)
  expect(
    painted.product,
    `transparent measurement hook: ${what} — \`${selector}\` resolves first to an element that ` +
    `is laid out but painted at opacity 0 (${painted.culprit}). Playwright calls that visible: ` +
    'it has a box and it is not `visibility:hidden` — and because it still lays out, its grid ' +
    'tracks, colours, sizes and radii all read as if the reader could see them. A fade-in ' +
    'overlay or a `transition-opacity` twin is measured, not skipped; give the one that is ' +
    'actually painted at this width a distinct selector.',
  ).toBeGreaterThan(0)

  const p = await placement(page, selector)
  const box = `box ${JSON.stringify(p.rect)} in a ${p.viewport.width}×${p.viewport.height} viewport`

  expect(
    p.onScreen,
    `off-screen measurement hook: ${what} — no part of \`${selector}\` is inside the viewport ` +
    `(${box}). Nothing about a box that is laid out somewhere nobody can look reads as wrong: ` +
    'a column at `left:-9999px` reports the same `max-width` and the same used `width` as one ' +
    'in the middle of the page, and every colour, size, radius and track inside it is computed ' +
    'exactly as if it were on screen. If the hook is genuinely further down a long page, point ' +
    'the selector at the twin the reader meets first at this width.',
  ).toBe(true)

  expect(
    Math.max(p.outLeft, p.outRight) <= 0.5,
    `measurement hook off the side: ${what} — \`${selector}\` sticks out ` +
    `${p.outLeft > 0.5 ? `${p.outLeft.toFixed(1)}px past the left edge` : ''}` +
    `${p.outLeft > 0.5 && p.outRight > 0.5 ? ' and ' : ''}` +
    `${p.outRight > 0.5 ? `${p.outRight.toFixed(1)}px past the right edge` : ''} ` +
    `(${box}). Nothing in this application scrolls horizontally, so that part of the hook is ` +
    'not somewhere the reader can scroll to — it is sliced off. A screen that really needs a ' +
    'wider-than-viewport element must hook the scroll container, not its content.',
  ).toBe(true)

  expect(
    p.cover,
    `covered measurement hook: ${what} — every point sampled inside \`${selector}\` has ` +
    'something painted on top of it. The hook goes on computing every colour, length, radius ' +
    'and track it always did, so a scrim that failed to unmount is a solid rectangle where the ' +
    'page should be and a fully green suite. **`pointer-events: none` is not an exemption** — ' +
    'it stops the mouse, not the paint, and the probe forces hit testing on for exactly that ' +
    'reason. If this is a deliberate overlay, the spec must dismiss it before measuring the ' +
    `screen underneath it. Found: ${p.cover}`,
  ).toBe(null)
}


/* ------------------------------------------------------------------ *
 * the gutters the browser actually drew
 * ------------------------------------------------------------------ */

/** Every gap between adjacent grid items, measured off their border boxes. */
interface GridGeometry {
  items: number
  rows: number
  columnGaps: number[]
  rowGaps: number[]
}

/**
 * The distance between adjacent items, in pixels, read off the boxes.
 *
 * The computed `column-gap` is a declared length like any other, and the point
 * of this file is that declared lengths are not what a reader sees. Two things
 * this catches that the declaration cannot: a margin or a transform on the items,
 * which opens a gutter the `gap` property never mentions; and items that have
 * escaped the grid altogether, which leaves `gap` perfectly correct and nothing
 * arranged by it. The declaration is still asserted too — together they are the
 * pair, and `grid.gap` is required so a screen cannot skip both.
 *
 * Rows are grouped by the top edge the browser gave each item rather than by
 * track index, so a wrapped or auto-placed grid is read the same way a reader
 * reads it. Items taken out of flow (`position: absolute` / `fixed`) are not
 * arranged by the gutter and are left out.
 */
const gridGeometry = async (page: Page, selector: string): Promise<GridGeometry> => samePage(
  page,
  await page.locator(selector).first().evaluate((el) => {
    const round = (n: number) => Math.round(n * 100) / 100
    const boxes = Array.from(el.children)
      .filter((c) => {
        const cs = getComputedStyle(c)
        return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed'
      })
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    const tops = [...new Set(boxes.map((b) => Math.round(b.top)))].sort((a, b) => a - b)
    const rows = tops.map((t) =>
      boxes.filter((b) => Math.round(b.top) === t).sort((a, b) => a.left - b.left))
    const columnGaps: number[] = []
    for (const row of rows) {
      for (let i = 1; i < row.length; i++) columnGaps.push(round(row[i].left - row[i - 1].right))
    }
    const rowGaps: number[] = []
    for (let i = 1; i < rows.length; i++) {
      const above = Math.max(...rows[i - 1].map((b) => b.bottom))
      rowGaps.push(round(Math.min(...rows[i].map((b) => b.top)) - above))
    }
    return {
      nav: window.__uiHarnessPage?.() ?? null,
      value: { items: boxes.length, rows: rows.length, columnGaps, rowGaps },
    }
  }),
  `measuring the gutters the browser drew inside \`${selector}\``,
)

/* ------------------------------------------------------------------ *
 * every run of type on the screen, against what is behind it
 * ------------------------------------------------------------------ */

/** One run of type, with the colour it is painted in and the colour behind it. */
interface TextRun {
  ratio: number
  color: string
  background: string
  fontSize: string
  text: string
  where: string
  /** a gradient or image is in the stack, so `background` is an approximation */
  approximate: boolean
}

/**
 * Every run of type inside the screen, with its contrast against what is painted
 * behind it.
 *
 * **Every run, not only the hooked ones, and that is the whole point.** The
 * `DESIGN` row names two pieces of type — the H1 and the body line — and grades
 * their colours exactly. The mutation that opened this hole was on neither: a
 * card *title*, `text-ink` → `text-bg`, cream on a cream card, every title on
 * the screen gone, and there is no version of this file where twenty-one screens
 * hook every title, label, chip and caption they draw. So nothing is enumerated:
 * anything with a text node under `[data-screen]` is read, and `contrastWaived`
 * is the only way out.
 *
 * The background is composited **from the first fully opaque ancestor inward**,
 * which is what the compositor does: a card with a solid background hides
 * whatever the page paints beneath it, so the search stops there and a field
 * colour four ancestors up cannot be mistaken for the thing behind the text. A
 * translucent layer under the text is composited over the layer beneath it, in
 * order, and the text's own colour is composited over the result — so
 * `text-white/70` is graded at the colour it is actually painted, not at white.
 *
 * Known blind spot, stated rather than hidden: where a gradient or an image is
 * in the stack, the colour is an approximation and the row is flagged
 * `approximate`. Type over a photograph is not gradable this way; waive it.
 */
const textRuns = async (page: Page, root: string, waived: readonly string[]) => samePage(
  page,
  await page.locator(root).first().evaluate(
    (el, waivers: string[]) => {
      const parse = (colour: string): number[] | null => {
        const c = colour.trim()
        if (c === 'transparent') return [0, 0, 0, 0]
        const m =
          /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(c)
        if (!m) return null
        return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
      }
      const over = (top: number[], bottom: number[]): number[] => {
        const a = top[3] + bottom[3] * (1 - top[3])
        if (a === 0) return [0, 0, 0, 0]
        const mix = (i: number) =>
          (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a
        return [mix(0), mix(1), mix(2), a]
      }
      const luminance = (c: number[]): number => {
        const channel = (v: number) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])
      }
      const contrast = (a: number[], b: number[]) => {
        const la = luminance(a)
        const lb = luminance(b)
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
      }

      const deadWaivers = waivers.filter(
        (s) => !el.matches(s) && el.querySelector(s) === null)
      const runs: TextRun[] = []
      for (const n of [el, ...Array.from(el.querySelectorAll('*'))]) {
        const writes = Array.from(n.childNodes)
          .some((c) => c.nodeType === 3 && (c.textContent ?? '').trim() !== '')
        if (!writes) continue
        if (waivers.some((s) => n.closest(s) !== null)) continue
        const cs = getComputedStyle(n)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const box = n.getBoundingClientRect()
        // `sr-only` type is a 1×1 clipped box. It is not painted, so it is not graded.
        if (box.width < 2 || box.height < 2) continue
        let opacity = 1
        for (let p: Element | null = n; p; p = p.parentElement) {
          opacity *= Number(getComputedStyle(p).opacity)
        }
        if (opacity === 0) continue

        const stack: CSSStyleDeclaration[] = []
        for (let p: Element | null = n; p; p = p.parentElement) {
          const s = getComputedStyle(p)
          stack.push(s)
          const c = parse(s.backgroundColor)
          if (c && c[3] >= 1) break
        }
        let approximate = false
        let background = [255, 255, 255, 1]
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].backgroundImage !== 'none') approximate = true
          const c = parse(stack[i].backgroundColor)
          if (c && c[3] > 0) background = over(c, background)
        }
        const declared = parse(cs.color)
        if (!declared) continue
        const painted = over(declared, background)
        const cls = n.getAttribute('class')
        runs.push({
          ratio: Math.round(contrast(painted, background) * 100) / 100,
          color: cs.color,
          background: `rgb(${background.slice(0, 3).map((v) => Math.round(v)).join(', ')})`,
          fontSize: cs.fontSize,
          text: (n.textContent ?? '').trim().slice(0, 30),
          where: `<${n.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}>`,
          approximate,
        })
      }
      return { nav: window.__uiHarnessPage?.() ?? null, value: { runs, deadWaivers } }
    },
    [...waived],
  ),
  `reading every run of type inside \`${root}\``,
)

/* ------------------------------------------------------------------ *
 * §8's scroll box — the one root a Persian screen may write `ltr` on
 * ------------------------------------------------------------------ */

/** Whether the screen root is §8's scroll box, and which children escaped it. */
interface ScrollBox {
  /** the root carries `data-r-pad`, the selector §8's rule actually targets */
  isPad: boolean
  /** immediate element children that did **not** come back to `rtl` */
  escaped: string[]
}

/**
 * The two halves of `[data-r-pad]{direction:ltr} [data-r-pad] > *{direction:rtl}`.
 *
 * Read only when the root computes `ltr`, which on a Persian application is
 * either §8's scroll box or the whole page mirrored — and nothing else this
 * file measures can tell those apart. `isPad` separates them by the attribute
 * the stylesheet rule is written against, and `escaped` proves the half that
 * makes the box harmless: **every** immediate child came back, not just the one
 * that happens to be hooked.
 *
 * `el.children` is elements only, so text nodes and comments are not candidates
 * — and they are not, because `direction` on a text node is its parent's.
 */
const scrollBox = async (page: Page, selector: string): Promise<ScrollBox> => samePage(
  page,
  await page.locator(selector).first().evaluate((el) => ({
    nav: window.__uiHarnessPage?.() ?? null,
    value: {
      isPad: el.hasAttribute('data-r-pad'),
      escaped: Array.from(el.children)
        .filter((child) => getComputedStyle(child).direction !== 'rtl')
        .map((child) => {
          const cls = child.getAttribute('class')
          return `<${child.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}>`
        }),
    },
  })),
  `reading §8's scroll-box contract on \`${selector}\``,
)

/* ------------------------------------------------------------------ *
 * focus
 * ------------------------------------------------------------------ */

/** Everything that can carry a focus indicator, read in one pass. */
interface FocusState {
  borderColor: string
  borderWidth: string
  outlineStyle: string
  outlineColor: string
  outlineWidth: string
  shadow: string
  /**
   * Whether Chrome would paint `base.css`'s F11 ring for this element right
   * now. Not an indicator in itself — it is the *permission* for one, and it is
   * the thing a mouse click takes away. Carried in the state so a failure
   * prints it: "focusVisible: false" is the difference between "this screen has
   * no focus style" and "this check focused it like a mouse".
   */
  focusVisible: boolean
}

const focusState = async (page: Page, selector: string): Promise<FocusState> => samePage(
  page,
  await page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      nav: window.__uiHarnessPage?.() ?? null,
      value: {
        borderColor: cs.getPropertyValue('border-top-color'),
        borderWidth: cs.getPropertyValue('border-top-width'),
        outlineStyle: cs.getPropertyValue('outline-style'),
        outlineColor: cs.getPropertyValue('outline-color'),
        outlineWidth: cs.getPropertyValue('outline-width'),
        shadow: cs.getPropertyValue('box-shadow'),
        focusVisible: el.matches(':focus-visible'),
      },
    }
  }),
  `reading the focus state of \`${selector}\``,
)

/**
 * A key press whose only job is to tell Chrome the user is on the keyboard.
 *
 * `Shift` and not `Tab`: Tab moves focus somewhere the check does not control,
 * and `Control`/`Meta` do not work — Blink ignores a keydown that carries a
 * shortcut modifier when it decides focus modality, measured here (`Control`
 * leaves `:focus-visible` false, `Shift` sets it true). A bare `Shift` keydown
 * moves no focus, scrolls nothing, types nothing and closes nothing.
 */
const KEYBOARD_MODALITY = 'Shift'

/** A border that is actually drawn, in the focus colour. */
const coralBorder = (s: FocusState) =>
  s.borderColor === FOCUS && parseFloat(s.borderWidth) > 0

/** A ring that is actually drawn — `outline-none` is a *transparent* outline. */
const paintsRing = (s: FocusState) =>
  s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && !transparent(s.outlineColor)

/**
 * Focusing this control raises a coral indicator, and nothing else.
 *
 * **This is the assertion that had never run.** No `DESIGN` row set `focus` and
 * no spec exercised it, so the branch was furniture — and measured against the
 * two focus idioms that exist in `src/`, the version it replaced could not pass
 * on either:
 *
 * | | `<input … outline-none focus:border-coral>` (21 sites) | `<button>` (`Button.tsx`, coral) |
 * |---|---|---|
 * | `border-top-color` on focus | `rgb(250, 90, 82)` ✓ | `rgb(229, 231, 235)` at **0px** — `border-0` ✗ |
 * | `shadowOf(box-shadow)` | `none` ✓ | `rgba(250, 90, 82, 0.9) 0px 12px 26px -12px` (`shadow-coral`, at rest too) ✗ |
 * | `outline` on focus | `solid 2px rgba(0, 0, 0, 0)` — Tailwind's `outline-none` beats `base.css` ✗ | `solid 3px rgb(250, 90, 82)` ✓ |
 *
 * A "coral border, no box-shadow, coral outline" rule goes red on every real
 * control in the repo, and the cheap repair — weakening it — would have been
 * enshrined twenty-one times. So the assertion is the guarantee that is
 * genuinely true of both, and it is written as a **difference**, which is what
 * makes it able to fail:
 *
 * 1. focus raises a coral indicator — the design's border (§4.6:
 *    `border-color:#FA5A52`, 15 of 15 declarations) **or** the app-wide ring
 *    `base.css` F11 adds for keyboard users (`outline: 3px solid var(--coral)`);
 * 2. it was **not** there at rest, so a permanently coral control cannot pass;
 * 3. nothing non-coral appears with it — no second focus idiom;
 * 4. no glow is *added*: `shadowOf` must be unchanged, which holds a button's
 *    resting `shadow-coral` harmless while still killing a `focus:shadow-…`.
 *
 * It then blurs, and requires the indicator to go away — otherwise `shot()`
 * would photograph a focus ring the design does not draw, which is exactly the
 * defect I5 fixed for hover.
 *
 * ### The control is focused the way a *keyboard* user focuses it
 *
 * `el.focus()` alone is not enough, and the way it fails is the worst way an
 * assertion can fail: it is a false **red**. F11's ring is a `:focus-visible`
 * rule, and Chrome only grants `:focus-visible` on a scripted `.focus()` when
 * the last thing the user did was a keyboard thing. Measured here: click *any*
 * control with the mouse, then `.focus()` a `<Button>`-shaped one, and its at-
 * rest and focused states are byte-identical — `outline-style: none`,
 * `:focus-visible` false — so this check reports "draws no coral indicator" on
 * a control whose indicator is perfectly correct. A screen spec that opens a
 * menu, dismisses a toast or types in a filter before calling `expectDesign`
 * would meet that red, be told by §4 not to weaken the assertion, and add a
 * focus style the design never asked for. Twenty-one times.
 *
 * So the modality is set before the focused state is read: one `Shift` keydown,
 * which moves no focus and types nothing (see `KEYBOARD_MODALITY`). What the
 * check then measures is what a person tabbing through the screen sees, which
 * is what F11 is *about*. **A spec is free to use the mouse first.**
 */
export async function expectFocusIndicator(page: Page, selector: string, label: string) {
  // Ahead of the first read, because this one is called directly by specs as
  // well as through `expectDesign`'s `hook`. A control that left with the
  // document is not a control that is missing a focus style: without this, the
  // locator below waits for an element that will never come and the test dies
  // of a timeout with nothing in it that says why.
  await expectSamePage(page, `looking for the focus target \`${selector}\``)
  const el = page.locator(selector).first()
  const rest = await focusState(page, selector)

  await el.focus()
  await orNavigated(
    page,
    expect(el, `${label}: \`${selector}\` did not take focus — is it focusable?`).toBeFocused(),
    `focusing \`${selector}\``,
  )
  await page.keyboard.press(KEYBOARD_MODALITY)
  // The focused state ONCE IT HAS STOPPED MOVING. Every field in this codebase
  // transitions its focus border at `--duration` (.16s, ledger L-18), so a single
  // read lands mid-tween — measured on the process list at 1440,
  // `rgb(230, 197, 221)`, between `--line` and `--coral`, and a different colour
  // on every run. `harness.spec.ts`'s FIELD_IDIOM probe is the PRE-REBUILD inline
  // input, which carried no `transition`, which is why this self-test never met
  // the case: `processList` is the first DESIGN row ever to set `focus`.
  //
  // Settling is not asserting. This waits for two consecutive reads to AGREE and
  // says nothing about WHICH value they agree on, so every clause below is still
  // reached and can still fail.
  let prev = await focusState(page, selector)
  let held = prev
  await expect
    .poll(async () => {
      const now = await focusState(page, selector)
      const still = now.borderColor === prev.borderColor
        && now.borderWidth === prev.borderWidth
        && now.outlineColor === prev.outlineColor
        && now.outlineWidth === prev.outlineWidth
        && now.outlineStyle === prev.outlineStyle
        && now.shadow === prev.shadow
      prev = now
      held = now
      return still
    }, {
      message: `${label}: \`${selector}\`'s focus indicator never stopped changing`,
      timeout: HOOK_TIMEOUT,
    })
    .toBe(true)

  const seen = ` (at rest ${JSON.stringify(rest)}; focused ${JSON.stringify(held)})`

  expect(
    held.focusVisible,
    `${label}: \`${selector}\` is focused, but Chrome does not consider it \`:focus-visible\`, ` +
    'so `base.css`\'s F11 ring is not painted and a control whose only indicator is that ring ' +
    'would be reported as having none. **This is a fault in the harness, not in the screen** — ' +
    `the \`${KEYBOARD_MODALITY}\` press above exists to set the keyboard modality and something ` +
    'has stopped it working. Do not add a focus style to the screen to make this go away.' + seen,
  ).toBe(true)
  const borderChanged = held.borderColor !== rest.borderColor || held.borderWidth !== rest.borderWidth
  const ringChanged = held.outlineColor !== rest.outlineColor ||
    held.outlineStyle !== rest.outlineStyle || held.outlineWidth !== rest.outlineWidth

  expect(
    coralBorder(held) || (paintsRing(held) && held.outlineColor === FOCUS),
    `${label}: focusing \`${selector}\` draws no coral indicator — §4.6's coral border, or the ` +
    'coral ring base.css F11 adds, must appear. Note that Tailwind\'s `outline-none` is a ' +
    'transparent 2px outline that beats the F11 rule, so a control wearing it must bring its ' +
    'own `focus:border-coral`.' + seen,
  ).toBe(true)

  expect(
    borderChanged || ringChanged,
    `${label}: nothing changed when \`${selector}\` took focus — the indicator this asserts is ` +
    'already there at rest, so the assertion cannot fail and is not an indicator.' + seen,
  ).toBe(true)

  if (borderChanged) {
    expect(held.borderColor, `${label}: focus border colour`).toBe(FOCUS)
  }
  if (paintsRing(held)) {
    expect(held.outlineColor, `${label}: focus ring colour`).toBe(FOCUS)
  }
  expect(
    shadowOf(held.shadow),
    `${label}: focus added a glow — §4.6 declares none (the resting shadow is allowed to stay)`,
  ).toBe(shadowOf(rest.shadow))

  // Leave the control as it was found: `shot()` runs after `expectDesign`, and
  // a still-focused control would put a 3px coral ring in every reference image.
  await el.blur()
  await expect
    .poll(async () => {
      const after = await focusState(page, selector)
      return coralBorder(after) || paintsRing(after)
    }, {
      message: `${label}: \`${selector}\` still shows a focus indicator after blur`,
      timeout: HOOK_TIMEOUT,
    })
    .toBe(false)
}

/** Asserts the screen's computed values against the design's numbers. */
export async function expectDesign(page: Page, screen: keyof typeof DESIGN) {
  const d: ScreenDesign = DESIGN[screen]
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('_harness: the running project declares no viewport')
  const w = viewport.width
  const at = <T>(v: PerWidth<T>): T => atWidth(w, v)

  // Before anything is measured: see `expectGuardedPage`. Everything below can
  // notice a navigation only because this page was stamped on the way in.
  await expectGuardedPage(page, `grading the ${screen} screen`)

  const root = `[data-screen="${screen}"]`
  /**
   * Every content hook is resolved **inside the screen**, never document-wide.
   *
   * `data-screen` was the only namespaced selector; the other four were global.
   * Measured: adding a `data-body` to `PanelShell`'s topbar made the departments
   * check read the topbar's 22px instead of the screen's 14px. It went red there
   * — the dangerous case is the stray hook whose value happens to match, which
   * would grade the wrong element in silence. Twenty-one screens are about to
   * add these hooks, some behind overlays that co-exist with a screen.
   */
  const within = (selector: string) => `${root} ${selector}`

  /**
   * The graded hooks, in the order they are measured. Every one gets the
   * `direction` check; see `ScreenDesign.direction` for why the focus and lift
   * targets do not.
   *
   * `hook` is the stable name the row's `direction` record is keyed by, and it
   * is carried beside `what` rather than parsed back out of it: `what` is
   * whatever reads best in a failure — `data-h1`, or the row's own grid selector
   * — and keying an override off a human-readable string is how a renamed
   * message silently turns an override into a no-op.
   */
  const graded: { hook: ContentHook | 'screen'; what: string; selector: string }[] = []
  const grade = async (hook_: ContentHook, what: string, selector: string) => {
    await hook(page, selector, what)
    graded.push({ hook: hook_, what, selector })
  }

  await orNavigated(
    page,
    expect(page.locator(root), `${screen}: \`${root}\` is not visible`).toBeVisible(),
    `waiting for \`${root}\``,
  )
  graded.push({ hook: 'screen', what: 'data-screen', selector: root })

  expect(await css(page, root, 'background-color'), `${screen}: field`).toBe(at(d.field))

  const col = within('[data-col]')
  await grade('col', 'data-col', col)
  expect(await css(page, col, 'max-width'), `${screen}: column max-width`).toBe(at(d.column))
  // The one width-dependent assertion. See `ByWidth` above for why it exists.
  expect(await css(page, col, 'width'), `${screen}: column used width at ${w}px`)
    .toBe(atWidth(w, d.columnWidth))

  const pad = expandPadding(at(d.padding))
  expect(await css(page, root, 'padding-top'), `${screen}: padding-top`).toBe(pad.top)
  expect(await css(page, root, 'padding-right'), `${screen}: padding-right`).toBe(pad.right)
  expect(await css(page, root, 'padding-bottom'), `${screen}: padding-bottom`).toBe(pad.bottom)
  expect(await css(page, root, 'padding-left'), `${screen}: padding-left`).toBe(pad.left)

  /**
   * The two inherited properties, graded on every run of type this row names.
   *
   * Neither is declared anywhere in `src/` — the family comes from `base.css`'s
   * one `body` rule and the direction from `index.html` — which is precisely why
   * neither had ever been measured, and precisely why breaking either one costs
   * nothing to do and shows up in nothing this file used to read.
   */
  const type = async (what: string, selector: string, m: Measured) => {
    expect(await css(page, selector, 'font-family'), `${screen}: ${what} font-family`)
      .toBe(at(m.family ?? FONT_SANS))
    expect(await css(page, selector, 'text-align'), `${screen}: ${what} text-align`)
      .toBe(at(m.align ?? 'start'))
  }

  const h1 = within('[data-h1]')
  await grade('h1', 'data-h1', h1)
  expect(await css(page, h1, 'font-size'), `${screen}: h1 size`).toBe(at(d.h1.size))
  expect(await css(page, h1, 'font-weight'), `${screen}: h1 weight`).toBe(at(d.h1.weight))
  expect(await css(page, h1, 'color'), `${screen}: h1 colour`).toBe(at(d.h1.color))
  await type('h1', h1, d.h1)

  const body = within('[data-body]')
  await grade('body', 'data-body', body)
  expect(await css(page, body, 'font-size'), `${screen}: body size`).toBe(at(d.body.size))
  expect(await css(page, body, 'color'), `${screen}: body colour`).toBe(at(d.body.color))
  if (d.body.weight !== undefined) {
    expect(await css(page, body, 'font-weight'), `${screen}: body weight`).toBe(at(d.body.weight))
  }
  await type('body', body, d.body)

  if (d.grid) {
    const grid = within(d.grid.selector ?? '[data-grid]')
    await grade('grid', d.grid.selector ?? 'data-grid', grid)
    const tracks = await css(page, grid, 'grid-template-columns')
    expect(trackCount(tracks), `${screen}: grid columns at ${w}px (grid-template-columns: ${tracks})`)
      .toBe(atWidth(w, d.grid.columns))

    const gap = at(d.grid.gap)
    expect(await css(page, grid, 'column-gap'), `${screen}: grid column-gap`).toBe(gap)
    expect(await css(page, grid, 'row-gap'), `${screen}: grid row-gap`).toBe(gap)

    const g = await gridGeometry(page, grid)
    expect(
      g.items,
      `${screen}: the grid has no items to arrange, so its gutter is unproved. A fixture that ` +
      'serves an empty list makes every geometric check in this block vacuously true — serve ' +
      'enough rows to fill more than one cell.',
    ).toBeGreaterThan(0)
    if (g.items > 1) {
      expect(
        g.columnGaps.length + g.rowGaps.length,
        `${screen}: ${g.items} grid items and not one pair adjacent to another (${g.rows} row(s) ` +
        'by the top edges the browser gave them). Items that are not arranged by the grid leave ' +
        '`gap` reading correctly and nothing arranged by it.',
      ).toBeGreaterThan(0)
    }
    const want = parseFloat(gap)
    const drawn = [...g.columnGaps, ...g.rowGaps]
    expect(
      drawn.filter((v) => Math.abs(v - want) > 0.5),
      `${screen}: the gutters the browser drew between adjacent items are not ${gap} ` +
      `(column ${JSON.stringify(g.columnGaps)}, row ${JSON.stringify(g.rowGaps)}, across ` +
      `${g.rows} row(s) of ${g.items} items). The declared \`gap\` above agreed, so this is a ` +
      'margin, a transform or an item that is not in the grid — none of which the declaration ' +
      'can see.',
    ).toEqual([])
  }

  if (d.card) {
    const c = d.card
    const card = within('[data-card]')
    await grade('card', 'data-card', card)
    if (c.radius !== undefined) {
      expect(await css(page, card, 'border-top-left-radius'), `${screen}: card radius`)
        .toBe(at(c.radius))
    }
    if (c.shadow !== undefined) {
      expect(shadowOf(await css(page, card, 'box-shadow')), `${screen}: card shadow`)
        .toBe(at(c.shadow))
    }
    if (c.border !== undefined) {
      expect(await css(page, card, 'border-top-color'), `${screen}: card border colour`)
        .toBe(at(c.border))
      expect(await css(page, card, 'border-top-width'), `${screen}: card border width`).toBe('1px')
    }
    expect(await css(page, card, 'background-color'), `${screen}: card background`)
      .toBe(at(c.background))
  }

  /* ---- direction, per hook. See `ScreenDesign.direction`. ---- */
  const overrides = d.direction ?? {}
  const overridden = Object.keys(overrides) as ContentHook[]

  // Both halves of "a deviation must be real". An override on a hook this row
  // does not grade cannot ever fire, and one that restates `rtl` announces a
  // deviation there is none of — either way a reviewer reads a claim the run
  // does not make. Same rule, and the same reason, as `contrastWaived`.
  const gradedHooks = new Set(graded.map((g) => g.hook))
  expect(
    overridden.filter((h) => !gradedHooks.has(h)),
    `${screen}: \`direction\` names hooks this row does not grade. An override on a hook that ` +
    'is never measured is a sentence in the row that nothing keeps honest — delete it, or add ' +
    'the hook it was written for.',
  ).toEqual([])
  expect(
    overridden.filter((h) => WIDTHS.every((w) => atWidth(w, overrides[h]!) === RTL)),
    `${screen}: \`direction\` names a hook and then states the default. Every hook is \`rtl\` ` +
    'unless the row says otherwise, so this reads as a deviation and is not one; the next ' +
    'person to change that element will trust it. Delete the entry.',
  ).toEqual([])

  for (const { hook: which, what, selector } of graded) {
    const drawn = await css(page, selector, 'direction')

    if (which === 'screen') {
      // The root's rule is §8's, not the row's: `rtl`, or `ltr` proved to be
      // the scroll box. `rtl` is the ordinary answer and costs nothing.
      if (drawn === RTL) continue
      const box = await scrollBox(page, root)
      expect(
        box.isPad,
        `${screen}: data-screen direction — the application is Persian and every screen ` +
        'inherits `rtl` from `index.html`, so nothing declares it and nothing used to measure ' +
        'it. This root computes `ltr` and it is **not** §8\'s scroll box: it carries no ' +
        '`data-r-pad`, so no rule flips its children back and the whole page is mirrored — ' +
        'headings to the other margin, cards in the reverse order, chevrons pointing the wrong ' +
        'way, the sentence-final period on the wrong side — while no length, colour, weight, ' +
        'radius or track count in this file moves. The scroll box is the one legal LTR root and ' +
        'it has to prove itself; see `ScreenDesign.direction`.',
      ).toBe(true)
      expect(
        box.escaped,
        `${screen}: data-screen direction — this root is §8's scroll box (\`data-r-pad\`, ` +
        '`direction:ltr` so the scrollbar sits on the right), but the rule that flips its ' +
        'children back did not reach all of them, so those subtrees are mirrored. That is the ' +
        'O1 defect verbatim: the attribute form flipped back the one child somebody remembered ' +
        'and every dialog mounted beside it stayed LTR, which is the workaround five files in ' +
        '`src/write/` each carry a comment about. The rule is `[data-r-pad] > * { direction: ' +
        'rtl }` and it has to be the rule, not two attributes. An island that really must read ' +
        'LTR nests one level deeper, inside `[data-col]`, as every other LTR island in this ' +
        'codebase does.',
      ).toEqual([])
      continue
    }

    expect(
      drawn,
      `${screen}: ${what} direction — the application is Persian and every screen inherits ` +
      '`rtl` from `index.html`, so nothing declares it and nothing used to measure it. A `dir` ' +
      'inside the column mirrors everything under it — headings to the other margin, cards in ' +
      'the reverse order, chevrons pointing the wrong way, the sentence-final period on the ' +
      'wrong side — and moves no length, colour, weight, radius or track count in this file. ' +
      `If the flip is deliberate — a latin id, a phone number, a mono username — say so as ` +
      `\`direction: { ${which}: 'ltr' }\` in the row, where a reviewer reads it. Do not state ` +
      'it for the whole row: that would excuse a mirrored page as well as a latin word.',
    ).toBe(at<'rtl' | 'ltr'>(overrides[which] ?? RTL))
  }

  const { runs, deadWaivers } = await textRuns(page, root, d.contrastWaived ?? [])
  expect(
    deadWaivers,
    `${screen}: \`contrastWaived\` names selectors that match nothing on the screen. A waiver ` +
    'that has outlived the element it was written for is a hole nobody decided to open — ' +
    'delete it, or point it at what it was meant to cover.',
  ).toEqual([])
  expect(
    runs.length,
    `${screen}: the census found no type at all inside \`${root}\`, so it graded nothing. ` +
    'Either the screen rendered empty or every run is waived.',
  ).toBeGreaterThan(0)
  expect(
    runs.filter((r) => r.ratio < LEGIBLE),
    `${screen}: type the reader cannot see. Each row below is a run of text and the colour ` +
    `painted behind it; anything under ${LEGIBLE}:1 is invisible rather than merely dim. This ` +
    'is not an accessibility gate — see `LEGIBLE` — it is the check that notices a title ' +
    'painted in its own background colour, or a card repainted the colour of the field it sits ' +
    'on. Rows flagged `approximate` sit over a gradient or an image, where a single background ' +
    'colour is a guess. Decoration that is meant to be nearly invisible goes in the row\'s ' +
    '`contrastWaived`.',
  ).toEqual([])

  if (d.focus) {
    const target = within(d.focus)
    await hook(page, target, `focus target \`${d.focus}\``)
    await expectFocusIndicator(page, target, `${screen}: focus`)
  }

  if (d.lift) {
    const target = within(d.lift)
    await hook(page, target, `lift target \`${d.lift}\``)
    const el = page.locator(target).first()
    expect(await css(page, target, 'transform'), `${screen}: transform at rest`).toBe('none')
    await el.hover()
    await expect
      .poll(() => css(page, target, 'transform'), { message: `${screen}: transform on hover` })
      .toBe(LIFT)
    // Put the pointer back where it was found. Two things depended on that and
    // neither got it: a second `expectDesign` call on the same page read the
    // inherited hover as the resting transform, and `shot()` — which parks the
    // pointer itself but only after this ran — had to undo it. Polling the
    // transform back to `none` rather than only moving the mouse also proves
    // the lift is released, which a one-way check never did.
    await page.mouse.move(0, 0)
    await expect
      .poll(() => css(page, target, 'transform'), {
        message: `${screen}: the lift did not release when the pointer left. The pointer is ` +
          'parked at (0, 0); a screen that reaches the top-left corner must park it elsewhere.',
        timeout: HOOK_TIMEOUT,
      })
      .toBe('none')
  }

  await expectEveryEndpointStubbed(page)
}

/**
 * `contextOptions.reducedMotion` is really set.
 *
 * This is asserted rather than assumed because the setting that grants it is an
 * easy one to write inertly. `reducedMotion` is a BrowserContext option; put at
 * the top level of `use` — beside `viewport`, where it reads perfectly natural —
 * @playwright/test 1.61 ignores it and every run still goes green with the
 * media query false. Measured on this repo before the config was corrected.
 *
 * What it does **not** prove is that nothing moves: `src/` defines zero
 * `prefers-reduced-motion` rules (measured: 0 in every stylesheet in the page),
 * so the media feature changes nothing the app paints — a card's
 * `transition-duration` is still `0.16s` under it. Freezing the page for the
 * camera is `animations: 'disabled'` on the screenshot itself; see `shot`.
 */
export async function expectReducedMotion(page: Page) {
  const reduced = samePage(
    page,
    await page.evaluate(() => ({
      nav: window.__uiHarnessPage?.() ?? null,
      value: matchMedia('(prefers-reduced-motion: reduce)').matches,
    })),
    'reading `prefers-reduced-motion`',
  )
  expect(
    reduced,
    'playwright.config.ts must set use.contextOptions.reducedMotion = "reduce"',
  ).toBe(true)
}

/**
 * Everything inside a screen that the pointer is currently over.
 *
 * A fixed tag list — `[data-card]`, `a`, `button`, `[role=button]`, `input`,
 * `select`, `textarea` — was the wrong shape for this: the app's hover styles
 * are Tailwind `hover:` utilities, and they go on whatever element the design
 * needs, most often a `<div>`. A hovered `<div class="hover:bg-tile-v2">` sat
 * under the shutter uncounted. Which element is hovered is not knowable from
 * its tag, so nothing is enumerated — `:hover` is asked directly, and every
 * descendant under the pointer answers.
 */
const HOVERED = '[data-screen] :hover'

const hoveredCount = async (page: Page) => samePage(
  page,
  await page.evaluate(
    (sel) => ({
      nav: window.__uiHarnessPage?.() ?? null,
      value: document.querySelectorAll(sel).length,
    }),
    HOVERED,
  ),
  'counting what the pointer is over',
)

/**
 * A screenshot at the running project's width, for comparison against ui/design/.
 *
 * **Deliberately a `page.screenshot`, not a `toHaveScreenshot`, and it is not a
 * gate.** Pixel comparison is the obvious answer to "the page looks wrong" and
 * neither baseline it could use is sound here:
 *
 * - `ui/design/` is hand-written HTML with a different DOM, different class
 *   names and different fonts loaded a different way. It is what the screens are
 *   *drawn from*, not a rendering of them; a diff against it is red on every
 *   screen, forever, for reasons that are not defects.
 * - A **self**-baseline — commit today's render, compare tomorrow's — freezes
 *   whatever the page looks like the moment the baseline is taken. This screen's
 *   card is the wrong colour, its grid does not collapse and its padding has no
 *   mobile variant; all three are recorded above as things Task 14 fixes. A
 *   self-baseline would turn every one of those into an approved reference and
 *   go red on the commit that *corrects* them.
 *
 * So the composition checks above are structural instead: each one names the
 * thing it is asserting — this hook is on screen, nothing is painted over it,
 * the page reads right to left, this type can be seen against what is behind it,
 * the gutter the browser drew is the gutter the design asked for. They fail with
 * a sentence rather than a diff image, they say which property moved, and they
 * are the same at all three widths without three sets of reference pixels. The
 * image this writes is for a human to look at; nothing compares it.
 */
export async function shot(page: Page, name: string) {
  await expectReducedMotion(page)
  await expectEveryEndpointStubbed(page)

  // The camera's two preconditions, both of which the first cut of this file
  // stated and neither of which it obtained.
  //
  // 1. Nothing is hovered. `expectDesign`'s `lift` check used to end with the
  //    pointer on card 1 and never move it — so every reference image the
  //    screen tasks compare against `ui/design/` differed from the design by
  //    one lifted, hover-shadowed tile. Measured: `{ hovered: true, transform:
  //    matrix(1, 0, 0, 1, 0, -2) }` at the moment the shutter fired.
  //    `expectDesign` now restores the pointer itself; this stays because
  //    `shot()` may be called without it, and because the census below is a
  //    stronger claim than "the mouse was moved".
  await page.mouse.move(0, 0)
  await expect
    .poll(() => hoveredCount(page), {
      message:
        'something inside [data-screen] is still :hover at the moment of the screenshot. ' +
        'The pointer is parked at (0, 0); a screen that reaches the top-left corner must ' +
        'park it somewhere else before calling shot().',
      timeout: HOOK_TIMEOUT,
    })
    .toBe(0)

  // 2. Nothing is mid-transition. `page.screenshot` defaults to
  //    `animations: 'allow'` — only `toHaveScreenshot` disables them — and the
  //    app reads `prefers-reduced-motion` nowhere, so a transform was sampled
  //    mid-flight at `matrix(1, 0, 0, 1, 0, -0.298916)`.
  // The camera reads the whole page and returns nothing this file can grade, so
  // the one measurement that cannot fold the stamp into its own call pays for a
  // round trip. A screenshot of a page that moved is a picture of another
  // screen, filed under this screen's name in `e2e/__shots__/`.
  await expectGuardedPage(page, 'the screenshot')
  const width = page.viewportSize()?.width ?? 0
  await page.screenshot({
    path: `e2e/__shots__/${name}-${width}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}
