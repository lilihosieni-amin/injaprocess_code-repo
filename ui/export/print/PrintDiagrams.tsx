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
      // heading height at print width: title + id strip + meta row, measured live
      const sheet = slot.closest('[data-testid^="sheet-"]')
      const head = sheet?.querySelector('h2')?.getBoundingClientRect()
      const headH = head ? Math.ceil(head.height + 90) + PRINT.HEADGAP : 130
      const plan = planBands(minY, minY + height, width, cuts, headH)
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
  return (
    <div className="pf-measure" aria-hidden ref={host} style={{ width: 4000, height: 900 }}>
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
  )
}
