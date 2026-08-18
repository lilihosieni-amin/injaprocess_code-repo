import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import { Button } from './Button'
import { Card } from './Card'
import { SearchField } from './SearchField'
import { SurfaceProvider } from './surface'
import { DeniedState, EmptyState, ErrorState, LoadFailedScreen, LoadingState, NotFoundState } from './states'

/* -------------------------------------------------------------------------
   Why this file compiles CSS instead of reading class names.

   jsdom paints nothing, so `toHaveClass('disabled:opacity-60')` proves only
   that a string was written into an attribute. It cannot tell a real utility
   from an invented one — `disabled:opacity-sixty` would pass just as well and
   emit no rule at all — and it cannot tell which of two classes setting the
   same property actually wins, which is decided by Tailwind's output order and
   not by the order of the class string.

   So every assertion below runs the component's OWN rendered class string
   through the real theme and asserts the declarations that come out, per
   state. An invented class contributes nothing and the assertion goes red; a
   class that loses the cascade never appears in the winning value.
   ------------------------------------------------------------------------- */

/** One emitted rule, split into the class that carries it and the state it applies in. */
type Painted = { klass: string; state: string; media: string; decls: string }

/**
 * Compile a class string through the real `tailwind.config.js`.
 *
 * `state` is whatever the selector holds after the class itself — `':disabled'`,
 * `':hover:enabled'`, `''` for the resting state. `media` is the at-rule's
 * params, `''` at every width.
 */
async function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const out: Painted[] = []
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this file exists to catch.
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
 * cascade resolves two utilities that set the same property.
 *
 * Returns `''` when nothing sets it, so a missing declaration and a wrong one
 * fail the same way.
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

/**
 * Every `--token: value` literal in src/styles/tokens.css and the files it
 * imports.
 *
 * `winner()` stops at the declaration — `gap: var(--gap-button-icon)` — and a
 * token name is still a name. This is the hop that turns it into the number the
 * design draws, so an assertion can say *7px* and not *the token we happen to
 * point at today*.
 */
function tokenLiterals(): Map<string, string> {
  const entry = resolve(process.cwd(), 'src/styles/tokens.css')
  const files = [
    ...[...readFileSync(entry, 'utf8').matchAll(/@import\s+'([^']+)'/g)]
      .map((m) => resolve(dirname(entry), m[1])),
    entry,
  ]
  const values = new Map<string, string>()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
      values.set(m[1], m[2].trim())
    }
  }
  return values
}

/**
 * What one `--role-*` property resolves to on each surface, read out of
 * src/styles/roles.css and src/styles/tokens.css.
 *
 * A surface-scaled utility writes ONE class on both surfaces, so asserting the
 * class name proves nothing about scaling. This is the half that does: it says
 * what the role behind the class is worth on each side. `reader` is '' when the
 * reader block does not override the role — which is a real answer and not a
 * failure, and is what owner ruling R12 made true of --role-fs-dense.
 */
function readerScaleOf(role: string): { panel: string; reader: string } {
  const roles = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  const block = (selector: string) =>
    new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(roles)?.[1] ?? ''
  const target = (body: string) =>
    new RegExp(`(?<![-\\w])${role}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(body)?.[1] ?? ''

  const values = tokenLiterals()
  const literal = (token: string) => values.get(token) ?? ''
  return {
    panel: literal(target(block(':root'))),
    reader: literal(target(block("\\[data-surface='reader'\\]"))),
  }
}

/** Every state a class string paints in, which is what proves a variant exists at all. */
const statesOf = (painted: Painted[]) => [...new Set(painted.map((p) => p.state))].sort()

describe('the compiler this file is asserted with', () => {
  // Every assertion below reads `winner()`, which returns '' both for "nothing
  // sets it" and for "the class was invented". If `paint()` silently produced
  // nothing, a `.not.toBe(...)` would pass over an empty sheet. This pins both
  // ends: a real utility resolves, an invented one does not, and a `:disabled`
  // variant really does land after the base rule it has to beat.
  it('resolves a real utility and nothing at all for an invented one', async () => {
    const real = await paint('bg-coral')
    expect(winner(real, 'background-color')).toBe('var(--coral)')
    const fake = await paint('bg-coral-sixty')
    expect(winner(fake, 'background-color')).toBe('')
  })

  it('lets a variant beat the base utility it is written to override', async () => {
    const p = await paint('opacity-100 disabled:opacity-60')
    expect(winner(p, 'opacity')).toBe('1')
    expect(winner(p, 'opacity', ':disabled')).toBe('0.6')
  })
})

describe('P1 — a disabled button does not look or behave like a working one', () => {
  it('fades, drops its glow and stops being a pointer target', async () => {
    render(<Button variant="coral" disabled>حذف</Button>)
    const b = screen.getByRole('button')
    const p = await paint(b.className)

    // Each of the three is asserted against the DISABLED state and against the
    // resting one, because a value both states share proves nothing about
    // `disabled` at all — the house defect this task was warned about.
    expect(winner(p, 'opacity', ':disabled')).toBe('0.6')
    expect(winner(p, 'opacity')).toBe('')

    // `shadow-none` and `shadow-coral` both set --tw-shadow; only the emitted
    // order decides which one an element wearing both actually draws.
    // `--tw-shadow-colored` is the layer that carries the value: `coral` is
    // also a colour key, so `shadow-coral` additionally matches Tailwind's
    // shadow-*colour* plugin and ends by aliasing --tw-shadow to it.
    expect(winner(p, '--tw-shadow-colored')).toBe('var(--shadow-coral)')
    expect(winner(p, '--tw-shadow-colored', ':disabled')).toBe('0 0 #0000')
    expect(winner(p, '--tw-shadow', ':disabled')).toBe('0 0 #0000')

    expect(winner(p, 'cursor')).toBe('pointer')
    expect(winner(p, 'cursor', ':disabled')).toBe('default')
  })

  it('does not brighten under the pointer while disabled', async () => {
    render(<Button variant="coral" disabled>حذف</Button>)
    const b = screen.getByRole('button')
    const p = await paint(b.className)

    // The bug: `hover:brightness-105` matches a disabled <button> too, because
    // nothing sets pointer-events. `enabled:` is what stops it. Asserted as the
    // absence of a `:hover` state and the presence of an `:hover:enabled` one,
    // so writing `hover:` back cannot pass.
    expect(statesOf(p)).not.toContain(':hover')
    expect(winner(p, '--tw-brightness', ':hover:enabled')).toBe('brightness(1.05)')
  })

  it('fades the glyph rather than the surface on a ghost, as the design says', async () => {
    render(<Button variant="ghost" disabled>انصراف</Button>)
    const p = await paint(screen.getByRole('button').className)
    expect(winner(p, 'color')).toBe('var(--violet)')
    expect(winner(p, 'color', ':disabled')).toBe('var(--text-disabled)')
    // The ghost has no surface to fade — it is already white — so it must NOT
    // pick up the fill variants' opacity drop.
    expect(winner(p, 'opacity', ':disabled')).toBe('')
  })

  it('gives the destructive ghost the design’s own three values, not the conflict state’s', async () => {
    render(<Button variant="danger">حذف</Button>)
    const p = await paint(screen.getByRole('button').className)
    // §5.2 — #FFF3F2 / #E23D35 / 1.5px #FDD9D6. The border is what tells this
    // ACTION apart from the conflict STATE, which has none.
    expect(winner(p, 'background-color')).toBe('var(--tile-c2)')
    expect(winner(p, 'color')).toBe('var(--conflict)')
    expect(winner(p, 'border-color')).toBe('var(--border-danger)')
    expect(winner(p, 'border-width')).toBe('var(--border-hairline)')
    // The design declares no hover for it, so it has none.
    expect(statesOf(p)).not.toContain(':hover:enabled')
    // …and it is not a repaint of `coral`, which is the mutation this catches.
    expect(winner(p, 'background-color')).not.toBe('var(--coral)')
  })

  it('goes full width only when the caller asks, and puts the spinner in the icon’s place', () => {
    const icon = <svg data-testid="btn-icon" />
    const { rerender } = render(<Button icon={icon}>ذخیره</Button>)
    expect(screen.getByRole('button').className).not.toMatch(/\bw-full\b/)
    expect(screen.getByTestId('btn-icon')).toBeTruthy()

    rerender(<Button icon={icon} block loading loadingLabel="در حال ذخیره…">ذخیره</Button>)
    expect(screen.getByRole('button').className).toMatch(/\bw-full\b/)
    // S4's busy contract: the spinner REPLACES the icon, so the label never
    // shifts sideways when a save starts.
    expect(screen.queryByTestId('btn-icon')).toBeNull()
    expect(screen.getByTestId('btn-spinner')).toBeTruthy()
  })
})

describe('S4 — a button’s icon sits at the design’s 7px, not at a framework default', () => {
  it('paints --gap-button-icon’s 7px, and not `gap-2`’s 8', async () => {
    render(<Button icon={<svg data-testid="btn-icon" />}>ذخیره</Button>)
    const p = await paint(screen.getByRole('button').className)

    // This is the defect the whole file exists for, in its purest form. `gap-2`
    // is Tailwind's OWN numeric key: a perfectly real class emitting a perfectly
    // real rule, so nothing ever went red while every button in the app painted
    // an 8px icon gap against a design that draws 7 — panel 1012 and 1296,
    // reader 157, 202 and 750, all `display:inline-flex;align-items:center;gap:7px`.
    // A `toHaveClass('gap-button-icon')` would have passed on either spelling,
    // which is precisely how it survived; so the assertion is the VALUE.
    const gap = winner(p, 'gap')
    expect(gap).toBe('var(--gap-button-icon)')
    expect(tokenLiterals().get('--gap-button-icon')).toBe('7px')

    // Both halves are load-bearing and neither is redundant:
    //   · the literal catches the token being redefined out from under the
    //     class — `--gap-button-icon: 8px` paints the old bug back;
    //   · the token name catches the SAME-VALUE swap, which no value check
    //     can see. Four other tokens hold 7px (--pad-popover, --space-stat-label,
    //     --gap-stat-dot, --pad-back-y) and the theme's pairing table says why
    //     each is a different role; borrowing one of them here compiles, paints
    //     identically, and is wrong the day either role moves.
    expect(gap).not.toBe('0.5rem')
  })
})

describe('P4 — Card carries the design’s recipe, not four hand-rolled copies of it', () => {
  it('is #fff on the card border and the two-layer shadow (ledger L-14, L-15)', async () => {
    const { container } = render(<Card>x</Card>)
    const p = await paint((container.firstElementChild as HTMLElement).className)
    expect(winner(p, 'background-color')).toBe('var(--card)')
    // §4.3 — rgba(42,29,94,.07), 46 uses. `--warm` is the top-bar and drawer
    // edge and is a different colour; this is the assertion that tells them
    // apart, which `toContain('border-')` could not.
    expect(winner(p, 'border-color')).toBe('var(--border-card)')
    expect(winner(p, 'border-color')).not.toBe('var(--warm)')
    // §4.3 gives the card 1px and every *control* 1.5px, so the width is half
    // the recipe and not a detail: `border` -> `border-hairline` is a 46-use
    // edge getting 50% heavier, and the colour assertion above cannot see it.
    expect(winner(p, 'border-width')).toBe('1px')
    expect(winner(p, 'border-width')).not.toBe('var(--border-hairline)')
    // `card` is also a colour key, so --tw-shadow-colored is the layer that
    // carries the value; see the coral note above.
    expect(winner(p, '--tw-shadow-colored')).toBe('var(--shadow-card)')
  })

  it('lifts -2px over .16s and turns its border #C9B8EC, only when asked', async () => {
    const { container, rerender } = render(<Card>x</Card>)
    const plain = await paint((container.firstElementChild as HTMLElement).className)
    expect(statesOf(plain)).toEqual([''])

    rerender(<Card hoverLift>x</Card>)
    const lifted = await paint((container.firstElementChild as HTMLElement).className)
    // §4.6 — the one hover the design gives a surface. Asserted as the hover
    // state's own values, and against the resting state, so a card that always
    // sat 2px high with a lilac border could not pass.
    expect(winner(lifted, '--tw-translate-y', ':hover')).toBe('-2px')
    expect(winner(lifted, '--tw-translate-y')).toBe('')
    expect(winner(lifted, '--tw-shadow-colored', ':hover')).toBe('var(--shadow-card-hover)')
    expect(winner(lifted, 'border-color', ':hover')).toBe('var(--border-pick)')
    expect(winner(lifted, 'border-color')).toBe('var(--border-card)')
    // .16s, the design's one duration — and nothing scales or bounces.
    expect(winner(lifted, 'transition-duration')).toBe('var(--duration)')
    expect(winner(lifted, '--tw-scale-x', ':hover')).toBe('')
  })

  it('names its radius and padding instead of making every caller invent one', async () => {
    const { container, rerender } = render(<Card radius="feature" padding="feature">x</Card>)
    const feature = await paint((container.firstElementChild as HTMLElement).className)
    expect(winner(feature, 'border-radius')).toBe('var(--radius-card-lg)')
    expect(winner(feature, 'padding')).toBe('var(--space-10)')

    // The default is the 16px row/list radius and no padding at all, so a card
    // used as a shell does not have to unset one.
    rerender(<Card>x</Card>)
    const plain = await paint((container.firstElementChild as HTMLElement).className)
    expect(winner(plain, 'border-radius')).toBe('var(--radius-card)')
    expect(winner(plain, 'padding')).toBe('')

    // Every other rung resolves too — an invented key would compile to nothing.
    for (const [radius, token] of [
      ['tile', 'var(--radius-tile)'], ['doc', 'var(--radius-doc)'], ['control', 'var(--radius-md)'],
    ] as const) {
      rerender(<Card radius={radius}>x</Card>)
      const r = await paint((container.firstElementChild as HTMLElement).className)
      expect(winner(r, 'border-radius'), radius).toBe(token)
    }
    for (const [padding, token] of [
      ['tight', 'var(--space-8)'], ['card', 'var(--space-9)'],
    ] as const) {
      rerender(<Card padding={padding}>x</Card>)
      const r = await paint((container.firstElementChild as HTMLElement).className)
      expect(winner(r, 'padding'), padding).toBe(token)
    }
  })
})

describe('P6 — the search field is the design’s search field', () => {
  const noop = () => {}

  it('has the 1.5px control border, the 13px radius and the coral focus', async () => {
    render(<SearchField label="جست‌وجو" value="" onChange={noop} />)
    const p = await paint(screen.getByLabelText('جست‌وجو').className)
    // §4.3 — 1.5px on every control and input, not the 1px `border` default.
    expect(winner(p, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(p, 'border-color')).toBe('var(--line)')
    // 13px, not --radius-control's 10px.
    expect(winner(p, 'border-radius')).toBe('var(--radius-lg)')
    // §4.6 — focus is border-color and nothing else, 15 declarations out of 15.
    expect(winner(p, 'border-color', ':focus')).toBe('var(--coral)')
    // No glow, no ring, no outline: the border IS the focus.
    expect(winner(p, 'outline')).toBe('2px solid transparent')
    expect(winner(p, '--tw-shadow', ':focus')).toBe('')
    expect(winner(p, '--tw-ring-color', ':focus')).toBe('')
    expect(winner(p, '--tw-scale-x', ':focus')).toBe('')
  })

  it('scales with the surface, not with a prop', async () => {
    const { container } = render(
      <SurfaceProvider surface="reader">
        <SearchField label="جست‌وجو" value="" onChange={noop} />
      </SurfaceProvider>,
    )
    const cls = container.querySelector('input')!.className
    const p = await paint(cls)
    // The class is the same on both surfaces — that is the point of the layer —
    // so asserting the class name would prove nothing at all. What must be true
    // is that the size it resolves to is the ROLE and not a fixed step: the
    // field reads the scale layer, so the surface decides its size and no prop
    // ever can.
    expect(winner(p, 'font-size')).toBe('var(--role-fs-dense)')
    expect(winner(p, 'font-size')).not.toBe('var(--fs-sm)')
    // This line used to read `{ panel: '13px', reader: '14.5px' }`. Owner ruling
    // R12 removed that override: a matched-element comparison over 70 pairs
    // found the reader draws the panel's five 13px elements at 13px x3 and
    // 13.5px x2 and at 14.5px NEVER, and the ten reader sites that are 14.5px
    // are a different role (--fs-body-lead, a fixed step the panel uses too).
    // So dense copy is 13px on both surfaces by ruling, and pinning 14.5px here
    // would make the suite defend a number the design never draws.
    expect(readerScaleOf('--role-fs-dense')).toEqual({ panel: '13px', reader: '' })
    // …but the helper above must still be able to SEE an override, or the line
    // before it would pass on a roles.css whose reader block had been deleted
    // wholesale. --role-fs-body is the control: R3 genuinely scales body copy.
    expect(readerScaleOf('--role-fs-body')).toEqual({ panel: '14px', reader: '15px' })
    // …and the field really is inside a reader surface.
    expect(container.querySelector('[data-surface="reader"]')).not.toBeNull()
  })

  it('takes its place in the composition, and that is all `place` means', async () => {
    const { rerender } = render(<SearchField label="ج" value="" onChange={noop} place="menu" />)
    const menu = await paint(screen.getByLabelText('ج').className)
    expect(winner(menu, 'padding-top')).toBe('var(--pad-search-y-menu)')
    expect(winner(menu, 'padding-inline-start')).toBe('var(--pad-search-x-menu)')
    expect(winner(menu, 'padding-inline-end')).toBe('var(--space-6)')
    expect(winner(menu, 'border-radius')).toBe('var(--radius-control)')

    rerender(<SearchField label="ج" value="" onChange={noop} place="dialog" />)
    const dialog = await paint(screen.getByLabelText('ج').className)
    expect(winner(dialog, 'padding-top')).toBe('var(--space-6)')
    expect(winner(dialog, 'padding-left')).toBe('var(--pad-search-x-dialog)')
    expect(winner(dialog, 'border-radius')).toBe('var(--radius-md)')

    rerender(<SearchField label="ج" value="" onChange={noop} />)
    const screenPlace = await paint(screen.getByLabelText('ج').className)
    expect(winner(screenPlace, 'padding-top')).toBe('var(--pad-search-y)')
    expect(winner(screenPlace, 'padding-left')).toBe('var(--pad-search-x)')
    expect(winner(screenPlace, 'border-radius')).toBe('var(--radius-lg)')
  })

  it('pins the magnifier with a logical inset, at the size each place gives it', async () => {
    const { container, rerender } = render(<SearchField label="ج" value="" onChange={noop} />)
    const glyph = () => container.querySelector('svg')!.getAttribute('class') ?? ''
    const big = await paint(glyph())
    // §8 — inset-inline-start, so RTL is structural. A physical `right` would
    // emit `right:` here and this goes red.
    expect(winner(big, 'inset-inline-start')).toBe('var(--inset-search-icon)')
    expect(winner(big, 'right')).toBe('')
    expect(winner(big, 'width')).toBe('var(--size-search-glyph)')
    // The magnifier sits ON TOP of the field's leading 44px. Without
    // `pointer-events-none` it swallows every click on that edge — which in an
    // RTL layout is the edge a person's caret goes to first — and the field
    // looks broken rather than styled. Neither this nor the glyph's own colour
    // was asserted anywhere; both are the design's (§5.2, --text-faint).
    expect(winner(big, 'pointer-events')).toBe('none')
    expect(winner(big, 'color')).toBe('var(--text-faint)')

    rerender(<SearchField label="ج" value="" onChange={noop} place="dialog" />)
    const mid = await paint(glyph())
    expect(winner(mid, 'inset-inline-start')).toBe('var(--inset-search-icon-dialog)')
    expect(winner(mid, 'width')).toBe('var(--space-8)')

    rerender(<SearchField label="ج" value="" onChange={noop} place="menu" />)
    const small = await paint(glyph())
    expect(winner(small, 'inset-inline-start')).toBe('var(--inset-search-icon-menu)')
    expect(winner(small, 'width')).toBe('var(--space-7)')
  })
})

describe('P7 — the state screens stand where they claim to', () => {
  it('gives emptiness the three forms the design draws, and only the card is a card', async () => {
    const { container, rerender } = render(<EmptyState title="چیزی نیست" />)
    const root = () => container.firstElementChild as HTMLElement

    // `card` is the default and really is a <Card>: the recipe, not a repaint.
    const card = await paint(root().className)
    expect(winner(card, 'background-color')).toBe('var(--card)')
    expect(winner(card, 'border-color')).toBe('var(--border-card)')
    // §5.2 — `48px 20px`, two axes and two numbers. It shipped `p-s12` (30px
    // both ways) because the ladder has no 48 rung and no two-axis key; the two
    // tokens are the same move the nine control-geometry values beside them
    // already are, so the largest divergence in this task is closed rather than
    // recorded. A single `padding` would mean it went back to one number.
    expect(winner(card, 'padding-top')).toBe('var(--pad-empty-y)')
    expect(winner(card, 'padding-left')).toBe('var(--pad-empty-x)')
    expect(winner(card, 'padding')).toBe('')

    rerender(<EmptyState title="چیزی نیست" variant="dashed" />)
    const dashed = await paint(root().className)
    expect(winner(dashed, 'border-style')).toBe('dashed')
    expect(winner(dashed, 'border-color')).toBe('var(--line)')
    expect(winner(dashed, 'border-radius')).toBe('var(--radius-tile)')
    expect(winner(dashed, 'padding')).toBe('var(--space-9)')
    // A dashed block is not a card: it carries no shadow.
    expect(winner(dashed, '--tw-shadow-colored')).toBe('')

    rerender(<EmptyState title="چیزی نیست" variant="inline" />)
    const inline = await paint(root().className)
    expect(winner(inline, 'padding-top')).toBe('var(--space-16)')
    expect(winner(inline, 'padding-left')).toBe('var(--space-10)')
    expect(winner(inline, 'border-style')).toBe('')
    expect(winner(inline, '--tw-shadow-colored')).toBe('')
  })

  it('stands the load-failure screen at the same gutter as the refusal beside it', async () => {
    // Its own docstring says it is "laid out like RefusalScreen, because it
    // stands in the same place", and until now it stood at 30px where the
    // refusal stands at 40px. --pad-screen-x is what both mean.
    const { container } = render(
      <LoadFailedScreen message="بارگذاری نشد." error={new Error('x')} onRetry={() => {}} />,
    )
    const p = await paint((container.firstElementChild as HTMLElement).className)
    expect(winner(p, 'padding-left')).toBe('var(--pad-screen-x)')
    expect(winner(p, 'padding-top')).toBe('var(--pad-screen-y)')
    expect(winner(p, 'padding-left')).not.toBe('var(--space-12)')
  })

  it('shapes the skeleton row at a step the scale actually has', async () => {
    render(<LoadingState rows={1} />)
    const p = await paint(screen.getAllByTestId('skeleton-row')[0].className)
    expect(winner(p, 'height')).toBe('var(--space-16)')   // 40px, a rung; 64px is none
  })

  it('puts every margin and padding on the design scale, not Tailwind’s own', async () => {
    // The commit that made these five edits headlined them "on the scale's own
    // steps" and left three of them unprotected: `mt-s7`->`mt-4`, `px-s8`->`px-4`
    // and `mt-s2`->`mt-2` all left the whole suite green. guards.test.ts polices
    // Tailwind's palette, type scale and radii — not its default SPACING scale,
    // which is a sparser rem ladder (4/8/12/16/20px) that silently compiles.
    // Asserted as the token, so a rem step cannot satisfy it.
    render(<ErrorState message="بارگذاری نشد." onRetry={() => {}} />)
    const retry = screen.getByRole('button', { name: 'تلاش دوباره' })
    expect(winner(await paint(retry.parentElement!.className), 'margin-top'))
      .toBe('var(--space-7)')      // 14px; mt-4 is 1rem and this goes red
    expect(winner(await paint(retry.className), 'padding-left'))
      .toBe('var(--space-8)')      // 16px; px-4 is 1rem

    for (const State of [DeniedState, NotFoundState]) {
      const { container, unmount } = render(<State />)
      const hint = container.querySelectorAll('p')[1]
      expect(winner(await paint(hint.className), 'margin-top'), State.name)
        .toBe('var(--space-2)')    // 5px; mt-2 is 0.5rem
      unmount()
    }
  })

  it('draws the empty state’s hint as sub-copy, not as a second heading', async () => {
    // Also unasserted: restyling this line `text-fs-h1 text-conflict mt-s16`
    // left the suite green — a 23px red hint under a bold title, on a live
    // screen. It is the design's smallest supporting copy and nothing else.
    render(<EmptyState title="چیزی نیست" hint="بعداً دوباره سر بزنید." />)
    const p = await paint(screen.getByText('بعداً دوباره سر بزنید.').className)
    expect(winner(p, 'font-size')).toBe('var(--fs-sm)')
    expect(winner(p, 'color')).toBe('var(--text-faint)')
    expect(winner(p, 'margin-top')).toBe('var(--space-1)')
  })
})
