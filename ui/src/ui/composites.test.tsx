import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { SectionCard } from './SectionCard'
import { StatTile, type StatTone } from './StatTile'
import { NavTabTray } from './NavTabTray'
import { Timeline, type TimelineNode, type TimelineState } from './Timeline'
import { FAB } from './FAB'
import { expectExpandedHitArea } from '../test/a11y'

/* -------------------------------------------------------------------------
   Three halves, and the last two are the ones that matter.

   jsdom paints nothing. `toHaveClass('bg-violet')` proves only that a string
   reached an attribute — `bg-violet-ish` satisfies it just as well, emits no
   rule at all, and lets the build exit 0. That is this project's signature
   defect.

   So this file asks three questions of every element these five composites
   draw, and only the first is about class names:

     · BEHAVIOUR — roles, names, keyboard, the Persian numeral. Plain RTL.
     · ALIVE — `dead()` takes the element's OWN rendered class string and
       reports every class in it that compiles to nothing. It does not need to
       be told which property a class was meant to set, so an invented name is
       caught whether or not this file thought to assert it.
     · THE WHOLE DECLARATION SET — `snap()` compiles the element's own class
       string and returns EVERY winning declaration, sorted. Reviews of Tasks 7,
       8 and 9 all reached the same diagnosis: a suite asserts the properties
       its author was thinking about and nothing constrains the ones they were
       not, so a mutation that adds, drops or swaps a class nobody named
       survives. A full set has no such gap — every class on the element is
       inside it, in both directions.

   Every branch of every component is rendered, because a class inside an
   unrendered branch is invisible to all three.
   ------------------------------------------------------------------------- */

/** One emitted rule, split into the class that carries it and the state it applies in. */
type Painted = { klass: string; state: string; media: string; decls: [string, string][] }

/** Every class token in a selector — `.a:hover ~ .b\:c` is `a` and `b:c`. */
function classesIn(selector: string): string[] {
  return [...selector.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\/g, ''))
}

/**
 * Compile a class string through the real `tailwind.config.js`.
 *
 * `painted` is the house harness's leading-class parse, which `winner()` and
 * `snap()` read. `alive` is every class appearing anywhere in a rule with a
 * body, which is the only way to see a class whose selector does not begin
 * with it.
 */
type Compiled = { painted: Painted[]; alive: Set<string> }

/**
 * Compiling the theme is the expensive thing this file does, and the same class
 * string is asked about more than once. The cache is keyed on the SORTED,
 * de-duplicated class set, so two spellings of one set share an answer and
 * nothing else does.
 */
const CACHE = new Map<string, Promise<Compiled>>()

function compile(classNames: string): Promise<Compiled> {
  const key = [...new Set(classNames.split(/\s+/).filter(Boolean))].sort().join(' ')
  let hit = CACHE.get(key)
  if (hit === undefined) {
    hit = compileUncached(classNames)
    CACHE.set(key, hit)
  }
  return hit
}

async function compileUncached(classNames: string): Promise<Compiled> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  if (classes.length === 0) return { painted: [], alive: new Set() }
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const painted: Painted[] = []
  const alive = new Set<string>()
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this file exists to catch.
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => [(n as unknown as { prop: string }).prop, (n as unknown as { value: string }).value] as [string, string])
    if (decls.length === 0) return
    for (const sel of rule.selectors) {
      for (const k of classesIn(sel)) alive.add(k)
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      painted.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return { painted, alive }
}

/** The house harness's shape, for a single-property assertion. */
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
    for (const [name, v] of p.decls) if (name === prop) value = v
  }
  return value
}

/**
 * EVERY winning declaration a class string produces at rest, as sorted
 * `prop: value` lines.
 *
 * This is the assertion a chosen list of properties cannot make. Add a class
 * and a line appears; delete one and a line vanishes; swap one token for
 * another and a line changes. A mutation has nowhere to hide behind "no test
 * named that property".
 */
async function snapOf(classNames: string): Promise<string[]> {
  const { painted } = await compile(classNames)
  const own = new Map<string, string>()
  for (const p of painted) {
    if (p.state !== '' || p.media !== '') continue
    for (const [prop, value] of p.decls) own.set(prop, value)
  }
  return [...own].map(([p, v]) => `${p}: ${v}`).sort()
}

/** The same, for an element that has already been rendered. */
const snap = (el: Element) => snapOf(el.getAttribute('class') ?? '')

/** Every class in this string that compiles to nothing. */
async function dead(classNames: string): Promise<string[]> {
  const { alive } = await compile(classNames)
  return [...new Set(classNames.split(/\s+/).filter(Boolean))].filter((c) => !alive.has(c))
}

/* -------------------------------------------------------------------------
   The number the utility layer cannot tell you.

   A control whose drawn height is `padding + line box` has no `h-…` class to
   read, and the line box is `font-size x line-height` where the line-height is
   INHERITED — Tailwind's base layer sets it once, on `html`, and every button
   takes it from there. So the third factor is not in the element's class
   string at all, and a test that wanted the drawn height either hard-codes 1.5
   (a second, silent record of a value the base layer owns) or reads it.

   This reads it: the base layer is compiled and `html`'s own `line-height` is
   taken out of it. Change the preflight, or turn it off, and the arithmetic
   below moves with it.
   ------------------------------------------------------------------------- */
let BASE_LINE_HEIGHT: Promise<number> | undefined
function baseLineHeight(): Promise<number> {
  BASE_LINE_HEIGHT ??= (async () => {
    const result = await postcss([
      tailwind({ ...config, content: [{ raw: 'x', extension: 'html' }] }),
    ]).process('@tailwind base;', { from: undefined })
    let value = ''
    result.root.walkRules((rule) => {
      if (!rule.selectors.includes('html')) return
      for (const n of rule.nodes ?? []) {
        if (n.type !== 'decl') continue
        const decl = n as unknown as { prop: string; value: string }
        if (decl.prop === 'line-height') value = decl.value
      }
    })
    return Number(value)
  })()
  return BASE_LINE_HEIGHT
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

/** What one token is actually worth, so "21px" is a measurement and not a claim. */
const tokenLiteral = (token: string) => declared().get(token) ?? ''

/**
 * A CSS length in px, following `var(--x)` back to the token behind it.
 * Returns NaN for anything that is not a px length, so a missing declaration
 * and a wrong one both fail the arithmetic rather than passing it as 0.
 */
function pxOf(value: string): number {
  const token = /^var\((--[a-z0-9-]+)\)$/.exec(value.trim())?.[1]
  const literal = token === undefined ? value.trim() : tokenLiteral(token)
  return Number(/^(-?\d+(?:\.\d+)?)px$/.exec(literal)?.[1] ?? NaN)
}

/**
 * What a `--role-*` property is worth on one surface, read out of
 * `src/styles/roles.css` and then followed back to its literal.
 *
 * A surface-scaled utility writes ONE class on both surfaces, so asserting the
 * class name proves nothing about the scale. This is the half that does.
 */
function roleOn(surface: 'panel' | 'reader', role: string): string {
  const roles = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  const selector = surface === 'panel' ? ':root' : "\\[data-surface='reader'\\]"
  const body = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(roles)?.[1] ?? ''
  const token = new RegExp(`(?<![-\\w])${role}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(body)?.[1] ?? ''
  return tokenLiteral(token)
}

const sourceOf = (file: string) => readFileSync(join(process.cwd(), 'src/ui', file), 'utf8')

/**
 * The same source with `//` and `/* … *\/` removed.
 *
 * These five files explain themselves at length, and every one of those
 * explanations names the things it is explaining. A source scan that reads
 * prose reports `useSurface` in a docstring saying the component does not call
 * it — the same defect src/test/theme.test.ts's R11 scan was rebuilt to close.
 */
function codeOf(file: string): string {
  return sourceOf(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[^\n'"`]*\/\/[^\n]*/gm, ' ')
}

const SOURCES = ['SectionCard.tsx', 'StatTile.tsx', 'NavTabTray.tsx', 'Timeline.tsx', 'FAB.tsx'] as const

/* -------------------------------------------------------------------------
   The one bracketed spelling these five files may write.

   Everything else on the design's ladder comes through a token, and the test
   above says so. The hit-area overlay is the exception the plan carves out by
   name: `before:-inset-[Npx]` is derived ARITHMETIC — whatever brings this
   control's drawn size up to F11's 44 — so N differs per control (6px on
   Overlay's 32px close button, 5px on Pager's 34px page button, 5px on the
   34.75px tab below). A token would have to be minted per control size and
   would record the arithmetic in the one place that cannot check it; the
   arithmetic is checked here instead, against the box the control actually
   draws.

   Anchored, so a variant-prefixed `md:before:-inset-[5px]` — a 44px target
   above 768px and a 34.75px one on every phone — is NOT this. `_ANYWHERE` is
   the same pattern for striking the two spellings out of a source line, with a
   lookbehind that refuses to strike the tail off a variant chain.
   ------------------------------------------------------------------------- */
const HIT_AREA = /^before:(?:content-\[""\]|-inset-\[\d+(?:\.\d+)?px\])$/
const HIT_AREA_ANYWHERE = /(?<![\w:-])before:(?:content-\[""\]|-inset-\[\d+(?:\.\d+)?px\])/g

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

const NODES: TimelineNode[] = [
  { id: 'a', name: 'سحر بیات', role: 'سرپرست سالن', state: 'done', stateLabel: 'تأیید کرد' },
  { id: 'b', name: 'رضا کریمی', role: 'ادیتور', state: 'awaiting', stateLabel: 'در انتظار تأیید', note: 'روی میز از دیروز' },
]

const TABS = [
  { id: 'mine', label: 'رسیده به شما' },
  { id: 'all', label: 'همه' },
  { id: 'closed', label: 'بسته‌شده' },
]

/* ========================================================================= */

describe('the harness itself', () => {
  // `winner`, `snap` and `dead` all answer ''/[]/[] both for "nothing sets it"
  // and for "the compile produced nothing at all". If the second were ever
  // true this whole file would pass green and prove nothing. Pin every one of
  // them in both directions before using any of them.
  it('tells a real utility from an invented one', async () => {
    expect(winner(await paint('bg-violet'), 'background-color')).toBe('var(--violet)')
    expect(winner(await paint('bg-violet-ish'), 'background-color')).toBe('')
  })

  it('reports invented classes dead and real ones alive', async () => {
    expect(await dead('w-fab h-fab z-floating gap-stat-dot')).toEqual([])
    expect(await dead('w-fab-ish gap-stat-dott z-floaty')).toEqual(['w-fab-ish', 'gap-stat-dott', 'z-floaty'])
  })

  it('snapshots the WHOLE declaration set, and notices one more class or one fewer', async () => {
    expect(await snapOf('bg-coral rounded-round')).toEqual([
      'background-color: var(--coral)',
      'border-radius: var(--radius-round)',
    ])
    // One more class is one more line…
    expect(await snapOf('bg-coral rounded-round w-s4')).toEqual([
      'background-color: var(--coral)',
      'border-radius: var(--radius-round)',
      'width: var(--space-4)',
    ])
    // …one invented class is no line at all, which is what makes an added
    // typo visible rather than silently absent.
    expect(await snapOf('bg-coral rounded-round w-s4-ish')).toEqual([
      'background-color: var(--coral)',
      'border-radius: var(--radius-round)',
    ])
    expect(await snapOf('')).toEqual([])
  })

  it('reads the base layer’s inherited line-height, and a px length through its token', async () => {
    // Both feed the hit-area arithmetic below, and both answer with a number
    // for "nothing found" unless they are pinned: `Number('')` is 0 and would
    // make every line box zero tall, which is the direction that passes.
    expect(await baseLineHeight()).toBe(1.5)
    expect(pxOf('var(--space-4)')).toBe(8)
    expect(pxOf('12.5px')).toBe(12.5)
    expect(pxOf('-5px')).toBe(-5)
    expect(pxOf('var(--nonesuch)')).toBeNaN()
    expect(pxOf('')).toBeNaN()
    expect(pxOf('transparent')).toBeNaN()
    // A unitless token is not a length: `--fw-bold` is 700 and 700 is not 700px.
    expect(pxOf('var(--fw-bold)')).toBeNaN()
  })

  it('reads the token and role files, so a literal here is measured and not restated', () => {
    expect(tokenLiteral('--fs-stat')).toBe('27px')
    expect(tokenLiteral('--nonesuch')).toBe('')
    expect(roleOn('panel', '--role-fab')).toBe('52px')
    expect(roleOn('reader', '--role-fab')).toBe('56px')
    expect(roleOn('panel', '--role-nonesuch')).toBe('')
  })
})

/* ========================================================================= */

describe('every class these five composites write, in every branch', () => {
  /**
   * One mounted branch per row. A class inside a branch nothing renders is
   * invisible to `dead()`, to `snap()` and to every eye — Task 8 shipped two
   * invented names inside an unrendered `disabled` branch exactly that way —
   * so the list below has to reach every conditional in all five files.
   */
  const BRANCHES: [string, () => ReactNode][] = [
    ['SectionCard tint, with an eyebrow', () => <SectionCard eyebrow="نقش"><p>x</p></SectionCard>],
    ['SectionCard tint, without one', () => <SectionCard><p>x</p></SectionCard>],
    ['SectionCard white', () => <SectionCard skin="white" eyebrow="نقش"><p>x</p></SectionCard>],
    ...(['violet', 'ink', 'conflict', 'ok', 'warn'] as StatTone[]).map(
      (tone): [string, () => ReactNode] =>
        [`StatTile feature/${tone}`, () => <StatTile value={3} label="ل" tone={tone} />],
    ),
    ['StatTile feature with the dot', () => <StatTile value={3} label="ل" tone="conflict" dot />],
    ['StatTile compact', () => <StatTile value={3} label="ل" skin="compact" />],
    ['StatTile compact with the dot', () => <StatTile value={3} label="ل" skin="compact" dot />],
    ['StatTile with a string value', () => <StatTile value="۱ تا ۵" label="ل" />],
    ['NavTabTray', () => <NavTabTray label="ن" value="mine" tabs={TABS} onChange={() => {}} />],
    ['NavTabTray stretched', () => <NavTabTray label="ن" value="all" tabs={TABS} onChange={() => {}} stretch />],
    ...(['done', 'awaiting', 'rejected', 'pending'] as TimelineState[]).map(
      (state): [string, () => ReactNode] => [
        `Timeline/${state}`,
        () => (
          <Timeline
            label="ز"
            nodes={[
              { id: 'x', name: 'ن', role: 'ر', state, stateLabel: 'ح', note: 'ی' },
              { id: 'y', name: 'ن', role: 'ر', state, stateLabel: 'ح', mark: '×' },
            ]}
          />
        ),
      ],
    ),
    ['FAB, panel, no badge', () => <FAB label="ک" onClick={() => {}} />],
    ['FAB, panel, badged', () => <FAB label="ک" count={3} onClick={() => {}} />],
    ['FAB, reader, badged', () => <FAB label="ک" count={9} onClick={() => {}} />],
  ]

  it('emits a rule with a non-empty body — no class is a name only', async () => {
    // Rendered first, compiled once. Whether a utility emits does not depend on
    // what it was compiled beside, so one pass over the union answers for every
    // branch — and twenty passes is twenty seconds of Tailwind under a full
    // suite, which is a flake rather than a check.
    const seen = new Set<string>()
    const perBranch: [string, string[]][] = []
    for (const [name, node] of BRANCHES) {
      const { container, unmount } = on(name.includes('reader') ? 'reader' : 'panel', node())
      const written = classStringOf(container.firstElementChild!).split(/\s+/).filter(Boolean)
      for (const c of written) seen.add(c)
      perBranch.push([name, written])
      unmount()
    }
    const { alive } = await compile([...seen].join(' '))
    for (const [name, written] of perBranch) {
      expect([...new Set(written)].filter((c) => !alive.has(c)), name).toEqual([])
    }
    // …and the sweep is not vacuously green over three classes. If a branch
    // stops rendering, this is what says so.
    expect(seen.size).toBeGreaterThan(70)
    // The same union, asked the other way: three names nothing minted must come
    // back dead, or `alive` answering "yes" to everything would pass the loop.
    expect(await dead('w-fab-ish gap-stat-dott z-floaty')).toEqual([
      'w-fab-ish', 'gap-stat-dott', 'z-floaty',
    ])
  })

  it('writes no arbitrary value but the hit area, whose N is arithmetic and not a design value', async () => {
    // guards.test.ts bans `text-[`, `rounded-[` and `shadow-[` only, so
    // `p-[7px]` passes every gate in this repo while stepping straight past
    // the token layer. Nothing here may hold a bracket except HIT_AREA.
    for (const [name, node] of BRANCHES) {
      const { container, unmount } = on('panel', node())
      const brackets = classStringOf(container.firstElementChild!)
        .split(/\s+/).filter((c) => (c.includes('[') || c.includes(']')) && !HIT_AREA.test(c))
      expect(brackets, name).toEqual([])
      unmount()
    }
    // The same question of the sources, which also covers a branch this file
    // failed to think of. `-[` is the shape of a Tailwind arbitrary value and
    // matches neither a TS array type (`string[]`) nor an index (`tabs[next]`).
    // The two allowed spellings are struck out of the line first, so a second
    // bracket ON THE SAME LINE — the class string that carries the hit area is
    // also the one that carries every other utility the tab draws — is still
    // reported.
    for (const file of SOURCES) {
      const hits = sourceOf(file).split('\n')
        .map((line, i) => ({ n: i + 1, line: line.trim() }))
        .filter(({ line }) => /-\[/.test(line.replace(HIT_AREA_ANYWHERE, '')))
      expect(hits.map((h) => `${file}:${h.n} ${h.line}`)).toEqual([])
    }
    // …and the carve-out is a keyhole, not a door. Every near miss stays banned.
    //
    // Assembled from fragments rather than written out, because
    // `./src/**/*.{ts,tsx}` is a CONTENT glob: a class spelled whole in this
    // file is a class Tailwind mints into the shipped stylesheet, and a fixture
    // is by definition a rule nothing renders. One of these would have shipped
    // `inset: -5`, which is not even valid CSS. `dist/assets/*.css` is the
    // check — none of the eight is in it.
    const klass = (variants: string, utility: string, value: string) =>
      `${variants}${utility}${value === '' ? '' : `[${value}]`}`
    for (const near of [
      klass('before:', '-inset-', '5'),        // no unit
      klass('before:', '-inset-', '5rem'),     // not px
      klass('before:', 'inset-', '5px'),       // positive: an inset, not an outset
      klass('', '-inset-', '5px'),             // not on the ::before at all
      klass('md:before:', '-inset-', '5px'),   // only above 768px
      klass('before:', 'content-', 'none'),    // generates no box
      klass('before:', 'content-', "'x'"),     // paints a glyph
      klass('', 'p-', '7px'),                  // an ordinary arbitrary length
      klass('before:', '-inset-', ''),         // no value at all
    ]) {
      expect(HIT_AREA.test(near), near).toBe(false)
    }
    for (const real of [
      klass('before:', '-inset-', '5px'),
      klass('before:', '-inset-', '16.5px'),
      klass('before:', 'content-', '""'),
    ]) {
      expect(HIT_AREA.test(real), real).toBe(true)
    }
  })

  it('lets the caller add a class without dropping one of its own', async () => {
    // Four of the five take a `className`, and it is the quietest prop in the
    // file: a component that accepts one and interpolates it nowhere compiles,
    // renders, and looks exactly right until the first call site tries to place
    // it. Asserted for each, together with the classes it must NOT have lost.
    const cases: [string, ReactNode, (c: HTMLElement) => Element][] = [
      ['SectionCard', <SectionCard className="mt-s3"><p>x</p></SectionCard>, (c) => c.querySelector('section')!],
      ['StatTile', <StatTile className="mt-s3" value={1} label="ل" />, (c) => c.firstElementChild!],
      ['NavTabTray', <NavTabTray className="mt-s3" label="ن" value="mine" tabs={TABS} onChange={() => {}} />, (c) => c.firstElementChild!],
      ['FAB', <FAB className="mt-s3" label="ک" onClick={() => {}} />, (c) => c.querySelector('button')!],
    ]
    for (const [name, node, pick] of cases) {
      const { container, unmount } = on('panel', node)
      const el = pick(container.firstElementChild as HTMLElement) as HTMLElement
      expect(el.className.split(/\s+/), name).toContain('mt-s3')
      expect(await snap(el), name).toContain('margin-top: var(--space-3)')
      expect(await dead(el.className), name).toEqual([])
      unmount()
    }
  })

  it('takes its scale from the surface, never from a prop of its own', () => {
    // R3/F4 — `--role-fab` is what makes the FAB 52px in the panel and 56px in
    // the reader, and no component in this task may reach for `useSurface()`
    // or offer a size of its own. Asserted against the sources, because the
    // rendered output of a component with a second, wrong path looks identical
    // until the day someone passes the prop.
    for (const file of SOURCES) {
      expect(codeOf(file), file).not.toContain('useSurface')
      expect(codeOf(file), file).not.toMatch(/\bw-fab-reader\b|\bh-fab-reader\b/)
    }
    // The strip, both ways round, or the loop above passes by reading nothing:
    // FAB.tsx's docstring says `useSurface` and its code does not, and `toFa`
    // is in both.
    expect(sourceOf('FAB.tsx')).toContain('useSurface')
    expect(codeOf('FAB.tsx')).toContain('toFa(count)')
    expect(codeOf('FAB.tsx')).not.toContain('speech-bubble')
  })
})

/* ========================================================================= */

describe('SectionCard', () => {
  it('names its section with its own eyebrow', () => {
    const { container } = render(<SectionCard eyebrow="نقش و دپارتمان"><p>x</p></SectionCard>)
    const section = container.querySelector('section') as HTMLElement
    const eyebrow = screen.getByText('نقش و دپارتمان')
    expect(eyebrow.id).not.toBe('')
    expect(section).toHaveAttribute('aria-labelledby', eyebrow.id)
  })

  it('gives every section on the screen its own id', () => {
    // Eight of these stack on the Access screen. A fixed id would satisfy the
    // test above and make all eight say the same word: duplicate ids are
    // invalid, and `aria-labelledby` resolves to whichever came first, so
    // seven sections would be announced with the wrong name.
    const { container } = render(
      <>
        <SectionCard eyebrow="یک"><p>x</p></SectionCard>
        <SectionCard eyebrow="دو"><p>y</p></SectionCard>
      </>,
    )
    const [first, second] = [...container.querySelectorAll('section')]
    expect(screen.getByText('یک').id).not.toBe(screen.getByText('دو').id)
    expect(first.getAttribute('aria-labelledby')).toBe(screen.getByText('یک').id)
    expect(second.getAttribute('aria-labelledby')).toBe(screen.getByText('دو').id)
  })

  it('claims no name it does not have when there is no eyebrow', () => {
    // The other branch. `aria-labelledby` pointing at an id that is not in the
    // document is a section a screen reader announces as nameless — worse than
    // the attribute being absent, and invisible to a test that only ever
    // renders the eyebrow.
    const { container } = render(<SectionCard><p>x</p></SectionCard>)
    const section = container.querySelector('section') as HTMLElement
    expect(section).not.toHaveAttribute('aria-labelledby')
    expect(container.querySelector('p')?.textContent).toBe('x')
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('is tinted and shadowless by default, white and shadowed on request', () => {
    const { container, unmount } = render(<SectionCard><p>x</p></SectionCard>)
    const tint = container.querySelector('section') as HTMLElement
    expect(tint).toHaveClass('bg-surface-sub', 'border-border-current')
    expect(tint.className).not.toMatch(/shadow-/)
    unmount()
    const white = render(<SectionCard skin="white"><p>x</p></SectionCard>)
    expect(white.container.querySelector('section')).toHaveClass('bg-card', 'border-border-card', 'shadow-card')
  })

  it('draws exactly §5.2’s sub-panel and nothing else, in both skins', async () => {
    // R8 — 18px of padding on a 16px radius over a 1px hairline. Every
    // declaration, so a class added, dropped or swapped anywhere on this
    // element moves a line here.
    const { container, unmount } = render(<SectionCard><p>x</p></SectionCard>)
    expect(await snap(container.querySelector('section')!)).toEqual([
      'background-color: var(--surface-sub)',
      'border-color: var(--border-current)',
      'border-radius: var(--radius-card)',
      'border-width: 1px',
      'padding: var(--space-9)',
    ])
    unmount()

    const white = render(<SectionCard skin="white"><p>x</p></SectionCard>)
    expect(await snap(white.container.querySelector('section')!)).toEqual([
      '--tw-shadow-color: var(--card)',
      '--tw-shadow-colored: var(--shadow-card)',
      '--tw-shadow: var(--tw-shadow-colored)',
      'background-color: var(--card)',
      'border-color: var(--border-card)',
      'border-radius: var(--radius-card)',
      'border-width: 1px',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'padding: var(--space-9)',
    ])
    // …and the two skins differ in the three declarations that ARE the skin,
    // not in the geometry, which is one rule per role.
    expect(tokenLiteral('--space-9')).toBe('18px')
    expect(tokenLiteral('--radius-card')).toBe('16px')
  })

  it('draws the eyebrow as the 11px bold muted line the design writes, 12px above the body', async () => {
    // R8 again: 12px, not the 14px one screen uses above a list.
    render(<SectionCard eyebrow="نقش"><p>x</p></SectionCard>)
    expect(await snap(screen.getByText('نقش'))).toEqual([
      'color: var(--text-muted)',
      'font-size: var(--fs-xxs)',
      'font-weight: var(--fw-bold)',
      'margin-bottom: var(--space-6)',
      'margin: 0px',
    ])
    expect(tokenLiteral('--space-6')).toBe('12px')
    expect(tokenLiteral('--fs-xxs')).toBe('11px')
  })

  it('adds the caller’s class without losing one of its own', async () => {
    const { container } = render(<SectionCard className="mt-s3"><p>x</p></SectionCard>)
    const section = container.querySelector('section')!
    expect(section).toHaveClass('mt-s3', 'bg-surface-sub', 'rounded-card', 'p-s9')
    expect(await dead(section.className)).toEqual([])
  })
})

/* ========================================================================= */

describe('StatTile', () => {
  it('converts a number to Persian and leaves a string alone', () => {
    const { unmount } = render(<StatTile value={12} label="فرآیند مستند" />)
    expect(screen.getByText('۱۲')).toBeInTheDocument()
    unmount()
    const { unmount: second } = render(<StatTile value="۱ تا ۵" label="ردیف" />)
    expect(screen.getByText('۱ تا ۵')).toBeInTheDocument()
    second()
    // …and a string is passed through UNCONVERTED, which is the half a Persian
    // string cannot show: `toFa` leaves Persian digits alone, so running one
    // through it looks identical and this contract would be untested. A caller
    // that formatted its own value — an id, a version, a latin unit — gets it
    // back as written.
    render(<StatTile value="SOP-12" label="کد" />)
    expect(screen.getByText('SOP-12')).toBeInTheDocument()
    expect(screen.queryByText('SOP-۱۲')).toBeNull()
  })

  it('reads at 27px as a header stat and 21px in a grid, on the stat scale both times', async () => {
    // R14 / L-29 — the 4-up numeral is `--fs-stat-sm` (21px) and NOT `--fs-h1`
    // (23px, the process summary title). Two points apart, both plausible on
    // screen, and only one of them is a stat. Asserted three ways: the class,
    // the declaration it resolves to, and what that token is worth — so a
    // heading token wearing a stat's name could not pass any of them.
    const { unmount } = render(<StatTile value={9} label="دپارتمان" />)
    const feature = screen.getByText('۹')
    expect(feature).toHaveClass('text-fs-stat')
    expect(winner(await paint(feature.className), 'font-size')).toBe('var(--fs-stat)')
    unmount()

    render(<StatTile value={9} label="دپارتمان" skin="compact" />)
    const compact = screen.getByText('۹')
    expect(compact).toHaveClass('text-fs-stat-sm')
    expect(winner(await paint(compact.className), 'font-size')).toBe('var(--fs-stat-sm)')
    expect(winner(await paint(compact.className), 'font-size')).not.toBe('var(--fs-h1)')

    expect(tokenLiteral('--fs-stat')).toBe('27px')
    expect(tokenLiteral('--fs-stat-sm')).toBe('21px')
    expect(tokenLiteral('--fs-h1')).toBe('23px')
  })

  it('carries the conflict dot with its ring only when asked', () => {
    const { container, unmount } = render(<StatTile value={3} label="تعارض باز" tone="conflict" dot />)
    expect(container.querySelector('[data-dot]')).toHaveClass('bg-coral', 'shadow-conflict-dot')
    unmount()
    const quiet = render(<StatTile value={0} label="تعارض باز" tone="ok" />)
    expect(quiet.container.querySelector('[data-dot]')).toBeNull()
  })

  it('draws the dot at 8px with §1.1’s coral and the 3px ring, and hides it from the reading', async () => {
    const { container } = render(<StatTile value={3} label="ل" tone="conflict" dot />)
    const dot = container.querySelector('[data-dot]')!
    expect(dot).toHaveAttribute('aria-hidden', 'true')
    expect(dot.textContent).toBe('')
    expect(await snap(dot)).toEqual([
      '--tw-shadow-colored: var(--ring-conflict-dot)',
      '--tw-shadow: var(--ring-conflict-dot)',
      'background-color: var(--coral)',
      'border-radius: var(--radius-round)',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'flex: none',
      'height: var(--space-4)',
      'width: var(--space-4)',
    ])
    // An 8px dot beside a 27px numeral is only 8px while `flex-none` holds it.
    expect(tokenLiteral('--space-4')).toBe('8px')
    expect(tokenLiteral('--ring-conflict-dot')).toBe('0 0 0 3px #FFE4E1')
  })

  it('keeps the numeral 7px from the dot with the token minted for that gap (R16)', async () => {
    const { container } = render(<StatTile value={3} label="ل" tone="conflict" dot />)
    const row = container.querySelector('[data-dot]')!.parentElement!
    expect(await snap(row)).toEqual([
      'align-items: center',
      'display: flex',
      'gap: var(--gap-stat-dot)',
    ])
    // The theme holds three 7px tokens for three roles — the popover inset, the
    // 4-up label's margin and this gap — and R16 minted the third rather than
    // borrowing either of the first two. Equal values, different names: the
    // assertion is that this gap wears its OWN name.
    expect(tokenLiteral('--gap-stat-dot')).toBe('7px')
    expect(winner(await paint(row.className), 'gap')).not.toBe('var(--pad-popover)')
    expect(winner(await paint(row.className), 'gap')).not.toBe('var(--space-stat-label)')
  })

  it('centres the compact tile and leaves the header tile at the start', async () => {
    const { container, unmount } = render(<StatTile value={3} label="ل" />)
    expect(await snap(container.querySelector('[class*="gap-stat-dot"]')!)).toEqual([
      'align-items: center',
      'display: flex',
      'gap: var(--gap-stat-dot)',
    ])
    unmount()
    const grid = render(<StatTile value={3} label="ل" skin="compact" />)
    expect(await snap(grid.container.querySelector('[class*="gap-stat-dot"]')!)).toEqual([
      'align-items: center',
      'display: flex',
      'gap: var(--gap-stat-dot)',
      'justify-content: center',
    ])
  })

  it('is a 16px card at 20x14 in a header and a 14px tile at 17x15 in a grid', async () => {
    const { container, unmount } = render(<StatTile value={3} label="ل" />)
    expect(await snap(container.firstElementChild!)).toEqual([
      '--tw-shadow-color: var(--card)',
      '--tw-shadow-colored: var(--shadow-card)',
      '--tw-shadow: var(--tw-shadow-colored)',
      'background-color: var(--card)',
      'border-color: var(--border-card)',
      'border-radius: var(--radius-card)',
      'border-width: 1px',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'min-width: var(--width-stat)',
      'padding-bottom: var(--space-7)',
      'padding-left: var(--pad-stat-x)',
      'padding-right: var(--pad-stat-x)',
      'padding-top: var(--space-7)',
    ])
    unmount()

    const grid = render(<StatTile value={3} label="ل" skin="compact" />)
    expect(await snap(grid.container.firstElementChild!)).toEqual([
      '--tw-shadow-color: var(--card)',
      '--tw-shadow-colored: var(--shadow-card)',
      '--tw-shadow: var(--tw-shadow-colored)',
      'background-color: var(--card)',
      'border-color: var(--border-card)',
      'border-radius: var(--radius-tile)',
      'border-width: 1px',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'padding-bottom: var(--pad-stat-y-grid)',
      'padding-left: var(--pad-stat-x-grid)',
      'padding-right: var(--pad-stat-x-grid)',
      'padding-top: var(--pad-stat-y-grid)',
      'text-align: center',
    ])
    // The two shells are two roles, not one role at two sizes: only the header
    // tile has a floor under its width, and only the grid tile centres.
    expect(tokenLiteral('--width-stat')).toBe('96px')
    expect(tokenLiteral('--pad-stat-x')).toBe('20px')
    expect(tokenLiteral('--pad-stat-x-grid')).toBe('17px')
    expect(tokenLiteral('--pad-stat-y-grid')).toBe('15px')
  })

  it('puts the label 5px under a header numeral and 7px under a grid one', async () => {
    // The deliverable draws both — `margin-top:5px` on the departments header
    // tile, `margin-top:7px` on each of the two 4-up grids — and the theme
    // names both. One class on both skins would be right in one place and 2px
    // wrong in the other, which is exactly what nothing else here would catch.
    const { container, unmount } = render(<StatTile value={3} label="فرآیند" />)
    expect(await snap(screen.getByText('فرآیند'))).toEqual([
      'color: var(--text-muted)',
      'font-size: var(--fs-xs)',
      'font-weight: var(--fw-semibold)',
      'margin-top: var(--space-2)',
    ])
    expect(container.textContent).toContain('فرآیند')
    unmount()

    render(<StatTile value={3} label="فرآیند" skin="compact" />)
    expect(await snap(screen.getByText('فرآیند'))).toEqual([
      'color: var(--text-muted)',
      'font-size: var(--fs-xs)',
      'font-weight: var(--fw-semibold)',
      'margin-top: var(--space-stat-label)',
    ])
    expect(tokenLiteral('--space-2')).toBe('5px')
    expect(tokenLiteral('--space-stat-label')).toBe('7px')
    expect(tokenLiteral('--fs-xs')).toBe('11.5px')
  })

  it('gives each of the five tones its own ink, and none of them borrows another’s', async () => {
    // Every branch of TONE, rendered. A map is the easiest place in a component
    // for two keys to end up pointing at one colour.
    const want: [StatTone, string][] = [
      ['violet', 'var(--violet)'],
      ['ink', 'var(--ink)'],
      ['conflict', 'var(--conflict)'],
      ['ok', 'var(--green)'],
      ['warn', 'var(--warn)'],
    ]
    const seen: string[] = []
    for (const [tone, colour] of want) {
      const { unmount } = render(<StatTile value={7} label="ل" tone={tone} />)
      const numeral = screen.getByText('۷')
      expect(await snap(numeral), tone).toEqual([
        `color: ${colour}`,
        'font-size: var(--fs-stat)',
        'font-weight: var(--fw-extrabold)',
        'line-height: var(--lh-none)',
      ])
      seen.push(colour)
      unmount()
    }
    expect(new Set(seen).size).toBe(want.length)
    // R8's own row: the audit's fourth stat is amber-as-warning, which is
    // `--warn`, and NOT `--junction-or`, whose map §1.1 calls "never
    // re-assigned".
    expect(tokenLiteral('--warn')).toBe('#B4690E')
  })
})

/* ========================================================================= */

describe('NavTabTray', () => {
  const dir = () => document.documentElement.getAttribute('dir')
  let was: string | null = null
  beforeEach(() => { was = dir() })
  afterEach(() => {
    if (was === null) document.documentElement.removeAttribute('dir')
    else document.documentElement.setAttribute('dir', was)
  })

  it('is a named tablist with exactly one selected tab', () => {
    render(
      <NavTabTray
        label="نمای صندوق" value="mine"
        tabs={[{ id: 'mine', label: 'رسیده به شما' }, { id: 'all', label: 'همه' }]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'نمای صندوق' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'رسیده به شما' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'همه' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true'))
      .toHaveLength(1)
  })

  it('keeps one tab stop and moves the selection with the arrow keys, mirrored for RTL', async () => {
    // The app runs `html[dir=rtl]`, so ArrowLeft advances and ArrowRight goes back.
    document.documentElement.setAttribute('dir', 'rtl')
    const seen: string[] = []
    render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={(id) => seen.push(id)} />)
    expect(screen.getByRole('tab', { name: 'رسیده به شما' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'همه' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tab', { name: 'بسته‌شده' })).toHaveAttribute('tabindex', '-1')
    screen.getByRole('tab', { name: 'رسیده به شما' }).focus()
    await userEvent.keyboard('{ArrowLeft}{End}')
    expect(seen).toEqual(['all', 'closed'])
  })

  it('goes the other way for ArrowRight, and lands on the ends with Home and End', async () => {
    // The half the test above cannot see: a tray that answered every arrow with
    // "+1" passes it. Selection starts in the MIDDLE so both directions have
    // somewhere to go, and Home/End are asserted from a place that is neither.
    document.documentElement.setAttribute('dir', 'rtl')
    const seen: string[] = []
    render(<NavTabTray label="نما" value="all" tabs={TABS} onChange={(id) => seen.push(id)} />)
    screen.getByRole('tab', { name: 'همه' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}{Home}{End}')
    expect(seen).toEqual(['mine', 'closed', 'mine', 'closed'])
  })

  it('follows the writing direction rather than a hard-coded one', async () => {
    // In LTR the same key has to do the opposite thing. A tray with `rtl`
    // wired shut passes every assertion above.
    document.documentElement.setAttribute('dir', 'ltr')
    const seen: string[] = []
    render(<NavTabTray label="نما" value="all" tabs={TABS} onChange={(id) => seen.push(id)} />)
    screen.getByRole('tab', { name: 'همه' }).focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}')
    expect(seen).toEqual(['mine', 'closed'])
  })

  it('stops at the ends instead of wrapping, and stays quiet on a key it does not own', async () => {
    document.documentElement.setAttribute('dir', 'rtl')
    const onChange = vi.fn()
    render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={onChange} />)
    screen.getByRole('tab', { name: 'رسیده به شما' }).focus()
    // Already at the first tab: ArrowRight (back, in RTL) has nowhere to go,
    // and neither Home nor an unrelated key may report a change either.
    await userEvent.keyboard('{ArrowRight}{Home}{ArrowUp}a')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports the tab that was clicked', async () => {
    const onChange = vi.fn()
    render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'بسته‌شده' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('closed')
  })

  it('fills violet when active and stays transparent when not', () => {
    render(
      <NavTabTray label="نما" value="all" tabs={[{ id: 'mine', label: 'الف' }, { id: 'all', label: 'ب' }]} onChange={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: 'ب' })).toHaveClass('bg-violet', 'text-card')
    expect(screen.getByRole('tab', { name: 'الف' })).toHaveClass('bg-transparent', 'text-violet')
  })

  it('puts the selection, the tab stop and the fill on the SAME tab, and never on the first', async () => {
    // Every other test in this block that reads `aria-selected` or `tabindex`
    // happens to select the FIRST tab, so selection wired to the head of the
    // list rather than to `value` — `t.id === tabs[0].id` — satisfies all of
    // them and ships. Two mutations survived the suite that way. The three
    // answers are each legal on their own and wrong together, which is the
    // failure a selected-state control is most prone to and the one nothing
    // about a rendered tray shows, so they are asked of ONE render, of EVERY
    // tab, with the LAST tab selected.
    render(<NavTabTray label="نما" value="closed" tabs={TABS} onChange={() => {}} />)
    const selected = screen.getByRole('tab', { name: 'بسته‌شده' })
    for (const tab of screen.getAllByRole('tab')) {
      const mine = tab === selected
      const why = `${tab.textContent} (${mine ? 'the selected tab' : 'not selected'})`
      expect(tab.getAttribute('aria-selected'), why).toBe(String(mine))
      expect(tab.getAttribute('tabindex'), why).toBe(mine ? '0' : '-1')
      const painted = await snap(tab)
      expect(painted, why).toContain(
        mine ? 'background-color: var(--violet)' : 'background-color: transparent',
      )
      expect(painted, why).toContain(mine ? 'color: var(--card)' : 'color: var(--violet)')
    }
  })

  it('draws §5.2’s segmented tray: a 12px violet-tinted box with 4px of gap and inset', async () => {
    const { container } = render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={() => {}} />)
    expect(await snap(container.firstElementChild!)).toEqual([
      'background-color: var(--tile-v2)',
      'border-radius: var(--radius-md)',
      'display: inline-flex',
      'gap: var(--space-1)',
      'padding: var(--space-1)',
    ])
    expect(tokenLiteral('--space-1')).toBe('4px')
    expect(tokenLiteral('--radius-md')).toBe('12px')
  })

  it('paints the two tab states as declarations, differing only in fill and ink', async () => {
    render(<NavTabTray label="نما" value="all" tabs={TABS} onChange={() => {}} />)
    const shared = [
      'border-radius: var(--radius-sm)',
      'border-width: 0px',
      'cursor: pointer',
      'font-size: var(--fs-sm2)',
      'font-weight: var(--fw-bold)',
      'padding-bottom: var(--space-4)',
      'padding-left: var(--space-7)',
      'padding-right: var(--space-7)',
      'padding-top: var(--space-4)',
      // F11 — the anchor the hit-area overlay is placed against. It is the one
      // declaration on this element that paints nothing, and the two tests
      // below are what say why it is here.
      'position: relative',
    ]
    expect(await snap(screen.getByRole('tab', { name: 'همه' }))).toEqual(
      ['background-color: var(--violet)', ...shared.slice(0, 2), 'color: var(--card)', ...shared.slice(2)].sort(),
    )
    expect(await snap(screen.getByRole('tab', { name: 'رسیده به شما' }))).toEqual(
      ['background-color: transparent', ...shared.slice(0, 2), 'color: var(--violet)', ...shared.slice(2)].sort(),
    )
    expect(tokenLiteral('--radius-sm')).toBe('9px')
    expect(tokenLiteral('--fs-sm2')).toBe('12.5px')
  })

  it('spans its container only when the caller asks', async () => {
    const { unmount } = render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={() => {}} />)
    expect(await snap(screen.getByRole('tab', { name: 'همه' }))).not.toContain('flex: 1 1 0%')
    unmount()
    render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={() => {}} stretch />)
    for (const tab of screen.getAllByRole('tab')) {
      expect(await snap(tab)).toContain('flex: 1 1 0%')
    }
  })

  /* -----------------------------------------------------------------------
     F11, on the one control in this file that is drawn under the floor.

     The retired `Tabs.tsx` carried `min-h-touch`, so replacing it with a tray
     that carries no 44px provision at all made a control SMALLER than the one
     it retired — a net accessibility regression, not a difference. The plan's
     one rule for the design's 30/32/34/36/40/42 ladder decides the repair and
     supersedes any per-task treatment: the drawn control is the design's size,
     the target is brought to 44 by a transparent `::before`.

     The two halves of that rule are two numbers, and only one of them is in
     the class string. The drawn height here is `padding + line box`, and the
     line box's third factor — the line-height — is INHERITED from the base
     layer, so it is not on this element at all. That is also why
     `expectExpandedHitArea` cannot be the check: it resolves the drawn box out
     of the control's own `w-…`/`h-…` classes, and a tab has neither (its width
     is its label's, and pinning either would be a design change, not a
     hit-area one). The test after this one holds it to that, and holds the
     shared helper to every OTHER half of the contract.
     ----------------------------------------------------------------------- */
  it('grows every tab’s target to F11’s floor and leaves the 34.75px it draws alone', async () => {
    const floor = pxOf('var(--size-touch)')
    const lineHeight = await baseLineHeight()
    for (const stretch of [false, true]) {
      const { unmount } = render(
        <NavTabTray label="نما" value="mine" tabs={TABS} onChange={() => {}} stretch={stretch} />,
      )
      // The tray cannot clip what the tabs overhang: the overlay is
      // deliberately 1px wider than the box that generates it, and any
      // `overflow` on the parent would cut it back to what a tab looks like.
      expect(winner(await paint(screen.getByRole('tablist').className), 'overflow')).toBe('')

      for (const tab of screen.getAllByRole('tab')) {
        const why = `${stretch ? 'stretched' : 'plain'} · ${tab.textContent}`
        const painted = await paint(tab.className)

        // THE DRAWN BOX — read off the element's own declarations, not restated:
        // 8px of `py-s4` twice around a 12.5px `--fs-sm2` line box at the base
        // layer's 1.5. Change any one of the three and this number moves, which
        // is the point — the inset below is derived from it.
        const drawn =
          pxOf(winner(painted, 'padding-top'))
          + pxOf(winner(painted, 'padding-bottom'))
          + pxOf(winner(painted, 'font-size')) * lineHeight
        expect(drawn, why).toBe(34.75)
        // Never inflated to the floor. A tab that already measured 44 would be
        // the OTHER defect, and `min-h-touch` is how the retired file wrote it.
        expect(drawn, why).toBeLessThan(floor)
        expect(winner(painted, 'min-height'), why).toBe('')
        expect(winner(painted, 'height'), why).toBe('')

        // THE OVERLAY — every declaration it takes to generate a box that
        // catches a pointer. Each of these compiles and none of them is visible
        // in jsdom, in a snapshot or in a build.
        expect(winner(painted, 'position'), why).toBe('relative')
        expect(winner(painted, 'position', '::before'), why).toBe('absolute')
        expect(winner(painted, '--tw-content', '::before'), why).toBe('""')
        expect(winner(painted, 'content', '::before'), why).toBe('var(--tw-content)')
        expect(winner(painted, 'display', '::before'), why).toBe('')
        expect(winner(painted, 'visibility', '::before'), why).toBe('')
        // pointer-events is inherited, so the control's own value is the one
        // that would take the overlay with it.
        expect(winner(painted, 'pointer-events', '::before'), why).toBe('')
        expect(winner(painted, 'pointer-events'), why).toBe('')

        // THE ARITHMETIC. `inset: -5px` on all four sides, so the target is the
        // drawn box plus 2N: 34.75 + 10 = 44.75.
        const inset = -pxOf(winner(painted, 'inset', '::before'))
        expect(inset, why).toBeGreaterThan(0)
        expect(drawn + 2 * inset, why).toBeGreaterThanOrEqual(floor)
      }
      unmount()
    }
  })

  it('passes every half of the shared helper’s contract except the one it cannot state', () => {
    // `expectExpandedHitArea` is this project's checker for the rule above and
    // it is imported, not re-implemented: everything it CAN decide about this
    // tab — the unconditional `relative`, the unconditional `before:absolute`,
    // a `before:content` that is neither `none` nor `normal`, no
    // `before:pointer-events-none`, no `hidden`/`invisible`/`scale-0`/`static`
    // on the ::before, no clipping `overflow` on the control, an unconditional
    // `before:-inset-[Npx]` rather than one behind a `md:`/`max760:` variant —
    // it decides here, because it reaches its LAST check before stopping.
    //
    // That last check is the drawn box, which it resolves out of `w-…`/`h-…`
    // on the control. A tab states neither: its width is its label's and its
    // height is its padding's. So the helper reports exactly that, and the
    // test above measures the box instead. The day a tab is given a stated box
    // this goes red, and the two tests collapse into one call to the helper.
    render(<NavTabTray label="نما" value="mine" tabs={TABS} onChange={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'همه' })
    expect(() => expectExpandedHitArea(tab)).toThrow(/the drawn box is not stated on the control/)

    // …and it is not merely throwing at the first thing it looks at. Strip
    // either half of the overlay and it names THAT instead, which is what makes
    // the message above evidence that the rest of the contract held.
    const probe = (className: string) => {
      const el = document.createElement('button')
      el.className = className
      return el
    }
    expect(() => expectExpandedHitArea(probe(tab.className.replace(/\brelative\b/, ''))))
      .toThrow(/no unconditional `relative`/)
    expect(() => expectExpandedHitArea(probe(tab.className.replace(/\bbefore:absolute\b/, ''))))
      .toThrow(/no unconditional `before:absolute`/)
    expect(() => expectExpandedHitArea(probe(tab.className.replace(/before:-inset-\[[\d.]+px\]/, ''))))
      .toThrow(/no unconditional `before:-inset-/)
    expect(() => expectExpandedHitArea(probe(tab.className.replace(/before:content-\[""\]/, ''))))
      .toThrow(/no `before:content-/)
  })
})

/* ========================================================================= */

describe('Timeline', () => {
  it('is an ordered list with a name', () => {
    const { container } = render(<Timeline label="زنجیرهٔ تأیید" nodes={NODES} />)
    expect(screen.getByRole('list', { name: 'زنجیرهٔ تأیید' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    // An ordered list, because the chain is one: the order is the meaning, and
    // a <ul> would say the opposite.
    expect(container.querySelector('ol')).toBeInTheDocument()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('keeps the nodes in the order it was given them', () => {
    // The failure this catches is the one an ordered list is most prone to:
    // every row legal, every colour right, the sequence reversed or re-sorted.
    const items = render(<Timeline label="ز" nodes={NODES} />).container
      .querySelectorAll('li')
    expect([...items].map((li) => li.querySelector('p')!.textContent))
      .toEqual(['سحر بیات سرپرست سالن', 'رضا کریمی ادیتور'])
    expect([...items].map((li) => li.querySelector('[data-node-dot]')!.textContent))
      .toEqual(['۱', '۲'])
  })

  it('numbers its rail in Persian and colours each node by its state', () => {
    const { container } = render(<Timeline label="زنجیره" nodes={NODES} />)
    const dots = container.querySelectorAll('[data-node-dot]')
    expect(dots[0]).toHaveTextContent('۱')
    expect(dots[0]).toHaveClass('bg-tile-ok', 'text-green')
    expect(dots[1]).toHaveClass('bg-tile-warn', 'text-icom-control')
  })

  it('gives all four states their own tile and ink, in the rail and in the label', async () => {
    // §1.2's approval-chain map, every branch of it rendered. Two states
    // sharing one colour is a legal-looking map with a real bug in it.
    const want: [TimelineState, string, string][] = [
      ['done', 'var(--tile-ok)', 'var(--green)'],
      ['awaiting', 'var(--tile-warn)', 'var(--icom-control-fg)'],
      ['rejected', 'var(--tile-c)', 'var(--conflict)'],
      ['pending', 'var(--tile-v2)', 'var(--text-faint)'],
    ]
    const seen: string[] = []
    for (const [state, tile, ink] of want) {
      const { container, unmount } = render(
        <Timeline label="ز" nodes={[{ id: 'a', name: 'ن', role: 'ر', state, stateLabel: 'ح' }]} />,
      )
      expect(await snap(container.querySelector('[data-node-dot]')!), state).toEqual([
        'align-items: center',
        `background-color: ${tile}`,
        'border-radius: var(--radius-round)',
        `color: ${ink}`,
        'display: inline-flex',
        'font-size: var(--fs-xxs)',
        'font-weight: var(--fw-bold)',
        'height: var(--space-11)',
        'justify-content: center',
        'width: var(--space-11)',
      ])
      // …and the state line under the name wears the same ink as its dot.
      expect(await snap(screen.getByText('ح')), state).toEqual([
        `color: ${ink}`,
        'font-size: var(--fs-caption)',
        'font-weight: var(--fw-semibold)',
        'margin-top: var(--space-half)',
        'margin: 0px',
      ])
      seen.push(`${tile}/${ink}`)
      unmount()
    }
    expect(new Set(seen).size).toBe(want.length)
    expect(tokenLiteral('--space-11')).toBe('26px')
  })

  it('lets a node carry its own mark instead of the ordinal', () => {
    const { container } = render(
      <Timeline label="ز" nodes={[
        { id: 'a', name: 'ن', role: 'ر', state: 'rejected', stateLabel: 'ح', mark: '×' },
        { id: 'b', name: 'ن', role: 'ر', state: 'pending', stateLabel: 'ح' },
      ]} />,
    )
    const dots = container.querySelectorAll('[data-node-dot]')
    expect(dots[0]).toHaveTextContent('×')
    // …and the node beside it still counts from its own position, not from one.
    expect(dots[1]).toHaveTextContent('۲')
    // The rail is decoration around a name that is already in the row.
    expect(dots[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('stops the rail at the last node', () => {
    const { container } = render(<Timeline label="زنجیره" nodes={NODES} />)
    const rails = container.querySelectorAll('[data-node-line]')
    expect(rails[0]).toHaveClass('bg-border-current')
    expect(rails[1]).toHaveClass('bg-transparent')
  })

  it('draws the rail as a 2px line with the row’s own rhythm under it', async () => {
    const { container, unmount } = render(<Timeline label="ز" nodes={NODES} />)
    const rails = container.querySelectorAll('[data-node-line]')
    expect(await snap(rails[0])).toEqual([
      'background-color: var(--border-current)',
      'flex: 1 1 0%',
      'min-height: var(--space-7)',
      'width: var(--space-half)',
    ])
    expect(await snap(rails[1])).toEqual([
      'background-color: transparent',
      'flex: 1 1 0%',
      'min-height: var(--space-7)',
      'width: var(--space-half)',
    ])
    // R8 — `min-h-s7` is 14px, the same rung as the row's own `pb-s7`, which
    // is what actually sets the rhythm. The deliverable computes this per node
    // from a prototype layout constant with no design meaning.
    expect(tokenLiteral('--space-7')).toBe('14px')
    expect(tokenLiteral('--space-half')).toBe('2px')
    unmount()

    // A chain of one is all last node: the only rail it has must be the
    // stopped one, or a single-node chain trails a line into nothing.
    const alone = render(<Timeline label="ز" nodes={[NODES[0]]} />)
    const only = alone.container.querySelectorAll('[data-node-line]')
    expect(only).toHaveLength(1)
    expect(only[0]).toHaveClass('bg-transparent')
  })

  it('lays the row out as a 12px pair of a fixed rail and a body that may shrink', async () => {
    const { container } = render(<Timeline label="ز" nodes={NODES} />)
    expect(await snap(container.querySelector('ol')!)).toEqual([
      'display: flex',
      'flex-direction: column',
      'list-style-type: none',
      'margin: 0px',
      'padding: 0px',
    ])
    expect(await snap(container.querySelector('li')!)).toEqual([
      'display: flex',
      'gap: var(--space-6)',
    ])
    expect(await snap(container.querySelector('[data-node-dot]')!.parentElement!)).toEqual([
      'align-items: center',
      'display: flex',
      'flex-direction: column',
      'flex: none',
    ])
    // `min-w-0` is what lets a long note wrap instead of stretching the row —
    // a flex item's floor is its content unless something says otherwise.
    expect(await snap(container.querySelector('li')!.lastElementChild!)).toEqual([
      'min-width: 0px',
      'padding-bottom: var(--space-7)',
    ])
  })

  it('sets the name in 13px ink with the role quieter beside it', async () => {
    render(<Timeline label="ز" nodes={NODES} />)
    const role = screen.getByText('سرپرست سالن')
    expect(await snap(role.parentElement!)).toEqual([
      'color: var(--ink)',
      'font-size: var(--fs-sm)',
      'font-weight: var(--fw-bold)',
      'margin: 0px',
    ])
    expect(await snap(role)).toEqual([
      'color: var(--text-muted)',
      'font-size: var(--fs-xxs)',
      'font-weight: 400',
    ])
    expect(tokenLiteral('--fs-sm')).toBe('13px')
  })

  it('boxes a note when there is one, and draws nothing when there is not', async () => {
    const { container, unmount } = render(<Timeline label="ز" nodes={NODES} />)
    expect(container.querySelectorAll('p')).toHaveLength(5) // 2 names + 2 states + 1 note
    expect(await snap(screen.getByText('روی میز از دیروز'))).toEqual([
      'background-color: var(--tile-v4)',
      'border-radius: var(--radius-sm)',
      'color: var(--text-body)',
      'font-size: var(--fs-caption)',
      'line-height: var(--lh-normal)',
      'margin-top: var(--space-3)',
      'margin: 0px',
      'padding-bottom: var(--pad-note-y)',
      'padding-left: var(--pad-note-x)',
      'padding-right: var(--pad-note-x)',
      'padding-top: var(--pad-note-y)',
    ])
    expect(tokenLiteral('--pad-note-x')).toBe('11px')
    expect(tokenLiteral('--pad-note-y')).toBe('9px')
    expect(tokenLiteral('--lh-normal')).toBe('1.7')
    unmount()

    // The other branch: no note is no box, not an empty one.
    const bare = render(<Timeline label="ز" nodes={[NODES[0]]} />)
    expect(bare.container.querySelectorAll('p')).toHaveLength(2)
    expect(bare.container.querySelector('.bg-tile-v4')).toBeNull()
  })
})

/* ========================================================================= */

describe('FAB', () => {
  it('takes its box from the surface role rather than from a branch of its own', async () => {
    // R3 — 52px in the panel and 56px in the reader, and `--role-fab` is what
    // holds the difference: one class on both surfaces, resolved by CSS, so the
    // component never asks which surface it is in. What is asserted here is
    // that the FAB reads the ROLE and not one end of it — `w-fab-reader` on the
    // reader would paint the right number today and stop tracking the role.
    const { unmount } = on('panel', <FAB label="کامنت تازه" onClick={() => {}} />)
    const panel = screen.getByRole('button')
    expect(panel).toHaveClass('w-fab', 'h-fab')
    expect(winner(await paint(panel.className), 'width')).toBe('var(--role-fab)')
    expect(winner(await paint(panel.className), 'height')).toBe('var(--role-fab)')
    unmount()

    on('reader', <FAB label="کامنت تازه" onClick={() => {}} />)
    const reader = screen.getByRole('button')
    expect(reader).toHaveClass('w-fab', 'h-fab')
    expect(winner(await paint(reader.className), 'width')).toBe('var(--role-fab)')
    // …and the role really is worth two different things, or one class on both
    // surfaces would be a claim with nothing behind it.
    expect(roleOn('panel', '--role-fab')).toBe('52px')
    expect(roleOn('reader', '--role-fab')).toBe('56px')
  })

  it('says how many are waiting, in Persian, in its accessible name', () => {
    // S4 in the audit: the two shells were the only surfaces in the app
    // rendering a latin digit. A count that is only in a badge is a count a
    // screen reader never hears.
    on('panel', <FAB label="کامنت تازه" count={3} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'کامنت تازه، ۳ مورد' })).toBeInTheDocument()
    expect(screen.getByText('۳')).toHaveClass('border-ink')
  })

  it('drops the badge at zero rather than drawing a zero', () => {
    const { container, unmount } = on('panel', <FAB label="کامنت تازه" count={0} onClick={() => {}} />)
    expect(container.querySelector('[data-fab-badge]')).toBeNull()
    expect(screen.getByRole('button', { name: 'کامنت تازه' })).toBeInTheDocument()
    unmount()
    // …and the same when no count is passed at all, which is a different path
    // through the default and the one every non-comment screen takes.
    const bare = on('panel', <FAB label="کامنت تازه" onClick={() => {}} />)
    expect(bare.container.querySelector('[data-fab-badge]')).toBeNull()
    expect(screen.getByRole('button', { name: 'کامنت تازه' })).toBeInTheDocument()
  })

  it('sits where the design pins it, on the stacking ladder’s floating rung', async () => {
    // §8 — the FAB is one of the surviving physical pins: bottom:22px;
    // right:22px; left:auto, reproduced as written rather than mirrored. The
    // 22px is `--space-10`, the _ds ladder's own rung, so the pin is named
    // without the physical spelling changing.
    on('panel', <FAB label="کامنت تازه" onClick={() => {}} />)
    const b = screen.getByRole('button')
    expect(b).toHaveClass('fixed', 'bottom-s10', 'right-s10', 'left-auto', 'z-floating')
    const p = await paint(b.className)
    // `z-floating` is L-42's rung for exactly this control (1030). Tailwind's
    // own `z-40` emits and would look correct in every test and every build —
    // it is the number nothing in this design system chose, and it is also the
    // number the deliverable itself writes, which is why naming the rung is the
    // assertion and not the value.
    expect(winner(p, 'z-index')).toBe('var(--role-z-floating)')
    expect(winner(p, 'z-index')).not.toBe('40')
    expect(tokenLiteral('--z-floating')).toBe('1030')
    expect(winner(p, 'left')).toBe('auto')
    expect(tokenLiteral('--space-10')).toBe('22px')
  })

  it('draws §6.15’s coral disc and its two-layer glow, and nothing more', async () => {
    on('panel', <FAB label="ک" onClick={() => {}} />)
    expect(await snap(screen.getByRole('button'))).toEqual([
      '--tw-shadow-colored: var(--shadow-fab)',
      '--tw-shadow: var(--shadow-fab)',
      'align-items: center',
      'background-color: var(--coral)',
      'border-radius: var(--radius-round)',
      'border-width: 0px',
      'bottom: var(--space-10)',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'color: var(--card)',
      'cursor: pointer',
      'display: inline-flex',
      'height: var(--role-fab)',
      'justify-content: center',
      'left: auto',
      'position: fixed',
      'right: var(--space-10)',
      'width: var(--role-fab)',
      'z-index: var(--role-z-floating)',
    ])
    expect(tokenLiteral('--shadow-fab'))
      .toBe('0 6px 14px rgba(16, 10, 40, .22), 0 18px 40px -14px rgba(250, 90, 82, .9)')
  })

  it('cuts the badge out of the field with an ink ring, on both surfaces', async () => {
    // L-24 / §6.17 defect 5 — the ring exists to cut the badge out of the field
    // behind it, and §6.0/§6.17 agree that field is `--ink` on both surfaces.
    // The reader deliverable rings it in cream, which §6.17 itself calls a
    // stray light halo.
    const expected = [
      'align-items: center',
      'background-color: var(--violet)',
      'border-color: var(--ink)',
      'border-radius: var(--radius-pill)',
      'border-width: 2px',
      'color: var(--card)',
      'display: inline-flex',
      'font-size: var(--fs-xxs)',
      'font-weight: var(--fw-bold)',
      'height: var(--size-count)',
      'inset-inline-start: calc(var(--space-half) * -1)',
      'justify-content: center',
      'min-width: var(--size-count)',
      'padding-left: var(--space-3)',
      'padding-right: var(--space-3)',
      'position: absolute',
      'top: calc(var(--space-half) * -1)',
    ]
    const { container, unmount } = on('panel', <FAB label="ک" count={3} onClick={() => {}} />)
    const badge = container.querySelector('[data-fab-badge]')!
    expect(await snap(badge)).toEqual(expected)
    // …and it is pinned by a LOGICAL edge, so it stays on the outer corner in
    // both directions, while the FAB itself keeps the design's physical pin.
    expect(badge).toHaveClass('-start-half')
    expect(badge.className).not.toMatch(/(^|\s)-?(left|right)-/)
    unmount()

    const reader = on('reader', <FAB label="ک" count={12} onClick={() => {}} />)
    expect(await snap(reader.container.querySelector('[data-fab-badge]')!)).toEqual(expected)
    expect(screen.getByText('۱۲')).toBeInTheDocument()
    expect(tokenLiteral('--size-count')).toBe('21px')
  })

  it('carries the deliverable’s own glyph, hidden from the reading', () => {
    on('panel', <FAB label="ک" onClick={() => {}} />)
    const svg = screen.getByRole('button').querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    // §6.15 names the stroke; the path is the deliverable's own speech bubble.
    expect(svg.getAttribute('stroke-width')).toBe('2.2')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    const path = svg.querySelector('path')!.getAttribute('d') ?? ''
    expect(path).toBe('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z')
    // The glyph must not be a second, empty box: an `<svg>` with no path draws
    // nothing and every assertion above still holds.
    expect(svg.querySelectorAll('path')).toHaveLength(1)
  })

  it('reports the press once', async () => {
    const onClick = vi.fn()
    on('panel', <FAB label="ک" count={2} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
