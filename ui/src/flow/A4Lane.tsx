import { ViewportPortal, useNodes } from '@xyflow/react'

/**
 * **How wide a flowchart may be laid out, drawn on the canvas while editing.**
 *
 * This is `engine/layout`'s own five-column band, to the pixel: it places columns
 * at `SX = 40` on a `GX = 260` pitch and wraps after `MAX_COLS = 5`, and an
 * activity card is `w-[170px]`, so the fifth column's right edge is
 * `40 + 4*260 + 170 = 1250`. `export/print/a4-lane.test.ts` re-derives that from
 * the engine file and fails if either side moves.
 *
 * **Five cards in a line** — owner ruling: *"make more width for it. still 5
 * nodes can be in one line."* Taking the number from the layout engine rather
 * than choosing one means the guide and the automatic layout finally agree: a
 * diagram the engine laid out fills the lane exactly instead of overflowing a
 * guide that was narrower than the engine's own wrap point.
 *
 * ## What it promises, and what it does not
 *
 * It is **not** a 1:1 print width, and it never could be at five cards. The
 * export prints portrait A4 — unchanged, and deliberately so — whose content box
 * is `PRINT.W = 675`, so a lane-wide diagram is drawn at `675/1250 ≈ 0.54` by
 * `planBands`. That is exactly the scale today's engine-laid-out diagrams already
 * print at, so nothing about the PDF changes because of this lane; it only stops
 * describing the page wrongly. What it promises is that a diagram inside it is one
 * page wide, which is what the original ruling asked for.
 *
 * `a4-lane.test.ts` pins the scale above `PRINT.MINSC`, so a future widening
 * cannot quietly push diagrams onto the band-rather-than-shrink floor.
 */
export const A4_LANE_W = 1250

/** What the lane leaves below the deepest node, so the rails read as a lane and
 *  not as a box drawn tight against the content. The printer's own `PRINT.PAD`. */
const PAD = 20

/** A lane with nothing in it still has to be visible, or an editor placing their
 *  first node sees no guide at the moment it would help most. */
const MIN_H = 420

/**
 * **The lane does not move** — owner ruling: *"in edit mode when i in حالت انتخاب
 * mouse, the A4 line can be move.but i don't want it.it's location should be
 * fix."*
 *
 * It used to anchor to the nodes' own bounding box, which meant dragging any node
 * left dragged the lane left with it: the ruler moved with the thing it was
 * measuring, so it could never be overrun and told the editor nothing. It is now
 * pinned to the flow origin — `x = 0`, the same origin `engine/layout` measures
 * its `SX` from — and only its height follows the content, downward, so the rails
 * stay where they were put while a diagram grows.
 *
 * **Inside `ViewportPortal`**, so it is in flow coordinates: it pans and zooms
 * with the nodes, and 1250 stays 1250 in the coordinates the layout is written
 * in at every zoom level. `pointer-events: none` and `z-index: 0` keep it under
 * every node and out of the way of a drag or a selection box — it is a ruler,
 * not a control, and cannot itself be picked up.
 */
export function A4Lane() {
  const nodes = useNodes()
  if (nodes.length === 0) return null

  // Only what the lane's height and its overrun test need. The left edge is no
  // longer measured at all — that was the bug.
  let maxX = -Infinity
  let minX = Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    // `measured` is what the store knows the node's painted box to be; a node not
    // yet measured contributes its position alone, which is right — a zero-width
    // contribution can only read as further inside the lane, and the frame after
    // it the real box arrives.
    const w = n.measured?.width ?? 0
    const h = n.measured?.height ?? 0
    minX = Math.min(minX, n.position.x)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  if (!Number.isFinite(maxX)) return null

  // Overrun is now an absolute question rather than a relative one, which is the
  // point of pinning the lane: a node past the right rail, or dragged out to the
  // left of the origin, is outside the page either way.
  const over = maxX > A4_LANE_W || minX < 0
  const height = Math.max(maxY + PAD, MIN_H)

  return (
    <ViewportPortal>
      <div
        data-a4-lane
        data-over={over ? 'true' : 'false'}
        aria-hidden
        style={{
          position: 'absolute',
          transform: 'translate(0px, 0px)',
          width: A4_LANE_W,
          height,
          pointerEvents: 'none',
          zIndex: 0,
        }}
        // Dashed, because a solid rule at this weight reads as content — an edge
        // somebody drew — and this is furniture. The tone is the whole signal:
        // violet while the diagram is inside, coral once it is not, which is the
        // moment the ruling exists for and the one a same-coloured lane would let
        // an editor scroll straight past.
        //
        // Two edges and no fill. A tint was drawn first and removed after looking
        // at it: Tailwind 3 cannot apply an opacity modifier to a `var()` colour —
        // `bg-tile-v2/40` compiles to nothing — and at full strength any of these
        // tints is a wash over the diagram, which is the one thing on this screen
        // that has to stay readable.
        className={`border-x-2 border-dashed ${over ? 'border-coral' : 'border-line-dashed'}`}
      >
        <span
          className={
            'absolute -top-6 right-0 whitespace-nowrap rounded px-2 py-0.5 '
            + 'text-[11px] font-bold '
            + (over ? 'bg-coral text-white' : 'bg-tile-v2 text-violet')
          }
        >
          {over ? 'بیرون از عرض صفحهٔ A4' : 'عرض صفحهٔ A4'}
        </span>
      </div>
    </ViewportPortal>
  )
}
