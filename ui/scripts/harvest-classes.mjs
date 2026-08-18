#!/usr/bin/env node
/**
 * harvest-classes — prove that every Tailwind class THESE FILES write emits a
 * real rule in the built CSS.
 *
 *   cd ui && npx vite build
 *   node scripts/harvest-classes.mjs src/ui/Checkbox.tsx src/ui/Radio.tsx
 *   node scripts/harvest-classes.mjs            # every file the task changed
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY THE OBVIOUS VERSION DOES NOT WORK
 * ---------------------------------------------------------------------------
 * The obvious check is "build, then grep dist/assets/*.css for each class in a
 * list". It proves almost nothing here, for four separate reasons:
 *
 * 1. `tailwind.config.js` lists `./tailwind-probe.txt` in `content`, and that
 *    probe names EVERY theme class. So every theme class emits whether or not
 *    any component writes it. Measured on one task: 45 of its 52 grepped
 *    classes emitted regardless of whether the task existed at all.
 *    => The list must be HARVESTED FROM THE SOURCE FILES, never hand-kept.
 *       A hand-kept list also drifts: one task's list certified 25 of its 75.
 *
 * 2. Tailwind ESCAPES the special characters in a variant class, so
 *    `hover:bg-tile-v2` is written `.hover\:bg-tile-v2:hover` in the CSS. A
 *    `new RegExp("\\." + name)` therefore reports EVERY variant class missing.
 *    A reviewer hit exactly that and briefly believed three real classes were
 *    absent. => We PARSE the CSS and unescape the selectors into an index.
 *
 * 3. A plain substring grep for `.w-tick` is satisfied by `.w-tick-glyph`.
 *    => Index lookup, not substring search.
 *
 * 4. A theme key pointing at nothing can emit a rule with an EMPTY body, and a
 *    grep scores that as present. => We count declarations, and we also flag a
 *    declaration whose `var(--x)` is never declared anywhere in the CSS.
 *
 * Harvesting everything would also cry wolf, so a token is only judged when the
 * literal holding it is demonstrably a class string — see `inClassPosition` and
 * the CORROBORATION block. Measured over all 87 non-test source files: 681 ok,
 * 0 dead, and the three false positives an earlier version reported
 * (`btn-spinner`, `react-router-dom`, `react-dom/client`) are gone with no loss
 * of the real ones.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT PROVE
 * ---------------------------------------------------------------------------
 * It proves that a file writes a class and that the class compiles to a rule
 * with declarations. It does NOT prove that the class reaches the right
 * element, that the element is rendered, that it is visible on screen, or that
 * the value is the one the design asks for. Those need the Playwright checks.
 * A green run here is a floor, never a conformance result.
 *
 * ---------------------------------------------------------------------------
 * CONTROLS (they run on every invocation, so the check cannot go quietly dead)
 * ---------------------------------------------------------------------------
 * - a negative control: invented names — derived from the namespaces THIS
 *   stylesheet actually has, so each is a probe it can judge — are fed through
 *   the same classifier and must all come back dead. If one is reported present
 *   the checker is broken. Stubbing the check out is caught here: the run goes
 *   from `47 ok / 1 DEAD` to `47 ok / 0 DEAD` and the control reports 0/7.
 * - an escaping control: after indexing, no class name may still carry a
 *   backslash, and at least one must carry a `:`. Both halves are needed —
 *   testing only for a `:` passes a completely broken unescaper, because
 *   `hover\:bg-x` contains a colon too. Measured while building this: with the
 *   unescaper removed the colon-only test still reported a healthy 87 while all
 *   310 escaped classes were misfiled.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// 1. The files this task writes
// ---------------------------------------------------------------------------
// Named explicitly, or — with no arguments — every source file the working tree
// has changed, which is what a task has in hand when it reaches its check step.
//
// Test files are left out of the automatic set on purpose. They carry invented
// class names as fixtures (`rounded-tickk`, `w-tick-nineteen`) and quote CSS
// PROPERTY names in assertions (`text-align`, `inset-inline-end`) that collide
// with live utility namespaces. Running the default set over `choices.test.tsx`
// reported three of those as dead. Name a test file explicitly if you really
// want it scanned.
const isTest = (f) => /(^|\/)(test|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(f)
let files = process.argv.slice(2)
if (!files.length) {
  files = execSync('git status --porcelain -- .', { encoding: 'utf8' })
    .split('\n').map((l) => l.slice(3).trim()).filter(Boolean)
    .map((f) => (f.startsWith('ui/') ? f.slice(3) : f))
    .filter((f) => /\.(tsx?|txt|html)$/.test(f) && !isTest(f) && existsSync(f))
}
if (!files.length) {
  console.error('harvest-classes: no source files given and none changed — name them explicitly')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 2. Harvest the candidates out of those files
// ---------------------------------------------------------------------------
/**
 * A `'`/`"` string cannot span a line in JS, so an unterminated one is not a
 * string at all — we abandon it and resume on the next character. That keeps
 * any mis-read (an apostrophe in JSX prose, a quote inside a regex literal)
 * contained to a single line instead of swallowing the rest of the file.
 */
function quoted(src, i, q) {
  let j = i + 1, s = ''
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') { s += src[j + 1] ?? ''; j += 2; continue }
    if (c === '\n') return [null, i + 1]
    if (c === q) return [s, j + 1]
    s += c; j++
  }
  return [null, i + 1]
}

/**
 * Every string literal in a .ts/.tsx file, with comments removed, as
 * `{ text, pos }` — `pos` is where the literal opened, which lets the caller
 * ask whether it stood in a `className` position.
 *
 * Comments MUST be removed: this codebase documents class names in prose —
 * "`gap-s4` → `gap-s99` emits nothing" sits in a JSX comment in Pager.tsx — and
 * harvesting those would report a class as dead that no element ever writes.
 *
 * There is deliberately NO regex-literal detection. The usual heuristic ("a `/`
 * after `(`,`=`,`{`,`<`… starts a regex") is WRONG in TSX: `</span>` puts a `/`
 * straight after a `<`, the scanner reads it as a regex, runs to the next `/`
 * — which is the `/` of the following `{/*` — and the JSX comment after it is
 * then parsed as code. That is exactly how `gap-s99` leaked out of a comment.
 * Without the heuristic a regex holding a quote can still mis-open a string,
 * but `quoted()` above bounds that to one line.
 */
function literals(src, path) {
  if (path.endsWith('.txt')) return [{ text: src.replace(/^\s*#.*$/gm, ''), pos: -1 }]
  if (path.endsWith('.html')) {
    const clean = src.replace(/<!--[\s\S]*?-->/g, '')
    return [...clean.matchAll(/=\s*"([^"]*)"|=\s*'([^']*)'/g)].map((m) => ({ text: m[1] ?? m[2], pos: m.index }))
  }
  const out = []
  let i = 0, mode = 'code', buf = '', open = 0
  const braces = []               // one entry per open `${`, holding its brace depth
  while (i < src.length) {
    const c = src[i], d = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
      if (c === '"' || c === "'") { const [s, next] = quoted(src, i, c); if (s !== null) out.push({ text: s, pos: i }); i = next; continue }
      if (c === '`') { mode = 'tpl'; buf = ''; open = i; i++; continue }
      if (braces.length) {
        if (c === '{') braces[braces.length - 1]++
        else if (c === '}') {
          braces[braces.length - 1]--
          if (braces[braces.length - 1] === 0) { braces.pop(); mode = 'tpl'; buf = ' '; i++; continue }
        }
      }
      i++; continue
    }
    // mode === 'tpl'
    if (c === '\\') { buf += d ?? ''; i += 2; continue }
    if (c === '`') { out.push({ text: buf, pos: open }); buf = ''; mode = 'code'; i++; continue }
    if (c === '$' && d === '{') { out.push({ text: buf, pos: open }); buf = ' '; braces.push(1); mode = 'code'; i += 2; continue }
    buf += c; i++
  }
  if (buf.trim()) out.push({ text: buf, pos: open })
  return out
}

/**
 * Did this literal stand where a class string goes?
 *
 * Harvesting every string in a file also harvests things that are not classes,
 * and some of them collide with a live namespace: `data-testid="btn-spinner"`
 * looks dead because `.btn-coral` makes `btn-` live, and `from 'react-router-dom'`
 * looks dead because @xyflow ships `.react-flow__*`. Both were reported by an
 * earlier version of this file across the whole app.
 *
 * A literal counts as a class string when the nearest `className` / `cn(` /
 * `clsx(` before it is not separated from it by a `;`, a `<`, a `>` or a second
 * `=` — the `<svg` and the `data-testid=` in the example above both break the
 * link. A literal that fails this test is still checked if it is CORROBORATED
 * (see below), which is what carries `const NAV = 'w-pager h-pager …'` in a
 * helper module where no `className` is in sight.
 */
function inClassPosition(src, pos) {
  if (pos < 0) return true                       // a .txt inventory is all classes
  const before = src.slice(Math.max(0, pos - 250), pos)
  const k = Math.max(before.lastIndexOf('className'), before.lastIndexOf('class='),
    before.lastIndexOf('cn('), before.lastIndexOf('clsx('), before.lastIndexOf('twMerge('))
  if (k < 0) return false
  const between = before.slice(k)
  return !/[;<>]/.test(between) && (between.match(/=/g) ?? []).length <= 1
}

/** Tokens that could be a Tailwind class. Persian prose, paths and URLs are out. */
function looksLikeClass(t) {
  if (!t || t.length > 90) return false
  if (!/^[!a-zA-Z0-9]/.test(t) || !/[a-z]/.test(t)) return false
  if (!/^[!a-zA-Z0-9:_\-[\]().,/%#*+&~@]+$/.test(t)) return false   // ASCII class shapes only
  if (t.endsWith('-') || t.includes('..') || /^https?:/.test(t)) return false
  return true
}

const candidates = new Map()      // class -> Set(file it was written in)
const groups = []                 // { tokens, classPos } per literal
for (const f of files) {
  let src
  try { src = readFileSync(f, 'utf8') } catch { console.log(`  skipped (unreadable): ${f}`); continue }
  for (const { text, pos } of literals(src, f)) {
    const tokens = []
    for (const raw of text.split(/\s+/)) {
      const t = raw.trim()
      if (!looksLikeClass(t)) continue
      if (!candidates.has(t)) candidates.set(t, new Set())
      candidates.get(t).add(f)
      tokens.push(t)
    }
    if (tokens.length) groups.push({ tokens, classPos: inClassPosition(src, pos) })
  }
}

// ---------------------------------------------------------------------------
// 3. Index the built CSS by PARSING it (see reasons 2-4 in the header)
// ---------------------------------------------------------------------------
const CSS_DIR = 'dist/assets'
if (!existsSync(CSS_DIR)) {
  console.error(`harvest-classes: ${CSS_DIR} does not exist — run \`npx vite build\` first`)
  process.exit(1)
}
const css = readdirSync(CSS_DIR).filter((f) => /\.css$/.test(f))
  .map((f) => readFileSync(`${CSS_DIR}/${f}`, 'utf8')).join('\n')
if (!css.trim()) {
  console.error(`harvest-classes: no CSS in ${CSS_DIR} — run \`npx vite build\` first`)
  process.exit(1)
}

const endOfComment = (s, i) => { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2 }

/** Every style rule as [selector, body]. At-rule wrappers are walked into. */
function rules(s) {
  const out = []
  let i = 0, buf = ''
  while (i < s.length) {
    const c = s[i]
    // The backslash case comes FIRST. `.before\:content-\[\"\"\]` puts a `\"`
    // inside a SELECTOR; reading that as the start of a string swallows the
    // rest of the stylesheet and silently drops ~150 rules.
    if (c === '\\') { buf += s.slice(i, i + 2); i += 2; continue }
    if (c === '/' && s[i + 1] === '*') { i = endOfComment(s, i); continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < s.length) { if (s[j] === '\\') j += 2; else if (s[j] === c) break; else j++ }
      buf += s.slice(i, j + 1); i = j + 1; continue
    }
    if (c === '{') {
      const sel = buf.trim(); buf = ''
      if (/^@(media|supports|layer|container|document|scope)\b/.test(sel)) { i++; continue }
      let j = i + 1, depth = 1
      while (j < s.length && depth > 0) {
        const k = s[j]
        if (k === '\\') { j += 2; continue }
        if (k === '/' && s[j + 1] === '*') { j = endOfComment(s, j); continue }
        if (k === '"' || k === "'") { j++; while (j < s.length) { if (s[j] === '\\') j += 2; else if (s[j] === k) break; else j++ } }
        else if (k === '{') depth++
        else if (k === '}') depth--
        j++
      }
      if (!sel.startsWith('@')) out.push([sel, s.slice(i + 1, j - 1)])
      i = j; continue
    }
    if (c === '}') { buf = ''; i++; continue }
    buf += c; i++
  }
  return out
}

/** `.hover\:bg-tile-v2` -> `hover:bg-tile-v2`; `\31 0` -> `10`. */
const unescape = (n) => n
  .replace(/\\([0-9a-fA-F]{1,6})[ ]?/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/\\([\s\S])/g, '$1')

/** How many declarations a rule body actually holds. An empty body scores 0. */
function declarations(body) {
  let n = 0, depth = 0, seg = ''
  const flush = () => { if (/^\s*-{0,2}[\w-]+\s*:/.test(seg)) n++; seg = '' }
  for (const c of body) {
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ';' && depth === 0) flush(); else seg += c
  }
  flush()
  return n
}

const emitted = new Map()         // class -> { decls, vars:Set }
const declaredVars = new Set()
for (const [sel, body] of rules(css)) {
  const n = declarations(body)
  for (const m of body.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)) declaredVars.add(m[1])
  // `var(--x)` with no fallback: if `--x` is never declared the rule paints nothing.
  const used = [...body.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1])
  for (const m of sel.matchAll(/\.((?:\\[\s\S]|[^\s.,:>+~()[\]{}'"\\])+)/g)) {
    const name = unescape(m[1])
    const rec = emitted.get(name) ?? { decls: 0, vars: new Set() }
    rec.decls += n
    for (const v of used) rec.vars.add(v)
    emitted.set(name, rec)
  }
}

// ---------------------------------------------------------------------------
// 4. Classify
// ---------------------------------------------------------------------------
/** Strip variants: `max760:hover:bg-x` -> `bg-x`. A `:` inside `[...]` is not one. */
function baseOf(t) {
  let depth = 0, out = ''
  for (const c of t) {
    if (c === '[') depth++
    else if (c === ']') depth--
    if (c === ':' && depth === 0) out = ''
    else out += c
  }
  return out
}
/** `bg-tile-v2` -> `bg-`; `flex` -> null. The namespace, not the whole name. */
function namespaceOf(b) {
  const s = b.replace(/^-/, '')
  const i = s.indexOf('-')
  return i < 0 ? null : s.slice(0, i + 1)
}

// Which namespaces are real is derived from the CSS itself, never hand-listed:
// if any emitted class starts `bg-`, then `bg-anything` that does NOT emit is a
// dead utility rather than some unrelated string.
const liveNamespaces = new Set()
for (const name of emitted.keys()) {
  const ns = namespaceOf(baseOf(name))
  if (ns) liveNamespaces.add(ns)
}

const OK = 'ok', DEAD = 'DEAD', EMPTY = 'EMPTY', NOVAR = 'NOVAR'
const SKIP = 'not-utility-shaped', NOTCLASS = 'not-a-class-string'

function classify(t) {
  const rec = emitted.get(t)
  if (rec && rec.decls > 0) {
    const missing = [...rec.vars].filter((v) => !declaredVars.has(v))
    return missing.length
      ? [NOVAR, `emits, but reads ${missing.join(' ')} which nothing declares`]
      : [OK, '']
  }
  if (rec) return [EMPTY, 'selector emitted with an empty body — the theme key resolves to nothing']
  const base = baseOf(t)
  if (base !== t && emitted.get(base)?.decls > 0) {
    return [DEAD, `the variant never compiled (\`${base}\` on its own does)`]
  }
  const ns = namespaceOf(base)
  if (ns && liveNamespaces.has(ns)) {
    return [DEAD, `\`${ns}\` is a live utility namespace, so this name compiles to nothing`]
  }
  return [SKIP, '']
}

const verdict = new Map()
for (const t of candidates.keys()) verdict.set(t, classify(t))

// CORROBORATION. A literal is treated as a class string when it either stood in
// a `className` position or held two-or-more tokens of which at least one emits
// — the second half is what covers a helper module's `const NAV = 'w-pager …'`.
// A token seen only in literals that are neither is not judged at all: that is
// how `from 'react-router-dom'` and `data-testid="btn-spinner"` stop being
// reported dead just because `.react-flow__*` and `.btn-coral` make their
// namespaces live.
const corroborated = new Set()
for (const { tokens, classPos } of groups) {
  const live = tokens.filter((t) => verdict.get(t)[0] === OK).length
  if (!classPos && !(tokens.length >= 2 && live >= 1)) continue
  for (const t of tokens) corroborated.add(t)
  // A bare word (no `-`) cannot be judged by namespace, so it lands in SKIP.
  // In a string that is demonstrably a class list, a bare word that emits
  // nothing is a typo — `flexx`, `truncat`, `hiddne`. Promote those.
  if (live < 2) continue
  for (const t of tokens) {
    if (verdict.get(t)[0] === SKIP && !namespaceOf(baseOf(t))) {
      verdict.set(t, [DEAD, `bare word in a class string beside ${live} classes that do emit`])
    }
  }
}
for (const [t, v] of verdict) {
  if (!corroborated.has(t) && v[0] !== OK) verdict.set(t, [NOTCLASS, ''])
}

// ---------------------------------------------------------------------------
// 5. The controls
// ---------------------------------------------------------------------------
/**
 * Invented names, DERIVED FROM THIS STYLESHEET so each one is a probe it can
 * actually judge. A hand-written list is wrong on a stylesheet that happens to
 * have no `px-` class: the probe falls through to `not-utility-shaped`, the
 * control reports a leak, and the run fails for no reason. Observed while
 * building this, on a six-rule fixture.
 *
 * The set covers all three ways a name can be dead: an unknown name in a live
 * namespace, the same behind a variant that does exist, and a live base behind
 * a variant that does not.
 */
const NEGATIVE_CONTROL = (() => {
  const preferred = ['bg-', 'text-', 'px-', 'w-', 'border-', 'rounded-']
  const ordered = [...new Set([...preferred.filter((n) => liveNamespaces.has(n)),
                               ...[...liveNamespaces].sort()])].slice(0, 5)
  const realVariant = [...emitted.keys()].filter((n) => /^[a-z-]+:/.test(n)).sort()[0]
  const prefix = realVariant ? realVariant.slice(0, realVariant.indexOf(':') + 1) : ''
  const liveBase = [...emitted].filter(([n, r]) => r.decls > 0 && !n.includes(':') && namespaceOf(n))
    .map(([n]) => n).sort()[0]
  return [
    ...ordered.map((n) => `${n}zzz-not-a-real-token`),
    ...(prefix && ordered.length ? [`${prefix}${ordered[0]}zzz-not-a-real-token`] : []),
    ...(liveBase ? [`zzz-not-a-real-variant:${liveBase}`] : []),
  ]
})()
if (NEGATIVE_CONTROL.length < 3) {
  console.error('harvest-classes: the CSS index is too small to build a negative control — is dist/assets stale?')
  process.exit(1)
}
const leaked = NEGATIVE_CONTROL.filter((t) => classify(t)[0] !== DEAD)
// A `:` alone is not proof the unescaper ran — `hover\\:bg-x` contains one too.
// The index is only correct when no class name still carries a backslash AND at
// least one carries a colon. Checking only for a colon lets a broken unescaper
// report a healthy 87 while every variant class is misfiled.
const stillEscaped = [...emitted.keys()].filter((n) => n.includes('\\'))
const escapedClasses = [...emitted.keys()].filter((n) => n.includes(':') && !n.includes('\\'))

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
const bucket = (k) => [...verdict].filter(([, v]) => v[0] === k).map(([t, v]) => [t, v[1]])
const where = (t) => [...candidates.get(t)].join(', ')

console.log(`harvest-classes — ${files.length} file(s), ${candidates.size} candidates harvested, `
  + `${emitted.size} classes indexed from ${CSS_DIR}`)
for (const f of files) console.log(`    source: ${f}`)

let failures = 0
for (const kind of [DEAD, EMPTY, NOVAR]) {
  for (const [t, why] of bucket(kind).sort()) {
    failures++
    console.log(`  ${kind}  ${t}\n        ${why}\n        written in ${where(t)}`)
  }
}
for (const kind of [SKIP, NOTCLASS]) {
  const names = bucket(kind).map(([t]) => t).sort()
  if (names.length) console.log(`  ${kind} (${names.length}, harvested but NOT checked): ${names.join(' ')}`)
}
// `HARVEST_LIST=1` prints what was certified — useful when comparing this
// against a hand-kept list, or when reviewing what a task actually writes.
if (process.env.HARVEST_LIST) {
  console.log(`  ok (${bucket(OK).length}): ${bucket(OK).map(([t]) => t).sort().join(' ')}`)
}
console.log(`  ok ${bucket(OK).length}   DEAD ${bucket(DEAD).length}   `
  + `EMPTY ${bucket(EMPTY).length}   NOVAR ${bucket(NOVAR).length}`)

console.log(`  control (negative): ${NEGATIVE_CONTROL.length - leaked.length}/${NEGATIVE_CONTROL.length}`
  + ` invented names reported dead${leaked.length ? ` — LEAKED: ${leaked.join(' ')}` : ''}`)
const escapingBroken = escapedClasses.length === 0 || stillEscaped.length > 0
console.log(`  control (escaping): ${escapedClasses.length} escaped variant classes unescaped`
  + (escapedClasses.length ? ` (e.g. ${escapedClasses.sort()[0]})` : '')
  + (stillEscaped.length ? `, but ${stillEscaped.length} class names still carry a backslash` : '')
  + (escapingBroken ? ' — THE UNESCAPER IS BROKEN, every variant class above is misfiled' : ''))

const controlsFailed = leaked.length + (escapingBroken ? 1 : 0)
if (controlsFailed) console.log('  the controls did not hold: this run proves nothing')
console.log(failures + controlsFailed ? 'FAIL' : 'PASS')
console.log('  (proves these files write classes that compile; NOT that a class reaches'
  + ' the right element, renders, or is visible — that is what the Playwright checks are for)')
process.exit(failures + controlsFailed ? 1 : 0)
