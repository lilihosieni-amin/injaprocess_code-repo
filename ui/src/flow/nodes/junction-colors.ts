import type { JunctionNode } from '../../api/types'

/** The one definition of the junction palette.
 *
 *  Both readers live off this map: `JunctionNode` paints the diamonds with it and
 *  `JunctionLegend` paints the key with it — on the live flow page and inside an
 *  exported document alike. Recolouring a junction is a one-line change here, and
 *  nothing anywhere else is allowed to spell these colours out again.
 */
export const JUNCTION_COLOR: Record<JunctionNode['junctionType'], string> = {
  XOR: '#FA5A52', AND: '#4A25A9', OR: '#E8A33D',
}
