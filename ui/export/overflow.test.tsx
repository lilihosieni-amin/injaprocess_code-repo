import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document } from './flowchart/Document'
import { StepsApp } from './steps/StepsApp'
import { PrintDoc } from './steps/PrintDoc'
import { createSeededClient } from './shared/seed'
import d from './flowchart/document.module.css'
import s from './steps/steps.module.css'
import pm from './steps/print.module.css'
import type { ExportPayload } from './shared/payload'
import type { ProcNode } from '../src/api/types'

/** Long text must stay inside its box.
 *
 *  Both exports lay their long user-supplied strings — a process name — inside
 *  flex rows, and a flex row is exactly where a stylesheet can make text
 *  unshrinkable without anyone noticing. `document.module.css` is a
 *  byte-identical port of `ui/design/export/dining-export-v2.html`, and the
 *  mockup declares `.toc .toc-t` twice: `flex:1` at `:44`, then `flex:none` at
 *  `:88`. Equal specificity, so source order gives the row to `flex:none`; the
 *  title takes its max-content width, has no `min-width:0` to let it wrap
 *  inside the row, and simply hangs off the sheet. The document is RTL, so it
 *  hangs off the *scroll origin* and pushes a horizontal scrollbar onto the
 *  page. The mockup's own sample titles were short enough to hide it; the real
 *  cashier department's longest is 166 characters, and it laid out 1145px wide
 *  in an 824px row — 263px past the white sheet — at every desktop width.
 *
 *  **jsdom performs no layout**, so this file cannot measure a rendered box.
 *  What it can do is decide the same question the browser decides *before* it
 *  lays anything out: given the real markup and the real stylesheet, is the
 *  chain of flex items from the row down to the process name allowed to shrink
 *  and wrap? A `flex:none` or a missing `min-width:0` anywhere on that chain is
 *  the bug, in the browser and here alike. The browser measurements that
 *  motivated it are recorded in `.superpowers/sdd/overflow-report.md`.
 *
 *  The stylesheets are re-ported from the mockups by hand, so the guard is
 *  written against whatever the port produces rather than against one selector:
 *  it resolves the real cascade at real viewport widths and follows the chain
 *  the rendered DOM actually has.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

// ─── a very small cascade resolver ────────────────────────────────────────────
// Enough of one to answer "which declaration of `<prop>` wins on this element at
// this viewport width, on screen": media filtering, selector matching (jsdom's
// own `matches`, so the selector semantics are the browser's), specificity,
// `!important`, source order.

type Decl = { value: string; important: boolean }
type Rule = { media: string; selector: string; decls: Record<string, Decl>; spec: number; order: number }

function parseDecls(body: string): Record<string, Decl> {
  const out: Record<string, Decl> = {}
  for (const part of body.split(';')) {
    const at = part.indexOf(':')
    if (at < 0) continue
    const prop = part.slice(0, at).trim().toLowerCase()
    let value = part.slice(at + 1).trim()
    const important = /!important$/i.test(value)
    if (important) value = value.replace(/!important$/i, '').trim()
    if (prop) out[prop] = { value: value.toLowerCase(), important }
  }
  return out
}

/** Close enough for these stylesheets: ids 100, classes/attributes/pseudo-classes
 *  10, element names 1. No selector here mixes the tiers ambiguously. */
function specificity(sel: string): number {
  const s = sel.replace(/::[a-z-]+/g, '')
  const ids = (s.match(/#[\w-]+/g) ?? []).length
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:[a-z-]+(\([^)]*\))?/g) ?? []).length
  const elements = (s.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length
  return ids * 100 + classes * 10 + elements
}

function parse(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  let order = 0

  const collect = (text: string, media: string) => {
    const re = /([^{}]+)\{([^{}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const decls = parseDecls(m[2])
      for (const sel of m[1].split(',')) {
        const selector = sel.trim()
        if (selector) rules.push({ media, selector, decls, spec: specificity(selector), order: order++ })
      }
    }
  }

  let i = 0
  while (i < src.length) {
    const at = src.indexOf('@media', i)
    if (at < 0) { collect(src.slice(i), ''); break }
    collect(src.slice(i, at), '')
    const open = src.indexOf('{', at)
    let depth = 0
    let close = src.length
    for (let j = open; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) { close = j; break }
    }
    collect(src.slice(open + 1, close), src.slice(at + 6, open).trim())
    i = close + 1
  }
  return rules
}

type Medium = 'screen' | 'print'

/** Does this media query apply to `medium` in a `width` px box?
 *
 *  A query with no medium applies to both, and Chrome evaluates its width
 *  condition against the **page box** when printing — which is why the printed
 *  checks below pass the page area's width rather than a viewport width. */
function mediaApplies(query: string, width: number, medium: Medium = 'screen'): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (/\bprint\b/.test(q) && medium !== 'print') return false
  if (/\bscreen\b/.test(q) && medium !== 'screen') return false
  const mx = q.match(/max-width\s*:\s*([\d.]+)px/)
  if (mx && width > parseFloat(mx[1])) return false
  const mn = q.match(/min-width\s*:\s*([\d.]+)px/)
  if (mn && width < parseFloat(mn[1])) return false
  return true
}

/** A CSS-module stylesheet's source selectors name source classes; the DOM
 *  carries the hashed ones. Rewrite the selector into the DOM's vocabulary so
 *  jsdom can match it. Class names the module does not export (globals such as
 *  `.pf-wrap`, and element/attribute selectors) pass through untouched. */
const translator = (mod: Record<string, string>) => (selector: string) =>
  selector.replace(/\.([\w-]+)/g, (whole, name: string) => (mod[name] ? `.${mod[name]}` : whole))

type Sheet = { rules: Rule[]; translate: (sel: string) => string }

const sheet = (file: string, mod: Record<string, string>): Sheet =>
  ({ rules: parse(readFileSync(join(HERE, file), 'utf8')), translate: translator(mod) })

/** Cascade order: `!important` first, then specificity, then source position. */
function outranks(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** The winning declaration of `prop` on `el`, or null. `also` names shorthands
 *  that set the same computed property and therefore compete with it. */
function resolve(sheets: Sheet[], el: Element | null, prop: string, width: number,
                 also: string[] = [], medium: Medium = 'screen'): string | null {
  if (!el) return null
  const props = [prop, ...also]
  let best: { rank: number[]; value: string } | null = null
  for (const [sheetIndex, sh] of sheets.entries()) {
    for (const r of sh.rules) {
      if (!mediaApplies(r.media, width, medium)) continue
      let hit: Decl | undefined
      let hitProp = ''
      for (const p of props) if (r.decls[p]) { hit = r.decls[p]; hitProp = p }
      if (!hit) continue
      let matches = false
      try { matches = el.matches(sh.translate(r.selector)) } catch { matches = false }
      if (!matches) continue
      const rank = [hit.important ? 1 : 0, r.spec, sheetIndex * 1e6 + r.order]
      if (!best || outranks(rank, best.rank)) {
        best = { rank, value: hitProp === prop ? hit.value : `${hitProp}:${hit.value}` }
      }
    }
  }
  return best ? best.value : null
}

/** `flex-shrink`, from either the longhand or a `flex` shorthand. Unset flex
 *  items shrink (the initial value is 1), so `null` is not a failure. */
function shrinkOf(resolved: string | null): number {
  if (resolved === null) return 1
  const v = resolved.startsWith('flex:') ? resolved.slice(5).trim() : resolved
  if (v === 'none') return 0
  if (v === 'initial' || v === 'auto') return 1
  const nums = v.split(/\s+/).filter((t) => /^[\d.]+$/.test(t))
  if (!resolved.startsWith('flex:')) return nums.length ? parseFloat(nums[0]) : 1
  if (nums.length === 0) return 1
  if (nums.length === 1) return 1 // `flex: <number>` → 1 <number> 0%
  return parseFloat(nums[1])
}

/** `flex-basis`, from either the longhand or a `flex` shorthand. A zero basis is
 *  what lets an item start narrower than its content and take only the space the
 *  row can spare; `auto` (which `flex:none` gives) starts it at max-content. */
function basisOf(resolved: string | null): string | null {
  if (resolved === null) return null
  if (!resolved.startsWith('flex:')) return resolved
  const v = resolved.slice(5).trim()
  if (v === 'none' || v === 'auto' || v === 'initial') return 'auto'
  const parts = v.split(/\s+/)
  const num = (t: string) => /^[\d.]+$/.test(t)
  if (parts.length === 1) return num(parts[0]) ? '0%' : parts[0]
  if (parts.length === 2) return num(parts[1]) ? '0%' : parts[1]
  return parts[2]
}

/** The chain of elements from `leaf` up to and including `row`. */
function chain(leaf: Element, row: Element): Element[] {
  const out: Element[] = []
  for (let e: Element | null = leaf; e; e = e.parentElement) {
    out.push(e)
    if (e === row) break
  }
  return out
}

/** Every flex item between the long text and the row that contains it must be
 *  allowed to shrink below its content and to wrap inside the row.
 *
 *  Only *row* flex containers are asked: in a column container (`.plist`, the
 *  steps guide's process list) the inline axis is not the flex axis, so neither
 *  `flex-shrink` nor `min-width` decides how wide a child gets. */
function assertShrinkable(sheets: Sheet[], leaf: Element, row: Element, width: number, where: string,
                         medium: Medium = 'screen') {
  const links = chain(leaf, row)
  let checked = 0
  for (const el of links) {
    const parent = el.parentElement
    if (!parent) continue
    const display = resolve(sheets, parent, 'display', width, [], medium)
    if (display !== 'flex' && display !== 'inline-flex') continue
    const direction = resolve(sheets, parent, 'flex-direction', width, [], medium) ?? 'row'
    if (direction.startsWith('column')) continue
    checked++
    const at = `${where} @${width}px (${medium})`
    const shrink = shrinkOf(resolve(sheets, el, 'flex-shrink', width, ['flex'], medium))
    expect(shrink, `${at}: <${el.tagName.toLowerCase()}> is a flex item that cannot shrink`)
      .toBeGreaterThan(0)
    const minWidth = resolve(sheets, el, 'min-width', width, [], medium)
    expect(minWidth, `${at}: <${el.tagName.toLowerCase()}> has no min-width:0, so its ` +
      'automatic minimum size keeps it at its content width').toMatch(/^0(px)?$/)
  }
  expect(checked, `${where} (${medium}): the long text is not inside a flex row — ` +
    'this guard is measuring nothing').toBeGreaterThan(0)
}

// ─── the fixture ──────────────────────────────────────────────────────────────

/** Longer than anything stored today: the real cashier document's longest
 *  process name is 166 characters, and it already overflowed. */
const LONG =
  'تحویل سفارش به مشتری از چاپ فیش تا رسیدن غذا (چاپ همزمان فیش، تحویل به لجستیک، ' +
  'تحویل حضوری یا اختصاص به پیک و ارسال با اسنپ یا آژانس، مدیریت تحویل ناموفق و ' +
  'تغییر مسیر، و ثبت نتیجه در کارتابل صندوق و اطلاع به سرپرست شیفت و مدیر مجموعه)'

/** The pathological case the other two declarations cannot help with: one token,
 *  no space, no break opportunity anywhere in it. */
const UNBROKEN = 'الف'.repeat(70)

const act = (id: string, label: string): ProcNode => ({
  id, type: 'activity', label, description: '', actor: '',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 't', touched_by: [] },
} as ProcNode)

const proc = (id: string, name: string) => ({
  id, department: 'cashier', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent: null,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes: [act(`${id}-n001`, 'ثبت فیش')], edges: [], pending: [],
})

const PAYLOAD = {
  dept: {
    department: 'cashier', name: 'دپارتمان صندوق', description: 'شرح واحد.',
    sub_units: [], personnel: [{ role: 'صندوق‌دار', duties: ['ثبت فیش'], kpi: ['دقت'] }],
    updated_at: '2026-07-26T09:00:00Z',
  },
  processes: [proc('cashier-001', LONG), proc('cashier-002', UNBROKEN)],
  generated_at: '2026-07-26T09:00:00Z',
} as unknown as ExportPayload

// The two widths the fix was verified at in Chrome, plus the tablet fold the
// first pass stopped at — 761 is the width the phone-only rule left broken.
const WIDTHS = [1920, 1440, 1024, 761]

/** The inline space a *printed* row actually gets: the page box less its side
 *  margins. `@page{margin:8mm 13mm}` on letter (612x792pt = 816x1056 CSS px)
 *  leaves 816 − 2×49.13 = 717.7px; on A4 (793.7px wide) it would leave 695.4.
 *  Both are swept, plus a narrower one, because the correction must belong to
 *  the rule and not to one paper size — the printed contents page was left
 *  broken once already by a fix that was conditioned on a width. */
const PRINT_WIDTHS = [718, 695, 640]

const DOC_SHEETS = [sheet('flowchart/document.module.css', d as unknown as Record<string, string>)]
const STEPS_SHEETS = [sheet('steps/steps.module.css', s as unknown as Record<string, string>)]
const PRINTDOC_SHEETS = [sheet('steps/print.module.css', pm as unknown as Record<string, string>)]

describe('the flowchart document’s contents row holds a long process name', () => {
  const renderDoc = () => render(
    <QueryClientProvider client={createSeededClient(PAYLOAD)}>
      <Document payload={PAYLOAD} />
    </QueryClientProvider>,
  )

  for (const name of [LONG, UNBROKEN]) {
    for (const width of WIDTHS) {
      it(`lets a ${name.length}-character title shrink and wrap at ${width}px`, () => {
        const { container, unmount } = renderDoc()
        const title = [...container.querySelectorAll(`.${d['toc-t']}`)]
          .find((el) => el.textContent?.startsWith(name))
        expect(title, 'the contents list renders the long title').toBeTruthy()
        const row = title!.closest('li')!
        assertShrinkable(DOC_SHEETS, title!, row, width, 'flowchart contents row')
        unmount()
      })
    }
  }

  it('lets a title with no break opportunity break anyway', () => {
    // `flex:1` and `min-width:0` size the *box*; neither can break a word that
    // is wider than it. Without this the 210-character single token still runs
    // off the sheet, at every width.
    const { container } = renderDoc()
    const title = [...container.querySelectorAll(`.${d['toc-t']}`)]
      .find((el) => el.textContent?.startsWith(UNBROKEN))!
    for (const width of WIDTHS) {
      expect(resolve(DOC_SHEETS, title, 'overflow-wrap', width, ['word-wrap', 'word-break']),
        `no break opportunity is honoured at ${width}px`).toMatch(/anywhere|break-word|break-all/)
    }
  })

  it('is fixed on the rule, not behind a breakpoint', () => {
    // The regression this guards against is a real one: the first pass declared
    // `.toc .toc-t{flex:1;min-width:0}` inside `@media screen and
    // (max-width:760px)`, which left every width above the tablet fold — every
    // desktop — overflowing exactly as before.
    const { container } = renderDoc()
    const title = [...container.querySelectorAll(`.${d['toc-t']}`)]
      .find((el) => el.textContent?.startsWith(LONG))!
    const widths = [320, 560, 761, 1024, 1440, 1920, 2560]
    for (const w of widths) {
      expect(shrinkOf(resolve(DOC_SHEETS, title, 'flex-shrink', w, ['flex'])), `shrinks at ${w}px`)
        .toBeGreaterThan(0)
    }
  })
})

describe('the printed contents page holds a long process name', () => {
  /** The same question as above, asked of the medium the reader gets on paper.
   *
   *  The screen correction was scoped to `@media screen`, so the printed
   *  contents page kept the ported `flex:none` — and paper is the narrower box:
   *  717.7px against the 824px a row has inside the 940px sheet on a desk.
   *  Measured in Chrome 150 under print emulation at that width, on the real
   *  cashier document, 8 of its 17 process rows ran off the paper, the worst by
   *  427.1px, and the printed PDF lost 169 letters across those eight titles —
   *  up to 50 letters, 39% of one 128-letter name, cut mid-word at the edge. */
  const renderDoc = () => render(
    <QueryClientProvider client={createSeededClient(PAYLOAD)}>
      <Document payload={PAYLOAD} />
    </QueryClientProvider>,
  )

  for (const name of [LONG, UNBROKEN]) {
    for (const width of PRINT_WIDTHS) {
      it(`lets a ${name.length}-character title shrink and wrap on a ${width}px page`, () => {
        const { container, unmount } = renderDoc()
        const title = [...container.querySelectorAll(`.${d['toc-t']}`)]
          .find((el) => el.textContent?.startsWith(name))
        expect(title, 'the contents list renders the long title').toBeTruthy()
        const row = title!.closest('li')!
        assertShrinkable(DOC_SHEETS, title!, row, width, 'printed contents row', 'print')
        unmount()
      })
    }
  }

  it('breaks a printed title that has no break opportunity', () => {
    const { container } = renderDoc()
    const title = [...container.querySelectorAll(`.${d['toc-t']}`)]
      .find((el) => el.textContent?.startsWith(UNBROKEN))!
    for (const width of PRINT_WIDTHS) {
      expect(resolve(DOC_SHEETS, title, 'overflow-wrap', width, ['word-wrap', 'word-break'], 'print'),
        `no break opportunity is honoured on a ${width}px page`).toMatch(/anywhere|break-word|break-all/)
    }
  })

  it('does not leave the printed row at its max-content width', () => {
    // `flex:none` is `0 0 auto`: the item starts at max-content and can neither
    // grow nor shrink from there. That basis is the defect itself, so it is
    // asserted separately from `flex-shrink` — a rule could restore shrinking
    // and still leave the row starting too wide.
    const { container } = renderDoc()
    const title = [...container.querySelectorAll(`.${d['toc-t']}`)]
      .find((el) => el.textContent?.startsWith(LONG))!
    for (const width of PRINT_WIDTHS) {
      expect(basisOf(resolve(DOC_SHEETS, title, 'flex-basis', width, ['flex'], 'print')),
        `printed contents row on a ${width}px page`).toMatch(/^0(%|px)?$/)
    }
  })

  it('leaves the ported 26px number gutter rigid on paper too', () => {
    // The counterweight: if the print correction had been written broadly enough
    // to loosen `.toc .toc-n` as well, the numbers would stop lining up. It is
    // meant to be unshrinkable, in both media.
    const { container } = renderDoc()
    const num = container.querySelector(`.${d['toc-n']}`)!
    for (const width of PRINT_WIDTHS) {
      expect(shrinkOf(resolve(DOC_SHEETS, num, 'flex-shrink', width, ['flex'], 'print'))).toBe(0)
    }
  })
})

describe('the steps guide’s printed index holds a long process name', () => {
  /** Checked, and found sound — the guide's `@media print` block declares
   *  `.pindex .il{flex:1;…}`, so an index row starts at a zero basis and wraps.
   *  Measured the same way as the flowchart's, in Chrome 150 under print
   *  emulation at 718px on the real cashier document: **0 of 17** index rows
   *  overflowed their `<li>`, and all 17 titles came back complete out of the
   *  printed PDF. Nothing was changed here; this pins what is already true, so
   *  that a re-port of the mockup's block cannot quietly make it `flex:none`
   *  the way the flowchart's contents row was.
   *
   *  It asks slightly less than the flowchart guard: `.pindex .il` has no
   *  `min-width:0`, and does not need one, because a zero flex basis already
   *  keeps the row at the width the page can spare and its automatic minimum is
   *  the longest *word* in the title, not the whole title. */
  const renderPrint = () => render(<PrintDoc payload={PAYLOAD} />)

  for (const width of PRINT_WIDTHS) {
    it(`starts an index row at a zero basis and lets it shrink on a ${width}px page`, () => {
      const { container, unmount } = renderPrint()
      const idx = container.querySelector('[data-testid="print-index"]')!
      const title = [...idx.querySelectorAll(`.${pm.il}`)]
        .find((el) => el.textContent?.startsWith(LONG))
      expect(title, 'the printed index renders the long title').toBeTruthy()
      const row = title!.closest('li')!
      expect(resolve(PRINTDOC_SHEETS, row, 'display', width, [], 'print'),
        'an index row is a flex row').toBe('flex')
      expect(shrinkOf(resolve(PRINTDOC_SHEETS, title!, 'flex-shrink', width, ['flex'], 'print')),
        'the index title can shrink').toBeGreaterThan(0)
      expect(basisOf(resolve(PRINTDOC_SHEETS, title!, 'flex-basis', width, ['flex'], 'print')),
        'the index title does not start at max-content').toMatch(/^0(%|px)?$/)
      unmount()
    })
  }

  it('keeps the type pill and the id rigid beside it', () => {
    // The two things in an index row that must *not* wrap: `.it` («فرآیند» /
    // «زیرفرآیند») and `.ic` (the Latin process id). Both are ported `flex:none`
    // and are meant to stay that way — this is the guard's counterweight.
    const { container } = renderPrint()
    const idx = container.querySelector('[data-testid="print-index"]')!
    for (const cls of [pm.it, pm.ic]) {
      const el = idx.querySelector(`.${cls}`)!
      expect(shrinkOf(resolve(PRINTDOC_SHEETS, el, 'flex-shrink', 718, ['flex'], 'print'))).toBe(0)
    }
  })
})

describe('the steps guide’s rows hold a long process name', () => {
  it('lets the process list’s title shrink and wrap at every width', () => {
    const { container } = render(<StepsApp payload={PAYLOAD} />)
    const title = [...container.querySelectorAll(`.${s.pt}`)]
      .find((el) => el.textContent?.startsWith(LONG))
    expect(title, 'the process list renders the long title').toBeTruthy()
    const row = title!.closest('button')!
    for (const width of WIDTHS) assertShrinkable(STEPS_SHEETS, title!, row, width, 'steps process list row')
  })

  it('lets a step row’s label shrink and wrap at every width', () => {
    const { container } = render(<StepsApp payload={PAYLOAD} />)
    const open = [...container.querySelectorAll(`.${s.pbtn}`)]
      .find((el) => el.textContent?.startsWith(LONG))!
    fireEvent.click(open)
    const label = container.querySelector(`.${s.label}`)
    expect(label, 'the step page renders a step label').toBeTruthy()
    const row = label!.closest(`.${s['step-row']}`)!
    for (const width of WIDTHS) assertShrinkable(STEPS_SHEETS, label!, row, width, 'steps step row')
  })
})

describe('the cascade resolver itself', () => {
  // A guard that cannot fail is worth nothing, so pin the resolver against
  // declarations whose answer is known by reading the stylesheet.
  const doc = () => render(
    <QueryClientProvider client={createSeededClient(PAYLOAD)}>
      <Document payload={PAYLOAD} />
    </QueryClientProvider>,
  ).container

  it('reads the ported fixed-width gutter as unshrinkable, at every width', () => {
    // `.toc .toc-n{…flex:none;width:26px}` is the mockup's own 26px number
    // column and is *meant* to be rigid — if the resolver called this
    // shrinkable it would call anything shrinkable.
    const num = doc().querySelector(`.${d['toc-n']}`)!
    for (const width of WIDTHS) {
      expect(shrinkOf(resolve(DOC_SHEETS, num, 'flex-shrink', width, ['flex']))).toBe(0)
    }
  })

  it('reads the row as a flex container and honours !important', () => {
    const row = doc().querySelector(`.${d.toc} li`)!
    expect(resolve(DOC_SHEETS, row, 'display', 1440)).toBe('flex')
    // `.toc li{align-items:flex-start!important}` (`:43`) overrides
    // `.toc li{…align-items:baseline…}` (`:85`) from *later* in the file.
    expect(resolve(DOC_SHEETS, row, 'align-items', 1440)).toBe('flex-start')
  })

  it('never reads a print-only declaration on screen', () => {
    // `@media print` re-declares `.sheet{…max-width:none!important…}`; on screen
    // the ported `.sheet{max-width:940px}` is what holds.
    const sh = doc().querySelector(`.${d.sheet}`)!
    expect(resolve(DOC_SHEETS, sh, 'max-width', 1440)).toBe('940px')
  })

  it('reads the print-only declaration on paper, and only there', () => {
    // The mirror image, which is what the printed guards above stand on: asked
    // for `print`, the resolver must switch to the block it just refused. If the
    // medium argument did nothing, these two would agree and both guards would
    // be measuring the screen.
    const sh = doc().querySelector(`.${d.sheet}`)!
    expect(resolve(DOC_SHEETS, sh, 'max-width', 718, [], 'print')).toBe('100%')
    const bar = doc().querySelector(`.${d.topbar}`)
    expect(resolve(DOC_SHEETS, bar, 'display', 718, [], 'print')).toBe('none')
    expect(resolve(DOC_SHEETS, bar, 'display', 1440)).toBe('flex')
  })

  it('applies the mockup’s own bare width queries to the page box as well', () => {
    // A query with no medium is evaluated against the page box when printing,
    // and the printed page area (718px) is under the mockup's 760px fold — the
    // reason `print.css` records that `.g2` would go one-up on paper were the
    // print block not overriding it. The resolver has to see that too.
    const el = document.createElement('div')
    el.className = `${d.grid} ${d.g2}`
    expect(resolve(DOC_SHEETS, el, 'grid-template-columns', 718, [], 'print')).toBe('1fr 1fr')
    expect(resolve(DOC_SHEETS, el, 'grid-template-columns', 718)).toBe('1fr')
  })

  it('applies the mockup’s own bare width queries to the screen', () => {
    // `@media(max-width:760px){.g2{grid-template-columns:1fr}}` is ported with
    // no medium, so it matches on screen below the fold and not above it.
    const el = document.createElement('div')
    el.className = `${d.grid} ${d.g2}`
    expect(resolve(DOC_SHEETS, el, 'grid-template-columns', 1440)).toBe('repeat(2,1fr)')
    expect(resolve(DOC_SHEETS, el, 'grid-template-columns', 700)).toBe('1fr')
  })
})
