import { describe, it, expect } from 'vitest'
import { PRINT } from './bands'
import { A4_CONTENT_W } from '../../src/flow/A4Lane'

/**
 * **The editor's ruler and the printer's page box are one number.**
 *
 * Owner ruling: *"in export pdf, the flowchart should be in A4 page.so in edit
 * flowchart page i want to show the width of A4 to editor see and try to input
 * nodes in A4 width."* A guide that says «this is A4» and is not A4 is worse
 * than no guide — it teaches an editor to lay out to the wrong width and the
 * mistake only surfaces in a PDF somebody has already sent.
 *
 * `src/flow/A4Lane.tsx` holds the constant rather than importing `PRINT`,
 * because `ui/export/**` is the standalone printed document and imports from
 * `src/` and never the other way — the layering that made `linearize` move INTO
 * `src/lib` rather than let the app reach out. This test is what the import
 * would have bought: it lives on the export side, where reaching into `src/` is
 * the normal direction, and it fails the moment either side moves.
 */
describe('the A4 lane the editor is shown', () => {
  it('is exactly the width a diagram may be and still print at 1:1', () => {
    // `PrintDiagrams` pads the painted bounding box by `PRINT.PAD` on each side
    // and hands the total to `planBands`, whose first move is
    // `scW = min(1, PRINT.W / width)`. So `width <= PRINT.W` is "no shrink", and
    // the bounding box that survives it is `PRINT.W - 2 * PRINT.PAD`.
    expect(A4_CONTENT_W).toBe(PRINT.W - 2 * PRINT.PAD)
  })

  it('is a width a real flowchart can work in, not a degenerate one', () => {
    // A vacuity guard on the arithmetic above: were `PRINT.PAD` ever raised past
    // half the page, the identity would still hold and the lane would be a
    // sliver. An activity node is 170px wide (`nodes/ActivityNode.tsx`), so a
    // lane worth drawing holds at least two of them side by side.
    expect(A4_CONTENT_W).toBeGreaterThan(2 * 170)
    expect(A4_CONTENT_W).toBeLessThan(PRINT.W)
  })
})
