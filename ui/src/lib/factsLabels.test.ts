import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as labels from './factsLabels'
import { label } from './factsLabels'

/**
 * QF-42's build gate: **a value added to a schema without a Persian label fails
 * the test rather than leaking an English word onto a screen.**
 *
 * The three files are the ones spec §14 names — the entry contract, the
 * workbook manifest and the run record — read from `schemas/`, which is the
 * frozen data contract both repos validate against. Read with `fs` rather than
 * a `?raw` import so the test fails loudly on a moved file instead of at
 * bundle time, and so no schema ends up inside the app bundle.
 */
const SCHEMAS = [
  'facts.schema.json', 'manifest.schema.json', 'facts-run-meta.schema.json',
  // The other two files that mention a fact. Every member in them is a
  // duplicate of one above today — `.index.json` projects the entry's own
  // `kind`/`status`, a delta names the same five kinds — so these two add no
  // coverage this minute. They are named so that they cannot silently stop
  // being duplicates: an enumeration that grows on the index or the delta
  // alone is exactly the kind of value that reaches a screen with no label.
  'facts-index.schema.json', 'facts-delta.schema.json',
]

/** `process.cwd()` is `ui/`, the package vitest runs from — the same anchor
 *  `src/test/guards.test.ts` uses. `new URL(…, import.meta.url)` is not: under
 *  the jsdom environment `URL` is jsdom's, which node's `fileURLToPath`
 *  refuses. */
const schemaDir = join(process.cwd(), '..', 'schemas')

/** The two `refItems.namespace` sigils, which are punctuation rather than
 *  words: `#` and `##` are the id grammar's own marks, never drawn — nothing
 *  in `ui/` reads `namespace` at all — and a Persian "label" for a hash would
 *  be invented copy, which is the one thing QF-42 exists to stop. Exempted
 *  here, by value, so a *third* sigil would still fail the gate. */
const SIGILS = new Set(['#', '##'])

/** Every `enum` member and every `const`, at any depth, as `path -> value`.
 *
 *  Non-strings are skipped and not silently dropped: `schema_version: 1` is a
 *  version number, not a value a person reads, and a label for it would be
 *  noise. Strings are the whole of what reaches a screen — bar the two sigils
 *  above, for the same reason. */
function members(node: unknown, path: string, out: { path: string; value: string }[] = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => members(v, `${path}/${i}`, out))
    return out
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (Array.isArray(obj.enum)) {
      for (const v of obj.enum) {
        if (typeof v === 'string' && !SIGILS.has(v)) out.push({ path, value: v })
      }
    }
    if (typeof obj.const === 'string' && !SIGILS.has(obj.const)) {
      out.push({ path, value: obj.const })
    }
    for (const [k, v] of Object.entries(obj)) members(v, `${path}/${k}`, out)
  }
  return out
}

/**
 * The union of every exported label map — which is what "has a label" means:
 * the maps are per enumeration, and a schema member does not say which one it
 * belongs to.
 *
 * ponytail: a *new* schema member whose value happens to equal an unrelated key
 * elsewhere in the file — a `SCREEN_LABELS` action, a `PAYLOAD_FIELD_LABELS`
 * field name — would pass this on the wrong map's word. Tighten it by declaring
 * schema-path → map when a member actually collides; today none does, and the
 * per-map table would be a second copy of the schema to keep in step.
 */
function known(): Set<string> {
  const keys = new Set<string>()
  for (const value of Object.values(labels)) {
    if (!value || typeof value !== 'object') continue
    for (const k of Object.keys(value as Record<string, unknown>)) keys.add(k)
  }
  return keys
}

afterEach(() => vi.unstubAllEnvs())

describe('factsLabels — QF-42 coverage of the schemas', () => {
  it('every enum member and const the three schemas declare has a Persian label', () => {
    const have = known()
    const missing: string[] = []
    for (const file of SCHEMAS) {
      const doc = JSON.parse(readFileSync(join(schemaDir, file), 'utf8'))
      for (const m of members(doc, file)) {
        if (!have.has(m.value)) missing.push(`${m.path} → ${m.value}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('reads schemas that actually exist and finds members in them', () => {
    // Guards the guard: a moved schema or a broken walk would make the test
    // above pass by finding nothing at all.
    const all = SCHEMAS.flatMap((f) => members(JSON.parse(readFileSync(join(schemaDir, f), 'utf8')), f))
    expect(all.length).toBeGreaterThan(20)
    expect(all.map((m) => m.value)).toContain('measurement')
    expect(all.map((m) => m.value)).toContain('ui')
  })

  it('every label is Persian, never an English fallback', () => {
    const english: string[] = []
    for (const [name, value] of Object.entries(labels)) {
      if (!value || typeof value !== 'object') continue
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v !== 'string') continue
        // `{n}` / `{m}` / `{heir}` / `{kind}` are substitution slots, not copy.
        // PDF and Word are the estate's own words for those two file types
        // (Appendix D writes «PDF» and «سند Word»), and «ERP» is the owner's.
        const stripped = v.replace(/\{[a-z]+\}/g, '').replace(/PDF|Word|ERP/g, '')
        if (/[A-Za-z]/.test(stripped)) english.push(`${name}.${k} = ${v}`)
      }
    }
    expect(english).toEqual([])
  })

  it('no key is Persian — QF-32 keeps the stored value English', () => {
    const persian = [...known()].filter((k) => /[؀-ۿ]/.test(k))
    expect(persian).toEqual([])
  })
})

describe('label()', () => {
  it('returns the Persian label for a known value', () => {
    expect(label(labels.KIND_LABELS, 'measurement')).toBe('اندازه‌گیری')
  })

  it('throws in development on a value with no label', () => {
    vi.stubEnv('DEV', true)
    expect(() => label(labels.KIND_LABELS, 'workbook')).toThrow(/workbook/)
  })

  it('falls back to the raw value in production', () => {
    vi.stubEnv('DEV', false)
    expect(label(labels.KIND_LABELS, 'workbook')).toBe('workbook')
  })

  it('is null-safe on a value the server did not send', () => {
    vi.stubEnv('DEV', false)
    expect(label(labels.KIND_LABELS, null)).toBe('')
    expect(label(labels.KIND_LABELS, undefined)).toBe('')
  })
})

/**
 * `cellLabel` — the design's `enumFa` (`Inja Panel.dc.html:4693`), which two
 * cards read every open cell through. One check for the whole chain, because
 * the failure it exists to stop is a stored English word reaching a
 * Persian-only screen and it does not matter which of the four maps was meant
 * to catch it.
 */
describe('the Persian for an open cell value', () => {
  it('reads the four maps in the design’s own order', () => {
    // WD_FA, both spellings the store holds
    expect(labels.cellLabel('thu')).toBe('پنجشنبه')
    expect(labels.cellLabel('thursday')).toBe('پنجشنبه')
    // ENUM_FA's dimension half — `F-00017`'s own column
    expect(labels.cellLabel('mass')).toBe('جرم')
    expect(labels.cellLabel('dimensionless')).toBe('بی‌بعد')
    // …its state and category halves, through the maps Appendix D already names
    expect(labels.cellLabel('cooked')).toBe('پخته')
    expect(labels.cellLabel('ingredient')).toBe('مادهٔ اولیه')
    // GROUP_FA
    expect(labels.cellLabel('italian_pizza')).toBe('پیتزا ایتالیایی')
    // …and the design's own fallback: the stored value, never a throw.
    expect(labels.cellLabel('prod_61')).toBe('prod_61')
  })

  it('takes Appendix D’s word where the design and the appendix differ', () => {
    // `place` is «مکان» in the design's `ENUM_FA` (:4690) and «محل نگهداری» in
    // Appendix D's `item.category`. The appendix wins (note 9).
    expect(labels.cellLabel('place')).toBe('محل نگهداری')
    // …and a unit's DIMENSION keeps the design's word, because a measurement's
    // `quantity` is a different enumeration that happens to share four keys.
    expect(labels.cellLabel('duration')).toBe('زمان')
    expect(labels.QUANTITY_LABELS.duration).toBe('مدت')
  })

  it('carries «در غیر این صورت» once, as a reference', () => {
    expect(labels.cellLabel('otherwise')).toBe(labels.SCREEN_LABELS.table_default)
  })
})

describe('the v3 payload vocabulary', () => {
  it('names the three new structures and their two members', () => {
    for (const key of ['applies_to', 'instances', 'imports', 'columns',
                       'params', 'workbook', 'branch']) {
      expect(labels.PAYLOAD_FIELD_LABELS[key]).toMatch(/[؀-ۿ]/)
    }
  })

  it('names every issue kind the v3 engine raises', () => {
    for (const kind of ['hand_maintained_index', 'no_rule_applies',
                        'broken_formula', 'cached_error', 'leading_offset',
                        'unused_mirror', 'unknown_source', 'column_offset',
                        'per_cell_mirror', 'ambiguous_row_header',
                        'binding_gone']) {
      expect(labels.ISSUE_KIND_LABELS[kind]).toMatch(/[؀-ۿ]/)
    }
  })

  it('has no word left for a mirror — QF-48 made it an edge, not a record', () => {
    // The role and the pointer both left the schema. A label for a value no
    // entry can carry is a word waiting to be drawn by mistake.
    expect(labels.ROLE_LABELS_RECORD.mirror).toBeUndefined()
    expect(labels.KIND_SHAPE_LABELS.mirror).toBeUndefined()
    expect(labels.PAYLOAD_FIELD_LABELS.mirror_of).toBeUndefined()
  })
})
