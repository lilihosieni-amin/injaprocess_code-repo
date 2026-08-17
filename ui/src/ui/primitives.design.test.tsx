import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import { Button } from './Button'
import { Card } from './Card'

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
