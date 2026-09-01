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
const readerSrc = join(process.cwd(), 'design/Inja Reader.dc.html')

/** Both deliverables, by name. The design is TWO files and they do not agree. */
const DELIVERABLES: [string, string][] = [
  ['panel', readFileSync(designSrc, 'utf8')],
  ['reader', readFileSync(readerSrc, 'utf8')],
]

/**
 * Every inline SVG in a deliverable, reduced to WHAT IT DRAWS — the exact bytes
 * between its own `<svg …>` and `</svg>`, and nothing outside them.
 *
 * A set of whole drawings rather than one long string, because "these bytes
 * occur somewhere in the file" is a much weaker claim than it looks and both
 * ends of it leak. Dropping `file`'s fold leaves the FIRST HALF of the design's
 * own file icon, which is still a substring; dropping `user`'s head leaves the
 * SECOND half, and closing the lookup with `</svg>` does not catch it because
 * the byte before the remaining path is the `>` of the `</circle>` that was
 * dropped. Both survived until the comparison became one whole drawing against
 * another.
 */
const DRAWINGS: [string, Set<string>][] = DELIVERABLES.map(([name, src]) => [
  name,
  new Set([...src.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)].map((m) => m[1])),
])

/**
 * THE OTHER HALF OF WHAT A DELIVERABLE DRAWS: every `d` it BINDS rather than
 * writes — the path-data strings its script quotes and its markup interpolates
 * through `<path d="{{ … }}">`.
 *
 * `DRAWINGS` above reads markup, and markup is not where half of these glyphs
 * live. The panel binds a `d` in TEN places and the reader in five, and the
 * sentence "a scan for `<path d=` finds none, so the design draws none" has now
 * been wrong three times over — it authored a doorless `home`, invented a
 * `comment` bubble the design already ships four times per file, and left an
 * envelope on the conflict button the panel draws a tray on. `eye` and `eyeOff`
 * were rescued one at a time by `revealGlyphs()`; this is the general case, and
 * most of what it protects has not been written yet: `InjaIcons.warning` is one
 * of these strings BYTE FOR BYTE, and the next task that greps for `<path d=`
 * would conclude the design draws no warning and author one.
 *
 * `M` followed by a coordinate is the whole filter, which is what SVG path data
 * begins with and what nothing else in these files is: it harvests seventeen
 * strings per deliverable and every one of them is a drawing.
 */
const BOUND: [string, Set<string>][] = DELIVERABLES.map(([name, src]) => [
  name,
  new Set([...src.matchAll(/'(M-?[\d.][^']*)'/g)].map((m) => m[1])),
])

/**
 * THE FOUR STRINGS THE TWO DELIVERABLES DISAGREE ABOUT, since `207485c`
 * replaced the panel.
 *
 * The panel's script was rewritten: the change-password reveal's lens is
 * re-pathed (rounder, and no closing `z`) and the export menu's two glyphs are
 * gone — its `x.icon` site is fed a DEPARTMENT glyph now. The reader is
 * untouched and still binds the older set, which is the one `ICONS` quotes.
 *
 * Named here rather than inline because two tests below and the census read
 * the same strings, and a census that agreed with a typo would say nothing.
 */
const STRIKE = 'M3 3l18 18'
const PANEL_LENS = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6'
const READER_LENS = 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z'
const EXPORT_DOC =
  'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4'
const EXPORT_LIST = 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'

/** The names a deliverable interpolates into a `d`, in the order it draws them. */
function boundSites(src: string): string[] {
  return [...src.matchAll(/<path d="\{\{ ([^}]+?) \}\}"/g)].map((m) => m[1])
}

/**
 * Which deliverables BIND this glyph — its `d`s joined the way the design binds
 * them, since the design ships `eyeOff` as one string of two subpaths.
 */
function boundIn(name: keyof typeof ICONS): string[] {
  const joined = pathsOf(name).join('')
  if (joined === '') return []
  return BOUND.filter(([, ds]) => ds.has(joined)).map(([n]) => n)
}

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
 * The WHOLE drawing the design puts inside the affordance `marker` names — the
 * bytes between the first `<svg …>` after it and that svg's `</svg>`.
 *
 * `drawnIn` asks "is this drawing SOMEWHERE in the deliverable?", and that is a
 * weaker question than it reads as. It closed the fragment leak — half of
 * `file` is a substring of `file` and is not the icon — but it cannot see a
 * SUBSTITUTION between two real drawings: swapping `menu` and `funnel`, or
 * setting `home` to the design's own subprocess glyph, leaves both drawings in
 * the panel and every table green. Both were run against the whole suite and
 * both survived it. This is the other question — "is it the right drawing for
 * THIS control?" — and it is the one `drawnBy` was already asking of the four
 * chevrons.
 */
function drawnAt(marker: string): string {
  const src = readFileSync(designSrc, 'utf8')
  const at = src.indexOf(marker)
  expect(at, `the design draws no ${marker}`).toBeGreaterThan(0)
  expect(src.indexOf(marker, at + 1), `${marker} is not unique in the deliverable`).toBe(-1)
  const svg = /<svg\b[^>]*>([\s\S]*?)<\/svg>/.exec(src.slice(at))
  expect(svg, `${marker} has no glyph inside it`).not.toBeNull()
  return svg![1]
}

/**
 * The design system's own icon map — `InjaIcons`, thirty-three keys of markup
 * in design/_ds/…/_ds_bundle.js.
 *
 * The bundle is a deliverable and is never rewritten by a task, which is why
 * the two glyphs it records are checked against IT rather than against the
 * screens that draw them: src/screens/ProcessList.tsx and
 * export/steps/StepsApp.tsx are both on later tasks' Modify lists, and a check
 * against a file that is about to fold onto this set goes circular the moment
 * it does — which is how the assertion this one replaces expired mid-review.
 */
function injaIcons(): Map<string, string> {
  const dir = join(process.cwd(), 'design/_ds')
  const packages = readdirSync(dir)
  expect(packages, 'design/_ds holds one design-system package').toHaveLength(1)
  const src = readFileSync(join(dir, packages[0], '_ds_bundle.js'), 'utf8')
  const at = src.indexOf('const InjaIcons = {')
  expect(at, 'the design system bundle ships no InjaIcons map').toBeGreaterThan(0)
  const block = src.slice(at, src.indexOf('\n};', at))
  return new Map([...block.matchAll(/^\s*(\w+): '(.*?)',?$/gm)].map((m) => [m[1], m[2]]))
}

/**
 * One drawing reduced to a form that survives the trip between markup dialects:
 * `InjaIcons` self-closes its tags, jsdom writes them out longhand, and the
 * GEOMETRY is what is being compared. Nothing else about the bytes may move.
 */
function canonical(markup: string): string {
  return markup
    .replace(/\s*\/>/g, '>')
    .replace(/<\/(path|circle|rect)>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The single `d` the named icon draws, for the one-path glyphs. */
function pathOf(name: keyof typeof ICONS): string {
  const paths = pathsOf(name)
  expect(paths, name).toHaveLength(1)
  return paths[0]
}

/** Every `d` the named icon draws, in the order it draws them. */
function pathsOf(name: keyof typeof ICONS): string[] {
  const { container, unmount } = render(<Icon name={name} />)
  const out = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '')
  unmount()
  return out
}

/**
 * The markup one glyph renders — every drawn node, serialised.
 *
 * This is what gets looked up in the deliverable. A `d` on its own is not
 * enough: `file` is TWO paths and losing the second leaves a rectangle that is
 * still a document, still passes "contains this `d`", and is not the icon.
 */
function markupOf(name: keyof typeof ICONS): string {
  const { container, unmount } = render(<Icon name={name} />)
  const inner = (container.querySelector('svg') as SVGElement).innerHTML
  unmount()
  expect(inner, `${name} draws nothing at all`).not.toBe('')
  return inner
}

/** Which deliverables draw this glyph — the whole drawing, against whole drawings. */
function drawnIn(name: keyof typeof ICONS): string[] {
  const inner = markupOf(name)
  return DRAWINGS.filter(([, drawn]) => drawn.has(inner)).map(([n]) => n)
}

/**
 * The two `d`s the PANEL's change-password reveal binds, and the node it draws
 * beside them (markup :2741, script :5269 — both moved when `207485c` replaced
 * the file).
 *
 * The reveal is the one place the design ships an eye, and it ships it as a
 * BOUND STRING rather than as markup — `newPwIcon: shown ? '…' : '…'` — which is
 * why a scan for `<path d="…">` reports the deliverable as drawing none.
 *
 * `shown` and `hidden` name the STATE each branch is bound in, not the glyph:
 * `shown` is what the design draws when `newPwShow` is true and the password is
 * legible. Which of the two carries the strike is the question the test below
 * asks, and it is the question the deliverable changed its mind about.
 */
function revealGlyphs(): { shown: string; hidden: string; beside: string } {
  const src = DELIVERABLES[0][1]
  const bound = /newPwIcon: s\.newPwShow \? '([^']+)' : '([^']+)'/.exec(src)
  expect(bound, 'the design binds no newPwIcon').not.toBeNull()
  const svg = /<svg[^>]*><path d="\{\{ newPwIcon \}\}"><\/path>(.*?)<\/svg>/.exec(src)
  expect(svg, 'the design’s reveal button draws no bound path').not.toBeNull()
  return { shown: bound![1], hidden: bound![2], beside: svg![1] }
}

/* How many arguments each SVG path command takes. */
const PATH_ARGS: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
}

/**
 * How far one `d` reaches, in user units on the 24-box.
 *
 * On-path points only: curve control points are ignored and an arc contributes
 * its endpoint, so this UNDER-reports a curved glyph. That is the safe
 * direction for the floor it is used for — it can call a drawing smaller than
 * it is, never bigger.
 */
function pathSpan(d: string): { w: number; h: number } {
  const pts = pathPoints(d)
  expect(pts.length, `${d} draws no point at all`).toBeGreaterThan(0)
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/**
 * The ON-PATH POINTS one `d` visits, in order and in absolute user units.
 *
 * `M6 15l6-6 6 6` and `M18 15l-6-6-6 6` are the SAME THREE POINTS walked in
 * opposite directions — one picture, two spellings — and the deliverables use
 * the first where this set uses the second. Comparing the bytes calls them
 * different drawings; comparing the numbers calls `M6 15l6-6 6 6` and
 * `M6 15l6-6 6 5` the same one. This is what tells the two apart.
 */
function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+)/g) ?? []
  const pts: [number, number][] = []
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i]
    if (/[A-Za-z]/.test(t)) {
      cmd = t
      i += 1
      if (cmd === 'Z' || cmd === 'z') {
        x = sx
        y = sy
        pts.push([x, y])
        continue
      }
    } else {
      expect(cmd, `${d} begins with a number`).not.toBe('')
      // A second coordinate pair after a moveto is an implicit lineto.
      if (cmd === 'M') cmd = 'L'
      else if (cmd === 'm') cmd = 'l'
    }
    const c = cmd.toUpperCase()
    const rel = cmd !== c
    const a = tokens.slice(i, i + PATH_ARGS[c]).map(Number)
    expect(a, `${d} — "${cmd}" is short of arguments`).toHaveLength(PATH_ARGS[c])
    i += PATH_ARGS[c]
    if (c === 'H') x = rel ? x + a[0] : a[0]
    else if (c === 'V') y = rel ? y + a[0] : a[0]
    else {
      const end = c === 'C' ? [a[4], a[5]]
        : c === 'S' || c === 'Q' ? [a[2], a[3]]
          : c === 'A' ? [a[5], a[6]]
            : [a[0], a[1]]
      x = rel ? x + end[0] : end[0]
      y = rel ? y + end[1] : end[1]
    }
    if (c === 'M') {
      sx = x
      sy = y
    }
    pts.push([x, y])
  }
  return pts
}

/** The size of the smallest box that holds one drawn node. */
function nodeSpan(node: Element): { w: number; h: number } {
  const num = (a: string) => Number(node.getAttribute(a) ?? '0')
  if (node.tagName === 'path') return pathSpan(node.getAttribute('d') ?? '')
  if (node.tagName === 'circle') return { w: 2 * num('r'), h: 2 * num('r') }
  if (node.tagName === 'rect') return { w: num('width'), h: num('height') }
  throw new Error(`nodeSpan cannot measure <${node.tagName}>`)
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

  it('draws each glyph on the CONTROL the design draws it on, not merely somewhere', () => {
    /* THE SUBSTITUTION THE MEMBERSHIP TABLE CANNOT SEE.

       "This drawing is somewhere in the deliverable" is not "this is the right
       drawing for this name", and the gap between them is wide enough to walk
       two real defects through. Both of these were run against the whole suite
       and both came back 1203 green:

         · swap `menu` and `funnel` — the hamburger becomes a filter funnel and
           the funnel becomes three lines. Both are still panel drawings.
         · set `home` to the design's own SUBPROCESS glyph,
           `M3 3h7v7H3zM14 14h7v7h-7zM14 3l7 7M10 14l-7 7`, which both
           deliverables draw four times over — the «خانه» button then draws two
           disconnected squares, and every table still agrees.

       The four chevrons were never exposed to it, because `drawnBy` pins each
       one to the BUTTON the design draws it on. These four had no individual
       pin at all — `home`, `menu` and `funnel` are 'absent' from `InjaIcons`,
       so deliverable membership was the only thing holding them — and `inbox`
       is the one that actually shipped wrong: src/shell/PanelShell.tsx renders
       `<Icon name="inbox">` inside «صندوق بازبینی تعارض‌ها», and this set drew
       an envelope where that button draws a tray. Two pictures, one control.

       Whole drawing against whole drawing, because `inbox` is two paths and the
       tray's lid alone would pass a `d`-level check. */
    expect(drawnAt('title="خانه"')).toBe(markupOf('home'))
    expect(drawnAt('title="منو"')).toBe(markupOf('menu'))
    expect(drawnAt('data-r-filters=""')).toBe(markupOf('funnel'))
    expect(drawnAt('onClick="{{ openInbox }}"')).toBe(markupOf('inbox'))
    // …and the four controls really do draw four different glyphs, or one
    // drawing used for all of them would satisfy every line above — which is
    // exactly the failure mode the swap above is.
    const controls = [
      'title="خانه"', 'title="منو"', 'data-r-filters=""', 'onClick="{{ openInbox }}"',
    ]
    expect(new Set(controls.map(drawnAt)).size).toBe(4)
    // …against a reader that can miss. `drawnAt` returning '' for everything
    // would make the four lines above compare nothing to nothing.
    for (const c of controls) expect(drawnAt(c), c).toContain('<path d="')
    expect(() => drawnAt('title="no such control"')).toThrow()
  })

  it('is the design’s own drawing wherever the design draws one — all 21, and where', () => {
    /* THE PROVENANCE LIST IS THE THING AN OWNER REVIEWS, so it is measured here
       rather than written down in a docstring and believed.

       The set's first draft said six keys were authored "because neither
       deliverable carries a `d` for them". FIVE OF THE SIX WERE IN THE
       DELIVERABLE, and one of those five had shipped wrong on the strength of
       the claim: `home` was a roofline over an open-bottomed box, and both files
       draw a complete house WITH A DOOR, as one path, on the same «خانه» button.
       A list that is wrong in both directions is worse than one that is short,
       and prose cannot fail.

       So: render every key, look its whole markup up in both deliverables, and
       compare the answer to this table. `toContain(pathOf(x))` would not do it —
       `file` is two paths and losing the second leaves a rectangle that is still
       a document and still passes.

       An `[]` here is a claim in its own right, and NOT a claim that nothing
       draws the glyph: five of these six are drawn — by the design as a bound
       string, or by `InjaIcons` and a live call site — and each one names the
       assertion below that says where it comes from. The one true `[]` is
       `logout`.

       Nor is a name in this table safe because it is in it: membership is not
       identity, and the test above pins `home`, `menu`, `funnel` and `inbox` to
       the controls the design draws them on for exactly that reason. */
    const found = Object.fromEntries(
      (Object.keys(ICONS) as (keyof typeof ICONS)[]).map((n) => [n, drawnIn(n)]),
    )
    expect(found).toEqual({
      chevronStart: ['panel', 'reader'],
      chevronEnd: ['panel', 'reader'],
      chevronPrev: ['panel', 'reader'],
      chevronNext: ['panel', 'reader'],
      chevronDown: ['panel'],
      chevronUp: [],           // …as MARKUP. Both deliverables BIND it six times over
      //                         and the picture is the same — the bound-`d` test below
      check: ['panel', 'reader'],
      search: ['panel', 'reader'],
      user: ['panel', 'reader'],
      userBust: [],            // `InjaIcons.userBust`, which export/steps/StepsApp.tsx
      //                         draws today — the design-system table below
      dots: [],                // the design's own circles WITH the fill/stroke pair
      //                         moved onto them; drop the pair and this reads
      //                         ['panel'], which is the hollow-ring bug — below
      file: ['panel'],
      inbox: ['panel'],        // the conflict button's own tray (Panel :152), pinned to
      //                         that button above
      logout: [],              // src/shell/PanelShell.tsx — below
      home: ['panel', 'reader'],
      menu: ['panel'],
      comment: ['panel', 'reader'],
      funnel: ['panel'],
      trash: [],               // `InjaIcons.trash`, which src/screens/ProcessList.tsx
      //                         draws today — the design-system table below
      eye: [],                 // the design BINDS its `d` rather than writing it — below
      eyeOff: [],              // …and so this one too
    })
    // …against a harvest that really found the design's drawings, and a lookup
    // that can miss. A `DRAWINGS` that had silently stopped matching would
    // answer [] to every key, and one that matched anything would answer both
    // names to every key; the table above cannot tell either from a real result.
    expect(DRAWINGS.map(([n]) => n)).toEqual(['panel', 'reader'])
    for (const [name, drawn] of DRAWINGS) {
      // The reader is the smaller of the two and draws 19 distinct glyphs; a
      // harvest that had stopped matching would answer 0.
      expect(drawn.size, name).toBeGreaterThan(12)
      expect(drawn.has('<path d="M4 20l16-16"></path>'), name).toBe(false)
      expect(drawn.has(markupOf('check')), name).toBe(true)
    }
  })

  it('reads the `d`s the design BINDS as well as the ones it writes — all fifteen sites', () => {
    /* THE BLIND SPOT THAT HAS NOW COST THREE GLYPHS.

       Half of what these two files draw never appears in their markup. The
       panel interpolates a `d` in TEN places and the reader in FIVE, and every
       one of those `d`s lives in the script above as a quoted string — so
       "I grepped for `<path d=` and the design draws none" is a sentence that
       is FALSE BY CONSTRUCTION for a whole dialect of the deliverable. It has
       been written three times: it authored a doorless `home`, it invented a
       `comment` bubble the design ships four times per file, and it left an
       envelope on the conflict button the panel draws a tray on.

       `revealGlyphs()` below rescued `eye` and `eyeOff` one at a time. This is
       the general case, and most of what it protects has not been written yet:
       `warning`, `info`, `document` and `list` are four of the twelve keys
       still to arrive, and the answers for all four are in here. */
    // Every site, by the name it interpolates — so a deliverable that grew a
    // tenth binding cannot slip past a count. `e.d` is flow-edge geometry
    // rather than an icon, and it is listed because a harvest that quietly
    // stopped seeing it would be a harvest that had stopped working.
    expect(boundSites(DELIVERABLES[0][1])).toEqual([
      'd.icon', 'deptIcon', 'x.icon', 'p.chevron', 'bs.chevron', 'st.chevron', 'e.d',
      'sc.icon', 'newPwIcon', 'confDlgIcon',
    ])
    expect(boundSites(DELIVERABLES[1][1])).toEqual([
      'd.icon', 'p.chevron', 'bs.chevron', 'st.chevron', 'e.d',
    ])
    // …and the strings those sites are fed. They USED to be the same seventeen
    // in both files, which was itself a finding: the reader binds `confDlgIcon`
    // and `newPwIcon` in its state without drawing either. `207485c` replaced
    // the panel and they parted — so the assertion is the DIFFERENCE, not a
    // count: a count goes green again the first time one glyph leaves and
    // another arrives, and the four strings below are exactly what a reader of
    // this file needs to know before quoting either deliverable.
    expect(BOUND.map(([n, ds]) => [n, ds.size])).toEqual([['panel', 15], ['reader', 17]])
    const only = (a: number, b: number) =>
      [...BOUND[a][1]].filter((d) => !BOUND[b][1].has(d)).sort()
    expect(only(0, 1)).toEqual([PANEL_LENS, PANEL_LENS + STRIKE].sort())
    expect(only(1, 0)).toEqual(
      [READER_LENS, READER_LENS + STRIKE, EXPORT_DOC, EXPORT_LIST].sort())

    // WHAT THIS SET TAKES FROM THE BOUND DIALECT. Four keys, and every one of
    // them was called authored or undrawn at some point in this file's history.
    expect(Object.fromEntries(
      (Object.keys(ICONS) as (keyof typeof ICONS)[]).map((n) => [n, boundIn(n)]),
    )).toEqual({
      chevronStart: [], chevronEnd: ['panel', 'reader'], chevronPrev: [], chevronNext: [],
      chevronDown: [], chevronUp: [],   // …the same three points backwards — below
      check: ['panel', 'reader'],       // the confirm dialog's OK arm
      search: [], user: [], userBust: [], dots: [], file: [], inbox: [], logout: [],
      home: [], menu: [], comment: [], funnel: [], trash: [],
      // The reader alone since `207485c` re-pathed the panel's lens. The set
      // still quotes a deliverable rather than drawing its own — see the
      // eyeOff test below, and the audit's §6.3 for the owner's ruling.
      eye: ['reader'], eyeOff: ['reader'],
    })

    // CHEVRON-UP IS DRAWN SIX TIMES, and the note that said "the deliverable
    // draws it nowhere" was false. `M6 15l6-6 6 6` is this glyph's three points
    // walked the other way — identical on screen with round caps and joins — so
    // the reconciliation is on the POINTS, not the bytes.
    const open = 'M6 15l6-6 6 6'
    for (const [name, ds] of BOUND) expect(ds.has(open), name).toBe(true)
    expect(pathPoints(open)).toEqual([...pathPoints(pathOf('chevronUp'))].reverse())
    // …and that comparison can fail, or "same points reversed" would be a
    // property every three-point chevron in the set happens to have.
    expect(pathPoints(open)).not.toEqual([...pathPoints(pathOf('chevronDown'))].reverse())
    expect(pathPoints(open)).not.toEqual(pathPoints(pathOf('chevronUp')))

    // THE FOUR ANSWERS FOR THE KEYS STILL TO COME. A task that greps markup
    // finds nothing for any of them and authors four glyphs.
    const ds = injaIcons()
    const asPath = (d: string) => canonical(`<path d="${d}"/>`)
    // `warning` — bound as the confirm dialog's un-confirm arm, and it is
    // `InjaIcons.warning` BYTE FOR BYTE, in both files. There is nothing to
    // decide here and nothing to draw.
    const warning = 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'
    for (const [name, bound] of BOUND) expect(bound.has(warning), name).toBe(true)
    expect(canonical(ds.get('warning')!)).toBe(asPath(warning))
    // `document` and `list` — the export menu binds one of each, and NEITHER is
    // the design-system key of that name. That is a ruling to ask for, not a
    // blank to fill: the two records disagree. The READER is now the only
    // record of either: the replaced panel feeds its `x.icon` site a department
    // glyph and binds neither, so a task that reads only the panel would find
    // the blank and fill it — which is the trip this whole test exists to stop.
    expect(BOUND[1][1].has(EXPORT_DOC)).toBe(true)
    expect(BOUND[1][1].has(EXPORT_LIST)).toBe(true)
    expect(BOUND[0][1].has(EXPORT_DOC)).toBe(false)
    expect(BOUND[0][1].has(EXPORT_LIST)).toBe(false)
    expect(canonical(ds.get('document')!)).not.toBe(asPath(EXPORT_DOC))
    expect(canonical(ds.get('list')!)).not.toBe(asPath(EXPORT_LIST))
    // `info` — neither dialect of either deliverable carries it, so `InjaIcons`
    // really is the only record, and THAT is the sentence L-39 supports.
    const info = /<path d="([^"]+)"/.exec(ds.get('info')!)![1]
    for (const [name, bound] of BOUND) expect(bound.has(info), name).toBe(false)
    for (const [name, src] of DELIVERABLES) expect(src.includes(info), name).toBe(false)

    // THE NINE DEPARTMENT GLYPHS are bound too — `DEPTS[].icon`, the first site
    // in the list above — and src/lib/departments.ts carries all nine. They
    // never joined this set (§5.1.2 sends them through `Icon`'s `d`), so
    // nothing else in this file would notice one drifting.
    expect(DEPT_CODES).toHaveLength(9)
    for (const code of DEPT_CODES) {
      for (const [name, bound] of BOUND) {
        expect(bound.has(deptMeta(code).icon), `${code} in ${name}`).toBe(true)
      }
    }

    // …and the harvest itself can miss, which every table above depends on it
    // not doing silently. A regex that had stopped matching answers an empty
    // set to everything; one that matched too much drags in prose.
    for (const [name, bound] of BOUND) {
      expect(bound.has('M4 20l16-16'), name).toBe(false)
      for (const d of bound) expect(pathPoints(d).length, `${name}: ${d}`).toBeGreaterThan(1)
    }
  })

  it('quotes the glyphs that already existed, rather than redrawing them', () => {
    // `comment` is the sharp one: an earlier draft of this set invented a speech
    // bubble on the premise that the design ships none. It ships one, four times
    // over in each deliverable, and src/ui/FAB.tsx was already drawing it — so
    // the swap in step 8 would have changed the FAB's glyph while every class
    // assertion about the disc stayed green. Read from the DESIGN, because
    // FAB.tsx now reads this set and a check against it would be circular.
    expect(readFileSync(designSrc, 'utf8')).toContain(pathOf('comment'))
    // `inbox` USED TO BE ON THIS LIST, and that is the sharp one now: it was
    // called the codebase's own on the strength of "no deliverable draws
    // either", and the panel's conflict button — same label, same badge,
    // `openInbox` — draws a tray. It is measured against that button above and
    // is not a record of anything any more.
    //
    // `logout` is the last one that really is a record. It came from the two
    // shells, the comparison against them has expired the way the one against
    // FAB.tsx had — the shells read THIS SET — and neither the design nor
    // `InjaIcons` draws it, so the pin is that record rather than a measurement
    // pretending to be one.
    expect(markupOf('logout')).toBe(
      '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"></path>'
      + '<path d="M10 16l-4-4 4-4M6 12h10"></path>',
    )
    // …and it is the ONLY one left in that position, or a second glyph could
    // quietly go back to being its own record. Every other key is answered by
    // the deliverable (as markup or as a bound `d`) or by `InjaIcons`.
    const unsourced = (Object.keys(ICONS) as (keyof typeof ICONS)[]).filter(
      (n) => drawnIn(n).length === 0 && boundIn(n).length === 0 && !injaIcons().has(n),
    )
    expect(unsourced).toEqual(['logout'])
  })

  it('agrees with the design system’s own icon map, and says where it does NOT', () => {
    /* `InjaIcons` — thirty-three keys in design/_ds/…/_ds_bundle.js — is the
       OTHER ground truth in this repo, and the one nobody opened.

       Its header says it was "lifted verbatim from the TSX that inlines it",
       which makes it a record of what this codebase ALREADY DRAWS rather than a
       new ruling — and therefore exactly the right thing to hold a set that
       promises to quote rather than redraw. Two keys here had been called
       AUTHORED, "because nothing in either deliverable, the token files or the
       33-key InjaIcons export carries a `d` for them", and that sentence was
       false about the very file it named: `trash` is drawn today in
       src/screens/ProcessList.tsx and `userBust` in export/steps/StepsApp.tsx,
       both byte for byte the map's. Redrawing them would have changed the delete
       affordance and the export's actor glyph the moment those screens folded
       onto this set — the `comment` mistake, twice more.

       So every key is compared, and each of the four disagreements is a decision
       stated below rather than a drift. */
    const ds = injaIcons()
    expect(ds.size, 'the map is 33 keys, or it was not parsed').toBe(33)
    const verdict = (name: keyof typeof ICONS) => (
      !ds.has(name) ? 'absent'
        : canonical(ds.get(name)!) === canonical(markupOf(name)) ? 'same' : 'differs'
    )
    expect(Object.fromEntries(
      (Object.keys(ICONS) as (keyof typeof ICONS)[]).map((n) => [n, verdict(n)]),
    )).toEqual({
      chevronStart: 'differs',  // the RTL renaming — a crossing, below
      chevronEnd: 'differs',
      chevronPrev: 'differs',
      chevronNext: 'differs',
      chevronDown: 'same',
      chevronUp: 'same',
      check: 'same',
      search: 'same',
      user: 'same',
      userBust: 'same',
      dots: 'differs',          // the map's kebab lies down; S1's stands up
      file: 'same',
      inbox: 'same',            // the map's tray IS the panel's conflict button
      logout: 'absent',
      home: 'absent',
      menu: 'absent',
      comment: 'absent',
      funnel: 'absent',
      trash: 'same',
      eye: 'absent',            // L-39, and it is the deliverable that has one
      eyeOff: 'absent',
    })

    // THE FOUR CHEVRONS ARE A CROSSING, not four unrelated disagreements — and
    // this is where the plan's wrong table came from. `InjaIcons` names them the
    // English way round, the way the TSX it was lifted from did; the deliverable
    // puts the RIGHT-pointing one on «بازگشت» and «صفحهٔ قبلی», which the test
    // above pins to those buttons. Same four drawings, two names swapped twice.
    for (const [ours, theirs] of [
      ['chevronStart', 'chevronEnd'], ['chevronEnd', 'chevronStart'],
      ['chevronPrev', 'chevronNext'], ['chevronNext', 'chevronPrev'],
    ] as const) {
      expect(canonical(ds.get(theirs)!), `${ours} ↔ ${theirs}`)
        .toBe(canonical(markupOf(ours)))
    }

    // The kebab: the map lays it on its side (§9.7 l draws the idea three ways).
    // S1's row menu stands it up, and the panel deliverable is where that one is
    // read from — see the kebab test.
    expect(ds.get('dots')).toContain('cx="5" cy="12"')
    // The inbox: the map and the deliverable are the SAME drawing here, which is
    // the thing the old verdict of 'differs' was hiding. The set carried an
    // envelope inherited from the old shell/TopBar; `InjaIcons.inbox` is a tray,
    // the panel's «صندوق بازبینی تعارض‌ها» button draws that same tray, and
    // src/shell/PanelShell.tsx renders this key inside that button. So the two
    // ground truths are closed against each other rather than each against the
    // set, and the envelope is asserted gone from both.
    expect(canonical(ds.get('inbox')!)).toBe(canonical(drawnAt('onClick="{{ openInbox }}"')))
    expect(ds.get('inbox')).not.toContain('M3 8l9 6 9-6')
    expect(markupOf('inbox')).not.toContain('M3 8l9 6 9-6')

    // …and `canonical` really does reconcile the two dialects, or every 'same'
    // above is a comparison that never happened. The map self-closes its tags
    // and jsdom writes them out; nothing else about the bytes may move.
    expect(canonical('<path d="M1 2"/><circle r="3"/>'))
      .toBe(canonical('<path d="M1 2"></path><circle r="3"></circle>'))
    expect(canonical('<path d="M1 2"/>')).not.toBe(canonical('<path d="M1 3"/>'))
  })

  it('draws eyeOff as eye struck through, the way the DESIGN binds the two', () => {
    // Ledger L-39 says `InjaIcons` ships no eye, and an earlier draft read that
    // as "the design ships no eye" and drew a lucide-style gapped one. L-39 is
    // about the ICON EXPORT: the change-password reveal ships both states as a
    // bound `d` — `newPwIcon: shown ? '…' : '…'` — into a fixed <svg>, which is
    // why a scan for `<path d="…">` finds nothing and the deliverable draws it
    // all the same. Both are read out of the file here.
    const { shown, hidden, beside } = revealGlyphs()
    // eyeOff IS eye with the strike appended — in the deliverable's own bytes,
    // not as a convention this file invented.
    expect(shown).toBe(`${hidden}${STRIKE}`)
    expect(hidden).toBe(PANEL_LENS)
    expect(beside).toBe('<circle cx="12" cy="12" r="3"></circle>')

    /* THE BINDING, AND THE OWNER'S RULING (2026-09-01, audit §6.3).

       `shown` above is the branch the panel takes when the password is
       LEGIBLE, and it is the struck one — a plain eye means "click to reveal",
       a struck eye means "click to hide". That is the app's binding too
       (`PasswordField`: `name={shown ? 'eyeOff' : 'eye'}`, pinned end to end by
       src/ui/fields.test.tsx › *shows the struck eye only while the value is
       showing*), and it is what the key names say.

       It was NOT the old panel's: `9fc9c13` bound `newPwShow ? plain : struck`,
       the other way round, and this test was written against that — which is
       why replacing the deliverable broke it. The owner ruled the app right and
       the old ternary the defect; `207485c` has since brought the deliverable
       into line, so what follows asserts one convention against both. */
    expect(pathsOf('eyeOff').join('')).toBe(pathsOf('eye').join('') + STRIKE)
    // Subpaths of one `d` and sibling <path>s paint identically, so the set
    // keeps the strike separate: src/ui/fields.test.tsx reads it as a `d` of its
    // own in both states, and joining them back up is the comparison.
    expect(pathsOf('eyeOff')).toContain(STRIKE)
    expect(pathsOf('eye')).not.toContain(STRIKE)
    expect(pathsOf('eyeOff').length).toBeGreaterThan(1)

    // THE LENS IS STILL QUOTED, and from the reader — `207485c` re-pathed the
    // panel's and nobody has ruled on adopting the new drawing, so this set
    // keeps the one it copied. Asserted against both files rather than against
    // a literal, or "quotes a deliverable" would decay into "used to".
    expect(pathsOf('eye').join('')).toBe(READER_LENS)
    expect(BOUND[1][1].has(READER_LENS)).toBe(true)
    expect(BOUND[0][1].has(READER_LENS)).toBe(false)

    // …and the iris the design draws beside the lens, which is the node the
    // strike assertion cannot see: `r="0.2"` leaves both joins above
    // byte-identical and takes the pupil out of the eye.
    for (const name of ['eye', 'eyeOff'] as const) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.innerHTML, name).toContain(beside)
      unmount()
    }
  })

  it('draws the kebab vertically, the way S1 does, and SOLID', () => {
    // §9.7 l — three renderings of one idea; this is the one S1 uses on a row.
    const { container } = render(<Icon name="dots" />)
    const circles = Array.from(container.querySelectorAll('circle'))
    expect(circles.map((c) => c.getAttribute('cy'))).toEqual(['5', '12', '19'])
    expect(circles.map((c) => c.getAttribute('cx'))).toEqual(['12', '12', '12'])
    // The design's own kebab (Panel :356), read out of the deliverable. It is
    // the only three-circle SVG in either file, which is asserted rather than
    // assumed — a regex that matched two of them would pick whichever came
    // first and compare this glyph to something else.
    const kebabs = [...DELIVERABLES[0][1].matchAll(
      /<svg([^>]*)>((?:<circle [^>]*><\/circle>){3})<\/svg>/g,
    )]
    expect(kebabs, 'the design draws no three-circle kebab').toHaveLength(1)
    const [, svgAttrs, drawn] = kebabs[0]
    expect(drawn).toBe(circles
      .map((c) => `<circle cx="${c.getAttribute('cx')}" cy="${c.getAttribute('cy')}" r="${c.getAttribute('r')}"></circle>`)
      .join(''))
    // THE FILL IS THE GLYPH. The design fills that <svg> and strokes nothing;
    // Icon's <svg> says the exact opposite, because every other glyph in the set
    // is a line drawing. So the inversion rides on the circles, where a child's
    // attribute beats its parent — and dropping it turns three solid dots into
    // three hollow rings while every `cx`, `cy` and `r` above stays put.
    expect(svgAttrs).toContain('fill="currentColor"')
    expect(svgAttrs).toContain('stroke="none"')
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    for (const c of circles) {
      expect(c.getAttribute('fill')).toBe('currentColor')
      expect(c.getAttribute('stroke')).toBe('none')
    }
  })

  it('draws every node big enough for a user to see it, on all twenty-one keys', () => {
    /* THE FLOOR A COLLAPSED DRAWING FALLS THROUGH.

       "Draws at least one node" and "no two keys share a shape" are the only
       things the two glyphs with NO GROUND TRUTH — `userBust` and `trash` — have
       to satisfy, and a stub satisfies both: `ICONS.trash` swapped for `M4 7h1`
       renders a 1px tick where the delete affordance is, is a shape no other key
       has, and every other assertion in this file stays green. So does the iris
       at `r="0.2"`, which the strike assertion above cannot see.

       Two units on a 24-box. The smallest thing this set really draws is 3.6 —
       a kebab dot — so the floor is a floor and not a fit to the current
       values. */
    const FLOOR = 2
    const tiny: string[] = []
    for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
      const { container, unmount } = render(<Icon name={name} />)
      for (const node of Array.from(container.querySelectorAll('path, circle, rect'))) {
        const { w, h } = nodeSpan(node)
        if (Math.max(w, h) < FLOOR) tiny.push(`${name}: <${node.tagName}> reaches ${w} by ${h}`)
      }
      unmount()
    }
    expect(tiny).toEqual([])
    // …against a measure that can see one, or the loop above is a green nothing.
    // Both mutations, and one real glyph so the measure is not simply small.
    const probe = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
      return nodeSpan(el)
    }
    expect(probe('path', { d: 'M4 7h1' })).toEqual({ w: 1, h: 0 })
    expect(probe('circle', { r: '0.2' })).toEqual({ w: 0.4, h: 0.4 })
    expect(probe('path', { d: pathOf('trash') })).toEqual({ w: 18, h: 20 })
    // …and it walks a path rather than reading its numbers: every command in
    // this set is relative or absolute and the two do not mean the same thing.
    expect(pathSpan('M10 10l4 4')).toEqual({ w: 4, h: 4 })
    expect(pathSpan('M10 10L4 4')).toEqual({ w: 6, h: 6 })
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
    both.unmount()
    // …AND A `name` REACHES THE DRAWING TOO, which is the same question's other
    // half and was the same hole. Deleting `name={name}` from the <Icon> call
    // leaves the tinted 48px square with an EMPTY <svg> in it — the tile, and no
    // glyph — and every box, radius, accent and stroke assertion in this file
    // stays green, because the three `name`-passing cases here all read the
    // width and the classes and none of them read the path.
    const named = on('panel', <IconTile name="trash" />)
    expect(named.container.querySelector('path')?.getAttribute('d')).toBe(pathOf('trash'))
    named.unmount()
    // …a key no department carries, or the department fallback would answer for
    // it and the assertion above would pass with `name` on the floor.
    expect(DEPT_CODES.map((c) => deptMeta(c).icon)).not.toContain(pathOf('trash'))
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
    // Task 14 added `accentText` and `ctaDiscClass` — the other two decisions
    // the accent makes, which src/screens/Departments.tsx used to hard-code.
    // The exhaustive shape stays exhaustive: a key ADDED without this line
    // moving is a key no caller was told about.
    expect(deptMeta('nonesuch')).toEqual({
      icon: '', accent: 'violet',
      tileClass: 'bg-tile-v text-violet', numeralClass: 'text-dept-numeral-violet',
      accentText: 'text-violet', ctaDiscClass: 'bg-disc-violet',
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

  it('reaches the raster through the BUNDLER, not through a path it typed out', () => {
    /* The one thing `toMatch(/inja-logo/)` above cannot say.

       Under vitest the import resolves to the string `/src/assets/inja-logo.jpg`
       — which is byte for byte what a hard-coded literal would be. The two are
       INDISTINGUISHABLE at runtime here, so replacing the import with the
       literal passes every assertion above, and the reviewer's proposed
       one-liner ("assert the src does not start with /src/") fails on the
       CORRECT code. In a production build they are not alike at all: an import
       makes vite emit a hashed asset and rewrite the reference, a literal emits
       no asset, and the brand mark is a broken image in the app bar and on the
       login screen.

       So it is asserted where the difference actually lives — in the source. */
    const src = sourceOf('Logo.tsx')
    const imported = /^import (\w+) from '(\.\.\/assets\/[\w.-]+)'$/m.exec(src)
    expect(imported, 'Logo.tsx does not import its raster, so vite emits none').not.toBeNull()
    const [, binding, spec] = imported!
    // …the file it names is really on disk, or the import is a broken build
    // rather than a working one.
    expect(statSync(join(process.cwd(), 'src/ui', spec)).size).toBeGreaterThan(0)
    // …and the <img> is bound to that identifier, not to a string beside it.
    expect(src).toContain(`src={${binding}}`)
    expect(src).not.toMatch(/src="[^"]*inja-logo/)
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
    //
    // **The two pictures are §6.4's own, and Task 17 settled which they are.**
    // `Inja Panel.dc.html:3501` binds `chevron: open ? 'M6 15l6-6 6 6' :
    // 'M15 18l-6-6 6-6'`, and the deliverables bind that same pair five more
    // times (Panel :2853, :2933; Reader :1866, :1950, :2539). Collapsed is `<`
    // — the inline END in a right-to-left reading, which is `chevronEnd` — and
    // never a down chevron; `chevronDown` is the select trigger and discloses
    // nothing in either deliverable. The open path is that same drawing turned
    // a quarter turn, so the state change is a rotation and not a second `d`.
    render(<Accordion items={[{ key: 'a', title: 'سرپرست سالن', body: <p>محتوا</p> }]} />)
    const header = screen.getByRole('button', { name: 'سرپرست سالن' })
    const svg = () => header.querySelector('svg')!
    const mark = () => svg().querySelector('path')?.getAttribute('d')
    expect(svg()).toBeTruthy()
    // Read off the shared set rather than transcribed: a `d` written out here
    // would keep passing while the glyph moved under it.
    expect(mark()).toBe((ICONS.chevronEnd as { props: { d: string } }).props.d)
    expect(mark()).not.toBe((ICONS.chevronDown as { props: { d: string } }).props.d)

    // The turn, and the rest position it turns FROM. `rotate-0` is written out
    // rather than left off: a state spelled as an appended class races with
    // whatever else sets `transform` in Tailwind's output order.
    const turn = () => svg().parentElement!
    expect(await styles(turn())).toMatchObject({ '--tw-rotate': '0deg' })
    await userEvent.click(header)
    expect(await styles(turn())).toMatchObject({ '--tw-rotate': '90deg' })
    // …and the `d` did NOT move: one drawing, two orientations.
    expect(mark()).toBe((ICONS.chevronEnd as { props: { d: string } }).props.d)

    // The span was already aria-hidden and Icon is too, so the header's
    // accessible name — which src/ui/controls.test.tsx finds it by — does not
    // move.
    expect(screen.getByRole('button', { name: 'سرپرست سالن' })).toBe(header)
    expect(svg()).toHaveAttribute('aria-hidden', 'true')
    // …and it has a WEIGHT. 2.4 is the chevron step of the stroke ladder the
    // icon set's own docstring records, and it is the one attribute sitting
    // between the `d` above and the size below that nothing here read: at 0.4
    // the mark is a hairline in a 44px header, with the `d` assertion, the
    // accessible name and the whole declaration set green.
    expect(svg()).toHaveAttribute('stroke-width', '2.4')
    // …and it has a SIZE. `Icon` writes no width attribute unless it is given a
    // `px`, which is the right default and also the sharp edge: a glyph that
    // loses its size does not fall back to something a little wrong, it falls
    // back to the replaced-element default of 300×150 and blows the header
    // apart — with the `d`, the weight, the accessible name and the whole of
    // controls.test.tsx still green. §6.4 draws 17, which is one step above the
    // 15px `--size-chevron` the dropdown and the pager take and has no token of
    // its own; Task 17's report asks for one.
    expect(svg()).toHaveAttribute('width', '17')
    expect(svg()).toHaveAttribute('height', '17')
  })
})
