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
 *   src/shell/   — rebuilt by Task 11 of this plan, which removes this line.
 *   src/screens/ — rebuilt by P0–P4 as each screen is redone.
 *   src/write/   — rebuilt by P1–P4 with the write flows.
 */
const PENDING_REBUILD = ['src/flow/', 'src/shell/', 'src/screens/', 'src/write/']

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
