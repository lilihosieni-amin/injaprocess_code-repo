export type Span = [number, number]

/** Page budget in CSS px for a **portrait** page, taken as the smaller of A4 and
 *  Letter in each direction so one build prints correctly on both.
 *
 *  The usable box is the `@page` margin box and nothing else: `print.css`
 *  declares `margin: 8mm 13mm`, and `document.module.css` puts both `.doc` and
 *  `.sheet` at `padding:0` under `@media print`, so no container takes a further
 *  bite. At 96dpi 1mm = 96/25.4 ≈ 3.7795px, so the side margins cost 2×13mm =
 *  98.3px and the vertical ones 2×8mm = 60.5px.
 *
 *    width   A4 portrait is the narrower sheet — 210mm = 793.7px,
 *            less 98.3px  ≈ 695.4px usable   (measured in Chrome 150: 697px)
 *    height  Letter portrait is the shorter sheet — 11in = 1056px,
 *            less 60.5px  ≈ 995.5px usable   (measured in Chrome 150: 996px —
 *            a 996px block prints on one page, 997px spills onto a second)
 *
 *  Both are then kept ~3% under the true figure so a band never lands a hair
 *  over the page: 675 of 695, 965 of 995. `page-box.test.ts` re-derives both
 *  from the margins the stylesheet actually declares.
 *
 *  Portrait is what the reader asked for. It costs width — 675px against the
 *  930px a landscape sheet gave — and the width constraint always wins over
 *  `MINSC` (content off the page edge is worse than a small diagram), so a wide
 *  diagram is now drawn smaller rather than overflowing. It buys height: 965px
 *  against 620px, which is what keeps the page count from rising with it. */
export const PRINT = {
  W: 675,
  H: 965,
  PAD: 20,       // breathing room around the diagram
  HEADGAP: 16,   // .pf-wrap margin-top in print, plus a little slack
  GAP: 6,        // clearance kept above a cut
  MINSC: 0.34,   // never shrink below this; band instead
}

/** Every y where nothing is painted — the only places a page break may fall.
 *  `blocks` is [top, bottom] for each node box and each edge label. */
export function freeCuts(blocks: Span[], top: number, bottom: number): Span[] {
  const sorted = [...blocks].sort((a, b) => a[0] - b[0])
  const cuts: Span[] = []
  let cover = top
  sorted.forEach((b) => {
    if (b[0] > cover + 2 * PRINT.GAP) cuts.push([cover + PRINT.GAP, b[0] - PRINT.GAP])
    cover = Math.max(cover, b[1])
  })
  if (bottom > cover + 2 * PRINT.GAP) cuts.push([cover + PRINT.GAP, bottom - PRINT.GAP])
  return cuts
}

/** Tallest run with no legal break inside it. No scale can put more than this
 *  on one page, so it bounds how large the diagram may be drawn. */
export function maxChunk(top: number, bottom: number, cuts: Span[]): number {
  if (!cuts.length) return bottom - top
  let m = cuts[0][1] - top
  for (let i = 0; i < cuts.length - 1; i++) m = Math.max(m, cuts[i + 1][1] - cuts[i][0])
  return Math.max(m, bottom - cuts[cuts.length - 1][0])
}

/** Slice [top, bottom] into bands no taller than each band's budget, breaking
 *  only inside a free gap so no node or label is ever cut in half. Returns null
 *  when a band cannot be closed — the caller then scales down and retries.
 *
 *  **Precondition:** `cuts` must be sorted ascending by start and non-overlapping,
 *  as `freeCuts` returns them. The scan stops at the first gap starting past the
 *  budget limit, so an unsorted or overlapping list can hide a legal cut and make
 *  this return null where the sorted equivalent succeeds — a wrong answer, not an
 *  error. The result always covers the whole of [top, bottom] or is null; a
 *  partial split is never returned.
 */
export function bandSplit(top: number, bottom: number, cuts: Span[], budgetFor: (i: number) => number): Span[] | null {
  const bands: Span[] = []
  let start = top
  let guard = 0
  while (start < bottom - 0.5) {
    // pathological input (a cut every few px under a tiny budget) would inch
    // along forever; bail with the failure signal rather than a partial list
    if (guard++ >= 200) return null
    const limit = start + budgetFor(bands.length)
    if (limit >= bottom - 0.5) { bands.push([start, bottom]); return bands }
    // `-Infinity`, not `-1`: this is the "no legal cut found" sentinel, and a
    // diagram's coordinates are not guaranteed positive — `emit()` takes them
    // from React Flow's `positionAbsolute`, and the live cashier-030 already
    // starts at y ≈ -36. With `-1` the guard below reads `-1 > start + 20`,
    // which is *true* for any band starting under -21, so the sentinel was
    // accepted as a cut and the band was closed at y = -1: a boundary chosen
    // without reference to any gap, and therefore free to fall through a node.
    // No real diagram has reached it (every process in dining and cashier finds
    // a legal cut first), but nothing stopped it. A sentinel that cannot be
    // mistaken for a coordinate closes the hole; on every input where a cut does
    // exist, or where the band starts at or above -21, the result is unchanged.
    let cut = -Infinity
    for (const [a, b] of cuts) {
      if (a > limit) break
      if (b > start + 20) cut = Math.max(cut, Math.min(b, limit))
    }
    if (cut <= start + 20) return null
    bands.push([start, cut])
    start = cut
  }
  // the loop never ran: [top, bottom] is degenerate, so one degenerate band
  return bands.length ? bands : [[top, bottom]]
}

/** How one diagram should be drawn: at what scale, sliced where, on whose page. */
export interface BandPlan {
  /** uniform factor the diagram is drawn at; never above 1, never so large that
   *  `scale * width` exceeds `PRINT.W` */
  scale: number
  /** the y-ranges to emit, in order, covering the whole of [top, bottom] */
  bands: Span[]
  /** true when the diagram needs a page to itself rather than sharing the
   *  page that carries its heading */
  ownPage: boolean
}

/** Choose a scale and a band split for one diagram.
 *
 *  Prefer the whole diagram on the heading page when that costs little size;
 *  otherwise keep it at full page width and break it across pages instead — a
 *  readable diagram over two pages beats a complete but tiny one.
 */
export function planBands(top: number, bottom: number, width: number, cuts: Span[], headHeight: number): BandPlan {
  const H = bottom - top
  const firstH = Math.max(220, PRINT.H - headHeight)
  const scW = Math.min(1, PRINT.W / width)
  const scOne = Math.min(scW, firstH / H)

  if (scOne >= scW * 0.8) return { scale: scOne, bands: [[top, bottom]], ownPage: false }

  // MINSC is a *height* policy — "band rather than shrink further" — so the
  // floor is applied to the height-derived scale only, and the width constraint
  // is taken last. Ordering these the other way lets the floor raise the scale
  // back above scW on a very wide diagram, printing content off the page edge.
  const scale = Math.min(scW, Math.max(PRINT.MINSC, PRINT.H / maxChunk(top, bottom, cuts)))
  let bands = bandSplit(top, bottom, cuts, (k) => (k === 0 ? firstH : PRINT.H) / scale)
  if (bands) return { scale, bands, ownPage: false }

  // the first unbreakable run is taller than the heading page allows —
  // give the diagram a fresh page, which buys a much larger drawing
  bands = bandSplit(top, bottom, cuts, () => PRINT.H / scale)
  if (bands) return { scale, bands, ownPage: true }

  return { scale: scOne, bands: [[top, bottom]], ownPage: false }
}
