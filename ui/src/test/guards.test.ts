import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

/** The only file allowed to hold literal values. */
const ALLOWED = ['src/styles/tokens.css']

/**
 * Directories this guard does not police yet, each with the plan that clears it.
 * The list only ever shrinks: whoever rebuilds a directory deletes its line.
 *   src/flow/    — F16 keeps the flowchart implementation as-is. Permanent for F.
 *   src/screens/ — rebuilt by P0–P4 as each screen is redone.
 *   src/write/   — rebuilt by P1–P4 with the write flows.
 */
const PENDING_REBUILD = ['src/flow/', 'src/screens/', 'src/write/']

/**
 * Task 12 decides which arbitrary Tailwind values are legitimate and tightens
 * these regexes accordingly. Today they catch `text-[`, `rounded-[` and
 * `shadow-[` only — `px-[0.6em]`, `max-w-[560px]`, `rgba()` literals and raw px
 * in .css files all pass. That is a design call about which escapes are worth
 * keeping, not a regex tweak, which is why it is deferred rather than forgotten.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

function files() {
  return walk(SRC)
    .map((p) => ({ path: p, rel: p.slice(p.indexOf('src/')) }))
    .filter((f) => !ALLOWED.includes(f.rel))
    .filter((f) => !PENDING_REBUILD.some((d) => f.rel.startsWith(d)))
    .filter((f) => !/\.test\.tsx?$/.test(f.rel))
}

describe('F6 — tokens are the only source of values', () => {
  it('no component contains a hex colour', () => {
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b/.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('no component names an arbitrary size or radius', () => {
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => /(text|rounded|shadow)-\[/.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('catches Tailwind\'s own built-in palette, type scale and radii, not just arbitrary values', () => {
    // I1 — everything above lives under theme.extend, so bg-sky-600, text-lg and
    // rounded-lg all compile and violate F6/F8 while the two checks above stay
    // silent (they only catch arbitrary `[...]` values and hex literals). This
    // scans the same policed set for Tailwind's shipped defaults instead.
    const PALETTE = /\b(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|emerald|teal|cyan|sky|blue|indigo|purple|fuchsia|pink|rose)-\d{2,3}\b/
    const TYPE_SCALE = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/
    const RADII = /\brounded(-[tblrse]{1,2})?-(sm|md|lg|xl|2xl|3xl|full)\b/
    const BAD = new RegExp([PALETTE.source, TYPE_SCALE.source, RADII.source].join('|'))
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => BAD.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('is actually scanning files, not vacuously passing over an empty list', () => {
    // Both assertions above compare a derived list to `[]`, so a scan that
    // finds nothing "passes" for the wrong reason — e.g. if PENDING_REBUILD
    // ever grew a line broad enough to exclude everything (even 'src/' itself)
    // the two tests above would go green while policing zero files. This test
    // has no such blind spot: it asserts the scan is over a real, sizeable set
    // that includes a file none of the PENDING_REBUILD entries can exclude.
    const scanned = files()
    expect(
      scanned.length,
      `files() returned only ${scanned.length} entries — the guard above would pass ` +
        `vacuously with a list this small. Check PENDING_REBUILD hasn't grown broad ` +
        `enough to exclude nearly everything under src/.`,
    ).toBeGreaterThan(15)
    expect(
      scanned.some((f) => f.rel.startsWith('src/ui/')),
      "files() did not include anything under src/ui/ — the scan isn't looking at the files it should be.",
    ).toBe(true)
  })
})

describe('F10 — RTL is structural', () => {
  it('no component uses a physical direction property', () => {
    // I2 — widened past the original four cases: it needed a CSS colon or a
    // trailing digit, so text-right (the commonest physical-direction mistake)
    // matched nothing. Now also catches the bare left/right text-align utility,
    // ml/mr/pl/pr-auto, physical border/rounded corners, float, and the inline
    // JS style properties (margin/paddingLeft/Right).
    const BAD =
      /(margin|padding)-(left|right)|text-align:\s*(left|right)|\b(ml|mr|pl|pr|left|right)-\d|\btext-(left|right)\b|\b(ml|mr|pl|pr)-(auto|\d)|\bborder-[lr]\b|\brounded-[lr]-|\bfloat-(left|right)\b|margin(Left|Right)|padding(Left|Right)/
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => BAD.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('only the declared islands pin dir', () => {
    // IdBadge is the sole dir="ltr" island in this sub-project; P0 adds the
    // phone-number and IP fields to this list as it builds them.
    const ISLANDS = ['src/ui/IdBadge.tsx']
    const hits = files()
      .filter((f) => !ISLANDS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => /\bdir=/.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })
})

describe('F4/F8 — density comes from the shell', () => {
  it('no shared component accepts a density or size prop', () => {
    // I3 — was three literal names scoped to src/ui/ alone. Broadened to the
    // names an actual density prop is likely to be spelled (compact/dense/roomy
    // join size/scale/density; variant covers a style-variant prop smuggling a
    // density choice) and to every policed directory, not just src/ui/.
    // (?<!-) keeps kebab-case CSS declarations like `font-size:` out of a scan
    // that broadened past src/ui/ into src/styles/ — a TS/JSX prop name is never
    // preceded by a hyphen, so this excludes only the false positive.
    const BAD = /(?<!-)\b(density|size|scale|compact|dense|roomy|variant)\??:\s*('|"|[A-Za-z])/
    // Button's own `variant` selects a colour theme (coral/violet/green/ghost) —
    // a real, load-bearing axis distinct from density, not a size in disguise.
    // Allowlisted by file, the same pattern F10 below uses for IdBadge's
    // dir="ltr": one named, commented exception rather than loosening the
    // pattern (and so this guard's ability to catch a real one) for everyone.
    const EXCEPTIONS = ['src/ui/Button.tsx']
    const hits = files()
      .filter((f) => !EXCEPTIONS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => BAD.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })
})
