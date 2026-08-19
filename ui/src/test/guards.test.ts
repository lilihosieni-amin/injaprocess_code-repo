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
    // IdBadge was the sole dir="ltr" island in this sub-project; P0 adds the
    // phone-number and IP fields to this list as it builds them. The screens
    // below are declared here **before** the scan can see them —
    // `src/screens/` is still in PENDING_REBUILD — precisely so that deleting
    // that line is a one-line change and not a hunt for the islands nobody
    // wrote down. Every one of them pins `ltr` on the same thing: a latin-digit
    // mobile number inside RTL prose. The form's input, the candidate's number
    // beside their name in the picker, the signed-in account's own number on
    // the profile, and — added when this list was found to be missing two of
    // this branch's own files — the number on each row of the user list and on
    // one person's record. Masked today by PENDING_REBUILD, those two would
    // have turned this guard red on the day `src/screens/` left it.
    const ISLANDS = [
      'src/ui/IdBadge.tsx',
      // TextField pins `dir="ltr"` when its caller asks for a latin island — the
      // username on the new-user dialog, a process id, an IP. Declared here
      // rather than worked around inside the component, because the workaround
      // (spreading a `{ dir: 'ltr' }` object so the string `dir=` never appears)
      // would defeat the guard without changing the markup it exists to police.
      'src/ui/TextField.tsx',
      // The crumb strip pins a process id LTR and monospaced — §8's rule for
      // every latin island in an RTL app, and the only `dir=` in either shell.
      // `src/shell/crumbs.ts`, which decides WHICH crumb is one, is deliberately
      // not on this list and must not join it: it renders nothing, and its
      // docstring says so without spelling the attribute, because this scan
      // reads comments too and a file that merely describes the island would
      // otherwise have to be declared as one.
      'src/shell/PanelShell.tsx',
      'src/screens/UserFields.tsx',
      'src/screens/SupervisorPicker.tsx',
      'src/screens/Profile.tsx',
      'src/screens/Users.tsx',
      'src/screens/UserDetail.tsx',
      // Summary pins `ltr` on one thing: the mono `A-0 · {id}` line inside the
      // IDEF0 centre box (§8 — every mono id run is an LTR island). NOT on its
      // scrolling region: that is `[data-r-pad]`, whose direction pair lives in
      // `src/styles/base.css` with every other screen's.
      'src/screens/Summary.tsx',
      // `src/screens/ProcessList.tsx` is deliberately NOT here, and the absence
      // is the finding rather than an omission: that screen used to pin the
      // direction twice — once on its scrolling region, once back on the single
      // child somebody remembered — and it now pins it nowhere. §8's intent
      // moved into `[data-r-pad]{direction:ltr}` / `[data-r-pad] > *{direction:
      // rtl}` in `src/styles/base.css`, where the rule reaches every child
      // instead, so the five re-pins under `src/write/` that existed to undo the
      // second half have nothing left to undo. Anyone re-adding the attribute to
      // that file has re-opened O1 and must not add a line here to quiet this.
    ]
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
    // `variant` on EmptyState selects a *visual form* the design defines —
    // a card, a dashed block, a line inside a table — not a density. Named here
    // rather than loosening the pattern for every file, exactly as Button's
    // colour `variant` is.
    const EXCEPTIONS = ['src/ui/Button.tsx', 'src/ui/states/index.tsx']
    const hits = files()
      .filter((f) => !EXCEPTIONS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => BAD.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])

    // The list is the only way past this guard, so it must not be able to grow
    // quietly: an entry for a file that no longer trips the pattern (or no
    // longer exists) is an exception nobody is paying for, and the next file
    // added beside it inherits the same absence of scrutiny. Each entry has to
    // earn its place by still matching.
    const idle = EXCEPTIONS.filter((rel) => {
      const f = files().find((x) => x.rel === rel)
      return !f || !readFileSync(f.path, 'utf8').split('\n').some((line) => BAD.test(line))
    })
    expect(
      idle,
      'these files are excepted from F4/F8 but no longer trip it — delete the line',
    ).toEqual([])
  })
})
