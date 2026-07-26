// Lifecycle and invariants for `dist-export/`, the output of
// `vite.config.export.ts`. That config builds one entry per invocation
// (viteSingleFile sets `inlineDynamicImports`, which Rollup rejects for a
// multi-input build), so the directory is written by two separate `vite build`
// runs. Neither of them may clear it, and neither of them can see the other's
// output — hence both jobs live here, run by `npm run build:export`:
//
//   clean  — empty the directory exactly once, before either build
//   check  — assert both documents' contracts, after both builds
//
// Plain Node, no dependencies. Exits non-zero with a readable message on any
// violation, so a broken bundle fails the build instead of being published.

import { readFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const UI_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(UI_ROOT, 'dist-export')
const TEMPLATES = ['flowchart.html', 'steps.html']

// The literal `ui-backend/inja_ui_backend/exports.py` (DATA_SLOT) substitutes.
// Safe to write contiguously *here* — this file is a build script and is never
// bundled into a template. It must never appear contiguously in anything that
// is bundled; see the note in `export/shared/payload.ts`.
const DATA_SLOT = '__INJA_EXPORT_DATA__'

function clean() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
}

/** The document with every `<script>` and `<style>` body emptied, ready for the
 *  attribute scan.
 *
 *  The inlined bundle is ~350 KB of minified JS full of URL-like strings
 *  (React's error links, XML namespaces), none of which the browser ever
 *  fetches, so `<script>` bodies are dropped and never looked at again. CSS is
 *  dropped *here* only because `src=`/`href=` mean nothing inside it — the
 *  bodies are scanned separately by `cssRefsOf`, which is where a real external
 *  reference in a stylesheet lives. */
function markupOf(html) {
  return html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2')
}

/** The body of every inlined `<style>`. */
function styleBodiesOf(html) {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
}

// `data:` is inlined content; `#…` is a same-document fragment (an SVG paint
// server, a table of contents link). Everything else is a fetch, and offline
// there is nobody to answer it.
const INERT = /^(data:|#)/i

// The attributes that make a browser fetch something. `data` is `<object
// data=…>`; the ubiquitous `data-*` attributes cannot match it, because the
// character after `data` there is `-`, not `=` or whitespace. `srcset` is
// listed before `src` for readability only — the alternation backtracks either
// way, but `src` first reads like a bug.
const REF_ATTR = /\s(srcset|src|(?:xlink:)?href|poster|data)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi

/** The fetchable targets an attribute value carries.
 *
 *  All of them carry one, except `srcset`, which carries a comma-separated
 *  candidate list — `pic-1x.png 1x, pic-2x.png 2x`. Data URIs contain commas
 *  but never whitespace, so they are blanked out before the split rather than
 *  torn in half by it; what is left splits on commas and whitespace, and the
 *  `1x`/`100w` descriptors are dropped. */
function targetsOf(attr, value) {
  if (attr.toLowerCase() !== 'srcset') return [value]
  return value
    .replace(/data:\S*/gi, ' ')
    .split(/[\s,]+/)
    .filter((t) => t && !/^\d+(\.\d+)?[wx]$/i.test(t))
}

/** External references inside a CSS body: `@import` targets, and `url(…)`
 *  targets that are not inlined data URIs.
 *
 *  Blanking CSS wholesale — on the rationale that it holds only inert
 *  URL-like strings — would hide precisely the regression this build is most
 *  exposed to. The whole point of the export build is inlining a webfont; the
 *  way that silently reverts is `@import url(https://fonts.googleapis.com/…)`
 *  or a `url()` pointing at a remote `.woff2`, and neither is markup. */
function cssRefsOf(css) {
  const refs = []
  for (const m of css.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s;)]+))/gi)) {
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!INERT.test(value)) refs.push(`@import ${value.slice(0, 80)}`)
  }
  // `@import url(…)` is already reported above; skip it so one fault is one
  // message.
  for (const m of css.matchAll(/(?<!@import\s{1,8})\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (value && !INERT.test(value)) refs.push(`url(${value.slice(0, 80)})`)
  }
  return refs
}

/** At most five references, so a thoroughly broken bundle stays readable. */
function summarise(refs) {
  const shown = refs.slice(0, 5).join(', ')
  return refs.length > 5 ? `${shown}, +${refs.length - 5} more` : shown
}

function violationsFor(name, html) {
  const problems = []

  // 1. The data slot, exactly once.
  //
  // Absent, the backend raises at render time. Duplicated is the dangerous
  // one and is why this check exists: the backend substitutes with Python's
  // `str.replace`, which replaces *every* occurrence, so a second copy — a
  // constant, a guard, a fixture that happens to contain the literal — would
  // splice a department's JSON into the middle of the bundle and produce a
  // syntactically broken file the backend would happily publish.
  const slots = html.split(DATA_SLOT).length - 1
  if (slots !== 1) {
    problems.push(
      `expected the ${DATA_SLOT} slot exactly once, found ${slots}` +
        (slots > 1
          ? ' — the backend replaces every occurrence, so this would splice JSON into the bundle'
          : ''),
    )
  }

  const markup = markupOf(html)

  // 2. No external references. An export is opened by double-click on a
  //    laptop with no server and no internet; anything fetched renders blank.
  const refs = []
  for (const m of markup.matchAll(REF_ATTR)) {
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim()
    for (const target of targetsOf(m[1], value)) {
      if (target && !INERT.test(target)) refs.push(`${m[1]}=${target.slice(0, 80)}`)
    }
  }
  if (refs.length) {
    problems.push(`external reference(s) in markup: ${summarise(refs)} — the export must be standalone`)
  }

  // 3. The same, for the inlined stylesheet — where the webfont lives, and so
  //    where a reverted inlining would show up.
  const cssRefs = styleBodiesOf(html).flatMap(cssRefsOf)
  if (cssRefs.length) {
    problems.push(
      `external reference(s) in inlined CSS: ${summarise(cssRefs)} — stylesheets and fonts must be inlined, not fetched`,
    )
  }

  const links = [...markup.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0].slice(0, 120))
  if (links.length) {
    problems.push(`<link> tag(s) in markup: ${links.join(', ')} — stylesheets and fonts must be inlined`)
  }

  return problems.map((p) => `${name}: ${p}`)
}

function check() {
  const failures = []
  for (const name of TEMPLATES) {
    let html
    try {
      html = readFileSync(join(OUT_DIR, name), 'utf8')
    } catch {
      failures.push(`${name}: missing from dist-export — the build did not produce it`)
      continue
    }
    failures.push(...violationsFor(name, html))
  }

  if (failures.length) {
    console.error('\nexport build check FAILED:')
    for (const f of failures) console.error(`  - ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(`export build check OK — ${TEMPLATES.join(', ')}: one data slot each, no external references`)
}

const job = process.argv[2]
if (job === 'clean') clean()
else if (job === 'check') check()
else {
  console.error(`usage: node scripts/export-dist.mjs clean|check — got ${job ?? '(nothing)'}`)
  process.exit(1)
}
