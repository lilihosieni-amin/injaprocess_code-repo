import { describe, it, expect } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { Checkbox, TickBox } from './Checkbox'
import { Radio } from './Radio'
import { Dropdown } from './Dropdown'
import { isTopDismissible, popDismissible, pushDismissible } from './dismissibleStack'

/* -------------------------------------------------------------------------
   Three halves, and the third is the one that matters.

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
   deleted a class nobody had named passed. `dead()` closes that from one side
   — it takes the element's OWN rendered class string and reports every class
   in it that emits nothing, so an invented name is caught whether or not this
   file thought to assert the property it was meant to set.

   This task's own review found the limit of THAT, and it is the whole reason
   for `sheet()` below. `dead()` only sees a class that emits NOTHING; a class
   swapped for another real one — `end-0` for `end-full`, `text-muted` for
   `text-card`, a dropped `flex-col` — compiles perfectly and survives. And a
   property-by-property assertion only ever constrains the properties whoever
   wrote it was thinking about. Thirty mutations survived that suite, every one
   of them landing on a declaration no assertion named.

   `sheet()` asserts the FULL emitted declaration set of an element — the
   popover, the trigger, the option, the tick, the dot, the row, the card —
   against a measured expectation. Adding an UNPREFIXED class, dropping one, or
   swapping one for a different real one all change that set, so the test does
   not have to have anticipated the property to fail on it.

   Unprefixed is the whole of that claim, and the re-review of this task was
   right to bound it: `sheet()` reads one state at a time and skips every rule
   carrying a `state` or a `media`, so a class ADDED under a variant leaves the
   resting snapshot identical — `hover:bg-coral`, `focus:border-violet`, and
   `md:hidden` on the popover, which is a menu that vanishes above the
   breakpoint with the rest of this file green. `conditional()` is the other
   half: it lists every non-resting rule an element's classes emit, and the
   three "writes only these conditional rules" tests pin those lists exactly.
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
 * `painted` is the house harness's leading-class parse, which `winner()` and
 * `sheet()` read. `alive` is every class that appears anywhere in a rule with a
 * body — which is the only way to see a variant class like
 * `peer-focus-visible:border-coral`, whose selector does not begin with it.
 */
async function compile(classNames: string): Promise<{
  painted: Painted[]
  alive: Set<string>
  raw: { selector: string; decls: string; media: string }[]
}> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  if (classes.length === 0) return { painted: [], alive: new Set(), raw: [] }
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const painted: Painted[] = []
  const alive = new Set<string>()
  const raw: { selector: string; decls: string; media: string }[] = []
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
      raw.push({ selector: sel, decls, media })
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
 * EVERY declaration these classes emit in `state`, resolved the way the cascade
 * resolves them — not the handful an assertion happened to name.
 *
 * This is the difference between "the properties I was thinking about are
 * right" and "these unprefixed classes and no others are on this element". A
 * `toEqual` against one of these fails on a class that was dropped, an
 * UNPREFIXED one that was added, and one that was swapped for a different real
 * class — none of which the property-by-property form can see. A class added
 * under a variant (`hover:`, `focus:`, `md:`) emits in a different state or
 * media and is invisible here BY CONSTRUCTION; `conditional()` below is what
 * catches that half.
 */
function sheet(painted: Painted[], state = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of painted) {
    if (p.state !== state || p.media !== '') continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      out[name] = rest.join(': ')
    }
  }
  return out
}

/**
 * Every rule these classes emit that a RESTING element does not get — each
 * `:hover`/`:focus`/peer rule, and each `@media` one, as its own line.
 *
 * `sheet()` deliberately sees only the resting state, so it cannot be the thing
 * that catches an ADDED variant class: `hover:bg-coral`, `focus:border-violet`
 * and — the sharp one — `md:hidden` on the popover all leave the resting
 * snapshot untouched, and `dead()` calls them alive because they do compile.
 * `md:hidden` in particular is a dropdown menu that vanishes above the
 * breakpoint with every other assertion in this file still green.
 *
 * A rule is resting iff it is unprefixed: no media, and a selector that is one
 * bare class and nothing else.
 */
function conditional(raw: { selector: string; media: string }[]): string[] {
  return [...new Set(
    raw
      .filter((r) => r.media !== '' || !/^\.(?:\\.|[\w-])+$/.test(r.selector))
      .map((r) => (r.media ? `@media ${r.media} ` : '') + r.selector.replace(/\\/g, '')),
  )].sort()
}

/** Every conditional rule the element and all of its descendants carry. */
async function conditionalsOf(root: Element): Promise<string[]> {
  return conditional((await compile(classStringOf(root))).raw)
}

/** The full declaration set an element actually renders with. */
async function styles(el: Element, state = ''): Promise<Record<string, string>> {
  const cls = el.getAttribute('class') ?? ''
  // An element with no class at all would snapshot as `{}` and match an
  // expectation of `{}` — the same "empty is not clean" hole `dead()` had.
  expect(cls.trim(), 'the element carries no class at all').not.toBe('')
  return sheet(await paint(cls), state)
}

/**
 * `peer` is Tailwind's marker class. It emits no rule BY DESIGN — it exists so
 * a sibling's `peer-*` variant has something to select against — so it is the
 * one name `dead()` may not call dead. Listed rather than pattern-matched, so
 * the exemption cannot quietly widen.
 */
const MARKER_ONLY = new Set(['peer'])

/**
 * Every class in this string that compiles to nothing.
 *
 * It REFUSES an empty string rather than answering `[]`. `dead('')` returning
 * "nothing dead here" made a harvest that had silently stopped matching
 * indistinguishable from a component with nothing wrong in it — which is the
 * one thing this helper exists to tell apart.
 */
async function dead(classNames: string): Promise<string[]> {
  if (classNames.trim() === '') {
    throw new Error('dead(): nothing was harvested — an empty class string is not a clean one')
  }
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

/**
 * One animation frame, flushed.
 *
 * An ArrowDown on a CLOSED trigger has to open first and then step in, and the
 * options do not exist until React has committed — so the component waits a
 * frame. jsdom runs `requestAnimationFrame`; nothing about that branch is
 * untestable, it was simply never reached.
 */
const frame = () => act(() => new Promise<void>((r) => { requestAnimationFrame(() => r()) }))

const tickOf = (c: Element) => c.querySelector('[data-tick]') as HTMLElement

/**
 * The control of this role whose accessible name is EXACTLY this string, or
 * null.
 *
 * `getByRole`'s string matcher is a whitespace-normalised full-string match run
 * against testing-library's own `dom-accessibility-api` — the same computation
 * a screen reader's announcement comes from. Asserting through it rather than
 * writing a second copy of the name algorithm here is the same rule the rest of
 * this file follows for the theme: read the real implementation, do not restate
 * it.
 */
const named = (role: string, name: string) => screen.queryByRole(role, { name })

describe('the harness itself', () => {
  // Every assertion below reads `winner()`, `sheet()` or `dead()`, and all
  // three answer ''/{}/[] for "nothing sets it" AND could answer it for "the
  // harvest was empty". If the compile silently produced nothing, the whole
  // file would pass green and prove nothing at all. Pin every direction before
  // using any of them.
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

  it('refuses an empty harvest rather than reporting it clean', async () => {
    // The flaw the review found in this file's own harness: `dead('')` answered
    // `[]`, so a `querySelector` that had stopped matching read exactly like a
    // component with nothing wrong in it.
    await expect(dead('')).rejects.toThrow(/nothing was harvested/)
    await expect(dead('   ')).rejects.toThrow(/nothing was harvested/)
  })

  it('snapshots the WHOLE declaration set, so an unnamed property still fails', async () => {
    // The property-by-property form cannot see a dropped class it never named;
    // this can. Both directions, or the snapshots below prove nothing.
    expect(sheet(await paint('flex flex-col gap-half'))).toEqual({
      display: 'flex', 'flex-direction': 'column', gap: 'var(--space-half)',
    })
    expect(sheet(await paint('flex gap-half'))).not.toEqual({
      display: 'flex', 'flex-direction': 'column', gap: 'var(--space-half)',
    })
    // …and a class SWAPPED for another real one — the mutation `dead()` is
    // blind to, because both compile.
    expect(sheet(await paint('end-0'))).not.toEqual(sheet(await paint('end-full')))
    // States are kept apart, so a `:hover` rule cannot stand in for the resting one.
    expect(sheet(await paint('hover:bg-tile-v2'))).toEqual({})
    expect(sheet(await paint('hover:bg-tile-v2'), ':hover')).toEqual({ 'background-color': 'var(--tile-v2)' })
  })

  it('lists the conditional rules the resting snapshot is blind to', async () => {
    // The bound on the claim above, pinned rather than asserted in prose. A
    // resting `sheet()` cannot see a variant class, so `conditional()` has to —
    // and both halves are pinned here, or the three component-level lists below
    // prove nothing.
    expect(conditional((await compile('flex px-s7')).raw)).toEqual([])

    const hover = await compile('hover:bg-coral')
    expect(sheet(hover.painted)).toEqual({})
    expect(conditional(hover.raw)).toEqual(['.hover:bg-coral:hover'])

    // The sharp one: a breakpoint class changes NO resting declaration, so the
    // popover could be given `md:hidden` — invisible above 768px — and every
    // other assertion in this file would still pass.
    const media = await compile('md:hidden')
    expect(sheet(media.painted)).toEqual({})
    expect(conditional(media.raw)).toEqual(['@media (min-width: 768px) .md:hidden'])

    // A peer rule is conditional too: its selector is not one bare class.
    expect(conditional((await compile('peer-focus-visible:border-coral')).raw))
      .toEqual(['.peer:focus-visible ~ .peer-focus-visible:border-coral'])
  })

  it('reads the token files, so a literal here is measured and not restated', () => {
    expect(tokenLiteral('--size-tick')).toBe('19px')
    expect(tokenLiteral('--nonesuch')).toBe('')
  })

  it('sees an aria-labelledby override the way a screen reader does', () => {
    // `named()` is load-bearing for the Dropdown trigger below, where
    // `aria-labelledby` REPLACES the element's contents. Pin that a role query
    // reports the override and NOT the text — otherwise the accessible-name
    // assertions further down prove nothing.
    render(
      <div>
        <span id="h-lbl">برچسب</span>
        <button aria-labelledby="h-lbl">متن</button>
      </div>,
    )
    expect(named('button', 'برچسب')).toBeTruthy()
    expect(named('button', 'متن')).toBeNull()
    // …and it is an EXACT match, not a substring one.
    expect(named('button', 'برچ')).toBeNull()
  })
})

/* ---------------------------------------------------------------------------
   The measured declaration sets. Every one of these was harvested from the
   rendered component and its compiled CSS, not written from the design by
   hand — a hand-written expectation is a second record of the same numbers and
   drifts silently. The shared halves are named once so the difference between
   two states is the only thing spelled out twice.
   --------------------------------------------------------------------------- */

/**
 * The tick square at one rung of the ladder — §5.2, ledger L-10, owner ruling
 * R36. The box and the radius are the only things a rung changes; everything
 * else about the square is the same at all four.
 */
const tickBox = (size: string, radius: string) => ({
  display: 'inline-flex',
  width: `var(${size})`,
  height: `var(${size})`,
  flex: 'none',
  'align-items': 'center',
  'justify-content': 'center',
  'border-radius': `var(${radius})`,
  'border-width': 'var(--border-hairline)',
  // White check on whichever fill; a tick the colour of its own box is invisible.
  color: 'var(--card)',
})
const ticked = (box: Record<string, string>) =>
  ({ ...box, 'background-color': 'var(--violet)', 'border-color': 'var(--violet)' })
const unticked = (box: Record<string, string>) =>
  ({ ...box, 'background-color': 'var(--card)', 'border-color': 'var(--border-pick)' })

/** What `Checkbox` draws: its row IS the design's form field (panel 1344, 1356). */
const TICK_BOX = tickBox('--size-tick-field', '--radius-tick')
const TICK_ON = ticked(TICK_BOX)
const TICK_OFF = unticked(TICK_BOX)

/** What a dropdown option draws — the tick nested inside another option (panel 1386). */
const OPTION_TICK_ON = ticked(tickBox('--size-tick-nested', '--radius-tick-nested'))
const OPTION_TICK_OFF = unticked(tickBox('--size-tick-nested', '--radius-tick-nested'))

/** The checkbox row — `gap:11px; padding:13px 14px; radius 12` (§5.2). */
const CHECKBOX_ROW = {
  position: 'relative',
  display: 'flex',
  'align-items': 'center',
  gap: 'var(--gap-tick-row)',
  'padding-left': 'var(--space-7)',
  'padding-right': 'var(--space-7)',
  'padding-top': 'var(--pad-tick-row-y)',
  'padding-bottom': 'var(--pad-tick-row-y)',
  'border-radius': 'var(--radius-md)',
  'border-width': 'var(--border-hairline)',
}
const ROW_ON = { 'background-color': 'var(--tile-v4)', 'border-color': 'var(--border-pick)' }
const ROW_OFF = { 'background-color': 'var(--card)', 'border-color': 'var(--line)' }

/** The round pick — `gap:12px; padding:14px 15px; radius 14` (§5.2). */
const RADIO_CARD = {
  position: 'relative',
  display: 'flex',
  cursor: 'pointer',
  // flex-start, not center: the dot sits against the FIRST line of a
  // two- or three-line option, not the middle of the whole block.
  'align-items': 'flex-start',
  gap: 'var(--space-6)',
  'padding-left': 'var(--pad-radio-x)',
  'padding-right': 'var(--pad-radio-x)',
  'padding-top': 'var(--space-7)',
  'padding-bottom': 'var(--space-7)',
  'border-radius': 'var(--radius-tile)',
  'border-width': 'var(--border-hairline)',
}
const RADIO_DOT = {
  'margin-top': 'var(--space-half)',
  display: 'inline-flex',
  width: 'var(--size-tick)',
  height: 'var(--size-tick)',
  flex: 'none',
  'align-items': 'center',
  'justify-content': 'center',
  'border-radius': 'var(--radius-round)',
  'border-width': 'var(--border-hairline)',
}
const DOT_ON = { ...RADIO_DOT, 'background-color': 'var(--violet)', 'border-color': 'var(--violet)' }
const DOT_OFF = { ...RADIO_DOT, 'background-color': 'var(--card)', 'border-color': 'var(--border-pick)' }

/** The dropdown trigger — the design's screen-level control (§4.3, §4.6). */
const TRIGGER = {
  display: 'flex',
  width: '100%',
  cursor: 'pointer',
  'align-items': 'center',
  gap: 'var(--space-5)',
  'padding-left': 'var(--space-7)',
  'padding-right': 'var(--space-7)',
  'padding-top': 'var(--space-5)',
  'padding-bottom': 'var(--space-5)',
  'border-radius': 'var(--radius-md)',
  'border-width': 'var(--border-hairline)',
  'background-color': 'var(--card)',
  'text-align': 'start',
  'font-size': 'var(--fs-menu)',
  color: 'var(--ink)',
}

/**
 * The popover box. `position:absolute` is only anchored to the trigger because
 * `[data-dd]` is `relative`; `inset-inline` rather than left/right because the
 * app is rtl; `flex-direction:column` because without it three options lay out
 * across a 280px box.
 */
const POPOVER = {
  position: 'absolute',
  top: '100%',
  'inset-inline-start': '0px',
  'inset-inline-end': '0px',
  'z-index': 'var(--role-z-dropdown)',
  'margin-top': 'var(--space-3)',
  display: 'flex',
  'flex-direction': 'column',
  gap: 'var(--space-half)',
  'max-height': 'var(--height-popover)',
  overflow: 'auto',
  padding: 'var(--pad-popover)',
  'border-radius': 'var(--radius-card)',
  // The CARD hairline (1px), not the control's 1.5px --line.
  'border-width': '1px',
  'border-color': 'var(--border-card)',
  'background-color': 'var(--card)',
  '--tw-shadow': 'var(--shadow-pop)',
  '--tw-shadow-colored': 'var(--shadow-pop)',
  'box-shadow':
    'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
}

/** The options container — the element that actually carries `role="listbox"`. */
const LISTBOX = { display: 'flex', 'flex-direction': 'column', gap: 'var(--space-half)' }

/** One option row inside it. */
const OPTION_ROW = {
  display: 'flex',
  width: '100%',
  cursor: 'pointer',
  'align-items': 'center',
  gap: 'var(--gap-option)',
  'padding-left': 'var(--space-6)',
  'padding-right': 'var(--space-6)',
  'padding-top': 'var(--space-5)',
  'padding-bottom': 'var(--space-5)',
  'border-radius': 'var(--radius-input)',
  'border-width': '0px',
  'text-align': 'start',
  'font-size': 'var(--fs-sm)',
  color: 'var(--ink)',
}

/**
 * What `sr-only` and NOTHING ELSE emits.
 *
 * Named once and asserted at all three sites — both sr-only inputs and the
 * hidden dropdown caption — because `toHaveClass('peer','sr-only')` is
 * satisfied by `"peer sr-only hidden"`. In jsdom that mutation is invisible
 * from every direction: no stylesheet is loaded, so `input.focus()` still
 * focuses, and label clicks forward whatever the input's display is. In a
 * browser `display:none` takes the control out of the tab order AND out of the
 * accessibility tree, so the change-supervisor dialog looks perfect, works with
 * a mouse, and is completely unreachable by keyboard and silent to a screen
 * reader. The declaration set is the only place that shows.
 */
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  'border-width': '0',
}

/** The in-popover search field (§8, design/Inja Panel.dc.html:1220). */
const SEARCH_FIELD = {
  'box-sizing': 'border-box',
  width: '100%',
  'border-radius': 'var(--radius-control)',
  'border-width': 'var(--border-hairline)',
  'border-color': 'var(--line)',
  'background-color': 'var(--card)',
  'padding-top': 'var(--pad-search-y-menu)',
  'padding-bottom': 'var(--pad-search-y-menu)',
  'padding-inline-start': 'var(--pad-search-x-menu)',
  'padding-inline-end': 'var(--space-6)',
  'font-size': 'var(--fs-sm2)',
  color: 'var(--ink)',
  // `outline-none` — which is exactly why `focus:border-coral` beside it is
  // the ONLY focus indicator this field has.
  outline: '2px solid transparent',
  'outline-offset': '2px',
}

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

  it('paints the tick with these declarations and no others — on and off', async () => {
    // The whole set, not the four properties an author was thinking about. A
    // dropped `flex-none`, a swapped radius, an added utility: all fail here.
    const lit = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    expect(await styles(tickOf(lit.container))).toEqual(TICK_ON)
    lit.unmount()
    const dark = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    expect(await styles(tickOf(dark.container))).toEqual(TICK_OFF)
    dark.unmount()
    // …and TickBox on its own paints the same thing at the same rung, since the
    // screens that place a bare tick draw this and not a fourth copy.
    const bare = on('panel', <TickBox on rung="field" />)
    expect(await styles(bare.container.querySelector('[data-tick]')!)).toEqual(TICK_ON)
  })

  it('writes no class that compiles to nothing — on, off, and LOCKED', async () => {
    // The half `toHaveClass` cannot do. An invented name passes every assertion
    // above and emits no rule; this reads the component's own rendered string.
    // The `disabled` branch is here because `dead()` can only see the states a
    // test actually renders — the review found two invented names could have
    // hidden in this branch precisely because nothing rendered it.
    for (const props of [
      { checked: false, hint: 'چرا' },
      { checked: true },
      { checked: true, disabled: true },
      { checked: false, disabled: true, hint: 'چرا' },
    ] as const) {
      const r = on('panel', <Checkbox label="کل سامانه" onChange={() => {}} {...props} />)
      const harvested = classStringOf(r.container.querySelector('label')!)
      expect(harvested).not.toBe('')
      expect(await dead(harvested), JSON.stringify(props)).toEqual([])
      r.unmount()
    }
  })

  it('writes no conditional rule but the one focus idiom', async () => {
    // The half every declaration snapshot above is blind to. `sheet()` reads
    // one state at a time, so a class ADDED under a variant changes nothing it
    // asserts and `dead()` calls it alive: `hover:bg-coral` on the row and
    // `md:hidden` on it both survive the entire file. This is the exact list.
    const seen = new Set<string>()
    for (const props of [
      { checked: false, hint: 'چرا' },
      { checked: true },
      { checked: true, disabled: true },
    ] as const) {
      const r = on('panel', <Checkbox label="کل سامانه" onChange={() => {}} {...props} />)
      for (const c of await conditionalsOf(r.container.querySelector('label')!)) seen.add(c)
      r.unmount()
    }
    expect([...seen].sort()).toEqual([
      '.peer:focus-visible ~ .peer-focus-visible:border-coral',
    ])
  })

  it('draws the 18px box its own row is drawn at, with the 12px check inside it', async () => {
    const { container } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    const tick = tickOf(container)
    // Owner ruling R36 reversed L-10's provisional normalisation. `Checkbox`'s
    // ROW is `gap:11px; padding:13px 14px; radius 12` and the design draws that
    // row exactly twice — the supervisor flag (panel 1344) and «کل سامانه»
    // (panel 1356) — with an 18px tick in both. The declarations above name the
    // tokens; these are what the tokens are worth.
    expect(tokenLiteral('--size-tick-field')).toBe('18px')
    expect(tokenLiteral('--radius-tick')).toBe('6px')
    expect(tokenLiteral('--border-hairline')).toBe('1.5px')

    const glyph = tick.querySelector('svg') as SVGElement
    expect(await styles(glyph)).toEqual({
      width: 'var(--size-tick-glyph-field)', height: 'var(--size-tick-glyph-field)',
    })
    expect(tokenLiteral('--size-tick-glyph-field')).toBe('12px')
    expect(glyph.getAttribute('stroke-width')).toBe('3')
    // Sized by the token, never by an SVG attribute — an attribute is a second
    // record of a number the token layer already holds.
    expect(glyph.getAttribute('width')).toBeNull()
    // It is a CHECK. Nothing about a `d` attribute is checked by a class
    // string, a snapshot or a build.
    expect(glyph.querySelector('path')?.getAttribute('d')).toBe('M20 6L9 17l-5-5')
    // And the unchecked box draws nothing at all inside itself.
    const off = on('panel', <TickBox on={false} rung="field" />)
    expect(off.container.querySelector('svg')).toBeNull()
  })

  /*
   * Owner ruling R36, in one table: each row is a rung of the design's ladder,
   * the design line that draws it, the box, the radius and the check inside it.
   *
   * One `it` per rung rather than one loop inside one `it`: each rung costs
   * three Tailwind compiles and four of them in a single test ran past the 5s
   * per-test budget under whole-suite contention. Four tests also name the rung
   * that failed in the report line rather than in an assertion message.
   */
  const RUNGS = [
    // rung      design    box                    radius                   check                       stroke
    ['row',    '1764', '--size-tick',        '--radius-tick',        '--size-tick-glyph',        '3'],
    ['field',  '1344', '--size-tick-field',  '--radius-tick',        '--size-tick-glyph-field',  '3'],
    ['scope',  '1369', '--size-tick-scope',  '--radius-tick',        '--size-tick-glyph-nested', '3.2'],
    ['nested', '1386', '--size-tick-nested', '--radius-tick-nested', '--size-tick-glyph-nested', '3.2'],
  ] as const
  const PX = { row: '19px', field: '18px', scope: '17px', nested: '16px' }
  const RADIUS_PX = { row: '6px', field: '6px', scope: '6px', nested: '5px' }
  const GLYPH_PX = { row: '13px', field: '12px', scope: '11px', nested: '11px' }

  for (const [rung, line, box, radius, check, stroke] of RUNGS) {
    it(`owner ruling R36 — draws the \`${rung}\` rung the design draws at panel ${line}`, async () => {
      // Compiled CSS on both halves. `toHaveClass` would pass on a misspelt
      // name that emits nothing, and a rung whose box is right and whose radius
      // came from the neighbouring rung is exactly the mistake a ladder invites.
      //
      // The radius does NOT track the size — 19, 18 and 17 are all drawn at 6
      // and only 16 at 5 — so each is read off the design at its own site
      // rather than interpolated between the two rungs that were already known.
      const r = on('panel', <TickBox on rung={rung} />)
      const el = r.container.querySelector('[data-tick]') as HTMLElement
      expect(await styles(el)).toEqual(ticked(tickBox(box, radius)))
      expect(tokenLiteral(box)).toBe(PX[rung])
      expect(tokenLiteral(radius)).toBe(RADIUS_PX[rung])
      expect(el.getAttribute('data-rung')).toBe(rung)

      const glyph = r.container.querySelector('svg') as SVGElement
      expect(await styles(glyph)).toEqual({ width: `var(${check})`, height: `var(${check})` })
      expect(tokenLiteral(check)).toBe(GLYPH_PX[rung])
      expect(glyph.getAttribute('stroke-width')).toBe(stroke)
    })
  }

  it('owner ruling R36 — writes no dead class at any rung, and the four boxes are four', async () => {
    // The half a declaration snapshot cannot do, run at every rung rather than
    // at whichever one happened to be the default.
    for (const [rung] of RUNGS) {
      const r = on('panel', <TickBox on rung={rung} />)
      const el = r.container.querySelector('[data-tick]') as HTMLElement
      expect(await dead(classStringOf(el)), rung).toEqual([])
      r.unmount()
    }
    // Four DISTINCT boxes, which is the whole of what the owner ruled: a mint
    // that gave two rungs one token would satisfy every assertion above.
    expect(new Set(RUNGS.map(([, , box]) => tokenLiteral(box))).size).toBe(4)
  })

  it('is the row the design draws — gap 11, padding 13/14, radius 12', async () => {
    const off = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    expect(await styles(off.container.querySelector('label')!))
      .toEqual({ ...CHECKBOX_ROW, ...ROW_OFF, cursor: 'pointer' })
    off.unmount()
    const lit = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    expect(await styles(lit.container.querySelector('label')!))
      .toEqual({ ...CHECKBOX_ROW, ...ROW_ON, cursor: 'pointer' })

    // §5.2 draws `gap:11px; padding:13px 14px`. The brief paired that gap with
    // the NESTED row's 11/12 padding, which is a different composition.
    expect(tokenLiteral('--gap-tick-row')).toBe('11px')
    expect(tokenLiteral('--pad-tick-row-y')).toBe('13px')
    expect(tokenLiteral('--space-7')).toBe('14px')
    expect(tokenLiteral('--border-pick')).toBe('#C9B8EC')
  })

  it('shows a locked row as locked, and refuses the click', async () => {
    // The one branch no test rendered. `disabled` changed TWO things — the
    // cursor and the opacity — and dropping the opacity leaves a row that is
    // dead to the pointer and identical to a live one on screen.
    const seen: boolean[] = []
    const { container } = on('panel', (
      <Checkbox label="نام گام" checked disabled onChange={(v) => seen.push(v)} />
    ))
    const row = container.querySelector('label')!
    expect(await styles(row)).toEqual({
      ...CHECKBOX_ROW, ...ROW_ON, cursor: 'default', opacity: '0.6',
    })
    const input = screen.getByRole('checkbox') as HTMLInputElement
    expect(input).toBeDisabled()
    await userEvent.click(input)
    expect(seen).toEqual([])

    // …and it is ONLY the locked row that is faded and inert. Without this the
    // whole assertion above is satisfied by a component that fades every row.
    const live = on('panel', <Checkbox label="نام گام" checked onChange={() => {}} />)
    const liveStyles = await styles(live.container.querySelector('label')!)
    expect(liveStyles.opacity).toBeUndefined()
    expect(liveStyles.cursor).toBe('pointer')
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
    expect(input).toHaveClass('peer')
    // `sr-only` clips; `display:none` and `visibility:hidden` would also take
    // the control off the tab order, which is the mutation this catches.
    expect(await styles(input)).toEqual(SR_ONLY)
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
    // …and it is the DESCRIPTION only. The <label> wraps the hint too, so
    // implicit labelling put the explanation in the name as well and a screen
    // reader read the whole paragraph twice — once as what the control is
    // called, once as what it is described by.
    expect(named('checkbox', 'سرپرست‌شدن')).toBe(el)
    expect(screen.queryAllByRole('checkbox', { name: /این پرچم/ })).toHaveLength(0)
    // …and a row WITHOUT one points at nothing, rather than at an id that is
    // not in the document.
    const bare = on('panel', <Checkbox label="س" checked={false} onChange={() => {}} />)
    const bareInput = bare.container.querySelector('input')!
    expect(bareInput).not.toHaveAttribute('aria-describedby')
    expect(named('checkbox', 'س')).toBe(bareInput)
  })

  it('draws title and explanation as two different steps, not two titles', async () => {
    const { container } = on('panel', (
      <Checkbox label="سرپرست‌شدن" checked={false} onChange={() => {}} hint="توضیح" />
    ))
    expect(await styles(screen.getByText('توضیح'))).toEqual({
      'margin-top': 'var(--space-1)',
      display: 'block',
      'font-size': 'var(--fs-xs)',
      'line-height': 'var(--lh-normal)',
      color: 'var(--text-faint)',
    })
    expect(await styles(container.querySelector('.font-bold')!)).toEqual({
      display: 'block',
      'font-size': 'var(--fs-menu)',
      'font-weight': 'var(--fw-bold)',
      color: 'var(--ink)',
    })
    // The box the two lines sit in. `min-w-0` is what lets a long unbroken hint
    // WRAP inside the row rather than force the flex item past the row's edge —
    // a flex item's min-width is `auto`, not 0, so without it the row overflows.
    expect(await styles(container.querySelector('label > span:last-child')!))
      .toEqual({ 'min-width': '0px' })
    expect(tokenLiteral('--fs-xs')).toBe('11.5px')
    expect(tokenLiteral('--lh-normal')).toBe('1.7')
    // 4px of lead, which is NOT the radio note's 5px — two roles, two leads.
    expect(tokenLiteral('--space-1')).toBe('4px')
    expect(tokenLiteral('--space-1')).not.toBe(tokenLiteral('--space-2'))
    // The hint is FAINTER than the title, which is the distinction that makes
    // the row read as one thing with a note rather than as two rows.
    expect(tokenLiteral('--text-faint')).not.toBe(tokenLiteral('--ink'))
  })

  it('takes its title step from the surface, not from a prop', async () => {
    const panel = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const one = await styles(panel.container.querySelector('.font-bold')!)
    panel.unmount()
    const reader = on('reader', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const two = await styles(reader.container.querySelector('.font-bold')!)

    expect(one['font-size']).toBe('var(--fs-menu)')
    expect(two['font-size']).toBe('var(--fs-lg)')
    // …and NOTHING ELSE moves with the surface.
    expect({ ...one, 'font-size': '' }).toEqual({ ...two, 'font-size': '' })
    expect(tokenLiteral('--fs-menu')).toBe('13.5px')
    expect(tokenLiteral('--fs-lg')).toBe('15px')
  })

  it('toggles from the label text, not only from the box', async () => {
    // The binding, asserted as BEHAVIOUR rather than as an `htmlFor` attribute —
    // the input is inside its own <label>, so explicit and implicit association
    // are both correct and only the outcome is worth pinning.
    const seen: boolean[] = []
    on('panel', <Checkbox label="کل سامانه" checked={false} onChange={(v) => seen.push(v)} hint="توضیح" />)
    await userEvent.click(screen.getByText('کل سامانه'))
    expect(seen).toEqual([true])
    // …and the hint is part of the same target, so a stray click there is not
    // a click on nothing.
    await userEvent.click(screen.getByText('توضیح'))
    expect(seen).toEqual([true, true])
  })

  it('takes the id and the extra class the caller gives it', async () => {
    // Ignoring either prop outright survived everything else in this file —
    // the same `className` mutation dies on `Dropdown` only because one test
    // there happens to pass one. A caller's `id` is what a screen's own
    // `aria-describedby` or <label for> outside the row points at, and
    // `className` is how a screen places the row in its own grid.
    const given = on('panel', (
      <Checkbox label="کل سامانه" checked={false} onChange={() => {}} id="perm-all" className="w-full" />
    ))
    const row = given.container.querySelector('label')!
    expect(screen.getByRole('checkbox')).toHaveAttribute('id', 'perm-all')
    expect(row).toHaveAttribute('for', 'perm-all')
    expect(await styles(row)).toEqual({ ...CHECKBOX_ROW, ...ROW_OFF, cursor: 'pointer', width: '100%' })
    given.unmount()

    // …and with no id given the row still binds to itself, so the caller's
    // prop is an override rather than the only thing holding the pair together.
    const auto = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    const input = auto.container.querySelector('input')!
    expect(input.id).not.toBe('')
    expect(auto.container.querySelector('label')).toHaveAttribute('for', input.id)
  })

  it('announces nothing decorative', () => {
    // The painted square is `aria-hidden`: the native input already carries the
    // role, the state and the name, and a second empty node beside it is one
    // more thing for a screen reader to walk past on every row.
    const { container } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} hint="توضیح" />)
    expect(tickOf(container)).toHaveAttribute('aria-hidden')
    const svgs = Array.from(container.querySelectorAll('svg'))
    expect(svgs).toHaveLength(1)
    for (const svg of svgs) expect(svg.getAttribute('focusable')).toBe('false')
    // The row's whole name is the label — the tick contributes nothing to it.
    expect(named('checkbox', 'کل سامانه')).toBe(screen.getByRole('checkbox'))
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

  it('writes no class that compiles to nothing — picked or not', async () => {
    for (const checked of [true, false]) {
      const r = on('panel', (
        <Radio name="s" value="a" checked={checked} onChange={() => {}} label="سحر" note="یادداشت" />
      ))
      const harvested = classStringOf(r.container.querySelector('label')!)
      expect(harvested).not.toBe('')
      expect(await dead(harvested), String(checked)).toEqual([])
      r.unmount()
    }
  })

  it('writes no conditional rule but the one focus idiom', async () => {
    const seen = new Set<string>()
    for (const checked of [true, false]) {
      const r = on('panel', (
        <Radio name="s" value="a" checked={checked} onChange={() => {}} label="سحر" note="یادداشت" />
      ))
      for (const c of await conditionalsOf(r.container.querySelector('label')!)) seen.add(c)
      r.unmount()
    }
    expect([...seen].sort()).toEqual([
      '.peer:focus-visible ~ .peer-focus-visible:border-coral',
    ])
  })

  it('paints the dot with these declarations and no others — picked and not', async () => {
    // The mutation this exists for: giving the UNPICKED dot the picked one's
    // fill, so every option in the group reads as chosen. Nothing in the old
    // suite rendered an unpicked dot at all.
    const lit = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const dotOn = lit.container.querySelector('label > span[aria-hidden]')!
    expect(await styles(dotOn)).toEqual(DOT_ON)
    // …with the 8px white pip inside it. A pip the colour of its ring is a
    // picked radio that looks unpicked.
    expect(await styles(dotOn.firstElementChild!)).toEqual({
      width: 'var(--space-4)', height: 'var(--space-4)',
      'border-radius': 'var(--radius-round)', 'background-color': 'var(--card)',
    })
    lit.unmount()

    const dark = on('panel', <Radio name="s" value="a" checked={false} onChange={() => {}} label="سحر" />)
    const dotOff = dark.container.querySelector('label > span[aria-hidden]')!
    expect(await styles(dotOff)).toEqual(DOT_OFF)
    // …and it holds NO pip, so an unpicked option is empty rather than white-on-white.
    expect(dotOff.firstElementChild).toBeNull()

    expect(tokenLiteral('--radius-round')).toBe('50%')
    expect(tokenLiteral('--space-4')).toBe('8px')
    expect(tokenLiteral('--space-half')).toBe('2px')
  })

  it('shows focus the one way the design shows focus', async () => {
    // The sibling test `Checkbox` has and `Radio` did not. The input is
    // `sr-only`, so without this class a keyboard user tabbing through the
    // change-supervisor dialog gets no focus indicator AT ALL.
    const { container } = on('panel', <Radio name="s" value="a" checked={false} onChange={() => {}} label="سحر" />)
    const dot = container.querySelector('label > span[aria-hidden]')!
    expect(dot).toHaveClass('peer-focus-visible:border-coral')
    const { raw } = await compile(dot.getAttribute('class') ?? '')
    const rule = raw.find((r) => r.selector.includes('peer-focus-visible'))
    expect(rule?.decls).toBe('border-color: var(--coral)')
    expect(rule?.selector).toMatch(/\.peer:focus-visible\s*~/)
    // …and the input it answers is really the peer beside it, hidden the one
    // way that keeps it. The sibling assertion `Checkbox` had and this did not:
    // `toHaveClass('peer','sr-only')` is satisfied by `"peer sr-only hidden"`,
    // and `display:none` here is a change-supervisor dialog that mouse-works
    // and is unreachable by keyboard and silent to a screen reader.
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).toHaveClass('peer')
    expect(await styles(input)).toEqual(SR_ONLY)
    expect(input.nextElementSibling).toBe(dot)
    input.focus()
    expect(input).toHaveFocus()
  })

  it('is the card the design draws — gap 12, padding 14/15, radius 14', async () => {
    const lit = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    expect(await styles(lit.container.querySelector('label')!)).toEqual({
      ...RADIO_CARD, 'background-color': 'var(--tile-v2)', 'border-color': 'var(--violet)',
    })
    lit.unmount()
    const rest = on('panel', <Radio name="s" value="a" checked={false} onChange={() => {}} label="سحر" />)
    expect(await styles(rest.container.querySelector('label')!)).toEqual({
      ...RADIO_CARD, 'background-color': 'var(--card)', 'border-color': 'var(--warm)',
    })
    expect(tokenLiteral('--pad-radio-x')).toBe('15px')
    expect(tokenLiteral('--radius-tile')).toBe('14px')
    // Two different edges, not one written twice.
    expect(tokenLiteral('--warm')).not.toBe(tokenLiteral('--violet'))
  })

  it('draws its note in the muted step the design gives it, not the checkbox hint\'s', async () => {
    // #8a7db0 (--text-muted) on the supervisor option, against #a99fc4
    // (--text-faint) on the checkbox hint. Two roles, two colours, and 5px of
    // lead rather than 3px; the brief used the checkbox's for both.
    on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" note="یادداشت" />)
    expect(await styles(screen.getByText('یادداشت'))).toEqual({
      'margin-top': 'var(--space-2)',
      display: 'block',
      'font-size': 'var(--fs-xs)',
      'line-height': 'var(--lh-normal)',
      color: 'var(--text-muted)',
    })
    expect(tokenLiteral('--text-muted')).toBe('#8a7db0')
    expect(tokenLiteral('--text-faint')).toBe('#a99fc4')
    expect(tokenLiteral('--space-2')).toBe('5px')
    // …inside a box that may shrink, so a long unbroken note wraps rather than
    // pushing the option card past its own edge.
    expect(await styles(screen.getByText('یادداشت').parentElement!))
      .toEqual({ 'min-width': '0px' })
  })

  it('takes its title step from the surface, not from a prop', async () => {
    const panel = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const one = await styles(panel.container.querySelector('.font-bold')!)
    panel.unmount()
    const reader = on('reader', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    const two = await styles(reader.container.querySelector('.font-bold')!)
    expect(one).toEqual({
      display: 'block', 'font-size': 'var(--fs-menu)',
      'font-weight': 'var(--fw-bold)', color: 'var(--ink)',
    })
    expect(two).toEqual({ ...one, 'font-size': 'var(--fs-lg)' })
  })

  it('picks from the label text, not only from the dot', async () => {
    const seen: string[] = []
    on('panel', (
      <Radio name="sup" value="09120000000" checked={false} onChange={(v) => seen.push(v)} label="سحر بیات" note="یادداشت" />
    ))
    await userEvent.click(screen.getByText('سحر بیات'))
    expect(seen).toEqual(['09120000000'])
    await userEvent.click(screen.getByText('یادداشت'))
    expect(seen).toEqual(['09120000000', '09120000000'])
  })

  it('takes the id and class the caller gives it, and carries its own value', async () => {
    const given = on('panel', (
      <Radio
        name="sup" value="09120000000" checked onChange={() => {}} label="سحر"
        id="sup-1" className="w-full"
      />
    ))
    const input = screen.getByRole('radio') as HTMLInputElement
    const card = given.container.querySelector('label')!
    expect(input).toHaveAttribute('id', 'sup-1')
    expect(card).toHaveAttribute('for', 'sup-1')
    expect(await styles(card)).toEqual({
      ...RADIO_CARD, 'background-color': 'var(--tile-v2)',
      'border-color': 'var(--violet)', width: '100%',
    })
    // The NATIVE value, which the `onChange` assertion above does not reach —
    // that one reads the prop back out of a closure and passes with no `value`
    // attribute at all. A radio group in a real <form> submits this, and the
    // group is only a group because each input in it carries a distinct one.
    expect(input).toHaveAttribute('value', '09120000000')
    given.unmount()

    const auto = on('panel', <Radio name="s" value="a" checked={false} onChange={() => {}} label="سحر" />)
    const bare = auto.container.querySelector('input')!
    expect(bare.id).not.toBe('')
    expect(auto.container.querySelector('label')).toHaveAttribute('for', bare.id)
  })

  it('announces nothing decorative, and reads the scope line as part of the choice', () => {
    const bare = on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" />)
    expect(bare.container.querySelector('label > span[aria-hidden]')).toBeTruthy()
    // The ring and the pip are paint; the native radio carries the whole of the
    // control's meaning.
    expect(bare.container.querySelectorAll('svg')).toHaveLength(0)
    expect(named('radio', 'سحر')).toBe(screen.getByRole('radio'))
    bare.unmount()

    // The note here is a SCOPE line — «دسترسی: کل سامانه» — and it is part of
    // what the reader is choosing between, not a description of a control they
    // have already identified. So unlike the checkbox's hint it belongs IN the
    // name, and there is no `aria-describedby` to read it out a second time.
    on('panel', <Radio name="s" value="a" checked onChange={() => {}} label="سحر" note="دسترسی: کل سامانه" />)
    const el = screen.getByRole('radio')
    expect(named('radio', 'سحر دسترسی: کل سامانه')).toBe(el)
    expect(named('radio', 'سحر')).toBeNull()
    expect(el).not.toHaveAttribute('aria-describedby')
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

const popoverOf = (c: Element) => c.querySelector('[data-popover]') as HTMLElement

describe('Dropdown', () => {
  it('is a closed listbox trigger carrying its placeholder', () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="یک نقش انتخاب کنید" onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(named('button', 'نقش یک نقش انتخاب کنید')).toBe(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('ANNOUNCES THE CHOSEN VALUE, not just the field label', async () => {
    // The defect this replaces. `aria-labelledby` REPLACES a button's contents
    // in the accessible-name computation, so naming only the label gave the
    // trigger the accessible name «نقش» whatever was inside it:
    //
    //     accname = "نقش"   textContent = "مدیر"
    //     accname = "د"     textContent = "خواننده، مدیر"
    //
    // A screen-reader user could open the menu, pick a value, and never hear
    // what was selected — on the control that replaces fifteen hand-rolled
    // selects. The name has to carry BOTH: the field, then its value.
    const single = on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="یک نقش" value="admin" onChange={() => {}} />
    ))
    const trigger = screen.getByRole('button')
    expect(trigger.textContent).toContain('مدیر')
    expect(named('button', 'نقش مدیر')).toBe(trigger)
    // …and the name is no longer the bare field label, which is what it was.
    expect(named('button', 'نقش')).toBeNull()
    single.unmount()

    const multi = on('panel', (
      <Dropdown label="د" options={ROLES} placeholder="د" values={['reader', 'admin']} onToggle={() => {}} />
    ))
    const both = screen.getByRole('button')
    expect(named('button', 'د خواننده، مدیر')).toBe(both)
    expect(named('button', 'د')).toBeNull()
    multi.unmount()

    const empty = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="یک نقش" onChange={() => {}} />)
    expect(named('button', 'نقش یک نقش')).toBeTruthy()
    empty.unmount()

    // The picked value is announced after a real interaction, not only when the
    // caller renders it pre-set.
    function Live() {
      const [v, setV] = useState<string | undefined>(undefined)
      return <Dropdown label="نقش" options={ROLES} placeholder="یک نقش" value={v} onChange={setV} />
    }
    on('panel', <Live />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByRole('option', { name: 'ادیتور' }))
    // It MOVES. A name that happened to carry the value once, but was computed
    // from a fixed node, would pass everything above.
    expect(named('button', 'نقش ادیتور')).toBeTruthy()
    expect(named('button', 'نقش یک نقش')).toBeNull()
  })

  it('points the trigger at the list it opens, and only while it is open', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    expect(trigger).not.toHaveAttribute('aria-controls')
    await userEvent.click(trigger)
    const list = screen.getByRole('listbox')
    expect(list.id).not.toBe('')
    expect(trigger).toHaveAttribute('aria-controls', list.id)
  })

  it('keeps the search field OUT of the listbox — ARIA 1.2 owns only options', async () => {
    // `listbox` has required owned elements of `option` (or `group` → `option`).
    // A search field inside one is invalid, and assistive tech either skips the
    // field or mis-announces the list. The popover is a plain box; the field is
    // first inside it; `role="listbox"` sits on the options container beneath.
    const { container } = on('panel', (
      <Dropdown
        label="نقش" options={ROLES} placeholder="ب" onChange={() => {}}
        searchable searchPlaceholder="ج" noHit="نیست"
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    const pop = popoverOf(container)
    const list = screen.getByRole('listbox')
    const field = screen.getByPlaceholderText('ج')

    expect(pop).not.toHaveAttribute('role')
    expect(pop.contains(list)).toBe(true)
    expect(list.contains(field)).toBe(false)
    // The field comes FIRST, so tab and reading order both reach it before the
    // options it filters.
    expect(pop.firstElementChild!.contains(field)).toBe(true)
    // Every child of the list is an option, and nothing else.
    expect(Array.from(list.children).map((c) => c.getAttribute('role')))
      .toEqual(['option', 'option', 'option'])
    // …and the list is NAMED, not merely pointed somewhere. `toHaveAttribute`
    // alone is satisfied by an id that resolves to nothing, which leaves the
    // listbox anonymous — the same shape as the trigger defect this round's
    // headline fix was about. Asserted through the accessible-name computation,
    // and against the element the id really resolves to.
    expect(named('listbox', 'نقش')).toBe(list)
    const namedBy = list.getAttribute('aria-labelledby')!
    expect(document.getElementById(namedBy)).toHaveTextContent('نقش')
    // `aria-multiselectable` describes the LIST, so it has to be on the list.
    expect(pop).not.toHaveAttribute('aria-multiselectable')

    // …and the miss message is a sibling of the list, not a child of it — a
    // <p> is not a permitted owned element either.
    await userEvent.type(field, 'zzz')
    const miss = screen.getByText('نیست')
    expect(popoverOf(container).contains(miss)).toBe(true)
    expect(screen.getByRole('listbox').contains(miss)).toBe(false)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('opens, and turns its border coral while open', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    expect(await styles(trigger)).toEqual({ ...TRIGGER, 'border-color': 'var(--line)' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // §4.6's one focus idiom, as a declaration — and NOTHING else about the
    // trigger moves when it opens.
    expect(await styles(trigger)).toEqual({ ...TRIGGER, 'border-color': 'var(--coral)' })
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('reports the value and closes', async () => {
    const seen: string[] = []
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={(v) => seen.push(v)} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.click(screen.getByRole('option', { name: 'ادیتور' }))
    expect(seen).toEqual(['editor'])
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    // …and focus comes back with it. A closed popover that has left focus on a
    // node it just unmounted drops the caret to <body>.
    expect(screen.getByRole('button')).toHaveFocus()
  })

  it('closes when the pointer goes somewhere else, and not when it stays inside', async () => {
    // §5.2 — a document listener rather than a full-screen invisible backdrop,
    // "so the wheel is not stolen from the scrolling dialog" behind it. Nothing
    // rendered this branch, so deleting the listener outright passed.
    const { container } = on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Inside the popover: still open. Without this, "closes on any mousedown"
    // would satisfy the half below and make the control unusable.
    await userEvent.click(screen.getByPlaceholderText('ج'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // Inside the trigger's own box: still open.
    await userEvent.click(container.querySelector('[data-dd] > span')!)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Outside: closed.
    await userEvent.click(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not reopen on a filter the user cannot see', async () => {
    // The popover closes with its query still in it; reopening on a filter
    // nothing on screen explains is a list that has silently lost most of its
    // options. The behaviour is in the commit message and was tested nowhere.
    on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    await userEvent.type(screen.getByPlaceholderText('ج'), 'ادی')
    expect(screen.getAllByRole('option')).toHaveLength(1)

    await userEvent.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.click(trigger)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByPlaceholderText('ج')).toHaveValue('')
  })

  it('never submits the form it is dropped into', async () => {
    // A <button> with no `type` inside a form is a SUBMIT button, so opening
    // the menu would send the form. Three buttons here, and all three need it.
    const submits: string[] = []
    render(
      <SurfaceProvider surface="panel">
        <form onSubmit={(e) => { e.preventDefault(); submits.push('sent') }}>
          <Dropdown label="د" options={ROLES} placeholder="د" values={[]} onToggle={() => {}} />
        </form>
      </SurfaceProvider>,
    )
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('type', 'button')
    await userEvent.click(trigger)
    expect(submits).toEqual([])
    const options = screen.getAllByRole('option')
    for (const o of options) expect(o).toHaveAttribute('type', 'button')
    await userEvent.click(options[0])
    expect(submits).toEqual([])
    // …and a multi-select stays open, so the form is still there to not submit.
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('marks the picked option, and only that one', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('option', { name: 'مدیر' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'ادیتور' })).toHaveAttribute('aria-selected', 'false')
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
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

  it('leaves an Escape for the dialog ON TOP of it alone, and answers its own', async () => {
    // The guard, rather than the bookkeeping. The sibling test below pushes the
    // other dismissible BEFORE opening, so the popover is always the top and
    // `isTopDismissible(identity)` is always true — deleting the guard passes
    // it. Here something opens ON TOP of an open popover, which is the only
    // arrangement in which the guard does any work: the Escape belongs to the
    // thing above, and the popover has to ignore it.
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    const over = Symbol('a dialog opened from the menu')
    pushDismissible(over)
    await userEvent.keyboard('{Escape}')
    // Still open: that Escape was not the popover's to answer.
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')

    // …and once the thing above is gone, the next Escape IS the popover's.
    popDismissible(over)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('leaves an Escape for the dialog underneath it alone', async () => {
    // I7 — the popover joins the shared dismissible stack, so the Escape that
    // closes it stops there. Before that stack existed, one Escape took the
    // menu AND the dialog it was opened inside. Asserted through the stack's
    // own view of the world: while the popover is open it is the top, and once
    // it closes the thing beneath it is the top again.
    const under = Symbol('a dialog')
    pushDismissible(under)
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    expect(isTopDismissible(under)).toBe(true)
    await userEvent.click(screen.getByRole('button'))
    expect(isTopDismissible(under)).toBe(false)
    await userEvent.keyboard('{Escape}')
    expect(isTopDismissible(under)).toBe(true)
    popDismissible(under)
  })

  it('walks the options with the arrow keys — from the CLOSED trigger and from the field', async () => {
    on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    const trigger = screen.getByRole('button')

    // The closed branch, which is the one a keyboard user actually meets and
    // which this test was named for and never reached: it opened with a CLICK
    // first, so every ArrowDown went through `if (open) move('first')` and
    // deleting the closed branch's own `move('first')` stranded the user on the
    // trigger with all of this green. Opening has to wait a frame for the
    // options to mount, so the frame is flushed rather than assumed away.
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await frame()
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()

    // Back to the trigger, and now the OPEN branch — which steps in at once,
    // because waiting a frame for options that already exist is a race.
    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
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

    // The search field is outside the listbox now, so the key handler has to
    // sit on the popover rather than on the list — otherwise typing a filter
    // strands the keyboard user in the field with no way down into the results.
    await userEvent.click(screen.getByPlaceholderText('ج'))
    expect(screen.getByPlaceholderText('ج')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()

    // ArrowUP out of the field lands on the first option too, rather than on
    // nothing. `activeElement` is not in the list at all there, so the step is
    // computed from an index of -1 and only the clamp saves it.
    await userEvent.click(screen.getByPlaceholderText('ج'))
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()
  })

  it('leaves Home and End to the caret while the search field holds it', async () => {
    // The key handler sits on the POPOVER, so it saw Home and End from inside
    // the search field too and claimed both. With the caret at position 3 of
    // «ادی», Home was preventDefault()ed — so the caret never moved — and focus
    // jumped to an option: a user correcting the start of a Persian family name
    // was thrown out of the field they were typing in.
    on('panel', (
      <Dropdown label="سرپرست" options={ROLES} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    await userEvent.click(screen.getByRole('button'))
    const field = screen.getByPlaceholderText('ج') as HTMLInputElement
    await userEvent.type(field, 'ادی')
    expect(field.selectionStart).toBe(3)

    await userEvent.keyboard('{Home}')
    expect(field).toHaveFocus()
    expect(field.selectionStart).toBe(0)

    await userEvent.keyboard('{End}')
    expect(field).toHaveFocus()
    expect(field.selectionStart).toBe(3)

    // …and the exemption is only the field's. Inside the list both keys are
    // still the list's, which is what the arrow-key test walks in full.
    await userEvent.clear(field)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'مدیر' })).toHaveFocus()
  })

  it('filters when searchable, and states the miss rather than showing a blank', async () => {
    on('panel', (
      <Dropdown
        label="سرپرست" options={ROLES} placeholder="ب" onChange={() => {}}
        searchable searchPlaceholder="جست‌وجو…" noHit="سرپرستی با این نام نیست"
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByPlaceholderText('جست‌وجو…'), 'ادی')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.type(screen.getByPlaceholderText('جست‌وجو…'), 'xyz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    // …and it is READABLE. `text-card` here is white on white: a search that
    // misses shows what looks like an empty box, which is the exact thing
    // §"EmptyState" forbids and which every class-name assertion still passes.
    expect(await styles(screen.getByText('سرپرستی با این نام نیست'))).toEqual({
      margin: '0px',
      'padding-left': 'var(--space-6)',
      'padding-right': 'var(--space-6)',
      'padding-top': 'var(--space-7)',
      'padding-bottom': 'var(--space-7)',
      'text-align': 'center',
      'font-size': 'var(--fs-sm2)',
      color: 'var(--text-muted)',
    })
    expect(tokenLiteral('--text-muted')).not.toBe(tokenLiteral('--card'))
  })

  it('draws the magnifier in the room it reserves for one', async () => {
    // The design's popover search field is `padding:9px 34px 9px 12px` with a
    // 14px magnifier pinned 11px in (design/Inja Panel.dc.html:1220). The brief
    // kept the 34px and dropped the icon, which leaves a third of the field
    // empty for nothing — legal, compiling, and visibly wrong.
    const { container } = on('panel', (
      <Dropdown label="س" options={ROLES} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="جست‌وجو…" />
    ))
    await userEvent.click(screen.getByRole('button'))
    const field = screen.getByPlaceholderText('جست‌وجو…')
    const glyph = container.querySelector('input[type="search"] ~ svg') as SVGElement
    expect(glyph, 'the reserved inline-start room holds no magnifier').toBeTruthy()

    expect(await styles(field)).toEqual(SEARCH_FIELD)
    // `outline-none` above means this is the field's ONLY focus indicator.
    expect(await styles(field, ':focus')).toEqual({ 'border-color': 'var(--coral)' })

    expect(await styles(glyph)).toEqual({
      position: 'absolute',
      'inset-inline-start': 'var(--inset-search-icon-menu)',
      top: '50%',
      width: 'var(--space-7)',
      height: 'var(--space-7)',
      'pointer-events': 'none',
      '--tw-translate-y': '-50%',
      transform:
        'translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))',
      color: 'var(--text-faint)',
    })
    // …and it is a MAGNIFIER. The chevron's `d` and stroke-width are asserted,
    // the tick's are; the glyph whose absence was the defect this test exists
    // for had neither, so the same 34px-reserved-for-nothing appearance came
    // back through `strokeWidth="0.2"` (invisible at 14px) or `r="2"` with
    // every declaration above unchanged.
    expect(glyph.getAttribute('stroke-width')).toBe('2')
    expect(glyph.getAttribute('fill')).toBe('none')
    const lens = glyph.querySelector('circle')!
    expect([lens.getAttribute('cx'), lens.getAttribute('cy'), lens.getAttribute('r')])
      .toEqual(['11', '11', '7'])
    expect(glyph.querySelector('path')?.getAttribute('d')).toBe('m21 21-4.3-4.3')
    // Sized by the token, never by an SVG attribute.
    expect(glyph.getAttribute('width')).toBeNull()
    expect(glyph.getAttribute('viewBox')).toBe('0 0 24 24')

    // The relationship, not the two ends separately: the icon has to sit INSIDE
    // the room the field reserves, or it lands on top of the caret.
    const room = Number.parseFloat(tokenLiteral('--pad-search-x-menu'))
    const inset = Number.parseFloat(tokenLiteral('--inset-search-icon-menu'))
    const glyphW = Number.parseFloat(tokenLiteral('--space-7'))
    expect(room).toBeGreaterThanOrEqual(inset + glyphW)
    // …and the box around the two is what makes `absolute` mean "in this field".
    expect(await styles(glyph.parentElement!)).toEqual({
      position: 'relative', 'margin-bottom': 'var(--space-1)',
    })
  })

  it('multi-selects with the NESTED tick, and FILLS the ticked ones', async () => {
    const seen: string[] = []
    on('panel', (
      <Dropdown
        label="دپارتمان" options={ROLES} placeholder="ب"
        values={['reader', 'admin']} onToggle={(v) => seen.push(v)}
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    expect(list.querySelectorAll('[data-tick]')).toHaveLength(3)

    // Counting the ticks proved only that three spans exist. `on={false}` on
    // every one of them is a multi-select where nothing you tick ever fills,
    // and it passed the count.
    // …and at the rung the design draws for an option inside a popover: 16px
    // at radius 5 (panel 1386), not the 19px row this component used to borrow.
    const tickIn = (name: string) => tickOf(screen.getByRole('option', { name }))
    expect(await styles(tickIn('خواننده'))).toEqual(OPTION_TICK_ON)
    expect(await styles(tickIn('مدیر'))).toEqual(OPTION_TICK_ON)
    expect(await styles(tickIn('ادیتور'))).toEqual(OPTION_TICK_OFF)
    // …and the fill is the CHECK, not just the box.
    expect(tickIn('خواننده').querySelector('svg')).toBeTruthy()
    expect(tickIn('ادیتور').querySelector('svg')).toBeNull()

    // The tick is PAINT. `aria-selected` is the record of the choice — this
    // file says so itself, about the single-select's trailing check — and only
    // the single-select branch pinned it, so `aria-selected={multiple ? false
    // : picked}` left a list where a sighted user sees two filled ticks and a
    // screen-reader user hears three UNSELECTED options inside a list that has
    // just announced itself as multi-selectable.
    const stateOf = (name: string) =>
      screen.getByRole('option', { name }).getAttribute('aria-selected')
    expect(stateOf('خواننده')).toBe('true')
    expect(stateOf('مدیر')).toBe('true')
    expect(stateOf('ادیتور')).toBe('false')

    await userEvent.click(screen.getByRole('option', { name: 'ادیتور' }))
    expect(seen).toEqual(['editor'])
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // A multi-select LEADS with its tick (design :1386) and draws no trailing
    // check, which is the other half of the single-select's arrangement.
    const row = screen.getByRole('option', { name: 'خواننده' })
    expect(row.firstElementChild).toHaveAttribute('data-tick')
    expect(row.querySelectorAll('svg')).toHaveLength(1)
  })

  it('keeps its label bound even when the trigger text is the label', () => {
    // The filter bar shows «نقش» as the trigger text, so a second visible label
    // would be a duplicate — but dropping the label would leave the control
    // unnamed. `hideLabel` hides it; it never removes it, and it still leads
    // the accessible name.
    const { container } = on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}} hideLabel />
    ))
    const name = container.querySelector('[data-dd] > span') as HTMLElement
    expect(name).toHaveTextContent('نقش')
    expect(named('button', 'نقش مدیر')).toBeTruthy()
    // …and the visible half of the trigger does not repeat it.
    expect(screen.getByRole('button').textContent).not.toContain('نقش')
  })

  it('draws the caption the design draws, and hides it without deleting it', async () => {
    // `text-card` here is a caption the colour of the card behind it: every
    // dropdown on the screen silently loses its label.
    const shown = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    expect(await styles(shown.container.querySelector('[data-dd] > span')!)).toEqual({
      'margin-bottom': 'var(--space-3)',
      display: 'block',
      'font-size': 'var(--fs-sm2)',
      'font-weight': 'var(--fw-semibold)',
      color: 'var(--violet)',
    })
    expect(tokenLiteral('--violet')).not.toBe(tokenLiteral('--card'))
    shown.unmount()

    const hidden = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} hideLabel />)
    // `sr-only`, which clips — not `hidden`, which would take the name out of
    // the accessibility tree and leave the trigger anonymous.
    expect(await styles(hidden.container.querySelector('[data-dd] > span')!)).toEqual(SR_ONLY)
  })

  it('writes no class that compiles to nothing — closed, open, searching, multi', async () => {
    const harvest = async (root: Element) => {
      const s = classStringOf(root)
      expect(s).not.toBe('')
      return dead(s)
    }
    const shut = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    expect(await harvest(shut.container.querySelector('[data-dd]')!)).toEqual([])
    shut.unmount()

    const open = on('panel', (
      <Dropdown
        label="نقش" options={[{ value: 'a', label: 'الف', note: 'یادداشت' }]} placeholder="ب"
        value="a" onChange={() => {}} searchable searchPlaceholder="ج"
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    expect(await harvest(open.container.querySelector('[data-dd]')!)).toEqual([])
    await userEvent.type(screen.getByPlaceholderText('ج'), 'zzz')
    expect(await harvest(open.container.querySelector('[data-dd]')!)).toEqual([])
    open.unmount()

    const multi = on('panel', <Dropdown label="د" options={ROLES} placeholder="د" values={[]} onToggle={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(await harvest(multi.container.querySelector('[data-dd]')!)).toEqual([])
  })

  it('writes no conditional rule but the row hover and the field focus', async () => {
    // The mutation this exists for is `md:hidden` on the popover: a dropdown
    // menu that is simply not there above 768px, with all of the declaration
    // snapshots, `dead()` and every behavioural test in this file still green,
    // because a breakpoint class emits inside a `@media` and `sheet()` reads
    // only the resting state. So the conditional rules are listed EXACTLY.
    const seen = new Set<string>()
    const shut = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    for (const c of await conditionalsOf(shut.container.querySelector('[data-dd]')!)) seen.add(c)
    shut.unmount()

    const open = on('panel', (
      <Dropdown
        label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}}
        searchable searchPlaceholder="ج"
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    for (const c of await conditionalsOf(open.container.querySelector('[data-dd]')!)) seen.add(c)
    await userEvent.type(screen.getByPlaceholderText('ج'), 'zzz')
    for (const c of await conditionalsOf(open.container.querySelector('[data-dd]')!)) seen.add(c)
    open.unmount()

    const multi = on('panel', (
      <Dropdown label="د" options={ROLES} placeholder="د" values={['reader']} onToggle={() => {}} hideLabel />
    ))
    await userEvent.click(screen.getByRole('button'))
    for (const c of await conditionalsOf(multi.container.querySelector('[data-dd]')!)) seen.add(c)

    expect([...seen].sort()).toEqual([
      // The option row answering the pointer (§5.2)…
      '.hover:bg-tile-v2:hover',
      // …and the search field's ONLY focus indicator, since it is `outline-none`.
      '.focus:border-coral:focus',
    ].sort())
  })

  it('anchors the popover to its own trigger, not to the page', async () => {
    // `position:absolute` on the popover resolves against the nearest POSITIONED
    // ancestor. Without `relative` here that is whatever the screen happens to
    // have — usually nothing — and the menu opens at the top of the document,
    // which jsdom reports no geometry to catch.
    const { container } = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} className="w-full" />)
    const root = container.querySelector('[data-dd]')!
    expect(await styles(root)).toEqual({ position: 'relative', width: '100%' })
    await userEvent.click(screen.getByRole('button'))
    // …and the popover really is inside it, which is what makes that matter.
    expect(root.contains(popoverOf(container))).toBe(true)
  })

  it('is the popover the design draws — 280 tall, 7 inset, 2 between, radius 16', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const pop = popoverOf(document.body)
    expect(await styles(pop)).toEqual(POPOVER)
    // The options container beneath it — dropping `flex-col` here lays three
    // options out across a 280px box.
    expect(await styles(screen.getByRole('listbox'))).toEqual(LISTBOX)

    expect(tokenLiteral('--height-popover')).toBe('280px')
    expect(tokenLiteral('--pad-popover')).toBe('7px')
    expect(tokenLiteral('--space-3')).toBe('6px')
    expect(tokenLiteral('--space-half')).toBe('2px')
    // Ledger L-42/L-43 — one role, one rung. The deliverable wrote the same
    // popover at 25, 27, 30, 35, 37, 39 and 57, each exactly high enough to
    // clear whatever its own anchor sat in.
    expect(roleTarget('--role-z-dropdown')).toBe('--z-dropdown')
    expect(tokenLiteral('--z-dropdown')).toBe('1000')
    expect(roleTarget('--role-z-nonesuch')).toBe('')
  })

  it('anchors itself logically, the way a right-to-left app has to', async () => {
    // F10 — the design writes `inset-inline:0` and the deliverable's magnifier
    // a physical `right:11px`, which is the same edge only because the app is
    // never ltr. A physical `left`/`right` here mirrors the whole popover the
    // day anything renders ltr, and jsdom reports no geometry to catch it.
    const { container } = on('panel', (
      <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    await userEvent.click(screen.getByRole('button'))
    const pop = await paint(popoverOf(container).className)
    expect(allProps(pop)).toContain('inset-inline-start')
    expect(allProps(pop)).toContain('inset-inline-end')
    expect(allProps(pop)).not.toContain('left')
    expect(allProps(pop)).not.toContain('right')
    // …and pinned to the trigger's own edges, not pushed off them. `end-full`
    // emits the same PROPERTY and a different value.
    expect(winner(pop, 'inset-inline-start')).toBe('0px')
    expect(winner(pop, 'inset-inline-end')).toBe('0px')

    const field = await paint(screen.getByPlaceholderText('ج').className)
    expect(allProps(field)).not.toContain('padding-left')
    expect(allProps(field)).not.toContain('padding-right')

    const opt = await paint(screen.getAllByRole('option')[0].className)
    expect(winner(opt, 'text-align')).toBe('start')
  })

  it('is the trigger the design draws, and fades only the placeholder', async () => {
    const empty = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش را انتخاب کنید" onChange={() => {}} />)
    expect(await styles(screen.getByRole('button'))).toEqual({ ...TRIGGER, 'border-color': 'var(--line)' })
    const ph = empty.container.querySelector('button > span') as HTMLElement
    // It fills the row and clips. Without these the chevron is dragged off the
    // trigger's inline end by a long value, or the trigger grows a second line.
    expect(await styles(ph)).toEqual({
      flex: '1 1 0%', overflow: 'hidden', 'text-overflow': 'ellipsis',
      'white-space': 'nowrap', color: 'var(--text-faint)',
    })
    empty.unmount()

    // …and the chosen value is NOT faint. The design gives the trigger two inks
    // (#2A1D5E chosen, #a99fc4 empty) and a component that faded both would
    // read as permanently unset.
    const filled = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}} />)
    const value = filled.container.querySelector('button > span') as HTMLElement
    expect(value).toHaveTextContent('مدیر')
    expect(await styles(value)).toEqual({
      flex: '1 1 0%', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
    })
  })

  it('draws the chevron at the token size, not at an attribute', async () => {
    const { container } = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    const chev = container.querySelector('button > svg') as SVGElement
    expect(await styles(chev)).toEqual({
      width: 'var(--size-chevron)', height: 'var(--size-chevron)',
      flex: 'none', color: 'var(--text-muted)',
    })
    expect(tokenLiteral('--size-chevron')).toBe('15px')
    expect(chev.getAttribute('width')).toBeNull()
    // It points DOWN. Nothing about a `d` attribute is checked by a class
    // string, a snapshot or a build, and the same glyph rotated is the pager's.
    expect(chev.querySelector('path')?.getAttribute('d')).toBe('M6 9l6 6 6-6')
    expect(chev.getAttribute('stroke-width')).toBe('2.2')
  })

  it('is the option row the design draws, and marks the picked one twice over', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const picked = screen.getByRole('option', { name: 'مدیر' })
    const plain = screen.getByRole('option', { name: 'ادیتور' })

    // Tint AND weight, which is what the design changes; either alone leaves a
    // picked row that reads as unpicked at a glance.
    expect(await styles(picked)).toEqual({
      ...OPTION_ROW, 'background-color': 'var(--tile-v2)', 'font-weight': 'var(--fw-bold)',
    })
    expect(await styles(plain)).toEqual({
      ...OPTION_ROW, 'background-color': 'transparent', 'font-weight': 'var(--fw-semibold)',
    })
    // …and a row answers the pointer, which is the whole of its affordance.
    expect(await styles(plain, ':hover')).toEqual({ 'background-color': 'var(--tile-v2)' })
    expect(tokenLiteral('--gap-option')).toBe('9px')
  })

  it('trails the single-select check after the label, as the design does', async () => {
    // design/Inja Panel.dc.html:1334 — `<span style="flex:1">{{label}}</span>`
    // and then the check. The brief led with it behind a 14px spacer, which
    // indents every label in the list by 23px the design does not draw.
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    const picked = screen.getByRole('option', { name: 'مدیر' })
    const kids = Array.from(picked.children)
    expect(kids[0].tagName.toLowerCase()).toBe('span')
    expect(kids[kids.length - 1].tagName.toLowerCase()).toBe('svg')
    // The label fills the row, which is what puts the check at the inline END
    // rather than immediately after the text.
    expect(await styles(kids[0])).toEqual({ 'min-width': '0px', flex: '1 1 0%' })
    expect(await styles(kids[kids.length - 1])).toEqual({
      width: 'var(--space-7)', height: 'var(--space-7)', flex: 'none', color: 'var(--violet)',
    })
    // …and it is the CHECK, at the weight §5.2 gives a check in a small box.
    // Neither the `d` nor the stroke is in a class string, so the paint
    // assertion above is blind to both: a 2.6 check reads as a hairline beside
    // the 3 the tick in the same list draws, and a chevron in its place is a
    // picked row that looks like a row you can open.
    const check = kids[kids.length - 1]
    expect(check.getAttribute('stroke-width')).toBe('3')
    expect(check.querySelector('path')?.getAttribute('d')).toBe('M20 6L9 17l-5-5')
    // An unpicked row draws nothing there — no spacer, so the labels line up
    // with the popover's own inset rather than with a phantom column.
    const plain = screen.getByRole('option', { name: 'ادیتور' })
    expect(plain.querySelector('svg')).toBeNull()
    expect(plain.children).toHaveLength(1)
  })

  it('draws an option note in its own step, under the label', async () => {
    on('panel', (
      <Dropdown
        label="د" options={[{ value: 'a', label: 'الف', note: 'یادداشت' }]} placeholder="د"
        values={[]} onToggle={() => {}}
      />
    ))
    await userEvent.click(screen.getByRole('button'))
    expect(await styles(screen.getByText('یادداشت'))).toEqual({
      'margin-top': 'var(--space-half)',
      display: 'block',
      'font-size': 'var(--fs-xs)',
      // The row is `font-semibold`/`font-bold`; a note that inherited it would
      // read as a second label.
      'font-weight': '400',
      color: 'var(--text-faint)',
    })
    expect(await styles(screen.getByText('الف'))).toEqual({ display: 'block' })
  })

  it('takes its trigger step from the surface, not from a prop', async () => {
    const panel = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    const one = await styles(screen.getByRole('button'))
    panel.unmount()
    on('reader', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} />)
    const two = await styles(screen.getByRole('button'))
    expect(one['font-size']).toBe('var(--fs-menu)')
    expect(two['font-size']).toBe('var(--fs-lg)')
    // …and NOTHING ELSE moves with the surface.
    expect({ ...one, 'font-size': '' }).toEqual({ ...two, 'font-size': '' })
  })

  it('searches INSIDE a label, not only at the start of one', async () => {
    // A family name sits in the middle of a Persian full name. A prefix match
    // finds nothing for «بیات» here and the field reads as broken — and it
    // compiles, renders and passes every assertion about the field's paint.
    const people = [
      { value: '1', label: 'سحر بیات' },
      { value: '2', label: 'مریم بیاتی' },
      { value: '3', label: 'رضا کریمی' },
    ]
    on('panel', (
      <Dropdown label="سرپرست" options={people} placeholder="ب" onChange={() => {}} searchable searchPlaceholder="ج" />
    ))
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByPlaceholderText('ج'), 'بیات')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['سحر بیات', 'مریم بیاتی'])
  })

  it('states its miss and names its search field without being told to', async () => {
    // The defaults are what most call sites get: every screen that does not
    // pass its own wording relies on these two strings being here.
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" onChange={() => {}} searchable />)
    await userEvent.click(screen.getByRole('button'))
    const field = screen.getByRole('searchbox')
    expect(field).toHaveAttribute('placeholder', 'جست‌وجو…')
    // …and a placeholder is not a NAME. It is the field's only visible caption,
    // it disappears the moment the user types, and there is no <label> anywhere
    // near it, so the name has to be stated.
    expect(field).toHaveAttribute('aria-label', 'جست‌وجو…')
    await userEvent.type(field, 'zzz')
    expect(screen.getByText('موردی پیدا نشد')).toBeInTheDocument()
  })

  it('announces nothing decorative', async () => {
    const { container } = on('panel', (
      <Dropdown
        label="د" options={ROLES} placeholder="د" values={['reader']} onToggle={() => {}}
        searchable searchPlaceholder="ج"
      />
    ))
    const chevron = container.querySelector('button > svg') as SVGElement
    expect(chevron).toHaveAttribute('aria-hidden')
    expect(chevron.getAttribute('focusable')).toBe('false')

    await userEvent.click(screen.getByRole('button'))
    const glyph = container.querySelector('input[type="search"] ~ svg') as SVGElement
    expect(glyph).toHaveAttribute('aria-hidden')
    expect(glyph.getAttribute('focusable')).toBe('false')

    // Every tick in the list is paint; `aria-selected` on the option is what
    // actually carries the state, and a second unnamed node per row is noise.
    for (const tick of Array.from(container.querySelectorAll('[data-tick]'))) {
      expect(tick).toHaveAttribute('aria-hidden')
    }
    // The option's whole name is its label.
    expect(named('option', 'خواننده')).toBeTruthy()

    // …and the single-select's trailing check is decorative too — the tick is
    // not the record of the choice, `aria-selected` is.
    const single = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="ب" value="admin" onChange={() => {}} />)
    await userEvent.click(single.container.querySelector('button')!)
    const check = screen.getByRole('option', { name: 'مدیر' }).querySelector('svg') as SVGElement
    expect(check).toHaveAttribute('aria-hidden')
    expect(check.getAttribute('focusable')).toBe('false')
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
