import { describe, it, expect } from 'vitest'
import { freeCuts, maxChunk, bandSplit, planBands, PRINT } from './bands'

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
})
