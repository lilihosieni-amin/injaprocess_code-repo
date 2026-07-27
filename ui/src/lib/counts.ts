import type { ProcNode } from '../api/types'

/** What the application means by an activity and a junction.
 *
 *  Deleting a node is a *soft* delete: the node stays in the JSON with
 *  `removed: true` so a later merge can tell «never existed» from «taken out».
 *  Every reader that shows a process to a human drops those nodes —
 *  `flow/adapt` before it builds the canvas, `export/steps/linearize` before it
 *  walks the graph — so any count that keeps them contradicts the picture the
 *  same page draws.
 *
 *  Terminal `start`/`end` nodes are not activities either. No stored process
 *  carries them today, but the schema and the node components both model them,
 *  and «everything that is not a junction» would silently count them.
 *
 *  This module is the single definition: the process list, the flowchart
 *  document's table of contents and its print sheets all call it, so the three
 *  can never drift apart.
 */
export const isLiveActivity = (n: ProcNode): boolean => n.type === 'activity' && !n.removed

export const isLiveJunction = (n: ProcNode): boolean => n.type === 'junction' && !n.removed

export const countActivities = (nodes: ProcNode[]): number => nodes.filter(isLiveActivity).length

export const countJunctions = (nodes: ProcNode[]): number => nodes.filter(isLiveJunction).length
