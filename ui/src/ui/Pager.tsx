import { Icon } from './Icon'
import { toFa } from '../lib/format'

export interface PagerProps {
  from: number
  to: number
  count: number
  page: number
  pages: number
  onPage: (next: number) => void
}

/**
 * §5.2 — 34×34, a 1.5px `--line` edge, radius 10, the glyph in `--violet`.
 *
 * The `before:` box is the invisible 44px hit area (see `expectExpandedHitArea`
 * in src/test/a11y.ts): 34 + 2×5 = 44. It changes nothing that is painted,
 * which is why the design has no opinion about it — and why the drawn box stays
 * the design's 34 rather than being inflated to the floor.
 */
const NAV =
  'relative before:absolute before:content-[""] before:-inset-[5px] ' +
  'w-pager h-pager inline-flex items-center justify-center flex-none ' +
  'bg-card text-violet border-hairline border-line rounded-control cursor-pointer ' +
  // §4.6 — "Disabled keeps its surface and fades the glyph"; a control that
  // cannot act is never hidden and never a pointer target.
  'disabled:text-disabled disabled:cursor-default'

/*
 * THE TWO CHEVRONS, in the direction a RIGHT-TO-LEFT reader travels.
 *
 * The two `<Icon>` calls below carry `chevronPrev` and `chevronNext`, whose
 * paths are `M9 6l6 6-6 6` and `M15 6l-6 6 6 6` in src/ui/icons/index.tsx. This
 * is the only written record of WHY «قبلی» points right, and it stays with the
 * component that pairs the glyph to the label rather than moving to the set,
 * which knows nothing about either.
 *
 * «صفحهٔ قبلی» is first in the DOM, which in RTL puts it on the RIGHT — and the
 * page before this one lies further right, so it points RIGHT. «صفحهٔ بعدی» is
 * second, on the LEFT, and points LEFT. Both design pagers draw exactly this
 * (`design/Inja Panel.dc.html:1602` and `:1720`), as does the row chevron at
 * `:1274` and the department CTA at `:257` — the file is RTL-aware throughout.
 *
 * Swapped, the two arrows point inward at each other and each points at the
 * page it will NOT take you to. Nothing about a `d` attribute is checked by a
 * class-string test, a snapshot or a build, which is why the two names are
 * pinned to their two labels in src/ui/table.test.tsx.
 */

export function Pager({ from, to, count, page, pages, onPage }: PagerProps) {
  return (
    // §6.16 — both design pagers sit in a `data-r-stack`, which at ≤760px is
    // `flex-direction:column; align-items:stretch` with the same 12px gap. On a
    // phone the count and the two buttons stack rather than squeezing together.
    <div
      data-r-pager
      className="flex items-center justify-between gap-s6 px-s9 py-s7 max760:flex-col max760:items-stretch"
    >
      {/* §2.7 — every count, position and index a reader sees is Persian, with
          no exception for "technical" numbers. */}
      <span className="text-fs-caption text-muted">{toFa(from)} تا {toFa(to)} از {toFa(count)}</span>
      {/* Named so the row itself can be compiled, not just the buttons in it:
          `gap-s4` → `gap-s99` emits nothing, and a `flex-row-reverse` here
          swaps the two arrows on screen while leaving the DOM order, the
          labels and the `d` attributes exactly as the tests below pin them. */}
      <div data-r-pagernav className="flex items-center gap-s4">
        <button
          type="button" aria-label="صفحهٔ قبلی" disabled={page <= 1}
          onClick={() => onPage(page - 1)} className={NAV}
        >
          {/* `>` — towards the START of the list, which in RTL is to the right.
              15×15 @2.4 (§8), sized by `--size-chevron` and not by an attribute. */}
          <Icon name="chevronPrev" stroke={2.4} className="w-chevron h-chevron" />
        </button>
        {/* The label is held at `--width-page-label` so the two buttons do not
            shift sideways as ۹ becomes ۱۰. */}
        <span aria-live="polite" className="min-w-page-label text-center text-fs-sm2 font-semibold text-body-ink">
          صفحهٔ {toFa(page)} از {toFa(pages)}
        </span>
        <button
          type="button" aria-label="صفحهٔ بعدی" disabled={page >= pages}
          onClick={() => onPage(page + 1)} className={NAV}
        >
          {/* `<` — towards the END of the list, which in RTL is to the left. */}
          <Icon name="chevronNext" stroke={2.4} className="w-chevron h-chevron" />
        </button>
      </div>
    </div>
  )
}
