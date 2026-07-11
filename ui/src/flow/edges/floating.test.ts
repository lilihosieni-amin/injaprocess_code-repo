import { describe, it, expect } from 'vitest'
import { Position } from '@xyflow/react'
import { getEdgeParams, type Geom } from './floating'

const node = (x: number, y: number): Geom => ({ measured: { width: 100, height: 40 }, internals: { positionAbsolute: { x, y } } })

describe('getEdgeParams (floating edges)', () => {
  it('attaches source-right / target-left when the target is to the right', () => {
    const p = getEdgeParams(node(0, 0), node(300, 0))
    expect(p.sourcePos).toBe(Position.Right)
    expect(p.targetPos).toBe(Position.Left)
  })
  it('attaches source-left / target-right when the target is to the left (spiral row reversal)', () => {
    const p = getEdgeParams(node(300, 0), node(0, 0))
    expect(p.sourcePos).toBe(Position.Left)
    expect(p.targetPos).toBe(Position.Right)
  })
  it('attaches source-bottom / target-top when the target is below (row wrap)', () => {
    const p = getEdgeParams(node(0, 0), node(0, 300))
    expect(p.sourcePos).toBe(Position.Bottom)
    expect(p.targetPos).toBe(Position.Top)
  })
  it('returns endpoints on each node border, not the node center', () => {
    const p = getEdgeParams(node(0, 0), node(300, 0))
    // source right border is x=100 (0 + width); endpoint should be at/near it, y within the node
    expect(p.sx).toBeGreaterThan(90)
    expect(p.sy).toBeGreaterThanOrEqual(0)
    expect(p.sy).toBeLessThanOrEqual(40)
  })
})
