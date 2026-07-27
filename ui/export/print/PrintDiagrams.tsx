import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  ReactFlow, ReactFlowProvider, useNodesInitialized, useStoreApi, getBezierPath,
} from '@xyflow/react'
import { ActivityNode } from '../../src/flow/nodes/ActivityNode'
import { StartNode } from '../../src/flow/nodes/StartNode'
import { EndNode } from '../../src/flow/nodes/EndNode'
import { JunctionNode } from '../../src/flow/nodes/JunctionNode'
import { toFlowNodes, toFlowEdges } from '../../src/flow/adapt'
import { getEdgeParams, type Geom } from '../../src/flow/edges/floating'
import { freeCuts, planBands, PRINT } from './bands'
import { bandSvg, geomBlocks, geomBounds, type DiagramGeom, type EdgeGeom, type NodeBox } from './geometry'
import type { ExportPayload } from '../shared/payload'
import type { Process } from '../../src/api/types'

const nodeTypes = { activity: ActivityNode, start: StartNode, end: EndNode, junction: JunctionNode }

/** Height in CSS px of a process sheet's heading block on paper — the title
 *  row, the id strip and the meta row, from the top of the sheet down to the
 *  top of `.pf-wrap`'s margin.
 *
 *  **Derived from the print stylesheet, not measured.** It cannot be measured:
 *  the block lives inside `ProcessSheets`' `.view.print-only` container, which
 *  is `display:none` on screen, and `emit()` only ever runs on screen — a rect
 *  taken there is all zeroes, which is exactly the bug this replaced (a
 *  `getBoundingClientRect().height` that was always 0 and made this constant a
 *  constant while looking like a measurement).
 *
 *  Every number below is declared in a stylesheet, and `head-height.test.ts`
 *  re-derives this sum from those declarations so the two cannot drift:
 *
 *    18   × 1.75  = 31.5    title row   `.view.print-only .sheet-head h2` at
 *                                       18px, leading 1.75 from `.doc-root`
 *      +   8      =  8      `.sheet-head{margin-bottom:8px}`
 *    11.5 × 1.75
 *         + 2 × 3 = 26.125  id strip    `.id-badge` 11.5px + 3px padding
 *      +  max(6,8)=  8      `.proc-num-strip{margin-bottom:6px}` collapsing
 *                           against `.proc-meta{margin-top:8px}` (print values)
 *    12   × 1.75  = 21      meta row    `.pm` at 12px
 *                  ───────
 *                   94.625
 *
 *  `.pf-wrap`'s own printed `margin-top:14px` is deliberately *not* included:
 *  `PRINT.HEADGAP` already stands for it plus a little slack.
 *
 *  Assumes the title fits on one line, as every stored process name does at
 *  ~950px of print width. A name that wrapped would make the real heading one
 *  line taller; the band would then not fit beside it and `break-inside:avoid`
 *  would move it to the next page — the same graceful outcome as before, never
 *  a halved node. */
export const PRINT_HEAD_BLOCK = 18 * 1.75 + 8 + (11.5 * 1.75 + 2 * 3) + Math.max(6, 8) + 12 * 1.75

/** What `planBands` is told the heading costs it. */
export const HEAD_H = Math.ceil(PRINT_HEAD_BLOCK) + PRINT.HEADGAP

/** A process id made safe for an SVG `id`, without ever mapping two ids onto one.
 *
 *  Every marker in the document shares one id space, so two processes that
 *  slugged the same would have the second's arrowheads resolve to the first's
 *  `<marker>`. Dropping the offending characters (`dining-001` → `dining001`)
 *  collides with a genuine `dining001`; escaping them to `_<code>` cannot,
 *  because `_` is itself escaped. Real ids are `[a-z]+-[0-9]{3}` and pass
 *  through untouched. */
function slug(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(36)}`)
}

/** Read the laid-out flow: node boxes with their real markup, edges with the
 *  same bezier `LabeledEdge` draws. Geometry comes from React Flow's own
 *  functions, so the printed curve is the curve on screen.
 *
 *  `host` is the offscreen measuring element. React Flow puts `data-id` on each
 *  node wrapper, so scoping the query to that one host identifies the wrapper
 *  without naming React Flow's class: `parity.test.tsx` bans any `react-flow__`
 *  literal under `ui/export/`, and that ban is what keeps the exported diagram
 *  the app's rather than a local restyling. The id is unambiguous inside the
 *  host — edge groups carry `from->to` and handles carry a compound id, neither
 *  of which can equal a node id. */
function capture(proc: Process, store: ReturnType<typeof useStoreApi>, host: HTMLElement | null): DiagramGeom {
  const lookup = store.getState().nodeLookup
  const boxes: NodeBox[] = []
  for (const [id, internal] of lookup) {
    const el = host?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
    if (!el) continue
    boxes.push({
      id,
      x: internal.internals.positionAbsolute.x,
      y: internal.internals.positionAbsolute.y,
      w: internal.measured?.width ?? el.offsetWidth,
      h: internal.measured?.height ?? el.offsetHeight,
      html: el.innerHTML,
    })
  }

  const edges: EdgeGeom[] = []
  for (const e of proc.edges) {
    const s = lookup.get(e.from) as unknown as Geom | undefined
    const t = lookup.get(e.to) as unknown as Geom | undefined
    if (!s || !t) continue
    const p = getEdgeParams(s, t)
    const [d, labelX, labelY] = getBezierPath({
      sourceX: p.sx, sourceY: p.sy, targetX: p.tx, targetY: p.ty,
      sourcePosition: p.sourcePos, targetPosition: p.targetPos,
    })
    const label = e.label
      ? { x: labelX - Math.min(240, e.label.length * 7.2 + 16) / 2, y: labelY - 11,
          w: Math.min(240, e.label.length * 7.2 + 16), h: 22, text: e.label }
      : undefined
    edges.push({ d, sx: p.sx, sy: p.sy, tx: p.tx, ty: p.ty, label })
  }
  return { boxes, edges }
}

function Capture({ proc, host, onReady }: { proc: Process; host: RefObject<HTMLDivElement | null>; onReady: (g: DiagramGeom) => void }) {
  const initialized = useNodesInitialized()
  const store = useStoreApi()
  useEffect(() => {
    if (initialized) onReady(capture(proc, store, host.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, proc.id])
  return null
}

/** Renders each process's flow, one at a time, into an offscreen host and writes
 *  the resulting SVG bands into the matching `[data-pf]` slot.
 *
 *  The host is laid out but never painted — `left:-99999px`, not `display:none`,
 *  because a `display:none` subtree measures as zero and every box would come
 *  back the wrong size.
 *
 *  Exactly one process is mounted at a time and the index only advances once its
 *  slot is written, so the queue is strictly sequential — which is also why a
 *  process that could never finish would strand every process behind it.
 */
export function PrintDiagrams({ payload }: { payload: ExportPayload }) {
  const [index, setIndex] = useState(0)
  const host = useRef<HTMLDivElement>(null)
  const proc = payload.processes[index]
  const nodes = useMemo(
    () => (proc ? toFlowNodes(proc).map((n) => ({ ...n, draggable: false, selectable: false })) : []),
    [proc],
  )

  // A process can render no nodes at all — the schema puts no minimum on `nodes`,
  // and `toFlowNodes` drops soft-deleted ones on top of that. Such a flow never
  // initialises: `nodesInitialized` is seeded `nodes.length > 0` and is only ever
  // set again inside the store's `setNodes`, so `Capture` would never fire, `emit`
  // would never advance the index, and EVERY LATER process's slot would stay empty
  // too. Skip it without mounting a flow.
  useEffect(() => {
    if (proc && !nodes.length) setIndex(index + 1)
  }, [proc, nodes.length, index])

  function emit(g: DiagramGeom) {
    const slot = document.querySelector<HTMLElement>(`[data-pf="${CSS.escape(proc.id)}"]`)
    if (slot && g.boxes.length) {
      const b = geomBounds(g)
      const minX = b.minX - PRINT.PAD
      const minY = b.minY - PRINT.PAD
      const width = (b.maxX + PRINT.PAD) - minX
      const height = (b.maxY + PRINT.PAD) - minY
      const cuts = freeCuts(geomBlocks(g), minY, minY + height)
      const plan = planBands(minY, minY + height, width, cuts, HEAD_H)
      slot.classList.toggle('own-page', plan.ownPage)
      slot.innerHTML = plan.bands
        .map((band, i) => bandSvg(g, band, { minX, width }, plan.scale, `pfah-${slug(proc.id)}-${i}`))
        .join('')
    }
    setIndex(index + 1)
  }

  // Nothing to measure: either past the last process — take the host down rather
  // than leave an idle flow in the document — or this process renders no nodes,
  // in which case the effect above is already moving on to the next one.
  if (!proc || !nodes.length) return null
  // `defaultNodes`/`defaultEdges`, not `nodes`/`edges`: a *controlled* flow
  // forwards its measurements out through `onNodesChange`, and with no handler
  // to apply them the nodes never gain a measured size — `useNodesInitialized`
  // stays false forever and nothing is ever captured. An uncontrolled flow
  // applies its own measurements, which is what a one-shot measuring host wants.
  // The keyed provider gives each process a fresh store, so these are read once.
  // `.pf-clip` is a 0×0 `overflow:hidden` box around the host. The host is 4000px
  // wide and used to sit at `left:-99999px`; in an RTL document that is 100 000px
  // of *scrollable* overflow, so while a diagram was being measured the document
  // reported `scrollWidth: 100389` and Chrome sized the phone's layout viewport to
  // fit it — the reader landed on the flowchart export scrolled away from its own
  // cover. A clipper establishes the containing block for the host and swallows
  // its overflow, so the host lays out at its full 4000×900 (the boxes it measures
  // are unchanged) while the document stays exactly as wide as the viewport.
  return (
    <div className="pf-clip" aria-hidden>
      <div className="pf-measure" ref={host} style={{ width: 4000, height: 900 }}>
        <ReactFlowProvider key={proc.id}>
          <ReactFlow
            defaultNodes={nodes}
            defaultEdges={toFlowEdges(proc)}
            nodeTypes={nodeTypes}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
            panOnDrag={false} zoomOnScroll={false} preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          >
            <Capture proc={proc} host={host} onReady={emit} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  )
}
