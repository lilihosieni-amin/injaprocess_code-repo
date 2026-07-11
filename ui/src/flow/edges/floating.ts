import { Position } from '@xyflow/react'

// The minimal geometry a floating edge needs from a React Flow internal node:
// its absolute position and measured size.
export type Geom = {
  measured?: { width?: number; height?: number }
  internals: { positionAbsolute: { x: number; y: number } }
}

// Intersection of the line between two node centers with `node`'s border.
// (React Flow's documented "floating edges" recipe.)
function nodeIntersection(node: Geom, other: Geom): { x: number; y: number } {
  const w = (node.measured?.width ?? 0) / 2
  const h = (node.measured?.height ?? 0) / 2
  const x2 = node.internals.positionAbsolute.x + w
  const y2 = node.internals.positionAbsolute.y + h
  const x1 = other.internals.positionAbsolute.x + (other.measured?.width ?? 0) / 2
  const y1 = other.internals.positionAbsolute.y + (other.measured?.height ?? 0) / 2
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1))
  const xx3 = a * xx1
  const yy3 = a * yy1
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 }
}

// Which side of `node` the point sits on → the Position for the bezier control.
// Invariant: `point` is the output of nodeIntersection(node, …), i.e. a point on
// `node`'s border; Left/Right/Top are checked, and Bottom is the remaining side.
function sideOf(node: Geom, point: { x: number; y: number }): Position {
  const nx = node.internals.positionAbsolute.x
  const ny = node.internals.positionAbsolute.y
  const w = node.measured?.width ?? 0
  if (Math.round(point.x) <= Math.round(nx) + 1) return Position.Left
  if (Math.round(point.x) >= Math.round(nx + w) - 1) return Position.Right
  if (Math.round(point.y) <= Math.round(ny) + 1) return Position.Top
  return Position.Bottom
}

// Floating edge endpoints: each end attaches on the side of its node that
// faces the other node, so serpentine/spiral layouts route cleanly.
export function getEdgeParams(source: Geom, target: Geom): {
  sx: number; sy: number; tx: number; ty: number; sourcePos: Position; targetPos: Position
} {
  const sp = nodeIntersection(source, target)
  const tp = nodeIntersection(target, source)
  return { sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, sourcePos: sideOf(source, sp), targetPos: sideOf(target, tp) }
}
