import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRINT } from './bands'
import { A4_LANE_W } from '../../src/flow/A4Lane'

const HERE = dirname(fileURLToPath(import.meta.url))
/** `engine/layout` — the other half of this number, and a different language, so
 *  it is read rather than imported. Same technique `page-box.test.ts` uses to hold
 *  `bands.ts` against the stylesheet it derives its page box from. */
const LAYOUT_PY = readFileSync(join(HERE, '../../../engine/layout/__init__.py'), 'utf8')

/** An activity card's painted width, `src/flow/nodes/ActivityNode.tsx`. The engine
 *  keeps its own copy in `_SIZES` and the test below holds the two together. */
const CARD_W = 170

function pyConst(name: string): number {
  // Two declaration forms in that file, and both are matched so the parse cannot
  // silently miss one and leave the assertion comparing against a default:
  // `SX, SY = 40, 90` / `GX, GY = 260, 175` are tuple assignments, `MAX_COLS = 5`
  // is plain. Neither pattern is anchored at the line end — every one of them
  // carries a trailing comment.
  for (const m of LAYOUT_PY.matchAll(/^(\w+), (\w+) = (-?\d+), (-?\d+)/gm)) {
    if (m[1] === name) return Number(m[3])
    if (m[2] === name) return Number(m[4])
  }
  const single = LAYOUT_PY.match(new RegExp(`^${name}\\s*=\\s*(-?\\d+)`, 'm'))
  expect(single, `engine/layout declares ${name}`).not.toBeNull()
  return Number(single![1])
}

/**
 * **The editor's lane and the layout engine's wrap point are one number.**
 *
 * Owner ruling: *"make more width for it. still 5 nodes can be in one line."*
 * Rather than pick a width that holds five cards, the lane takes the engine's
 * own: `engine/layout` places columns at `SX` on a `GX` pitch and wraps after
 * `MAX_COLS`, so the band it produces is exactly this wide. A guide narrower than
 * the engine's wrap point marks every automatically laid-out diagram as
 * overflowing, which is what it did before this.
 */
describe('the A4 lane the editor is shown', () => {
  it('is exactly the engine’s five-column band, so auto-layout fits it', () => {
    const sx = pyConst('SX')
    const gx = pyConst('GX')
    const cols = pyConst('MAX_COLS')
    expect(A4_LANE_W).toBe(sx + (cols - 1) * gx + CARD_W)
  })

  it('holds the five activity cards in a line the owner asked for', () => {
    // Owner ruling: *"still 5 nodes can be in one line."* A card is `w-[170px]`
    // (`nodes/ActivityNode.tsx`), so this is that sentence as arithmetic, checked
    // independently of the engine in case the engine is ever retuned narrower.
    expect(A4_LANE_W).toBeGreaterThanOrEqual(5 * CARD_W)
    // The engine agrees about how wide a card is; if it stops agreeing, the
    // identity above is comparing two different pictures of the same node.
    expect(LAYOUT_PY).toMatch(/"activity":\s*\((\d+),/)
    expect(Number(LAYOUT_PY.match(/"activity":\s*\((\d+),/)![1])).toBe(CARD_W)
  })

  it('is a width a portrait A4 page can still print without hitting the floor', () => {
    // The lane is NOT a 1:1 print width and cannot be at five cards — the export
    // prints portrait A4, whose content box is `PRINT.W`. What has to hold is that
    // a lane-wide diagram is drawn by `planBands` at `min(1, PRINT.W / width)`
    // without falling to the band-rather-than-shrink floor, or every full-width
    // diagram would start splitting across pages.
    const scale = PRINT.W / A4_LANE_W
    expect(scale).toBeLessThan(1)
    expect(scale).toBeGreaterThan(PRINT.MINSC)
    // A vacuity guard: a lane so wide the scale merely cleared the floor would
    // still print an unreadable diagram. This is the scale engine-laid-out
    // diagrams already print at today, so the lane changed no PDF.
    expect(scale).toBeGreaterThan(0.5)
  })
})
