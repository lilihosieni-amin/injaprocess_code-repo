import { ViewportPortal, useNodes } from '@xyflow/react'

/**
 * **How wide a flowchart may be and still print at 1:1 on A4.**
 *
 * The export prints portrait A4 through headless Chromium, and
 * `ui/export/print/bands.ts` derives the usable page box from the `@page`
 * margins `print.css` actually declares: 210mm less 2×13mm is ≈695 CSS px, kept
 * ~3% under as `PRINT.W = 675`. `PrintDiagrams` then pads the diagram's bounding
 * box by `PRINT.PAD = 20` on each side before asking `planBands` to fit it, and
 * `planBands`' first move is `scW = min(1, PRINT.W / width)`.
 *
 * So the whole of it is: a diagram whose painted bounding box is **635 flow px
 * or narrower** prints at full size, and one pixel wider starts shrinking. That
 * is the number this lane draws, and it is the same number in both places
 * because `export/print/a4-lane.test.ts` re-derives it from `PRINT` and fails if
 * either side moves.
 *
 * **Not imported from `export/print/bands.ts`, deliberately.** `ui/export/**` is
 * the standalone printed document; it imports from `src/` and never the other
 * way, which is the layering that let `linearize` move INTO `src/lib` rather
 * than the app reach out. A constant with a test tying it to its source keeps
 * that direction and makes drift impossible, which is what the import would have
 * bought.
 */
export const A4_CONTENT_W = 635

/** What the lane leaves above and below the diagram, so it reads as a lane and
 *  not as a box drawn tightly round the nodes. The printer's own `PRINT.PAD`. */
const PAD = 20

/** A lane with nothing in it still has to be visible, or an editor laying out
 *  their first node sees no guide at the moment it would help most. */
const MIN_H = 420

/**
 * **The A4 width, drawn on the canvas while it is being edited** — owner ruling:
 * *"in export pdf, the flowchart should be in A4 page.so in edit flowchart page
 * i want to show the width of A4 to editor see and try to input nodes in A4
 * width.it just show in editor of flowchrt.in edit mode.not read mode."*
 *
 * Anchored to the diagram's own left edge rather than to flow `x = 0`, because
 * that is what the printer measures: `PrintDiagrams` takes `geomBounds(g).minX`
 * and pads from there, so what decides whether the print shrinks is the
 * bounding box's WIDTH and never where on the canvas it sits. A lane pinned to
 * the origin would go green for a diagram laid out at x=−300 and red for the
 * same diagram at x=+300.
 *
 * **Inside `ViewportPortal`**, so it is in flow coordinates: it pans and zooms
 * with the nodes, and 635 on screen is 635 to the printer at every zoom level.
 * `pointer-events: none` and `z-index: 0` keep it under every node and out of
 * the way of a drag — it is a ruler, not a control.
 *
 * **Edge labels are not in this measurement and are in the printer's.**
 * `geomBounds` folds in each label's box; React Flow's node store does not carry
 * them, so a diagram whose widest thing is a long edge label sits a little wider
 * than this lane admits. The lane is therefore slightly optimistic at its right
 * edge, never pessimistic — it will not tell an editor to shrink a diagram that
 * would have printed. Reported rather than approximated with a guess at label
 * widths.
 */
export function A4Lane() {
  const nodes = useNodes()
  if (nodes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    // `measured` is what the store knows the node's painted box to be; a node
    // that has not been measured yet contributes its position alone, which is
    // right — a zero-width contribution can only make the lane read narrower,
    // and the frame after it the real box arrives.
    const w = n.measured?.width ?? 0
    const h = n.measured?.height ?? 0
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  if (!Number.isFinite(minX)) return null

  const over = maxX - minX > A4_CONTENT_W
  const height = Math.max(maxY - minY + 2 * PAD, MIN_H)

  return (
    <ViewportPortal>
      <div
        data-a4-lane
        data-over={over ? 'true' : 'false'}
        aria-hidden
        style={{
          position: 'absolute',
          transform: `translate(${minX}px, ${minY - PAD}px)`,
          width: A4_CONTENT_W,
          height,
          pointerEvents: 'none',
          zIndex: 0,
        }}
        // Dashed, because a solid rule at this weight reads as content — an
        // edge somebody drew — and this is furniture. The tone is the whole
        // signal: violet while the diagram fits, coral once it does not, which
        // is the moment the ruling exists for and the one a same-coloured lane
        // would let an editor scroll straight past.
        //
        // Two edges and no fill. A tint was drawn first and removed after
        // looking at it: Tailwind 3 cannot apply an opacity modifier to a
        // `var()` colour — `bg-tile-v2/40` compiles to nothing — and at full
        // strength any of these tints is a wash over the diagram, which is the
        // one thing on this screen that has to stay readable.
        className={`border-x-2 border-dashed ${over ? 'border-coral' : 'border-line-dashed'}`}
      >
        <span
          className={
            'absolute -top-6 right-0 whitespace-nowrap rounded px-2 py-0.5 '
            + 'text-[11px] font-bold '
            + (over ? 'bg-coral text-white' : 'bg-tile-v2 text-violet')
          }
        >
          {over ? 'پهن‌تر از عرض A4 — در خروجی کوچک می‌شود' : 'عرض چاپ A4'}
        </span>
      </div>
    </ViewportPortal>
  )
}
