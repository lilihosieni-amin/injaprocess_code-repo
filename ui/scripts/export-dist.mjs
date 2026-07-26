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

/** The document with every `<script>` and `<style>` body emptied.
 *
 *  The inlined bundle is ~350 KB of minified JS and CSS full of URL-like
 *  strings (React's error links, XML namespaces, `url(` inside emitted CSS),
 *  none of which the browser ever fetches. Only the markup can carry a real
 *  external reference, so only the markup is scanned. */
function markupOf(html) {
  return html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2')
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
  for (const m of markup.matchAll(/\s(src|href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim()
    // `data:` is inlined content; `#…` is a same-document fragment (a table of
    // contents link). Everything else is a fetch, and offline there is nobody
    // to answer it.
    if (!/^(data:|#)/i.test(value)) refs.push(`${m[1]}=${value.slice(0, 80)}`)
  }
  if (refs.length) {
    problems.push(`external reference(s) in markup: ${refs.join(', ')} — the export must be standalone`)
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
