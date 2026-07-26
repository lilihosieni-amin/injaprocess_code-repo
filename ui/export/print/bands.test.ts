import { describe, it, expect } from 'vitest'
import { freeCuts, maxChunk, bandSplit, planBands, PRINT } from './bands'
import type { Span } from './bands'

describe('freeCuts', () => {
  it('reports the empty gaps between painted blocks', () => {
    const cuts = freeCuts([[0, 100], [400, 500]], 0, 600)
    expect(cuts).toEqual([[106, 394], [506, 594]])
  })

  it('ignores gaps too small to cut in', () => {
    expect(freeCuts([[0, 100], [105, 200]], 0, 200)).toEqual([])
  })

  it('handles overlapping blocks by tracking the furthest cover', () => {
    expect(freeCuts([[0, 300], [50, 100]], 0, 400)).toEqual([[306, 394]])
  })
})

describe('maxChunk', () => {
  it('is the whole diagram when nothing can be cut', () => {
    expect(maxChunk(0, 500, [])).toBe(500)
  })

  it('is the tallest unbreakable run between cuts', () => {
    // cuts at 100–150 and 400–430 → runs are 0–150, 100–430, 400–500
    expect(maxChunk(0, 500, [[100, 150], [400, 430]])).toBe(330)
  })

  it('spans either side of a single cut, where the loop body never runs', () => {
    // one cut at 100–150 → runs are 0–150 (150) and 100–500 (400)
    expect(maxChunk(0, 500, [[100, 150]])).toBe(400)
  })
})

describe('bandSplit', () => {
  it('returns one band when the budget covers everything', () => {
    expect(bandSplit(0, 300, [[100, 150]], () => 1000)).toEqual([[0, 300]])
  })

  it('cuts inside a gap, never through a block', () => {
    const bands = bandSplit(0, 600, [[190, 250], [420, 470]], () => 300)
    expect(bands).toEqual([[0, 250], [250, 470], [470, 600]])
  })

  it('gives the first band its own smaller budget', () => {
    const bands = bandSplit(0, 600, [[90, 140], [380, 430]], (i) => (i === 0 ? 150 : 400))
    expect(bands![0]).toEqual([0, 140])
  })

  it('returns null when no legal cut exists under the budget', () => {
    expect(bandSplit(0, 600, [], () => 200)).toBeNull()
  })

  it('returns one degenerate band for a zero-height range', () => {
    expect(bandSplit(100, 100, [], () => 500)).toEqual([[100, 100]])
  })

  it('signals failure when the guard trips before the range is covered', () => {
    // a cut every 60px under a 70px budget advances ~60px per band, so 200
    // bands reach only ~12000 of 20000 — a partial list would be a lie
    const cuts: Span[] = []
    for (let y = 40; y < 20000; y += 60) cuts.push([y, y + 15])
    expect(bandSplit(0, 20000, cuts, () => 70)).toBeNull()
  })
})

describe('planBands', () => {
  it('keeps a small diagram whole on the heading page', () => {
    const plan = planBands(0, 300, 600, [], 130)
    expect(plan.bands).toEqual([[0, 300]])
    expect(plan.ownPage).toBe(false)
    expect(plan.scale).toBeCloseTo(1, 5)
  })

  it('never scales above 1 — a small diagram is not blown up', () => {
    expect(planBands(0, 100, 200, [], 130).scale).toBe(1)
  })

  it('scales a wide diagram down to the page width', () => {
    expect(planBands(0, 200, 1860, [], 130).scale).toBeCloseTo(PRINT.W / 1860, 5)
  })

  it('bands a tall diagram rather than shrinking it below the floor', () => {
    const cuts = freeCuts([[0, 400], [500, 900], [1000, 1400]], 0, 1400)
    const plan = planBands(0, 1400, 600, cuts, 130)
    expect(plan.bands.length).toBeGreaterThan(1)
    expect(plan.scale).toBeGreaterThanOrEqual(PRINT.MINSC)
  })

  it('gives the diagram its own page when the first run will not fit under the heading', () => {
    // one unbreakable run taller than the room left beside a tall heading
    const plan = planBands(0, 1200, 600, [[600, 700]], 400)
    expect(plan.ownPage).toBe(true)
  })

  // --- the MINSC floor: a height policy that must never beat the width constraint

  it('stops shrinking at the MINSC floor and bands instead', () => {
    // one unbreakable run of 2000px (1300 → 3300). PRINT.H / 2000 = 0.31 is
    // below the floor, and the width scale is 1, so the floor alone decides.
    const cuts: Span[] = [[1300, 1500], [2900, 3300]]
    expect(maxChunk(0, 4000, cuts)).toBe(2000)
    expect(PRINT.H / 2000).toBeLessThan(PRINT.MINSC)

    const plan = planBands(0, 4000, 600, cuts, 130)
    expect(plan.scale).toBe(PRINT.MINSC)
    expect(plan.scale).toBeGreaterThan(PRINT.H / 2000) // the floor is what bit
    expect(plan.bands.length).toBeGreaterThan(1)
    // and at this floor the first run still fits under the heading, so the
    // diagram shares its heading's page — a higher floor would forfeit that
    expect(plan.ownPage).toBe(false)
  })

  it('never draws wider than the page, even when the width scale is under MINSC', () => {
    // 4000px wide → scW = 0.2325, below MINSC. The height floor must not raise
    // the scale back above it, or the drawing runs off the page edge.
    const cuts: Span[] = [[1300, 1500], [2000, 2200]]
    const plan = planBands(0, 3000, 4000, cuts, 130)
    expect(plan.scale).toBeCloseTo(PRINT.W / 4000, 10)
    expect(plan.scale * 4000).toBeLessThanOrEqual(PRINT.W + 1e-9)
  })

  it('keeps the drawn width inside the page budget at every width', () => {
    const cuts: Span[] = [[1300, 1500], [2000, 2200]]
    for (const width of [1, 200, 600, 930, 1290, 2735, 3000, 4000, 8000]) {
      const plan = planBands(0, 3000, width, cuts, 130)
      expect(plan.scale * width).toBeLessThanOrEqual(PRINT.W + 1e-9)
    }
  })

  // --- the one-page threshold, pinned either side

  it('bands when one page costs just more than the threshold allows', () => {
    // firstH 490 / H 620 = 0.7903 of scW = 1 — just under the 0.8 tipping point
    const plan = planBands(0, 620, 600, [[300, 340]], 130)
    expect(plan.bands.length).toBeGreaterThan(1)
    expect(plan.ownPage).toBe(false)
  })

  it('keeps one page when it costs just less than the threshold allows', () => {
    // firstH 490 / H 605 = 0.8099 of scW = 1 — just over the 0.8 tipping point
    const plan = planBands(0, 605, 600, [[300, 340]], 130)
    expect(plan.bands).toEqual([[0, 605]])
    expect(plan.ownPage).toBe(false)
    expect(plan.scale).toBeCloseTo(490 / 605, 10)
  })

  // --- degenerate inputs

  it('falls back to a single whole-diagram band when nothing can legally be cut', () => {
    // taller than any page, but not one legal break point anywhere
    const plan = planBands(0, 4000, 600, [], 130)
    expect(plan.bands).toEqual([[0, 4000]])
    expect(plan.ownPage).toBe(false)
    expect(plan.scale).toBeCloseTo(490 / 4000, 10)
  })

  it('handles a zero-height diagram', () => {
    const plan = planBands(100, 100, 600, [], 130)
    expect(plan.bands).toEqual([[100, 100]])
    expect(plan.ownPage).toBe(false)
    expect(plan.scale).toBe(1)
  })
})
