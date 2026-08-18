import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { Accordion } from './Accordion'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { IconTile } from './IconTile'
import { Logo } from './Logo'
import { deptMeta, DEPT_CODES } from '../lib/departments'

/* -------------------------------------------------------------------------
   Two halves, and the second is the one jsdom cannot give you.

   An SVG's geometry IS its attributes — a `d`, a `viewBox`, a stroke width —
   so half of this file reads the DOM, which is the right instrument for it and
   the only one: nothing about a `d` is checked by a class string, a snapshot or
   a build, and the pager shipped with both its arrows pointing at the page they
   would not open.

   The tile is the opposite. jsdom paints nothing, so `toHaveClass('w-tile')`
   proves only that a string was written — `w-tile-ish` satisfies it just as
   well, emits no rule at all, and lets the build exit 0. So every class the
   tile writes is compiled through the real tailwind.config.js here and asserted
   by the DECLARATION it produces, and by the TOKEN that declaration names,
   read out of the role layer rather than restated.
   ------------------------------------------------------------------------- */

type Painted = { klass: string; state: string; media: string; decls: string }

/** Every class token in a selector — `.a:hover ~ .b\:c` is `a` and `b:c`. */
function classesIn(selector: string): string[] {
  return [...selector.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\/g, ''))
}

async function compile(classNames: string): Promise<{ painted: Painted[]; alive: Set<string> }> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  if (classes.length === 0) return { painted: [], alive: new Set() }
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const painted: Painted[] = []
  const alive = new Set<string>()
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this harness exists to catch.
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    if (!decls) return
    for (const sel of rule.selectors) {
      for (const k of classesIn(sel)) alive.add(k)
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      painted.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return { painted, alive }
}

async function paint(classNames: string): Promise<Painted[]> {
  return (await compile(classNames)).painted
}

/**
 * The winning value of `prop` — the LAST declaration in emitted order, which is
 * how the cascade resolves two utilities setting one property. Returns '' when
 * nothing sets it, so a missing declaration and a wrong one fail the same way.
 */
function winner(painted: Painted[], prop: string): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== '' || p.media !== '') continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

/**
 * EVERY declaration these classes emit at rest, resolved the way the cascade
 * resolves them — not the handful an assertion happened to name.
 *
 * `dead()` only sees a class that emits NOTHING, and a property-by-property
 * assertion only constrains the properties whoever wrote it was thinking about:
 * dropping `justify-center` from the tile leaves the glyph jammed against one
 * edge of a 48px square, compiles perfectly, and survived both. A `toEqual`
 * against this fails on a class that was dropped, an unprefixed one that was
 * added, and one swapped for a different real one.
 */
function sheet(painted: Painted[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of painted) {
    if (p.state !== '' || p.media !== '') continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      out[name] = rest.join(': ')
    }
  }
  return out
}

/**
 * Every rule these classes emit that a RESTING element does not get.
 *
 * `sheet()` sees only the resting state BY CONSTRUCTION, so it cannot be the
 * thing that catches an ADDED variant: `hover:bg-tile-v2` on the tile, or
 * `md:hidden` on it, leave the resting snapshot byte-identical and `dead()`
 * calls them alive because they do compile. This is the other half.
 */
function conditionals(painted: Painted[]): string[] {
  return [...new Set(
    painted
      .filter((p) => p.state !== '' || p.media !== '')
      .map((p) => `${p.media ? `@media ${p.media} ` : ''}.${p.klass}${p.state}`),
  )].sort()
}

/** Every non-resting rule the element and all of its descendants carry. */
async function conditionalsOf(root: Element): Promise<string[]> {
  return conditionals(await paint(classStringOf(root)))
}

/** The full declaration set an element actually renders with. */
async function styles(el: Element): Promise<Record<string, string>> {
  const cls = el.getAttribute('class') ?? ''
  // An element with no class at all would snapshot as `{}` and match an
  // expectation of `{}` — the same "empty is not clean" hole `dead()` has.
  expect(cls.trim(), 'the element carries no class at all').not.toBe('')
  return sheet(await paint(cls))
}

/**
 * Every class in this string that compiles to nothing.
 *
 * It REFUSES an empty string rather than answering `[]`: a harvest that had
 * silently stopped matching would otherwise be indistinguishable from a
 * component with nothing wrong in it, which is the one thing this helper exists
 * to tell apart.
 */
async function dead(classNames: string): Promise<string[]> {
  if (classNames.trim() === '') {
    throw new Error('dead(): nothing was harvested — an empty class string is not a clean one')
  }
  const { alive } = await compile(classNames)
  return [...new Set(classNames.split(/\s+/).filter(Boolean))].filter((c) => !alive.has(c))
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

/** Every custom property the app declares, in cascade order. */
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

/** What one token is actually worth, so "48px" is a measurement and not a claim. */
function tokenLiteral(token: string): string {
  return declared().get(token) ?? ''
}

/**
 * What one `--role-*` property points at ON A GIVEN SURFACE, read out of
 * src/styles/roles.css.
 *
 * R3 puts the panel values on `:root` and overrides them in the
 * `[data-surface='reader']` block, which is last in the file — so the panel end
 * is the file before that block and the reader end is the block itself. Reading
 * the whole file with one regex would return the panel value for both and make
 * every reader assertion below a restatement of its panel twin.
 *
 * The cut is at the SELECTOR — a line that begins the block and opens a brace —
 * and not at the first mention of the string. roles.css explains its own
 * arrangement at the top and names `[data-surface='reader']` in that prose,
 * 2.7KB before the block starts; cutting there put the whole role layer on the
 * reader side of the split and answered '' for every panel lookup.
 */
function roleTarget(role: string, surface: 'panel' | 'reader' = 'panel'): string {
  const src = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  const at = src.search(/^\[data-surface='reader'\]\s*\{/m)
  expect(at, 'roles.css has no reader block, so the two ends cannot be told apart')
    .toBeGreaterThan(0)
  const block = surface === 'reader' ? src.slice(at) : src.slice(0, at)
  return new RegExp(`(?<![-\\w])${role}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(block)?.[1] ?? ''
}

const sourceOf = (file: string) => readFileSync(join(process.cwd(), 'src/ui', file), 'utf8')

/** The panel deliverable — the file every value in this rebuild is measured against. */
const designSrc = join(process.cwd(), 'design/Inja Panel.dc.html')

/**
 * The `d` of the first glyph the design draws inside the affordance `marker`
 * names — its `onClick` binding, or the label beside it.
 *
 * This is how a chevron's DIRECTION gets asserted against something other than
 * an opinion. Each marker occurs exactly once in the deliverable, which the
 * helper checks, so "the first path after it" is that button's own glyph.
 */
function drawnBy(marker: string): string {
  const src = readFileSync(designSrc, 'utf8')
  const at = src.indexOf(marker)
  expect(at, `the design draws no ${marker}`).toBeGreaterThan(0)
  expect(src.indexOf(marker, at + 1), `${marker} is not unique in the deliverable`).toBe(-1)
  return /<path d="([^"]+)"/.exec(src.slice(at, at + 1500))?.[1] ?? ''
}

/**
 * The drawing inside one inline-SVG component in a shell file: every `d` in
 * order, and how many drawable nodes there are altogether.
 *
 * Both numbers, because "each path I draw appears somewhere in that file" is
 * satisfied by drawing half the glyph.
 */
function shellGlyph(file: string, component: string): { paths: string[]; nodes: number } {
  const src = readFileSync(join(process.cwd(), file), 'utf8')
  const at = src.indexOf(`const ${component} = `)
  expect(at, `${file} draws no ${component}`).toBeGreaterThan(0)
  const end = src.indexOf('</svg>', at)
  expect(end, `${component} has no closing </svg>`).toBeGreaterThan(at)
  const block = src.slice(at, end)
  return {
    paths: [...block.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]),
    nodes: [...block.matchAll(/<(path|circle|rect)\b/g)].length,
  }
}

/** The single `d` the named icon draws, for the one-path glyphs. */
function pathOf(name: keyof typeof ICONS): string {
  const { container, unmount } = render(<Icon name={name} />)
  const paths = Array.from(container.querySelectorAll('path'))
  expect(paths, name).toHaveLength(1)
  const d = paths[0].getAttribute('d') ?? ''
  unmount()
  return d
}

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

/* ========================================================================= */

describe('the harness this file is asserted with', () => {
  it('resolves a real utility and reports an invented one dead', async () => {
    // Both directions, or `dead()` answering "nothing is dead" to everything
    // would pass every class assertion below without compiling anything.
    expect(await dead('w-tile rounded-tile bg-tile-v')).toEqual([])
    expect(await dead('w-tile w-tile-ish rounded-tyle bg-tile-v9')).toEqual([
      'w-tile-ish', 'rounded-tyle', 'bg-tile-v9',
    ])
    expect(winner(await paint('w-tile'), 'width')).toBe('var(--role-tile)')
    expect(winner(await paint('w-tile'), 'height')).toBe('')
  })

  it('reads the two ends of a role apart, and a name that is not one at all', () => {
    // `roleTarget` slices roles.css at the reader block. If the slice were
    // wrong both ends would answer the same token and every per-surface
    // assertion in this file would be vacuous.
    expect(roleTarget('--role-tile')).toBe('--size-tile')
    expect(roleTarget('--role-tile', 'reader')).toBe('--size-tile-reader')
    expect(roleTarget('--role-nonesuch')).toBe('')
    expect(tokenLiteral('--size-tile')).toBe('48px')
    expect(tokenLiteral('--nonesuch')).toBe('')
  })
})

describe('Icon', () => {
  it('draws on the 24-box the design specifies, in the caller colour', () => {
    const { container } = render(<Icon name="check" />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke-linecap')).toBe('round')
    expect(svg.getAttribute('stroke-linejoin')).toBe('round')
    expect(svg.getAttribute('stroke-width')).toBe('2')
    // Decorative in every one of its call sites: the control around it carries
    // the name, and `focusable` keeps IE-era tab stops out of the order.
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
  })

  it('takes its box and its stroke from the caller', () => {
    const { container } = render(<Icon name="chevronStart" px={15} stroke={2.4} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('width')).toBe('15')
    expect(svg.getAttribute('height')).toBe('15')
    expect(svg.getAttribute('stroke-width')).toBe('2.4')
  })

  it('writes NO width attribute when the caller sizes it with a class', () => {
    // The reason `px` has no default. A width ATTRIBUTE beats a stylesheet
    // width unconditionally, so a default `px` would unpin every class-sized
    // glyph in the product while leaving its class string, and every
    // `toHaveClass` assertion about it, untouched. src/ui/choices.test.tsx
    // asserts this same null on the trigger chevron and the popover magnifier;
    // this states it of the component they now both go through.
    const { container } = render(<Icon name="chevronDown" className="w-chevron h-chevron" />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('width')).toBeNull()
    expect(svg.getAttribute('height')).toBeNull()
    expect(svg.getAttribute('class')).toBe('w-chevron h-chevron')
  })

  it('writes no class of its own, and no empty class attribute either', () => {
    // `block flex-none` on every icon in the product is one word long and
    // changes what four already-reviewed files paint: src/ui/choices.test.tsx
    // compares the trigger chevron's and the magnifier's FULL emitted
    // declaration set, and `display: block` is not in either. An empty
    // `class=""` is the other half — it is a class string nothing wrote, and
    // `styles()` in that file refuses one.
    const bare = render(<Icon name="check" />)
    expect((bare.container.querySelector('svg') as SVGElement).hasAttribute('class')).toBe(false)
    bare.unmount()
    const given = render(<Icon name="check" className="text-violet" />)
    expect((given.container.querySelector('svg') as SVGElement).getAttribute('class'))
      .toBe('text-violet')
  })

  it('lets an explicit path beat a named one', () => {
    // §5.1.2 — `d` wins over `name`. It is how the nine department glyphs reach
    // the component without joining the icon set.
    const { container } = render(<Icon name="check" d="M4 20l16-16" />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('d')).toBe('M4 20l16-16')
  })

  it('carries the paths the design fixes, byte for byte', () => {
    const fixed: Record<string, string> = {
      chevronStart: 'M9 18l6-6-6-6',
      chevronEnd: 'M15 18l-6-6 6-6',
      chevronPrev: 'M9 6l6 6-6 6',
      chevronNext: 'M15 6l-6 6 6 6',
      chevronDown: 'M6 9l6 6 6-6',
      chevronUp: 'M18 15l-6-6-6 6',
      check: 'M20 6L9 17l-5-5',
    }
    for (const [name, d] of Object.entries(fixed)) {
      const { container, unmount } = render(<Icon name={name as keyof typeof ICONS} />)
      expect(container.querySelector('path')?.getAttribute('d'), name).toBe(d)
      unmount()
    }
    const search = render(<Icon name="search" />)
    expect(search.container.querySelector('circle')?.getAttribute('r')).toBe('7')
    expect(search.container.querySelector('path')?.getAttribute('d')).toBe('m21 21-4.3-4.3')
  })

  it('names each horizontal chevron for where it points in a RIGHT-TO-LEFT product', () => {
    // The plan's icon table had all four the English way round — `chevronNext`
    // pointing right, `chevronStart` pointing left — and this app is RTL. Every
    // one of them compiles, looks right in a review, and puts the arrow on the
    // affordance it does not perform: it is the defect src/ui/Pager.tsx's
    // docstring exists about, one layer up and in four places instead of two.
    //
    // So the four names are pinned to the four BUTTONS the design draws them
    // on, read out of the deliverable itself rather than restated here. A
    // future task reaching for `chevronStart` for a back button gets the design's
    // own back button, whatever anyone thought "start" meant.
    expect(drawnBy('onClick="{{ back }}"')).toBe(pathOf('chevronStart'))
    expect(drawnBy('{{ d.cta }}')).toBe(pathOf('chevronEnd'))
    expect(drawnBy('onClick="{{ prevPage }}"')).toBe(pathOf('chevronPrev'))
    expect(drawnBy('onClick="{{ nextPage }}"')).toBe(pathOf('chevronNext'))
    // …and the pairs really are pairs, or one path used for all four would
    // satisfy every line above.
    const four = ['chevronStart', 'chevronEnd', 'chevronPrev', 'chevronNext'] as const
    expect(new Set(four.map(pathOf)).size).toBe(4)
  })

  it('quotes the glyphs that already existed, rather than redrawing them', () => {
    // `comment` is the sharp one: an earlier draft of this set invented a speech
    // bubble on the premise that the design ships none. It ships one, four times
    // over in each deliverable, and src/ui/FAB.tsx was already drawing it — so
    // the swap in step 8 would have changed the FAB's glyph while every class
    // assertion about the disc stayed green. Read from the DESIGN, because
    // FAB.tsx now reads this set and a check against it would be circular.
    expect(readFileSync(designSrc, 'utf8')).toContain(pathOf('comment'))
    // The two the prototype drew and this task carried over unchanged. Both
    // shells still draw them inline — neither is on this task's Modify list —
    // so these are a real comparison and not a restatement.
    //
    // EVERY path, in order, and the node count with it. "each path I draw is
    // somewhere in that file" is satisfied by drawing HALF the glyph: dropping
    // the arrow out of `logout` leaves the door frame, which is a door, and it
    // passed.
    for (const [name, component] of [['inbox', 'InboxIcon'], ['logout', 'LogoutIcon']] as const) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg') as SVGElement
      const drawn = Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('d'))
      const { paths, nodes } = shellGlyph('src/shell/PanelShell.tsx', component)
      expect(drawn, name).toEqual(paths)
      expect(svg.querySelectorAll('path, circle, rect').length, name).toBe(nodes)
      unmount()
    }
  })

  it('draws eyeOff as eye struck through, and eye unstruck', () => {
    // Ledger L-39: InjaIcons ships no eye, so these two were authored — in
    // src/ui/PasswordField.tsx, and moved here unchanged. The strike is the
    // whole difference between the two states and the only one a SIGHTED user
    // can see (`aria-pressed` and the label carry it for everyone else), which
    // is why src/ui/fields.test.tsx asserts it in both states and this asserts
    // it of the set they now both come from.
    const strike = 'M3 3l18 18'
    const paths = (name: 'eye' | 'eyeOff') => {
      const { container, unmount } = render(<Icon name={name} />)
      const out = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d'))
      unmount()
      return out
    }
    expect(paths('eyeOff')).toContain(strike)
    expect(paths('eye')).not.toContain(strike)
    // …and eyeOff is the eye WITH a strike, not a bare diagonal line.
    expect(paths('eyeOff').length).toBeGreaterThan(1)
  })

  it('draws the kebab vertically, the way S1 does', () => {
    // §9.7 l — three renderings of one idea; this is the one S1 uses on a row.
    const { container } = render(<Icon name="dots" />)
    const cys = Array.from(container.querySelectorAll('circle')).map((c) => c.getAttribute('cy'))
    expect(cys).toEqual(['5', '12', '19'])
    expect(container.querySelectorAll('circle')[0].getAttribute('cx')).toBe('12')
  })

  it('gives every key a drawing, and no two keys the same one', () => {
    // An empty entry passes every attribute assertion above and draws nothing;
    // a copy-pasted one gives two names one glyph, which is how a set grows a
    // second chevron-down called `chevronUp`.
    const drawings = new Map<string, string>()
    for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg') as SVGElement
      expect(svg.querySelectorAll('path, circle, rect').length, name).toBeGreaterThan(0)
      const shape = svg.innerHTML
      expect(drawings.get(shape), `${name} draws the same shape as ${drawings.get(shape) ?? ''}`)
        .toBeUndefined()
      drawings.set(shape, name)
      unmount()
    }
    expect(drawings.size).toBe(21)
  })
})

describe('IconTile', () => {
  it('takes the box, the radius and the glyph from R3’s role, on both surfaces', async () => {
    // The tile's three numbers are 48/14/24 in the panel and 54/16/26 in the
    // reader, and src/styles/roles.css already owns all six as one role trio.
    // So this asserts the CHAIN — the class the component writes, the token
    // that class carries, the token the role points at, and what that token is
    // worth — rather than the number, which the component must not know.
    const { container, unmount } = on('panel', <IconTile dept="dining" />)
    const tile = container.querySelector('[data-tile]') as HTMLElement
    expect(tile).toHaveClass('w-tile', 'h-tile', 'rounded-tile', 'inline-flex', 'flex-none')
    // …and it does not ALSO write the number. An inline width beats a class
    // unconditionally, so a tile carrying both would name the role and ignore it.
    expect(tile.getAttribute('style')).toBeNull()
    const glyph = container.querySelector('svg') as SVGElement
    expect(glyph.getAttribute('class')).toBe('w-glyph h-glyph')
    expect(glyph.getAttribute('width')).toBeNull()

    const box = await paint('w-tile h-tile')
    expect(winner(box, 'width')).toBe('var(--role-tile)')
    expect(winner(box, 'height')).toBe('var(--role-tile)')
    expect(roleTarget('--role-tile')).toBe('--size-tile')
    expect(tokenLiteral('--size-tile')).toBe('48px')

    expect(winner(await paint('rounded-tile'), 'border-radius')).toBe('var(--radius-tile)')
    expect(roleTarget('--role-tile-radius')).toBe('--radius-tile')
    expect(tokenLiteral('--radius-tile')).toBe('14px')

    const g = await paint('w-glyph h-glyph')
    expect(winner(g, 'width')).toBe('var(--size-glyph)')
    expect(winner(g, 'height')).toBe('var(--size-glyph)')
    expect(roleTarget('--role-tile-glyph')).toBe('--size-glyph')
    expect(tokenLiteral('--size-glyph')).toBe('24px')
    unmount()

    const reader = on('reader', <IconTile dept="dining" />)
    const big = reader.container.querySelector('[data-tile]') as HTMLElement
    // The BOX does not change class: `--role-tile` is 48 under :root and 54
    // under [data-surface='reader'], which is R3's whole arrangement — one
    // class, both surfaces, no call site knowing which it is in.
    expect(big).toHaveClass('w-tile', 'h-tile', 'rounded-card')
    expect(big).not.toHaveClass('rounded-tile')
    expect(big.getAttribute('style')).toBeNull()
    const readerGlyph = reader.container.querySelector('svg') as SVGElement
    expect(readerGlyph.getAttribute('class')).toBe('w-glyph-reader h-glyph-reader')

    expect(roleTarget('--role-tile', 'reader')).toBe('--size-tile-reader')
    expect(tokenLiteral('--size-tile-reader')).toBe('54px')
    expect(winner(await paint('rounded-card'), 'border-radius')).toBe('var(--radius-card)')
    expect(roleTarget('--role-tile-radius', 'reader')).toBe('--radius-card')
    expect(tokenLiteral('--radius-card')).toBe('16px')
    const gr = await paint('w-glyph-reader h-glyph-reader')
    expect(winner(gr, 'width')).toBe('var(--size-glyph-reader)')
    expect(roleTarget('--role-tile-glyph', 'reader')).toBe('--size-glyph-reader')
    // §6.17 states 26px, not the 27 the half-the-tile rule would give — and the
    // theme is where that ruling already lives.
    expect(tokenLiteral('--size-glyph-reader')).toBe('26px')
    // …and the six values really are six, not one repeated: a reader end that
    // resolved to its panel twin would pass every line above.
    expect(tokenLiteral('--size-tile')).not.toBe(tokenLiteral('--size-tile-reader'))
    expect(tokenLiteral('--radius-tile')).not.toBe(tokenLiteral('--radius-card'))
    expect(tokenLiteral('--size-glyph')).not.toBe(tokenLiteral('--size-glyph-reader'))
  })

  it('emits these declarations and no others, on either surface', async () => {
    // The whole set, not the properties an assertion thought of. Dropping
    // `justify-center` leaves a 24px glyph jammed against one edge of a 48px
    // square: it compiles, `dead()` waves it through, jsdom paints nothing, and
    // every other assertion in this file stays green.
    const CENTRED = {
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      flex: 'none',
      'background-color': 'var(--tile-c)',
      color: 'var(--conflict)',
      width: 'var(--role-tile)',
      height: 'var(--role-tile)',
    }
    const panel = on('panel', <IconTile dept="dining" />)
    expect(await styles(panel.container.querySelector('[data-tile]')!))
      .toEqual({ ...CENTRED, 'border-radius': 'var(--radius-tile)' })
    panel.unmount()
    const reader = on('reader', <IconTile dept="dining" />)
    expect(await styles(reader.container.querySelector('[data-tile]')!))
      .toEqual({ ...CENTRED, 'border-radius': 'var(--radius-card)' })
    reader.unmount()
    // …and the glyph inside it, which carries a class of its own on this path.
    const g = on('panel', <IconTile dept="dining" />)
    expect(await styles(g.container.querySelector('svg')!))
      .toEqual({ width: 'var(--size-glyph)', height: 'var(--size-glyph)' })
    g.unmount()

    // …and NOTHING it draws is conditional. The tile paints at rest and only at
    // rest: it has no hover skin (the card around it lifts, the tile does not),
    // no focus ring of its own and no responsive branch. A variant class is
    // invisible to the three snapshots above by construction — `hover:bg-tile-v2`
    // survived all of them — so it is asserted as its own question.
    for (const surface of ['panel', 'reader'] as const) {
      const { container, unmount } = on(surface, <IconTile dept="dining" />)
      expect(await conditionalsOf(container.querySelector('[data-tile]')!), surface).toEqual([])
      unmount()
    }
    // …against a helper that can see one, or the two lines above are a green
    // nothing.
    expect(conditionals(await paint('hover:bg-tile-v2 max760:hidden')))
      .toEqual(['.hover:bg-tile-v2:hover', '@media (max-width: 760px) .max760:hidden'])
  })

  it('lets an explicit path beat the department’s, as Icon does', () => {
    // `d` is IconTile's pass-through for a glyph that is in neither the icon set
    // nor the department map — a one-off tile on a screen. Dropping the `??`
    // silently ignores it and draws the department glyph, or nothing at all.
    const { container, unmount } = on('panel', <IconTile d="M4 20l16-16" />)
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M4 20l16-16')
    unmount()
    // …and it beats a department that is also given, the way Icon's does.
    const both = on('panel', <IconTile dept="cooking" d="M4 20l16-16" />)
    expect(both.container.querySelector('path')?.getAttribute('d')).toBe('M4 20l16-16')
    expect(deptMeta('cooking').icon).not.toBe('M4 20l16-16')
  })

  it('lets a caller override the box, and halves it for the glyph', async () => {
    // §5.1.2's `Math.round(size/2)`, for the tiles the role does not cover —
    // §6.15's 42×42 confirm-dialog tile is the first. This is the ONLY path
    // that writes a number, and it REPLACES the role box rather than sitting
    // beside it.
    const { container } = on('panel', <IconTile name="check" px={42} />)
    const tile = container.querySelector('[data-tile]') as HTMLElement
    expect(tile.style.width).toBe('42px')
    expect(tile.style.height).toBe('42px')
    expect(tile).not.toHaveClass('w-tile')
    expect(tile).not.toHaveClass('h-tile')
    const glyph = container.querySelector('svg') as SVGElement
    expect(glyph.getAttribute('width')).toBe('21')
    expect(glyph.getAttribute('height')).toBe('21')
    expect(glyph.hasAttribute('class')).toBe(false)
  })

  it('takes each department’s fixed accent, never a decorative one', () => {
    const { container, unmount } = on('panel', <IconTile dept="dining" />)
    expect(container.querySelector('[data-tile]')).toHaveClass('bg-tile-c', 'text-conflict')
    unmount()
    const violet = on('panel', <IconTile dept="warehouse" />)
    expect(violet.container.querySelector('[data-tile]')).toHaveClass('bg-tile-v', 'text-violet')
    violet.unmount()
    // …and the four accents are four, so `warn` and `ok` cannot quietly be the
    // violet tile with a different name.
    const warn = on('panel', <IconTile name="check" accent="warn" />)
    expect(warn.container.querySelector('[data-tile]')).toHaveClass('bg-tile-warn', 'text-warn')
    warn.unmount()
    const ok = on('panel', <IconTile name="check" accent="ok" />)
    expect(ok.container.querySelector('[data-tile]')).toHaveClass('bg-tile-ok', 'text-green')
  })

  it('draws the department glyph at stroke 1.9, and at the map’s own path', () => {
    const { container } = on('panel', <IconTile dept="cooking" />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('stroke-width')).toBe('1.9')
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deptMeta('cooking').icon)
    // Not the same path for every department, which is what a `d` dropped on
    // the floor would leave — and every accent assertion above would still pass.
    expect(deptMeta('cooking').icon).not.toBe(deptMeta('cashier').icon)
  })

  it('writes no class that compiles to nothing, on either surface', async () => {
    for (const surface of ['panel', 'reader'] as const) {
      const { container, unmount } = on(surface, <IconTile dept="logistics" className="mt-s3" />)
      const harvest = classStringOf(container.querySelector('[data-tile]') as Element)
      expect(harvest, surface).not.toBe('')
      expect(await dead(harvest), surface).toEqual([])
      // The caller's own class survives the join, rather than being dropped by
      // the whitespace squeeze that keeps the string tidy.
      expect(harvest.split(/\s+/), surface).toContain('mt-s3')
      unmount()
    }
  })
})

describe('the department accent map', () => {
  it('gives every one of the nine a numeral tint as well as a tile', () => {
    // The audit's §4: deptMeta returned tileClass and not the numeral tint,
    // which is why src/screens/Departments.tsx hard-codes two hexes.
    for (const code of DEPT_CODES) {
      const m = deptMeta(code)
      expect(m.numeralClass, code).toBe(
        m.accent === 'coral' ? 'text-dept-numeral-coral' : 'text-dept-numeral-violet',
      )
    }
    expect(DEPT_CODES).toHaveLength(9)
    // Both tints are used, or a map that returned one name for both accents
    // would pass the loop on a nine-department set that was all one colour.
    const tints = new Set(DEPT_CODES.map((c) => deptMeta(c).numeralClass))
    expect(tints.size).toBe(2)
  })

  it('names two tints that compile, and carry the two tokens they are named for', async () => {
    expect(await dead('text-dept-numeral-violet text-dept-numeral-coral')).toEqual([])
    expect(winner(await paint('text-dept-numeral-violet'), 'color'))
      .toBe('var(--dept-numeral-violet)')
    expect(winner(await paint('text-dept-numeral-coral'), 'color'))
      .toBe('var(--dept-numeral-coral)')
    // …and the two tokens are two values, not one written twice.
    expect(tokenLiteral('--dept-numeral-violet')).not.toBe('')
    expect(tokenLiteral('--dept-numeral-violet')).not.toBe(tokenLiteral('--dept-numeral-coral'))
  })

  it('keeps returning the tile class it always did', () => {
    // The numeral tint is an ADDITION. A `return { ...m, numeralClass }` that
    // dropped `tileClass` would take the tint to every caller and the tile from
    // all of them.
    expect(deptMeta('dining').tileClass).toBe('bg-tile-c text-conflict')
    expect(deptMeta('warehouse').tileClass).toBe('bg-tile-v text-violet')
    // …and an unknown code still answers, rather than throwing on a screen.
    expect(deptMeta('nonesuch')).toEqual({
      icon: '', accent: 'violet',
      tileClass: 'bg-tile-v text-violet', numeralClass: 'text-dept-numeral-violet',
    })
  })
})

describe('Logo', () => {
  it('draws the one raster the product ships', async () => {
    const { container } = render(<Logo />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/inja-logo/)
    expect(img).toHaveClass('object-cover', 'rounded-input')
    expect(img.getAttribute('width')).toBe('38')
    expect(img.getAttribute('height')).toBe('38')
    // Decorative beside the wordmark it sits next to; naming it twice is worse
    // than not naming it once.
    expect(img.getAttribute('alt')).toBe('')
    // …and the classes compile. `object-cover` is what keeps a non-square
    // source from being squashed into the square box above, and it is one of
    // the two classes here that is not a theme name.
    expect(await dead(img.className)).toEqual([])
    expect(winner(await paint('object-cover'), 'object-fit')).toBe('cover')
    expect(winner(await paint('rounded-input'), 'border-radius')).toBe('var(--radius-input)')
    expect(tokenLiteral('--radius-input')).toBe('11px')
  })

  it('takes the login size too', async () => {
    const { container } = render(<Logo px={76} radius="rounded-feature" className="mb-s7" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('width')).toBe('76')
    expect(img.getAttribute('height')).toBe('76')
    expect(img).toHaveClass('rounded-feature', 'mb-s7')
    expect(img).not.toHaveClass('rounded-input')
    expect(await dead(img.className)).toEqual([])
    expect(winner(await paint('rounded-feature'), 'border-radius')).toBe('var(--radius-card-lg)')
    expect(tokenLiteral('--radius-card-lg')).toBe('20px')
    // The design's two sizes, and they are two.
    expect(tokenLiteral('--size-logo-bar')).toBe('38px')
    expect(tokenLiteral('--size-logo-login')).toBe('76px')
  })
})

/* ========================================================================= */

/**
 * Every .ts/.tsx under src/ui/ that is not a test, with `//` and block comments
 * BLANKED — replaced space for space, so the line numbers in a failure still
 * point at the real line.
 *
 * Blanking is not a loophole; it is the difference between the rule and a
 * spellcheck. `×` is the multiplication sign this codebase writes every box
 * with (`34×34`, `24×24 box`, `48×48/radius 14`), `→` is an arrow in an
 * explanation (`gap-s4 → gap-s99 emits nothing`), and `⋯` appears in the icon
 * set's own note about why it does not draw one. Scanned raw, twelve lines in
 * src/ui/ match today and ten of them are prose. The rule is about what reaches
 * the SCREEN.
 */
function uiSources(): { rel: string; raw: string[]; code: string[] }[] {
  const dir = join(process.cwd(), 'src/ui')
  const files: string[] = []
  ;(function walk(d: string) {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
    }
  })(dir)
  return files.map((p) => {
    const raw = readFileSync(p, 'utf8')
    return { rel: p.slice(p.indexOf('src/')), raw: raw.split('\n'), code: decomment(raw).split('\n') }
  })
}

const blank = (m: string) => m.replace(/[^\n]/g, ' ')

/**
 * The `[^:"'`\\]` lead capture keeps `https://` and a `//` inside a string
 * literal from swallowing the rest of the line.
 */
function decomment(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)))
}

/**
 * The characters that are an ICON pretending to be text.
 *
 * `×`, `−`, `+` and `⋯` are audit P7's list; `✓ ✔ ➜` are the same idea. The
 * arrows are here because the design's two SANCTIONED unicode glyphs — the
 * reorder dialog's drag handle `⣿` and the IDEF0 card's `↓ → ← ↑` — live in
 * src/write/ and src/flow/, so an arrow appearing in src/ui/ is not one of them.
 *
 * `…` is NOT here, and that is a narrowing this file states rather than hides.
 * An ellipsis is punctuation in running copy, not a glyph standing in for a
 * drawing: src/ui/Dropdown.tsx's search placeholder is «جست‌وجو…», which is the
 * design's own copy and reaches the screen as TEXT. A rule that reported it
 * would be a rule about the character rather than about the icon.
 *
 * `+` cannot be scanned for on its own — it is the addition operator — so it is
 * caught through its partner: the accordion drew `−` and `+` on one line.
 */
const GLYPH = /[×−⋯✓✔➜←→↑↓]/

describe('the icon rule', () => {
  it('sees a unicode glyph in code and not in a comment', () => {
    // The negative control this scan cannot do without. Its predecessor blanked
    // comments with a regex that also ate the code after them, which reports
    // NOTHING — indistinguishable from a clean tree.
    const fixture = [
      "export const A = <span>{open ? '−' : '+'}</span>",
      '// the 24×24 box, and an arrow → in prose',
      '/* a block comment about ⋯ */',
      "const url = 'https://x/y' // and ✓ after a URL",
    ].join('\n')
    const scanned = decomment(fixture).split('\n')
    expect(scanned.map((l) => GLYPH.test(l))).toEqual([true, false, false, false])
    // …and blanking preserved the line count and the columns, so a reported
    // line number still points at the right line.
    expect(scanned).toHaveLength(4)
    expect(scanned[3].length).toBe(fixture.split('\n')[3].length)
    expect(scanned[3].trimEnd()).toBe("const url = 'https://x/y'")
  })

  it('leaves no unicode glyph standing in for an icon in src/ui/', () => {
    // "No icon font, no PNG icons, no emoji, no unicode-glyph icons", with two
    // sanctioned exceptions that live in src/write/ and src/flow/, not here.
    const sources = uiSources()
    // The scan is over a real set, or an empty walk would report [] and pass.
    expect(sources.length).toBeGreaterThan(20)
    expect(sources.map((s) => s.rel)).toContain('src/ui/Accordion.tsx')
    const hits = sources.flatMap((s) =>
      s.code
        .map((line, i) => ({ rel: s.rel, n: i + 1, line, raw: s.raw[i] }))
        .filter(({ line }) => GLYPH.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.raw.trim()}`)).toEqual([])
    // …and the corpus really does contain the characters this rule tolerates in
    // prose, so "no hits" is a decommenting that worked and not one that ran on
    // a tree with nothing to find.
    expect(sources.filter((s) => s.raw.some((l) => GLYPH.test(l))).length).toBeGreaterThan(3)
  })

  it('has folded every inline SVG out of the four files Tasks 7–10 left them in', () => {
    // FOUR FILES, and six SVGs — the plan's step 8 named two of Dropdown's
    // three and would have left the popover magnifier inline.
    //
    // Four, named — not "every SVG in src/ui/". Overlay.tsx's close cross,
    // SearchField.tsx's magnifier, Button.tsx's spinner and Checkbox.tsx's 13px
    // tick keep theirs: each is drawn by the task that owns it and none is on
    // this task's Modify list. A test named for all of them would be read as
    // licence to rewrite four files this task never opened.
    const named = ['PasswordField', 'Dropdown', 'Pager', 'FAB']
    for (const f of named) {
      const src = sourceOf(`${f}.tsx`)
      expect(src, f).not.toMatch(/<svg/)
      expect(src, f).toMatch(/<Icon/)
    }
    // …and the four that keep theirs still have them, so "not.toMatch(/<svg/)"
    // above is a statement about four files and not about the directory.
    for (const f of ['Overlay', 'SearchField', 'Button', 'Checkbox']) {
      expect(sourceOf(`${f}.tsx`), f).toMatch(/<svg/)
    }
  })

  it('draws the accordion’s open mark rather than typing it', async () => {
    // The last unicode glyph in src/ui/ (audit P7) was `−`/`+` in a span. The
    // scan above says the CHARACTER is gone; this says a DRAWING replaced it,
    // which deleting the span would also satisfy — and that the mark still
    // changes with the state, which one chevron drawn in both would not.
    render(<Accordion title="سرپرست سالن"><p>محتوا</p></Accordion>)
    const header = screen.getByRole('button', { name: 'سرپرست سالن' })
    const mark = () => header.querySelector('svg path')?.getAttribute('d')
    expect(header.querySelector('svg')).toBeTruthy()
    const shut = mark()
    expect(shut).toBe('M6 9l6 6 6-6')
    await userEvent.click(header)
    expect(mark()).toBe('M18 15l-6-6-6 6')
    expect(mark()).not.toBe(shut)
    // The span was already aria-hidden and Icon is too, so the header's
    // accessible name — which src/ui/controls.test.tsx finds it by — does not
    // move.
    expect(screen.getByRole('button', { name: 'سرپرست سالن' })).toBe(header)
    expect(header.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    // …and it has a SIZE. `Icon` writes no width attribute unless it is given a
    // `px`, which is the right default and also the sharp edge: a glyph that
    // loses its size class does not fall back to something a little wrong, it
    // falls back to the replaced-element default of 300×150 and blows the
    // header apart — with the `d` assertions above, the accessible name and the
    // whole of controls.test.tsx still green.
    expect(await styles(header.querySelector('svg')!)).toEqual({
      width: 'var(--size-chevron)', height: 'var(--size-chevron)', flex: 'none',
    })
  })
})
