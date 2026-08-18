import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { Checkbox, TickBox } from './Checkbox'
import { Radio } from './Radio'
import { Dropdown } from './Dropdown'
import { isTopDismissible, popDismissible, pushDismissible } from './dismissibleStack'

/* -------------------------------------------------------------------------
   Two halves, and the second is the one that matters.

   jsdom paints nothing. `toHaveClass('bg-violet')` proves only that a string
   was written into an attribute — `bg-violet-ish` would satisfy it just as
   well, emit no rule at all, and let the build exit 0. That is this project's
   signature defect and the reason nine screens shipped where every value was
   legal and the page looked wrong.

   So every class these three primitives write is also compiled through the
   real `tailwind.config.js` here and asserted by the DECLARATION it produces
   — `width: var(--size-tick)` — and by what that token is worth, read out of
   the token files rather than restated.

   Reviews of Tasks 7 and 9 both found the limit of that: a compiled-CSS
   harness only checks the declarations it is TOLD to name, so a mutation that
   deleted a class nobody had named passed. `dead()` below closes it from the
   other side. It takes the element's OWN rendered class string and reports
   every class in it that emits nothing, so an invented name is caught whether
   or not this file thought to assert the property it was meant to set.
   ------------------------------------------------------------------------- */

/** One emitted rule, split into the class that carries it and the state it applies in. */
type Painted = { klass: string; state: string; media: string; decls: string }

/** Every class token in a selector — `.a:hover ~ .b\:c` is `a` and `b:c`. */
function classesIn(selector: string): string[] {
  return [...selector.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\/g, ''))
}

/**
 * Compile a class string through the real theme.
 *
 * `painted` is the house harness's leading-class parse, which `winner()` reads.
 * `alive` is every class that appears anywhere in a rule with a body — which is
 * the only way to see a variant class like `peer-focus-visible:border-coral`,
 * whose selector does not begin with it.
 */
async function compile(classNames: string): Promise<{
  painted: Painted[]
  alive: Set<string>
  raw: { selector: string; decls: string }[]
}> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  if (classes.length === 0) return { painted: [], alive: new Set(), raw: [] }
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const painted: Painted[] = []
  const alive = new Set<string>()
  const raw: { selector: string; decls: string }[] = []
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this file exists to catch.
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    if (!decls) return
    for (const sel of rule.selectors) {
      raw.push({ selector: sel, decls })
      for (const k of classesIn(sel)) alive.add(k)
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      painted.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return { painted, alive, raw }
}

/** The house harness's shape, for the declaration assertions. */
async function paint(classNames: string): Promise<Painted[]> {
  return (await compile(classNames)).painted
}

/**
 * The winning value of `prop` in `state` — the LAST declaration in emitted
 * order, which is how the cascade resolves two utilities setting one property.
 * Returns '' when nothing sets it, so a missing declaration and a wrong one
 * fail the same way.
 */
function winner(painted: Painted[], prop: string, state = ''): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== state || p.media !== '') continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

/**
 * `peer` is Tailwind's marker class. It emits no rule BY DESIGN — it exists so
 * a sibling's `peer-*` variant has something to select against — so it is the
 * one name `dead()` may not call dead. Listed rather than pattern-matched, so
 * the exemption cannot quietly widen.
 */
const MARKER_ONLY = new Set(['peer'])

/** Every class in this string that compiles to nothing. */
async function dead(classNames: string): Promise<string[]> {
  const { alive } = await compile(classNames)
  return [...new Set(classNames.split(/\s+/).filter(Boolean))]
    .filter((c) => !alive.has(c) && !MARKER_ONLY.has(c))
}

/** Every class the element and all of its descendants write. */
function classStringOf(root: Element): string {
  const parts: string[] = []
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const c = el.getAttribute('class')
    if (c) parts.push(c)
  }
  return parts.join(' ')
}

/**
 * Every custom property the app declares, in cascade order — the four frozen
 * `_ds` files and then `src/styles/tokens.css`.
 */
function declared(): Map<string, string> {
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
 * What one `--role-*` property points at, read out of src/styles/roles.css —
 * the file the role layer lives in, which `declared()` above does not read.
 */
function roleTarget(role: string): string {
  const roles = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  return new RegExp(`(?<![-\\w])${role}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(roles)?.[1] ?? ''
}

/** What one token is actually worth, so "19px" is a measurement and not a claim. */
function tokenLiteral(token: string): string {
  return declared().get(token) ?? ''
}

const sourceOf = (file: string) => readFileSync(join(process.cwd(), 'src/ui', file), 'utf8')

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

const tickOf = (c: Element) => c.querySelector('[data-tick]') as HTMLElement

describe('the harness itself', () => {
  // Every assertion below reads `winner()` or `dead()`, and both answer ''/[]
  // for "nothing sets it" AND for "the class was invented". If the compile
  // silently produced nothing, the whole file would pass green and prove
  // nothing at all. Pin both directions before using either.
  it('tells a real utility from an invented one', async () => {
    expect(winner(await paint('bg-violet'), 'background-color')).toBe('var(--violet)')
    expect(winner(await paint('bg-violet-ish'), 'background-color')).toBe('')
  })

  it('reports invented classes dead and real ones alive — including variants', async () => {
    expect(await dead('w-tick rounded-tick peer sr-only peer-focus-visible:border-coral')).toEqual([])
    expect(await dead('w-tick-nineteen rounded-tickk peer-focus-visible:border-corally')).toEqual([
      'w-tick-nineteen', 'rounded-tickk', 'peer-focus-visible:border-corally',
    ])
  })

  it('reads the token files, so a literal here is measured and not restated', () => {
    expect(tokenLiteral('--size-tick')).toBe('19px')
    expect(tokenLiteral('--nonesuch')).toBe('')
  })
})

describe('Checkbox', () => {
  it('is a real checkbox with a bound label', () => {
    on('panel', <Checkbox label="سرپرست‌شدن" checked={false} onChange={() => {}} />)
    const el = screen.getByRole('checkbox', { name: /سرپرست‌شدن/ })
    expect(el).not.toBeChecked()
  })

  it('reports the new state, not the old one', async () => {
    const seen: boolean[] = []
    on('panel', <Checkbox label="کل سامانه" checked={false} onChange={(v) => seen.push(v)} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(seen).toEqual([true])
  })

  it('fills violet when on and shows the pick edge when off', () => {
    const { unmount, container } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    expect(tickOf(container)).toHaveClass('bg-violet', 'border-violet')
    unmount()
    const second = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    expect(tickOf(second.container)).toHaveClass('bg-card', 'border-border-pick')
  })

  it('writes no class that compiles to nothing — on or off', async () => {
    // The half `toHaveClass` cannot do. An invented name passes every assertion
    // above and emits no rule; this reads the component's own rendered string.
    const off = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} hint="چرا" />)
    expect(await dead(classStringOf(off.container.querySelector('label')!))).toEqual([])
    off.unmount()
    const bare = on('panel', <TickBox on />)
    expect(await dead(classStringOf(bare.container.firstElementChild!))).toEqual([])
  })

  it('draws the 19px box ledger L-10 names, with the 13px check inside it', async () => {
    const { container } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    const tick = tickOf(container)
    const box = await paint(tick.className)
    expect(winner(box, 'width')).toBe('var(--size-tick)')
    expect(winner(box, 'height')).toBe('var(--size-tick)')
    expect(winner(box, 'border-radius')).toBe('var(--radius-tick)')
    expect(winner(box, 'border-width')).toBe('var(--border-hairline)')
    // A 19px box that can be squeezed is not a 19px box: beside a long label in
    // a flex row, `flex-none` is the only thing holding it. And the check is
    // centred in it by the box, not by the glyph.
    expect(winner(box, 'flex')).toBe('none')
    expect(winner(box, 'align-items')).toBe('center')
    expect(winner(box, 'justify-content')).toBe('center')
    // …and what those are worth. L-10 settled 19, not 18; §"Iconography" gives
    // the check in a 12–13px box stroke 3.
    expect(tokenLiteral('--size-tick')).toBe('19px')
    expect(tokenLiteral('--radius-tick')).toBe('6px')
    expect(tokenLiteral('--border-hairline')).toBe('1.5px')

    const glyph = tick.querySelector('svg') as SVGElement
    const inner = await paint(glyph.getAttribute('class') ?? '')
    expect(winner(inner, 'width')).toBe('var(--size-tick-glyph)')
    expect(winner(inner, 'height')).toBe('var(--size-tick-glyph)')
    expect(tokenLiteral('--size-tick-glyph')).toBe('13px')
    expect(glyph.getAttribute('stroke-width')).toBe('3')
    // Sized by the token, never by an SVG attribute — an attribute is a second
    // record of a number the token layer already holds.
    expect(glyph.getAttribute('width')).toBeNull()
  })

  it('paints the fill and the edge as declarations, not as class names', async () => {
    const { container, unmount } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    const lit = await paint(tickOf(container).className)
    expect(winner(lit, 'background-color')).toBe('var(--violet)')
    expect(winner(lit, 'border-color')).toBe('var(--violet)')
    // The check itself is white ON that violet; a tick the colour of its own
    // fill is invisible and every class-name assertion above still passes.
    expect(winner(lit, 'color')).toBe('var(--card)')
    unmount()

    const { container: c2 } = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const dark = await paint(tickOf(c2).className)
    expect(winner(dark, 'background-color')).toBe('var(--card)')
    expect(winner(dark, 'border-color')).toBe('var(--border-pick)')
    expect(tokenLiteral('--border-pick')).toBe('#C9B8EC')
  })

  it('is the row the design draws — gap 11, padding 13/14, radius 12', async () => {
    const { container } = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    // The <label> itself, not SurfaceProvider's `display:contents` wrapper —
    // reading `firstElementChild` here measured the wrapper and reported
    // `display: contents` for a row the assertion claimed was a flex box.
    const row = await paint((container.querySelector('label') as HTMLElement).className)
    expect(winner(row, 'display')).toBe('flex')
    expect(winner(row, 'align-items')).toBe('center')
    expect(winner(row, 'gap')).toBe('var(--gap-tick-row)')
    expect(winner(row, 'padding-top')).toBe('var(--pad-tick-row-y)')
    expect(winner(row, 'padding-left')).toBe('var(--space-7)')
    expect(winner(row, 'border-radius')).toBe('var(--radius-md)')
    expect(winner(row, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(row, 'cursor')).toBe('pointer')
    // §5.2 draws `gap:11px; padding:13px 14px`. The brief paired that gap with
    // the NESTED row's 11/12 padding, which is a different composition.
    expect(tokenLiteral('--gap-tick-row')).toBe('11px')
    expect(tokenLiteral('--pad-tick-row-y')).toBe('13px')
    expect(tokenLiteral('--space-7')).toBe('14px')
  })

  it('tints the row when on and leaves the control edge when off', async () => {
    const { container, unmount } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    const lit = await paint((container.querySelector('label') as HTMLElement).className)
    expect(winner(lit, 'background-color')).toBe('var(--tile-v4)')
    expect(winner(lit, 'border-color')).toBe('var(--border-pick)')
    unmount()

    const { container: c2 } = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const dark = await paint((c2.querySelector('label') as HTMLElement).className)
    expect(winner(dark, 'background-color')).toBe('var(--card)')
    // §4.3 — 1.5px --line on every control, input, ghost and secondary button.
    expect(winner(dark, 'border-color')).toBe('var(--line)')
  })

  it('shows focus the one way the design shows focus', async () => {
    // §4.6 — 15 of 15 focus declarations are `border-color:#FA5A52`. The input
    // itself is sr-only, so the coral has to land on the painted square.
    const { container } = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    expect(tickOf(container)).toHaveClass('peer-focus-visible:border-coral')
    // …and that class is a real one that paints coral, on a selector which
    // needs the sr-only input beside it to be focus-visible. Both halves: the
    // colour, and the fact that it answers the INPUT's focus rather than the
    // square's own — the square is a `<span>` and can never be focused.
    const { raw } = await compile('peer-focus-visible:border-coral')
    const rule = raw.find((r) => r.selector.includes('peer-focus-visible'))
    expect(rule?.decls).toBe('border-color: var(--coral)')
    expect(rule?.selector).toMatch(/\.peer:focus-visible\s*~/)
  })

  it('hides the input without taking it out of the tab order', async () => {
    const { container } = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).toHaveClass('peer', 'sr-only')
    const p = await paint(input.className)
    // `sr-only` clips; `display:none` and `visibility:hidden` would also take
    // the control off the tab order, which is the mutation this catches.
    expect(winner(p, 'position')).toBe('absolute')
    expect(winner(p, 'display')).toBe('')
    expect(winner(p, 'visibility')).toBe('')
    input.focus()
    expect(input).toHaveFocus()
  })

  it('binds its explanation to the control', () => {
    on('panel', (
      <Checkbox
        label="سرپرست‌شدن"
        checked={false}
        onChange={() => {}}
        hint="این پرچم هیچ دسترسی نمی‌دهد؛ فقط او را در فهرست سرپرست‌های قابل انتخاب می‌آورد."
      />
    ))
    const el = screen.getByRole('checkbox')
    const hint = screen.getByText(/این پرچم هیچ دسترسی نمی‌دهد/)
    expect(el).toHaveAttribute('aria-describedby', hint.id)
  })

  it('draws the explanation as the design draws it — 11.5px, faint, loose', async () => {
    const { container } = on('panel', (
      <Checkbox label="سرپرست‌شدن" checked={false} onChange={() => {}} hint="توضیح" />
    ))
    const hint = await paint((screen.getByText('توضیح') as HTMLElement).className)
    expect(winner(hint, 'font-size')).toBe('var(--fs-xs)')
    expect(winner(hint, 'color')).toBe('var(--text-faint)')
    expect(winner(hint, 'line-height')).toBe('var(--lh-normal)')
    expect(tokenLiteral('--fs-xs')).toBe('11.5px')
    expect(tokenLiteral('--lh-normal')).toBe('1.7')
    // …and it is NOT the title's step, which is the mutation that makes the row
    // read as two titles.
    const title = await paint((container.querySelector('.font-bold') as HTMLElement).className)
    expect(winner(title, 'font-size')).not.toBe(winner(hint, 'font-size'))
  })

  it('takes its title step from the surface, not from a prop', async () => {
    const panel = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const one = await paint((panel.container.querySelector('.font-bold') as HTMLElement).className)
    panel.unmount()
    const reader = on('reader', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const two = await paint((reader.container.querySelector('.font-bold') as HTMLElement).className)

    expect(winner(one, 'font-size')).toBe('var(--fs-menu)')
    expect(winner(two, 'font-size')).toBe('var(--fs-lg)')
    expect(tokenLiteral('--fs-menu')).toBe('13.5px')
    expect(tokenLiteral('--fs-lg')).toBe('15px')
    expect(winner(one, 'font-weight')).toBe('var(--fw-bold)')
  })

  it('offers no green fill — ledger L-48 makes the "on" state violet', () => {
    // The design showed both (5 violet to 1 green) and the owner settled it:
    // a checkbox in the "on" state is a CONTROL. Green stays reserved for
    // committed / accepted / approved / confirmed STATE, which is why the flow
    // screen's confirmed tick keeps its green and this one may not have it.
    // Asserted against the source, the way guards.test.ts does, because a prop
    // that does not exist cannot be observed through the rendered output.
    const src = sourceOf('Checkbox.tsx')
    expect(src).not.toMatch(/\btone\b/)
    expect(src).not.toMatch(/\b(bg|border|text)-green\b/)
  })
})

describe('Radio', () => {
  it('is a real radio in a named group', () => {
    on('panel', <Radio name="sup" value="09120000000" checked={false} onChange={() => {}} label="سحر بیات" />)
    const el = screen.getByRole('radio', { name: /سحر بیات/ })
    expect(el).toHaveAttribute('name', 'sup')
  })

  it('reports its own value when picked', async () => {
    const seen: string[] = []
    on('panel', <Radio name="sup" value="09120000000" checked={false} onChange={(v) => seen.push(v)} label="سحر بیات" />)
    await userEvent.click(screen.getByRole('radio'))
    expect(seen).toEqual(['09120000000'])
  })

  it('turns its card violet when picked', () => {
    const { container } = on('panel', <Radio name="sup" value="a" checked onChange={() => {}} label="سحر بیات" />)
    expect(container.querySelector('label')).toHaveClass('bg-tile-v2', 'border-violet')
  })

  it('writes no class that compiles to nothing — picked or not', async () => {
    const one = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" note="یادداشت" />)
    expect(await dead(classStringOf(one.container.querySelector('label')!))).toEqual([])
    one.unmount()
    const two = on('panel', <Radio name="s" value="a" checked={false} onChange={() => {}} label="سحر" />)
    expect(await dead(classStringOf(two.container.querySelector('label')!))).toEqual([])
  })

  it('is a 19px circle with an 8px white pip, not a square', async () => {
    const { container } = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const dot = container.querySelector('label > span[aria-hidden]') as HTMLElement
    const d = await paint(dot.className)
    expect(winner(d, 'width')).toBe('var(--size-tick)')
    expect(winner(d, 'height')).toBe('var(--size-tick)')
    expect(winner(d, 'border-radius')).toBe('var(--radius-round)')
    expect(tokenLiteral('--radius-round')).toBe('50%')
    expect(winner(d, 'background-color')).toBe('var(--violet)')

    const pip = await paint((dot.firstElementChild as HTMLElement).className)
    expect(winner(pip, 'width')).toBe('var(--space-4)')
    expect(winner(pip, 'border-radius')).toBe('var(--radius-round)')
    // White on violet. A pip the colour of its ring is a picked radio that
    // looks unpicked, and every class-name assertion still passes.
    expect(winner(pip, 'background-color')).toBe('var(--card)')
    expect(tokenLiteral('--space-4')).toBe('8px')
  })

  it('is the card the design draws — gap 12, padding 14/15, radius 14', async () => {
    const { container, unmount } = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const lit = await paint((container.querySelector('label') as HTMLElement).className)
    expect(winner(lit, 'gap')).toBe('var(--space-6)')
    expect(winner(lit, 'padding-top')).toBe('var(--space-7)')
    expect(winner(lit, 'padding-left')).toBe('var(--pad-radio-x)')
    expect(winner(lit, 'border-radius')).toBe('var(--radius-tile)')
    expect(winner(lit, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(lit, 'background-color')).toBe('var(--tile-v2)')
    expect(winner(lit, 'border-color')).toBe('var(--violet)')
    expect(tokenLiteral('--pad-radio-x')).toBe('15px')
    expect(tokenLiteral('--radius-tile')).toBe('14px')
    unmount()

    const { container: c2 } = on('panel', <Radio name="s" value="a" checked={false} onChange={() => {}} label="سحر" />)
    const rest = await paint((c2.querySelector('label') as HTMLElement).className)
    expect(winner(rest, 'background-color')).toBe('var(--card)')
    expect(winner(rest, 'border-color')).toBe('var(--warm)')
    expect(winner(rest, 'border-color')).not.toBe('var(--violet)')
  })

  it('holds the dot against the first line, not the middle of the card', async () => {
    // The design's option is two or three lines high with the dot 2px below the
    // card's top padding. `items-center` centres it against the whole block —
    // legal, compiling, and visibly wrong on every multi-line option.
    const { container } = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" note="دو خط" />)
    const card = await paint((container.querySelector('label') as HTMLElement).className)
    expect(winner(card, 'align-items')).toBe('flex-start')
    const dot = container.querySelector('label > span[aria-hidden]') as HTMLElement
    expect(winner(await paint(dot.className), 'margin-top')).toBe('var(--space-half)')
    expect(tokenLiteral('--space-half')).toBe('2px')
  })

  it('draws its note in the muted step the design gives it', async () => {
    // #8a7db0 (--text-muted) on the supervisor option, against #a99fc4
    // (--text-faint) on the checkbox hint. Two roles, two colours; the brief
    // used the checkbox's for both.
    const { container } = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" note="یادداشت" />)
    const note = await paint((screen.getByText('یادداشت') as HTMLElement).className)
    expect(winner(note, 'color')).toBe('var(--text-muted)')
    expect(winner(note, 'font-size')).toBe('var(--fs-xs)')
    expect(winner(note, 'margin-top')).toBe('var(--space-2)')
    expect(tokenLiteral('--text-muted')).toBe('#8a7db0')
    expect(tokenLiteral('--space-2')).toBe('5px')
    expect(container.querySelector('label')).toBeTruthy()
  })

  it('takes its title step from the surface, not from a prop', async () => {
    const panel = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const one = await paint((panel.container.querySelector('.font-bold') as HTMLElement).className)
    panel.unmount()
    const reader = on('reader', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const two = await paint((reader.container.querySelector('.font-bold') as HTMLElement).className)
    expect(winner(one, 'font-size')).toBe('var(--fs-menu)')
    expect(winner(two, 'font-size')).toBe('var(--fs-lg)')
  })

  it('offers no way to draw a candidate nobody may pick', () => {
    // R5 — where availability depends on the target rather than the caller, the
    // option is absent, not greyed-out-with-a-reason. The design greys it and
    // explains; the ruling outranks the design. Asserted against the source,
    // the way guards.test.ts does, because a prop that does not exist cannot be
    // observed through the rendered output. The word itself may not appear —
    // not in a prop, not in a docstring explaining its absence.
    const src = sourceOf('Radio.tsx')
    expect(src).not.toMatch(/\bdisabled\b/)
    expect(src).not.toMatch(/opacity-60/)
  })
})

/** Every property any of these classes sets, in any state — for the RTL scan. */
function allProps(painted: Painted[]): string[] {
  const out = new Set<string>()
  for (const p of painted) for (const d of p.decls.split('; ')) out.add(d.split(': ')[0])
  return [...out]
}

const ROLES = [
  { value: 'reader', label: 'خواننده' },
  { value: 'editor', label: 'ادیتور' },
  { value: 'admin', label: 'مدیر' },
]

describe('Dropdown', () => {
  it('is a closed listbox trigger carrying its placeholder', () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'نقش' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens, and turns its border coral while open', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'نقش' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveClass('border-coral')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('reports the value and closes', async () => {
    const seen: string[] = []
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={(v) => seen.push(v)} />)
    await userEvent.click(screen.getByRole('button', { name: 'نقش' }))
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.click(screen.getByRole('option', { name: 'ادیتور' }))
    expect(seen).toEqual(['editor'])
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    // …and focus comes back with it. A closed popover that has left focus on a
    // node it just unmounted drops the caret to <body>.
    expect(screen.getByRole('button', { name: 'نقش' })).toHaveFocus()
  })

  it('marks the picked option, and only that one', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('option', { name: 'مدیر' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'ادیتور' })).toHaveAttribute('aria-selected', 'false')
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    // Step INTO the list first. Escaping straight from the trigger leaves focus
    // where it already was, so the restore is unobservable and dropping it
    // passed this test — which is the first thing a mutation found here.
    await userEvent.keyboard('{ArrowDown}')
    expect(trigger).not.toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('leaves an Escape for the dialog underneath it alone', async () => {
    // I7 — the popover joins the shared dismissible stack, so the Escape that
    // closes it stops there. Before that stack existed, one Escape took the
    // menu AND the dialog it was opened inside. Asserted through the stack's
    // own view of the world: while the popover is open it is the top, and once
    // it closes the thing beneath it is the top again.
    const under = Symbol('a dialog')
    pushDismissible(under)
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    expect(isTopDismissible(under)).toBe(true)
    await userEvent.click(screen.getByRole('button'))
    expect(isTopDismissible(under)).toBe(false)
    await userEvent.keyboard('{Escape}')
    expect(isTopDismissible(under)).toBe(true)
    popDismissible(under)
  })

  it('walks the options with the arrow keys', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'ادیتور' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'مدیر' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: 'ادیتور' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()
    // …and the ends hold rather than wrapping past them.
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()
  })

  it('filters when searchable, and states the miss rather than showing a blank', async () => {
    on('panel', (
      <Dropdown
        label="سرپرست" options={ROLES} placeholder="سرپرست" onChange={() => {}}
        searchable searchPlaceholder="جست‌وجو…" noHit="سرپرستی با این نام نیست"
      />
    ))
    await userEvent.click(screen.getByRole('button', { name: 'سرپرست' }))
    await userEvent.type(screen.getByPlaceholderText('جست‌وجو…'), 'ادی')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.type(screen.getByPlaceholderText('جست‌وجو…'), 'xyz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('سرپرستی با این نام نیست')).toBeInTheDocument()
  })

  it('draws the magnifier in the room it reserves for one', async () => {
    // The design's popover search field is `padding:9px 34px 9px 12px` with a
    // 14px magnifier pinned 11px in (design/Inja Panel.dc.html:1220). The brief
    // kept the 34px and dropped the icon, which leaves a third of the field
    // empty for nothing — legal, compiling, and visibly wrong.
    const { container } = on('panel', (
      <Dropdown label="س" options={ROLES} placeholder="س" onChange={() => {}} searchable searchPlaceholder="جست‌وجو…" />
    ))
    await userEvent.click(screen.getByRole('button'))
    const field = screen.getByPlaceholderText('جست‌وجو…')
    const glyph = container.querySelector('input[type="search"] ~ svg') as SVGElement
    expect(glyph, 'the reserved inline-start room holds no magnifier').toBeTruthy()

    const box = await paint(field.className)
    const icon = await paint(glyph.getAttribute('class') ?? '')
    expect(winner(box, 'padding-inline-start')).toBe('var(--pad-search-x-menu)')
    expect(winner(icon, 'inset-inline-start')).toBe('var(--inset-search-icon-menu)')
    // The relationship, not the two ends separately: the icon has to sit INSIDE
    // the room the field reserves, or it lands on top of the caret.
    const room = Number.parseFloat(tokenLiteral('--pad-search-x-menu'))
    const inset = Number.parseFloat(tokenLiteral('--inset-search-icon-menu'))
    const glyphW = Number.parseFloat(tokenLiteral('--space-7'))
    expect(room).toBeGreaterThanOrEqual(inset + glyphW)
    expect(winner(icon, 'pointer-events')).toBe('none')
    // …and it is PAINTED. `hidden` on this svg leaves the element in the DOM,
    // the inset intact and the reserved room empty — which is the exact defect
    // this test exists for, and it survived the first cut of these assertions.
    expect(winner(icon, 'display')).not.toBe('none')
    expect(winner(icon, 'visibility')).not.toBe('hidden')
    expect(winner(icon, 'opacity')).not.toBe('0')
    expect(winner(icon, 'color')).toBe('var(--text-faint)')
    expect(winner(icon, 'width')).toBe('var(--space-7)')
  })

  it('multi-selects with the same tick the checkbox draws, and stays open', async () => {
    const seen: string[] = []
    on('panel', (
      <Dropdown
        label="دپارتمان" options={ROLES} placeholder="دپارتمان"
        values={['reader']} onToggle={(v) => seen.push(v)}
      />
    ))
    await userEvent.click(screen.getByRole('button', { name: 'دپارتمان' }))
    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    expect(list.querySelectorAll('[data-tick]')).toHaveLength(3)
    await userEvent.click(screen.getByRole('option', { name: 'مدیر' }))
    expect(seen).toEqual(['admin'])
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('keeps its label bound even when the trigger text is the label', () => {
    // The filter bar shows «نقش» as the trigger text, so a second visible label
    // would be a duplicate — but dropping the label would leave the control
    // unnamed. `hideLabel` hides it; it never removes it.
    const { container } = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} hideLabel />)
    const name = container.querySelector('.sr-only')
    expect(name).toHaveTextContent('نقش')
    expect(screen.getByRole('button', { name: 'نقش' })).toBeInTheDocument()
  })

  it('writes no class that compiles to nothing — closed, open, searching, multi', async () => {
    const shut = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    expect(await dead(classStringOf(shut.container.querySelector('[data-dd]')!))).toEqual([])
    shut.unmount()

    const open = on('panel', (
      <Dropdown
        label="نقش" options={[{ value: 'a', label: 'الف', note: 'یادداشت' }]} placeholder="نقش"
        value="a" onChange={() => {}} searchable searchPlaceholder="ج"
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    expect(await dead(classStringOf(open.container.querySelector('[data-dd]')!))).toEqual([])
    await userEvent.type(screen.getByPlaceholderText('ج'), 'zzz')
    expect(await dead(classStringOf(open.container.querySelector('[data-dd]')!))).toEqual([])
    open.unmount()

    const multi = on('panel', <Dropdown label="د" options={ROLES} placeholder="د" values={[]} onToggle={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(await dead(classStringOf(multi.container.querySelector('[data-dd]')!))).toEqual([])
  })

  it('sits on the ladder\'s anchored-popover rung, not on the deliverable\'s 35', async () => {
    // Ledger L-42/L-43 — one role, one rung. The deliverable wrote the same
    // popover 25, 27, 30, 35, 37, 39 and 57, each exactly high enough to clear
    // whatever its own anchor sat in; a value that moves with nesting depth and
    // not with what the element IS records no distinction.
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const pop = await paint(screen.getByRole('listbox').className)
    expect(winner(pop, 'z-index')).toBe('var(--role-z-dropdown)')
    expect(roleTarget('--role-z-dropdown')).toBe('--z-dropdown')
    expect(tokenLiteral('--z-dropdown')).toBe('1000')
    expect(roleTarget('--role-z-nonesuch')).toBe('')
  })

  it('is the popover the design draws — 280 tall, 7 inset, 2 between, radius 16', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const pop = await paint(screen.getByRole('listbox').className)
    expect(winner(pop, 'position')).toBe('absolute')
    expect(winner(pop, 'top')).toBe('100%')
    expect(winner(pop, 'margin-top')).toBe('var(--space-3)')
    expect(winner(pop, 'max-height')).toBe('var(--height-popover)')
    expect(winner(pop, 'overflow')).toBe('auto')
    expect(winner(pop, 'padding')).toBe('var(--pad-popover)')
    expect(winner(pop, 'gap')).toBe('var(--space-half)')
    expect(winner(pop, 'border-radius')).toBe('var(--radius-card)')
    expect(winner(pop, 'border-color')).toBe('var(--border-card)')
    expect(winner(pop, 'background-color')).toBe('var(--card)')
    expect(winner(pop, '--tw-shadow')).toBe('var(--shadow-pop)')
    expect(tokenLiteral('--height-popover')).toBe('280px')
    expect(tokenLiteral('--pad-popover')).toBe('7px')
    expect(tokenLiteral('--space-3')).toBe('6px')
    // …and the card hairline, not the control's 1.5px, which is the one border
    // in this component that is NOT --line.
    expect(winner(pop, 'border-width')).toBe('1px')
  })

  it('anchors itself logically, the way a right-to-left app has to', async () => {
    // F10 — the design writes `inset-inline:0` and the deliverable's magnifier
    // a physical `right:11px`, which is the same edge only because the app is
    // never ltr. A physical `left`/`right` here mirrors the whole popover the
    // day anything renders ltr, and jsdom reports no geometry to catch it.
    on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    await userEvent.click(screen.getByRole('button'))
    const pop = await paint(screen.getByRole('listbox').className)
    expect(allProps(pop)).toContain('inset-inline-start')
    expect(allProps(pop)).toContain('inset-inline-end')
    expect(allProps(pop)).not.toContain('left')
    expect(allProps(pop)).not.toContain('right')

    const field = await paint(screen.getByPlaceholderText('ج').className)
    expect(allProps(field)).not.toContain('padding-left')
    expect(allProps(field)).not.toContain('padding-right')

    const opt = await paint(screen.getAllByRole('option')[0].className)
    expect(winner(opt, 'text-align')).toBe('start')
  })

  it('is the trigger the design draws, and fades only the placeholder', async () => {
    const empty = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش را انتخاب کنید" onChange={() => {}} />)
    const shut = await paint(screen.getByRole('button').className)
    expect(winner(shut, 'padding-top')).toBe('var(--space-5)')
    expect(winner(shut, 'padding-left')).toBe('var(--space-7)')
    expect(winner(shut, 'border-radius')).toBe('var(--radius-md)')
    expect(winner(shut, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(shut, 'border-color')).toBe('var(--line)')
    expect(winner(shut, 'background-color')).toBe('var(--card)')
    expect(winner(shut, 'font-size')).toBe('var(--fs-menu)')

    const ph = empty.container.querySelector('button > span') as HTMLElement
    const label = await paint(ph.className)
    expect(winner(label, 'color')).toBe('var(--text-faint)')
    // It fills the row and clips. Without these the chevron is dragged off the
    // trigger's inline end by a long value, or the trigger grows a second line.
    expect(winner(label, 'flex')).toBe('1 1 0%')
    expect(winner(label, 'overflow')).toBe('hidden')
    expect(winner(label, 'text-overflow')).toBe('ellipsis')
    expect(winner(label, 'white-space')).toBe('nowrap')
    empty.unmount()

    // …and the chosen value is NOT faint. The design gives the trigger two inks
    // (#2A1D5E chosen, #a99fc4 empty) and a component that faded both would
    // read as permanently unset.
    const filled = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" value="admin" onChange={() => {}} />)
    const value = filled.container.querySelector('button > span') as HTMLElement
    expect(value).toHaveTextContent('مدیر')
    expect(winner(await paint(value.className), 'color')).not.toBe('var(--text-faint)')
  })

  it('draws the chevron at the token size, not at an attribute', async () => {
    const { container } = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const chev = container.querySelector('button > svg') as SVGElement
    const p = await paint(chev.getAttribute('class') ?? '')
    expect(winner(p, 'width')).toBe('var(--size-chevron)')
    expect(winner(p, 'height')).toBe('var(--size-chevron)')
    expect(winner(p, 'color')).toBe('var(--text-muted)')
    expect(tokenLiteral('--size-chevron')).toBe('15px')
    expect(chev.getAttribute('width')).toBeNull()
    // It points DOWN. Nothing about a `d` attribute is checked by a class
    // string, a snapshot or a build, and the same glyph rotated is the pager's.
    expect(chev.querySelector('path')?.getAttribute('d')).toBe('M6 9l6 6 6-6')
  })

  it('is the option row the design draws, and marks the picked one twice over', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const picked = await paint(screen.getByRole('option', { name: 'مدیر' }).className)
    const rest = await paint(screen.getByRole('option', { name: 'ادیتور' }).className)

    expect(winner(rest, 'gap')).toBe('var(--gap-option)')
    expect(winner(rest, 'padding-top')).toBe('var(--space-5)')
    expect(winner(rest, 'padding-left')).toBe('var(--space-6)')
    expect(winner(rest, 'border-radius')).toBe('var(--radius-input)')
    expect(winner(rest, 'border-width')).toBe('0px')
    expect(winner(rest, 'cursor')).toBe('pointer')
    expect(tokenLiteral('--gap-option')).toBe('9px')

    // Tint AND weight, which is what the design changes; either alone leaves a
    // picked row that reads as unpicked at a glance.
    expect(winner(picked, 'background-color')).toBe('var(--tile-v2)')
    expect(winner(rest, 'background-color')).toBe('transparent')
    expect(winner(picked, 'font-weight')).toBe('var(--fw-bold)')
    expect(winner(rest, 'font-weight')).toBe('var(--fw-semibold)')
    // …and a row answers the pointer, which is the whole of its affordance.
    expect(winner(rest, 'background-color', ':hover')).toBe('var(--tile-v2)')
  })

  it('trails the single-select check after the label, as the design does', async () => {
    // design/Inja Panel.dc.html:1334 — `<span style="flex:1">{{label}}</span>`
    // and then the check. The brief led with it behind a 14px spacer, which
    // indents every label in the list by 23px the design does not draw.
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const picked = screen.getByRole('option', { name: 'مدیر' })
    const kids = Array.from(picked.children)
    expect(kids[0].tagName.toLowerCase()).toBe('span')
    expect(kids[kids.length - 1].tagName.toLowerCase()).toBe('svg')
    // The label fills the row, which is what puts the check at the inline END
    // rather than immediately after the text.
    expect(winner(await paint(kids[0].getAttribute('class') ?? ''), 'flex')).toBe('1 1 0%')
    const check = await paint(kids[kids.length - 1].getAttribute('class') ?? '')
    expect(winner(check, 'color')).toBe('var(--violet)')
    expect(winner(check, 'flex')).toBe('none')
    expect(winner(check, 'width')).toBe('var(--space-7)')
    // An unpicked row draws nothing there — no spacer, so the labels line up
    // with the popover's own inset rather than with a phantom column.
    const plain = screen.getByRole('option', { name: 'ادیتور' })
    expect(plain.querySelector('svg')).toBeNull()
    expect(plain.children).toHaveLength(1)
  })

  it('takes its trigger step from the surface, not from a prop', async () => {
    const panel = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const one = await paint(screen.getByRole('button').className)
    panel.unmount()
    on('reader', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const two = await paint(screen.getByRole('button').className)
    expect(winner(one, 'font-size')).toBe('var(--fs-menu)')
    expect(winner(two, 'font-size')).toBe('var(--fs-lg)')
  })

  it('names no size, density or scale — F4/F8 puts those on the shell', () => {
    const src = sourceOf('Dropdown.tsx')
    expect(src).not.toMatch(/(?<!-)\b(density|size|scale|compact|dense|roomy|variant)\??:\s*('|"|[A-Za-z])/)
    // …and writes no arbitrary value of ANY kind. guards.test.ts bans three
    // prefixes only, so `z-[35]` and `p-[7px]` would pass it while bypassing
    // the token layer entirely.
    for (const file of ['Checkbox.tsx', 'Radio.tsx', 'Dropdown.tsx']) {
      const arbitrary = sourceOf(file)
        .split('\n')
        .filter((l) => /\b[a-z-]+-\[[^\]]+\]/.test(l))
      expect(arbitrary, `${file} writes an arbitrary Tailwind value`).toEqual([])
    }
  })
})
