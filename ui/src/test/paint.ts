/*
 * Test infrastructure, not a component — the same standing as `a11y.ts` beside
 * it. src/test/theme.test.ts's R11 scan excludes this whole directory by name,
 * and guards.test.ts reads it as it reads every non-test file under src/.
 *
 *   marker: zz-only-a-test-file-writes-this
 *
 * NOT ONE UTILITY IS SPELLED WHOLE ANYWHERE IN THIS FILE — no prose, no
 * comment, no error message. Every .ts/.tsx under `./src` is inside a Tailwind
 * CONTENT glob and its scanner does not read a comment differently from code,
 * so a sentence naming a class here would mint that class into the built sheet.
 * This file needs to name none: it takes class strings as arguments.
 *
 * ## What it is
 *
 * jsdom paints nothing. It cannot tell a real utility from a misspelt one — an
 * invented name emits no rule and the build still exits 0, which is this
 * project's signature defect — and it cannot tell which of two utilities
 * setting the same property wins, because that is decided by Tailwind's output
 * order and not by the order of the class attribute.
 *
 * So these helpers run a component's OWN rendered class string through the real
 * `tailwind.config.js` and hand back the declarations that come out.
 *
 * ## Why it lives here
 *
 * Three files had grown byte-identical copies — src/ui/primitives.design.test.tsx,
 * src/ui/table.test.tsx and src/shell/shells.test.tsx — and the second of them
 * asks in a comment for the lift "by Task 12". The two under `src/ui/` are
 * frozen for that task, so they keep their copies for now; this module is the
 * destination, and moving them is one import each for whoever unfreezes them.
 */
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'

/** One emitted rule, split into the class that carries it and the state it applies in. */
export type Painted = { klass: string; state: string; media: string; decls: string }

/**
 * One Tailwind compile per distinct class SET, for the life of the worker.
 *
 * Every call here spins up the JIT over the real config and costs 100-400ms, and
 * the callers repeat themselves heavily — one chrome's class string is asserted
 * by `winner` five or six times and by `declarations` twice more, each of which
 * used to be its own compile. Measured: the panel chrome's slowest assertion ran
 * 804ms alone and timed out at 5s under whole-suite contention once a second
 * shell's worth of these landed in the same file.
 *
 * Safe because the input is a string and the output is read-only in every
 * caller: `winner` and `declarations` below only walk it, and nothing in the
 * suite mutates a `Painted`. The key is the SET, not the raw string, so two
 * spellings of the same classes share one compile — which is also the reason the
 * set is computed before the cache is consulted rather than after.
 */
const COMPILED = new Map<string, Promise<Painted[]>>()

/** Compile a class string through the real `tailwind.config.js`. */
export function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))].sort()
  const key = classes.join(' ')
  const hit = COMPILED.get(key)
  if (hit !== undefined) return hit
  const run = compile(classes)
  COMPILED.set(key, run)
  return run
}

async function compile(classes: string[]): Promise<Painted[]> {
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const out: Painted[] = []
  result.root.walkRules((rule) => {
    // A selector that sets nothing is the failure this module exists to catch.
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    for (const sel of rule.selectors) {
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      out.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return out
}

/**
 * The winning value of `prop` for an element wearing these classes, in `state`
 * and at `media` — the LAST declaration in emitted order, which is how the
 * cascade resolves two utilities that set the same property. Returns `''` when
 * nothing sets it, so a missing declaration and an invented class fail alike.
 */
export function winner(painted: Painted[], prop: string, state = '', media = ''): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== state || p.media !== media) continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

/**
 * **Every property this class string sets in `state`/`media`, WITH the value it
 * settles on** — `new Set(['<property>: <value>', …])`, ready for `toEqual`
 * against a written-out set.
 *
 * The point is the value half. The first spelling of this guard collected the
 * property NAMES alone, which made it a check that nobody had added a
 * declaration nor removed one — and every swap that keeps the property and
 * changes what it is set to walked straight through it. A reviewer's mutation
 * survey found two of that shape in the panel chrome alone: an alignment
 * flipped from centre to start, and a box changed from block-level flex to
 * inline flex, the second of which shrinks a full-width bar to the width of its
 * own buttons and takes the hairline under it along. Both were invisible here
 * AND invisible to Playwright, because no assertion there measured the bar's
 * own box.
 *
 * Values are read through `winner`, so a property two utilities both set is
 * reported once, at the value the cascade actually lands on.
 */
export function declarations(painted: Painted[], state = '', media = ''): Set<string> {
  const props = new Set<string>()
  for (const p of painted) {
    if (p.state !== state || p.media !== media) continue
    for (const d of p.decls.split('; ')) props.add(d.split(': ')[0])
  }
  return new Set([...props].map((prop) => `${prop}: ${winner(painted, prop, state, media)}`))
}
