import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

/** The drawer is a 340px side panel. On a 360px phone that is the whole screen:
 *  opened from the exported flowchart's viewer it left 20px of diagram, so the
 *  reader got the node's detail and no sight of where the node sits — and the
 *  panel was pinned to `left:0`, i.e. the side the RTL reader's thumb is not on.
 *  Below 560px it becomes a bottom sheet instead: full width, the lower 58% of
 *  the canvas, dismissed by the same × at a 40px target.
 *
 *  jsdom applies no stylesheet, so these are assertions on the *declaration* —
 *  which is exactly the contract worth pinning, because the danger is a later
 *  edit dropping a variant or, worse, changing a desktop class while doing it.
 *  The layout itself was measured in Chrome at 360/390/430 and recorded in
 *  `.superpowers/sdd/mobile-report.md`. */

const node: ActivityNode = {
  id: 'dining-026-n004', type: 'activity', label: 'تعویض لباس', description: 'شرح', actor: 'پرسنل سالن',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto',
  source: { created_by: 'voice', touched_by: [] },
} as ActivityNode

function renderDrawer() {
  render(
    <DetailDrawer node={node} editing={false} conflicts={[]} showIcom={false}
      process={{ nodes: [] } as never} onClose={vi.fn()} onEdit={vi.fn()}
      onAccept={vi.fn()} onReject={vi.fn()} onOpenSub={vi.fn()} onPatch={vi.fn()}
      onLinkSub={vi.fn()} onSetJunction={vi.fn()} onCreateSub={vi.fn()} onDeleteNode={vi.fn()} />,
  )
  const root = document.querySelector('[data-drawer]')
  expect(root, 'the drawer root carries the data-drawer hook').not.toBeNull()
  return root as HTMLElement
}

describe('the detail drawer on a phone', () => {
  it('becomes a full-width bottom sheet below 560px', () => {
    const cls = renderDrawer().className
    // full width: both inline edges are pinned and the fixed width is released
    expect(cls).toMatch(/\bleft-0\b/)
    expect(cls).toMatch(/max-\[560px\]:right-0/)
    expect(cls).toMatch(/max-\[560px\]:w-auto/)
    // anchored to the bottom, at a height that leaves the diagram above it
    expect(cls).toMatch(/max-\[560px\]:top-auto/)
    expect(cls).toMatch(/\bbottom-0\b/)
    expect(cls).toMatch(/max-\[560px\]:h-\[58%\]/)
  })

  it('reads as a sheet rather than a clipped side panel', () => {
    const cls = renderDrawer().className
    expect(cls).toMatch(/max-\[560px\]:border-e-0/)
    expect(cls).toMatch(/max-\[560px\]:border-t\b/)
    expect(cls).toMatch(/max-\[560px\]:rounded-t-2xl/)
  })

  it('keeps every desktop declaration exactly as it was', () => {
    // The editing app's flow page and the exported viewer are ports of a mockup
    // and their fidelity is deliberate: nothing above the breakpoint may move.
    const cls = renderDrawer().className
    for (const c of ['absolute', 'top-0', 'bottom-0', 'left-0', 'w-[340px]', 'bg-white',
      'border-e', 'border-warm', 'flex', 'flex-col', 'z-[15]']) {
      expect(cls.split(/\s+/)).toContain(c)
    }
    expect(cls).toMatch(/shadow-\[20px_0_50px_-30px_rgba\(74,37,169,\.5\)\]/)
  })

  it('gives the dismiss control a 40px target on a phone and keeps it 28px on a desk', () => {
    renderDrawer()
    const close = screen.getByRole('button', { name: 'بستن' })
    expect(close.className).toMatch(/\bw-7 h-7\b/)
    expect(close.className).toMatch(/max-\[560px\]:w-10 max-\[560px\]:h-10/)
  })
})
