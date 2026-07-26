import type { ExportPayload } from '../shared/payload'

/** Every activity, junction and terminal of every process must appear in some
 *  band. Persian glyph metrics decide how node labels wrap, which decides box
 *  heights, which decides where a cut is legal — so a build that ran before the
 *  webfont landed can be quietly wrong. This is the check that catches it.
 *
 *  "Every node" means every node the diagram actually draws. Deleting a node is
 *  a *soft* delete (`removed: true`, see `src/lib/counts`), and `flow/adapt`
 *  drops those before the flow is ever mounted — so a removed node can never
 *  appear in a band. Counting them here would pin this to `false` forever on
 *  every department that has ever deleted a node (today: cashier and dining),
 *  turning "retry while incomplete" into "always retry" and making the invariant
 *  signal nothing. A process with no live node at all draws no diagram by
 *  design, and is complete the moment it has nothing left to be missing. */
export function diagramsComplete(payload: ExportPayload): boolean {
  return payload.processes.every((p) => {
    const live = p.nodes.filter((n) => !n.removed)
    if (!live.length) return true
    const slot = document.querySelector(`[data-pf="${CSS.escape(p.id)}"]`)
    if (!slot?.querySelector('svg')) return false
    const have = new Set([...slot.querySelectorAll('[data-id]')].map((el) => el.getAttribute('data-id')))
    return live.every((n) => have.has(n.id))
  })
}
